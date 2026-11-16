# FlirtGPT — resume bullets

**FlirtGPT – AI-streaming chat app (Full-stack)**

- React + Cloudflare Worker (Hono) frontend, Groq SSE streaming, Freebuff auth + D1 per-user history.
- 4-slide pitch brief (intro, architecture, models, proof, ask) used as the product narrative.
- 10/10 server-test suite, 8/8 HTTP smoke tests; `bun run test:e2e:smoke` passes against the dev server.
- Ready to deploy on Freebuff Sites with D1 and Freebuff auth; the deployment flow and bindings are documented in `PROJECT_NOTES.md`.
- Persona-tuner / rate-limit / multi-room (choose one Idea to list as “extended feature”).
- No hard-coded keys; env-driven Groq API key; error handling and daily-limit guards.
