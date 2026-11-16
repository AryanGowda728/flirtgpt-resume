import { Hono } from 'hono'

import { DAILY_REPLY_LIMIT, REPLY_TONES, type ReplyTone } from '../../shared/config'
import { AiError, aiConfigured, generateReplies } from '../ai'
import { privateJson } from '../auth'
import { recordReplyScan, replyScansToday, utcDay } from '../db'
import type { AppContext } from '../env'

export const reply = new Hono<AppContext>()

/** Base64 data URLs from the browser. Groq's base64 limit is 4 MB. */
const MAX_IMAGE_CHARS = 4_000_000
const MAX_TEXT_CHARS = 8_000
const MAX_CONTEXT_CHARS = 800

const isTone = (value: unknown): value is ReplyTone => REPLY_TONES.includes(value as ReplyTone)

reply.post('/', async (c) => {
  if (!aiConfigured(c.env)) {
    return c.json({ error: 'not_configured', message: 'No API key is configured yet.' }, 503)
  }

  type Input = { image?: unknown; text?: unknown; context?: unknown; tone?: unknown }
  const input = await c.req.json<Input>().catch(() => ({} as Input))
  const image = typeof input.image === 'string' ? input.image.trim() : ''
  const text = typeof input.text === 'string' ? input.text.replace(/\r\n?/g, '\n').trim() : ''
  const context = typeof input.context === 'string' ? input.context.trim() : ''
  const tone = isTone(input.tone) ? input.tone : 'Playful'

  if (!image && !text) {
    return c.json({ error: 'empty', message: 'Add a screenshot or paste the conversation first.' }, 400)
  }
  if (image && !/^data:image\/(png|jpe?g|webp);base64,[a-z0-9+/=\s]+$/i.test(image)) {
    return c.json({ error: 'image', message: 'Upload a PNG, JPG, or WebP screenshot.' }, 400)
  }
  if (image.length > MAX_IMAGE_CHARS) {
    return c.json({ error: 'image_too_large', message: 'That screenshot is too large. Try a smaller one.' }, 400)
  }
  if (text.length > MAX_TEXT_CHARS) {
    return c.json({ error: 'too_long', message: `Pasted conversations can be up to ${MAX_TEXT_CHARS.toLocaleString()} characters.` }, 400)
  }
  if (context.length > MAX_CONTEXT_CHARS) {
    return c.json({ error: 'context_too_long', message: `Extra context can be up to ${MAX_CONTEXT_CHARS} characters.` }, 400)
  }

  const db = c.get('db')
  const owner = c.get('user').sub
  if ((await replyScansToday(db, owner)) >= DAILY_REPLY_LIMIT) {
    return c.json(
      { error: 'limit', message: `You have reached today's limit of ${DAILY_REPLY_LIMIT} screenshot reads.`, resetsAt: utcDay().end },
      429,
    )
  }

  try {
    const result = await generateReplies(c.env, { image: image || undefined, text, context, tone })
    await recordReplyScan(db, owner)
    return privateJson(c, result)
  } catch (error) {
    const failure = error instanceof AiError ? error : new AiError('unavailable', 'Something went wrong. Try again.', 502)
    if (!(error instanceof AiError)) console.error(error)
    return c.json({ error: failure.code, message: failure.message }, failure.status as 400)
  }
})
