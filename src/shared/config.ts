// FlirtGPT configuration, shared by the Worker and the app. Most
// customisation happens here: the name, the flirty persona, which models
// people may pick, and the usage limits that protect the API credits.

export const BRAND = 'FlirtGPT'
export const TAGLINE = 'Paste the chat. Get the reply.'

/**
 * What the assistant is told before every conversation. Playful and flirty,
 * but still useful: it answers the question, keeps the tone warm, and never
 * promises anything it cannot do.
 */
export const SYSTEM_PROMPT = `You are FlirtGPT, a friendly, playful and lightly flirty AI chat companion. You are warm, charming and a little teasing, but always respectful, never creepy, and never pushy. You still answer the question well: be clear, helpful and specific, and use Markdown when it helps (lists, headings, code blocks with a language, tables), never for decoration. Keep your tone conversational and confident, as if you are flirting with someone smart who you really want to impress. Compliment the user's question when it deserves it, keep the wit light, and never turn a serious question into a joke. If you are unsure, say so. If the user asks for something unsafe, decline kindly and keep the tone light. Match the length of your answer to the question: short for simple ones, structured for complex ones.`

/**
 * Models people may choose, in picker order. These are Groq model ids (the
 * OpenAI-compatible endpoint Groq exposes). The Worker refuses any model not
 * in this list, so this is also the spending allowlist.
 *
 * gpt-oss-20b is the fast, cheap, genuinely capable default the plan picked.
 * llama-4-scout is a strong, faster, somewhat lighter fallback. Both are open
 * models Groq serves quickly.
 */
export const MODELS = [
  { id: 'openai/gpt-oss-20b', name: 'GPT OSS 20B', description: 'Smart and quick; the default if you want the best all-rounder.' },
  { id: 'meta-llama/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout', description: 'Fast and sharp; a great lightweight companion.' },
] as const
export type ModelId = (typeof MODELS)[number]['id']
export const DEFAULT_MODEL: ModelId = 'openai/gpt-oss-20b'

/** Per-user limits. Messages and screenshot reads are counted per UTC day. */
export const DAILY_MESSAGE_LIMIT = 50
/** Screenshot reads per user per UTC day, to protect the Groq credits. */
export const DAILY_REPLY_LIMIT = 30
/** How much history goes to the model with each message. */
export const MAX_CONTEXT_MESSAGES = 24
export const MAX_MESSAGE_CHARS = 8_000
export const MAX_OUTPUT_TOKENS = 4_096

/** Shown on an empty chat. */
export const SUGGESTIONS = [
  'Flirt a little and tell me a clever compliment I can use tonight',
  'Give me three good openers for someone I just matched with',
  'Help me write a short, charming text that does not sound try-hard',
  'What should I know before a first date, in plain advice?',
  'Tell me something interesting about human attraction, briefly',
]

/** The OpenAI-compatible Groq endpoint. */
export const GROQ_BASE_URL = 'https://api.groq.com/openai/v1'
/** Where the app's owner creates a Groq API key. */
export const GROQ_API_KEYS_URL = 'https://console.groq.com/keys'

/** The vision model used to read chat screenshots. Groq serves it on the free tier. */
export const REPLY_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct'

/** Tones the reply studio can ask for. */
export const REPLY_TONES = ['Playful', 'Warm', 'Bold', 'Chill'] as const
export type ReplyTone = (typeof REPLY_TONES)[number]

/**
 * The reply studio's system prompt. It reads a screenshot or pasted chat and
 * returns three copy-ready replies plus a short read of the conversation.
 * The tone is warm and socially intelligent, never manipulative or explicit.
 */
export const REPLY_SYSTEM_PROMPT = `You are FlirtGPT Reply, a sharp, socially intelligent flirting coach. You read a chat screenshot or a pasted conversation and help the user write the next message. You are warm, playful and confident, but you never pressure, manipulate, insult, or encourage anything unsafe. You respect boundaries: if the other person is clearly uninterested, say so plainly and suggest a graceful exit instead of a pushy line.

Return JSON only, with exactly this shape:
{
  "analysis": "one or two short sentences on what is happening and what the other person seems to want",
  "replies": [
    { "tone": "Playful", "text": "..." },
    { "tone": "Warm", "text": "..." },
    { "tone": "Bold", "text": "..." }
  ]
}

Rules for the replies:
- Sound like a real person texting, not an AI. Short, natural, specific.
- Match the energy of the conversation and the requested tone.
- No emoji spam, no pet names too early, no paragraphs unless the chat is already long-form.
- Never mention that you are an AI or that this is a screenshot.
- If the user is starting a chat, write an opener that gives the other person something easy to answer.
- If the conversation is already warm, move it forward without being crude.
- Keep each reply under 320 characters unless the conversation clearly calls for more.
- If the screenshot is unreadable or does not contain a conversation, return an empty replies array and explain what is missing in analysis.`
