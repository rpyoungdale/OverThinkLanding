# OverThink Marketing Site

This project is a standalone landing page for `OverThink` with a server-side waitlist handler in `api/waitlist.js`.

## Structure

- `index.html`: static landing page
- `privacy.html`: public Privacy Policy page, available at `/privacy`
- `terms.html`: public Terms of Use page, available at `/terms`
- `legal/Privacy-Policy.md`: local markdown source copy for privacy content
- `legal/Terms-of-Use.md`: local markdown source copy for terms content
- `scripts/build-legal.mjs`: builds legal HTML pages from markdown
- `styles.css`: app-matched visual system and responsive layout
- `main.js`: reveal animations and waitlist form submission
- `assets/screens/*.svg`: screenshot-style mockups based on the current iOS UI
- `api/waitlist.js`: secure waitlist signup endpoint

## Legal page workflow

- Edit `legal/Privacy-Policy.md` and `legal/Terms-of-Use.md`.
- Run `npm run build:legal` to regenerate `privacy.html` and `terms.html`.
- Vercel runs the same command during deployment via `vercel.json` `buildCommand`.

## Secure waitlist storage

The form posts to `/api/waitlist`, which:

- validates the email address
- ignores bot submissions via a honeypot field
- applies a small in-memory rate limit
- supports an optional allowed-origin check
- stores subscribers in Resend Contacts on the server side

## Required environment variables

- `RESEND_API_KEY`

## Optional environment variables

- `RESEND_SEGMENT_ID`
  Recommended if you want all launch signups grouped into a dedicated Resend Segment.
- `WAITLIST_ALLOWED_ORIGIN`
  Example: `https://overthink.app`

## Deploy on Vercel

1. Import this repo in Vercel.
2. Add the environment variables above.
3. Create a Resend Segment for the launch waitlist and paste its ID into `RESEND_SEGMENT_ID`.
4. Add your custom domain in Vercel and point DNS at it.
5. Send the launch email to that Segment when the app is ready.
