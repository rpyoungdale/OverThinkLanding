#!/usr/bin/env node

import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT_DIR = process.cwd();
const LEGAL_DIR = path.join(ROOT_DIR, "legal");
const PUBLIC_DIR = path.join(ROOT_DIR, "public");

const PAGE_SPECS = [
  {
    source: "Privacy-Policy.md",
    output: "privacy.html",
    title: "Privacy Policy",
    description: "OverThink Privacy Policy",
    active: "privacy"
  },
  {
    source: "Terms-of-Use.md",
    output: "terms.html",
    title: "Terms of Use",
    description: "OverThink Terms of Use",
    active: "terms"
  }
];

const REQUIRED_STATIC_FILES = ["index.html", "styles.css", "main.js", "support.html"];
const OPTIONAL_STATIC_FILES = ["favicon.ico", "favicon.svg", "robots.txt"];

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseInline(markdownText) {
  const escaped = escapeHtml(markdownText);

  const withLinks = escaped.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g,
    (_match, text, href) => `<a href="${href}">${text}</a>`
  );

  const withStrong = withLinks.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

  return withStrong.replace(
    /\b([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g,
    '<a href="mailto:$1">$1</a>'
  );
}

function normalizeHeadingText(text) {
  const strongMatch = text.match(/^\*\*(.+)\*\*$/);
  return strongMatch ? strongMatch[1].trim() : text;
}

function markdownToHtml(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const output = [];

  let paragraphLines = [];
  let currentListLevel = 0;
  const listItemOpen = [];

  function closeParagraph() {
    if (!paragraphLines.length) {
      return;
    }

    const paragraph = paragraphLines.join(" ").trim();
    if (paragraph) {
      output.push(`<p>${parseInline(paragraph)}</p>`);
    }
    paragraphLines = [];
  }

  function closeLists(targetLevel = 0) {
    while (currentListLevel > targetLevel) {
      if (listItemOpen[currentListLevel]) {
        output.push("</li>");
        listItemOpen[currentListLevel] = false;
      }
      output.push("</ul>");
      currentListLevel -= 1;
    }
  }

  for (const originalLine of lines) {
    const line = originalLine.replace(/\t/g, "    ");
    const trimmed = line.trim();

    if (!trimmed) {
      closeParagraph();
      closeLists(0);
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      closeParagraph();
      closeLists(0);

      const level = headingMatch[1].length;
      const headingText = normalizeHeadingText(headingMatch[2].trim());
      output.push(`<h${level}>${parseInline(headingText)}</h${level}>`);
      continue;
    }

    const boldHeadingMatch = trimmed.match(/^\*\*(.+)\*\*$/);
    if (boldHeadingMatch) {
      closeParagraph();
      closeLists(0);
      output.push(`<h3>${parseInline(boldHeadingMatch[1].trim())}</h3>`);
      continue;
    }

    const listMatch = line.match(/^(\s*)-\s+(.+)$/);
    if (listMatch) {
      closeParagraph();

      const spaces = listMatch[1].length;
      const targetLevel = 1 + Math.max(0, Math.floor((spaces - 2) / 2));

      if (targetLevel > currentListLevel) {
        while (currentListLevel < targetLevel) {
          output.push("<ul>");
          currentListLevel += 1;
          listItemOpen[currentListLevel] = false;
        }
      } else {
        while (currentListLevel > targetLevel) {
          if (listItemOpen[currentListLevel]) {
            output.push("</li>");
            listItemOpen[currentListLevel] = false;
          }
          output.push("</ul>");
          currentListLevel -= 1;
        }

        if (listItemOpen[currentListLevel]) {
          output.push("</li>");
          listItemOpen[currentListLevel] = false;
        }
      }

      output.push(`<li>${parseInline(listMatch[2].trim())}`);
      listItemOpen[currentListLevel] = true;
      continue;
    }

    closeLists(0);
    paragraphLines.push(trimmed);
  }

  closeParagraph();
  closeLists(0);

  return output.join("\n        ");
}

function renderPage({ title, description, active, contentHtml }) {
  const privacyClass = active === "privacy" ? ' class="active"' : "";
  const termsClass = active === "terms" ? ' class="active"' : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta
    http-equiv="Content-Security-Policy"
    content="default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests"
  />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="description" content="${description}" />
  <meta name="theme-color" content="#F7F9FF" />
  <title>${title} | OverThink</title>
  <link rel="stylesheet" href="./styles.css" />
</head>
<body class="legal-page">
  <div class="page-shell">
    <div class="ambient ambient-one" aria-hidden="true"></div>
    <div class="ambient ambient-two" aria-hidden="true"></div>
    <div class="ambient ambient-three" aria-hidden="true"></div>

    <header class="site-header legal-header">
      <a class="brand-lockup" href="/" aria-label="OverThink home">
        <img class="brand-brain" src="./assets/brand-brain.png" alt="" />
        <img class="brand-wordmark" src="./assets/brand-wordmark.png" alt="OverThink" />
      </a>
      <p class="header-badge">Legal</p>
    </header>

    <main class="legal-main">
      <article class="legal-card">
        <nav class="legal-nav" aria-label="Legal routes">
          <a${privacyClass} href="/privacy">Privacy Policy</a>
          <a${termsClass} href="/terms">Terms of Use</a>
        </nav>

        ${contentHtml}
      </article>
    </main>
  </div>
</body>
</html>
`;
}

function assertNoUnresolvedPlaceholders(filePath, markdown) {
  const unresolved = [...new Set(markdown.match(/\[[A-Z][A-Z0-9_]*\]/g) ?? [])];

  if (unresolved.length > 0) {
    throw new Error(`${filePath} contains unresolved placeholders: ${unresolved.join(", ")}`);
  }
}

async function preparePublicDirectory() {
  await rm(PUBLIC_DIR, { recursive: true, force: true });
  await mkdir(PUBLIC_DIR, { recursive: true });

  for (const fileName of REQUIRED_STATIC_FILES) {
    await cp(path.join(ROOT_DIR, fileName), path.join(PUBLIC_DIR, fileName));
  }

  for (const fileName of OPTIONAL_STATIC_FILES) {
    try {
      await cp(path.join(ROOT_DIR, fileName), path.join(PUBLIC_DIR, fileName));
    } catch {
      // Optional file missing is fine.
    }
  }

  await cp(path.join(ROOT_DIR, "assets"), path.join(PUBLIC_DIR, "assets"), {
    recursive: true
  });
}

async function buildLegalPages() {
  await preparePublicDirectory();

  for (const page of PAGE_SPECS) {
    const sourcePath = path.join(LEGAL_DIR, page.source);
    const rootOutputPath = path.join(ROOT_DIR, page.output);
    const publicOutputPath = path.join(PUBLIC_DIR, page.output);

    const markdown = await readFile(sourcePath, "utf8");
    assertNoUnresolvedPlaceholders(page.source, markdown);

    const htmlContent = markdownToHtml(markdown);
    const fullPage = renderPage({
      title: page.title,
      description: page.description,
      active: page.active,
      contentHtml: htmlContent
    });

    await writeFile(rootOutputPath, fullPage, "utf8");
    await writeFile(publicOutputPath, fullPage, "utf8");

    console.log(`Generated ${page.output} from legal/${page.source}`);
  }
}

buildLegalPages().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
