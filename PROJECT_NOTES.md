# Project notes

## What it is

FlirtGPT is a flirty, playful AI chat app: conversations in a sidebar, streamed replies rendered as Markdown, a model picker, stop and regenerate, and a daily limit per user. It runs on Freebuff Sites with Sign in with Freebuff and D1, and can also be deployed as a normal Vite app with a static frontend.

## Architecture

- `src/app/` — React app (pages, components, API client, streaming reader).
- `src/worker/` — Cloudflare Worker (Hono): auth, D1 schema, Groq client, chat SSE route, account and conversation routes.
- `src/shared/` — types and configuration shared by both sides.
- `e2e/` — Playwright spec and HTTP smoke tests.

## Request flow

1. User sends a message from the React composer.
2. `POST /api/chat` validates input, checks the daily limit, stores the conversation and user message, and creates an empty assistant row.
3. The Worker calls Groq’s OpenAI-compatible `/chat/completions` endpoint with `stream: true`.
4. Groq streams SSE chunks; the Worker forwards each delta as a `ChatEvent` to the browser.
5. The browser renders the Markdown as tokens arrive; on completion the Worker stores the final reply.
6. If the user stops or disconnects, the Worker aborts upstream and keeps the partial reply, marked as interrupted.

## Security and limits

- Every `/api/*` route requires a signed-in user and scopes queries by `owner_sub`.
- Mutations must be same-origin.
- Models are allowlisted; message length, context size, and output tokens are capped.
- Daily limit: 50 replies per user per UTC day, counting stopped and regenerated replies.
- The Groq API key is read only in the Worker and never sent to the browser.

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
