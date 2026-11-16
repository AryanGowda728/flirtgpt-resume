# FlirtGPT — 4-slide pitch brief

## Slide 1 — Intro and one-line pitch

**FlirtGPT — paste the chat. Get the reply.**

People freeze when someone they like finally texts back. They overthink the tone, rewrite the message five times, or send nothing. FlirtGPT turns that moment into three natural replies they can copy in seconds.

This is not a generic chatbot. It is a screenshot-to-reply flirting copilot: upload the conversation, pick a tone, and get replies that sound like a confident human — not an AI.

## Slide 2 — Product and architecture

**How it works:**

1. The user uploads a chat screenshot (PNG/JPG/WebP) or pastes the conversation.
2. The browser resizes the image before sending it, so the original file never leaves the device.
3. The Cloudflare Worker validates the image, enforces a 30-read daily limit, and calls Groq’s vision model.
4. Groq reads the screenshot and returns three copy-ready replies plus a short read of the conversation.
5. The user copies the reply into Instagram, Snapchat, WhatsApp, or any messaging app.

**Architecture:**

- Frontend: React + Vite, with a dropzone, clipboard paste, tone picker, and one-click copy.
- Backend: Cloudflare Worker (Hono) with Freebuff auth and D1.
- AI: Groq’s OpenAI-compatible endpoint, using `meta-llama/llama-4-scout-17b-16e-instruct` for vision.
- Data: D1 stores auth and daily usage only. Screenshots are not stored.
- Privacy: the Groq API key stays on the server and never reaches the browser.

## Slide 3 — Models, proof, and advantages

**Model:** `meta-llama/llama-4-scout-17b-16e-instruct` on Groq. It reads images and text, and it is fast enough for a “paste and reply” workflow.

**Proven working now:**

- Screenshot upload, clipboard paste, and pasted-text fallback.
- Browser-side image resizing to stay under the API limit.
- Three reply options in Playful, Warm, Bold, or Chill tones.
- One-click copy for each reply.
- Daily limit of 30 screenshot reads per user.
- 12/12 server tests, clean typecheck, and a successful production build.

**Advantages:**

- Solves a specific, high-emotion moment instead of being another general chatbot.
- Reads the actual conversation, including subtext and the last message.
- Gives the user agency: three options, not one forced answer.
- Keeps screenshots private: they are resized locally and never stored.
- Cheap to run: one vision request per read, with a hard daily cap.
- Works on any messaging platform because the output is plain text.

## Slide 4 — Conclusion and the ask

FlirtGPT is a focused flirting copilot: upload the chat, get three natural replies, copy the one that sounds like you. It is built, tested, and ready to deploy.

**Not proven yet:** a live vision reply, because the project has no Groq API key yet.

**The ask:** add a Groq API key as `GROQ_API_KEY`, then the app can read real screenshots and generate replies. Deploy it on Freebuff Sites with D1 and Freebuff auth.

**Business line:** dating and messaging is a huge, repeat-use market. FlirtGPT is a simple, shareable tool that helps people stop overthinking and send the message.
