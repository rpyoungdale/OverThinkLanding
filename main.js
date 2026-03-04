const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

document.documentElement.classList.add("js");

const revealElements = document.querySelectorAll(".reveal");

if ("IntersectionObserver" in window) {
  const revealObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) {
          continue;
        }

        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      }
    },
    {
      rootMargin: "0px 0px -12% 0px",
      threshold: 0.12
    }
  );

  revealElements.forEach((element) => {
    revealObserver.observe(element);
  });
} else {
  revealElements.forEach((element) => {
    element.classList.add("is-visible");
  });
}

const form = document.querySelector("[data-waitlist-form]");

if (form) {
  const emailInput = form.querySelector('input[name="email"]');
  const honeypotInput = form.querySelector('input[name="company"]');
  const submitButton = form.querySelector("[data-submit-button]");
  const messageNode = document.querySelector("[data-form-message]");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = emailInput?.value.trim() ?? "";
    const company = honeypotInput?.value ?? "";

    if (!email || !EMAIL_PATTERN.test(email)) {
      setMessage("Enter a valid email address.", true);
      emailInput?.focus();
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({
          email,
          company,
          source: "marketing-site"
        })
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.message || "Could not join the waitlist right now.");
      }

      form.reset();
      setMessage(payload.message || "You’re on the list.");
    } catch (error) {
      setMessage(error.message || "Could not join the waitlist right now.", true);
    } finally {
      setLoading(false);
    }
  });

  function setLoading(isLoading) {
    if (submitButton) {
      submitButton.disabled = isLoading;
      submitButton.textContent = isLoading ? "Joining..." : "Join the launch list";
    }
  }

  function setMessage(message, isError = false) {
    if (!messageNode) {
      return;
    }

    messageNode.textContent = message;
    messageNode.classList.toggle("is-error", isError);
  }
}
