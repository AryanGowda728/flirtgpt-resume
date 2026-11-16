# FlirtGPT — resume bullets

**FlirtGPT – Screenshot-to-reply flirting copilot (Full-stack)**

- React + Cloudflare Worker (Hono) app that reads a chat screenshot with Groq’s Llama 4 Scout vision model and returns three copy-ready replies.
- Browser-side image resizing and clipboard paste keep uploads fast and private; screenshots are never stored.
- Freebuff auth + D1 track per-user usage and enforce a 30-read daily limit; the Groq API key stays server-side.
- Tone controls (Playful / Warm / Bold / Chill), one-click copy, and a pasted-text fallback for unreadable screenshots.
- 12/12 server tests, clean TypeScript typecheck, and a successful production build.
- Ready to deploy on Freebuff Sites with D1 and Freebuff auth; deployment and bindings are documented in `PROJECT_NOTES.md`.
