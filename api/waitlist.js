const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 10;
const requestLog = new Map();

class ConfigError extends Error {}
class UpstreamError extends Error {}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { message: "Method not allowed." });
  }

  if (!originIsAllowed(req)) {
    return sendJson(res, 403, { message: "Origin not allowed." });
  }

  const ip = getClientIp(req);

  if (!withinRateLimit(ip)) {
    return sendJson(res, 429, { message: "Too many requests. Try again in a bit." });
  }

  try {
    const payload = parseBody(req.body);
    const email = normalizeEmail(payload.email);
    const honeypot = typeof payload.company === "string" ? payload.company.trim() : "";

    if (honeypot) {
      return sendJson(res, 200, { message: "You’re on the list." });
    }

    if (!email || !EMAIL_PATTERN.test(email)) {
      return sendJson(res, 400, { message: "Enter a valid email address." });
    }

    const alreadySubscribed = await upsertResendContact(email);

    return sendJson(res, 200, {
      message: alreadySubscribed ? "You’re already on the list." : "You’re on the list."
    });
  } catch (error) {
    if (error instanceof ConfigError) {
      return sendJson(res, 503, { message: "Waitlist storage is not configured yet." });
    }

    if (error instanceof UpstreamError) {
      return sendJson(res, 502, { message: "Could not join the waitlist right now." });
    }

    console.error("waitlist_unexpected_error", error);
    return sendJson(res, 500, { message: "Something went wrong. Please try again." });
  }
}

function parseBody(body) {
  if (!body) {
    return {};
  }

  if (typeof body === "string") {
    const trimmed = body.trim();

    if (!trimmed) {
      return {};
    }

    if (trimmed.startsWith("{")) {
      return JSON.parse(trimmed);
    }

    return Object.fromEntries(new URLSearchParams(trimmed));
  }

  return body;
}

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function originIsAllowed(req) {
  const allowedOrigin = process.env.WAITLIST_ALLOWED_ORIGIN?.trim();

  if (!allowedOrigin) {
    return true;
  }

  const origin = req.headers.origin || req.headers.Origin || "";
  return !origin || origin === allowedOrigin;
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];

  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }

  return "unknown";
}

function withinRateLimit(ip) {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const attempts = requestLog.get(ip)?.filter((timestamp) => timestamp >= windowStart) ?? [];

  attempts.push(now);
  requestLog.set(ip, attempts);

  if (requestLog.size > 200) {
    for (const [key, timestamps] of requestLog.entries()) {
      const recent = timestamps.filter((timestamp) => timestamp >= windowStart);

      if (recent.length === 0) {
        requestLog.delete(key);
      } else {
        requestLog.set(key, recent);
      }
    }
  }

  return attempts.length <= RATE_LIMIT_MAX_REQUESTS;
}

async function upsertResendContact(email) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const segmentId = process.env.RESEND_SEGMENT_ID?.trim();

  if (!apiKey) {
    throw new ConfigError("RESEND_API_KEY is missing");
  }

  const createResponse = await resendRequest("/contacts", "POST", apiKey, {
    email,
    unsubscribed: false,
    ...(segmentId ? { segments: [{ id: segmentId }] } : {})
  });

  const createPayload = await safeJson(createResponse);

  if (createResponse.ok) {
    return false;
  }

  if (!looksLikeDuplicate(createResponse.status, createPayload)) {
    console.error("waitlist_create_failed", createResponse.status, createPayload);
    throw new UpstreamError("Resend create contact failed");
  }

  const updateResponse = await resendRequest(
    `/contacts/${encodeURIComponent(email)}`,
    "PATCH",
    apiKey,
    { unsubscribed: false }
  );

  const updatePayload = await safeJson(updateResponse);

  if (!updateResponse.ok) {
    console.error("waitlist_update_failed", updateResponse.status, updatePayload);
    throw new UpstreamError("Resend update contact failed");
  }

  if (segmentId) {
    const segmentResponse = await resendRequest(
      `/contacts/${encodeURIComponent(email)}/segments/${segmentId}`,
      "POST",
      apiKey
    );
    const segmentPayload = await safeJson(segmentResponse);

    if (!segmentResponse.ok && !looksLikeDuplicate(segmentResponse.status, segmentPayload)) {
      console.error("waitlist_segment_failed", segmentResponse.status, segmentPayload);
      throw new UpstreamError("Resend add segment failed");
    }
  }

  return true;
}

function looksLikeDuplicate(status, payload) {
  if (status === 409) {
    return true;
  }

  const message = `${payload?.message ?? ""} ${payload?.name ?? ""}`.toLowerCase();
  return message.includes("already exists") || message.includes("duplicate");
}

async function resendRequest(path, method, apiKey, body) {
  const requestInit = {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json"
    }
  };

  if (body) {
    requestInit.headers["Content-Type"] = "application/json";
    requestInit.body = JSON.stringify(body);
  }

  return fetch(`https://api.resend.com${path}`, requestInit);
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function sendJson(res, status, payload) {
  res.status(status);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.send(JSON.stringify(payload));
}
