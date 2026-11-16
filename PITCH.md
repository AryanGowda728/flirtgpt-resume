# FlirtGPT — 4-slide pitch brief

## Slide 1 — Intro and one-line pitch

**FlirtGPT — the flirty, playful AI chat app that actually works.**

A personality-driven AI chat companion with a warm, playful, lightly flirty tone, built as a real working chat product, not a mockup. Core promise: real streaming replies, saved conversations, sign-in, and clear error handling. This is a sentence-generation / NLP-style chat experience where the model generates replies one token at a time and the UI streams them as they arrive.

## Slide 2 — Body, product, and architecture

**Problem:** most “flirty” or “fun” AI chat feels fake, gimmicky, or unreliable. People want charm and personality without losing a dependable chat experience.

**Solution:** FlirtGPT restores warmth and personality while staying engineered like a real product.

**Architecture:**

- Frontend: React chat UI that receives a streaming response.
- Backend: Cloudflare Worker (Hono) that handles the chat API and database calls.
- AI: Groq’s OpenAI-compatible `/chat/completions` endpoint with streaming, using a bearer API key that stays on the server only.
- Data: conversations and messages stored per signed-in user in D1, scoped by `owner_sub`.
- Flow: user message → Worker validates and stores it → Worker streams tokens from Groq → frontend renders Markdown as tokens arrive.
- Safety: input validation, daily reply limit, same-origin mutations, clear error states.

## Slide 3 — Models, proof, and advantages

**Models:** primary is `openai/gpt-oss-20b` on Groq; fallback is `meta/llama-4-scout-17b-16e-instruct` on Groq.

**Proven working now:** the app serves and renders the FlirtGPT brand; sign-in works; the chat API validates input and returns clear errors when no AI key is configured; per-user chat history works, including a seeded welcome chat; the model list is correct; and the build passes typecheck, server tests (10/10), and HTTP end-to-end checks (8/8).

**Advantages:**

- Personality-first AI chat that is still reliable.
- Streaming token-by-token replies feel fast and alive.
- Server-side API key keeps credentials out of the browser.
- Per-user history and sign-in make it feel like a real product.
- Clear errors and limits make it safe and sane to run.
- Simple hosted architecture on Freebuff Sites with D1 and Freebuff auth.

## Slide 4 — Conclusion and the ask

FlirtGPT is a working, personality-driven AI chat app with streaming Groq replies and per-user history, ready to go fully live once the AI key is added.

**Not proven yet:** a real streamed AI reply, because the project has no Groq API key yet.

**The ask:** add a Groq API key as the environment variable `GROQ_API_KEY`, then the app can stream real flirty replies and be deployed on Freebuff Sites with D1 and Freebuff auth.

**Business line:** personality-driven AI chat is sticky and shareable, aimed at users who want a more human, charming AI companion experience that is simple to run and host.
