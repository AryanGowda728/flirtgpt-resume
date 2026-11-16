# Project notes

## What it is

FlirtGPT is a screenshot-to-reply flirting assistant. The user uploads a chat screenshot (or pastes the conversation), picks a tone, and gets three natural replies they can copy into Instagram, Snapchat, or any messaging app. The original chat mode is still available at `/chat` as a practice space.

## Architecture

- `src/app/pages/ReplyStudio.tsx` — the screenshot flow: dropzone, clipboard paste, pasted-text fallback, tone picker, result cards.
- `src/app/lib/image.ts` — resizes screenshots in the browser to a 1400px JPEG before sending.
- `src/worker/routes/reply.ts` — `POST /api/reply`: validates the image data URL and size, checks the daily limit, calls Groq, and returns JSON.
- `src/worker/ai.ts` — Groq client. `generateReplies` sends the image and prompt to the vision model and parses the JSON reply.
- `src/shared/config.ts` — reply model, tones, system prompt, and limits.
- `src/worker/db.ts` — D1 schema, including `reply_scans` for the daily screenshot count.
- `src/app/pages/Chat.tsx` — the practice chat.

## Request flow

1. The user uploads or pastes a screenshot in the reply studio.
2. The browser resizes it to a readable JPEG data URL; the original file stays local.
3. `POST /api/reply` validates the data URL, size, tone, and text limits.
4. The route checks `reply_scans` for today and refuses after 30 successful reads.
5. The Worker calls Groq’s `/chat/completions` with `meta-llama/llama-4-scout-17b-16e-instruct`, the system prompt, and the image.
6. Groq returns JSON with `analysis` and up to three `replies`.
7. The Worker records one `reply_scans` row and returns the JSON.
8. The browser renders the analysis and the reply cards with copy buttons.

## Privacy and security

- The Groq API key is read only in the Worker and never sent to the browser.
- Screenshots are not stored in D1 or R2.
- Every `/api/*` route requires a signed-in user; mutations must be same-origin.
- Images must be PNG, JPG, or WebP data URLs and must fit the base64 limit.
- The reply studio is capped at 30 reads per user per UTC day.
- The practice chat keeps its own 50-reply daily limit.

## How to run

```sh
bun install
bun run dev        # http://localhost:5173 with local D1 (Miniflare)
bun run build      # dist/client + dist/ai_chat/index.js
bun run typecheck
bun run test:worker
bun run test:e2e:smoke   # needs the dev server on port 5173
```

## Deployment

1. `sites_create`.
2. `sites_add_storage` for D1 named `DB`.
3. `sites_enable_auth`.
4. `bun run build`, then `sites_deploy` with `deploy.json`.
5. Set `GROQ_API_KEY` in Sites → Secrets.
