// The Groq client. Groq exposes an OpenAI-compatible chat-completions API, so
// this is a thin layer: one request per reply, streamed when the model
// supports it, with Groq's errors turned into messages the app can show. The
// key is read from env here and nowhere else.

import { GROQ_BASE_URL, MAX_OUTPUT_TOKENS, MODELS, REPLY_MODEL, REPLY_SYSTEM_PROMPT, type ModelId } from '../shared/config'
import type { ReplyResult } from '../shared/types'
import type { Env } from './env'

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

export class AiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 502,
  ) {
    super(message)
  }
}

export const aiConfigured = (env: Env) => Boolean(env.GROQ_API_KEY)

const apiBase = (env: Env) => (env.GROQ_BASE_URL || GROQ_BASE_URL).replace(/\/$/, '')

function headers(env: Env): HeadersInit {
  if (!env.GROQ_API_KEY) throw new AiError('not_configured', 'No API key is configured.', 503)
  return { authorization: `Bearer ${env.GROQ_API_KEY}`, 'content-type': 'application/json', accept: 'application/json' }
}

export const isModelId = (value: unknown): value is ModelId => MODELS.some((m) => m.id === value)

/**
 * What Groq offers, cached per isolate. Groq's models endpoint is free to call
 * without a key and lists each model's supported endpoints, so we probe it once
 * per TTL and keep only the models in MODELS. A failed fetch yields null and the
 * app carries on assuming every configured model exists and streams, which always
 * works for the short list we expose.
 */
type Capabilities = { streaming: boolean }
const MODELS_TTL = 10 * 60_000
let modelCache: { at: number; models: Map<string, Capabilities> } | undefined
let modelInflight: Promise<Map<string, Capabilities> | null> | undefined

export function availableModels(env: Env): Promise<Map<string, Capabilities> | null> {
  if (modelCache && Date.now() - modelCache.at < MODELS_TTL) return Promise.resolve(modelCache.models)
  modelInflight ??= (async () => {
    try {
      const response = await fetch(`${apiBase(env)}/models`, {
        signal: AbortSignal.timeout(8_000),
      })
      if (!response.ok) return null
      const body = (await response.json()) as { data?: { id: string; permissions?: { chat?: { create?: { streamed?: boolean } } } }[] }
      const models = new Map<string, Capabilities>()
      for (const model of body.data ?? []) {
        if (isModelId(model.id)) {
          const maybe = model.permissions?.chat?.create?.streamed
          const streams = maybe === true || maybe === undefined
          models.set(model.id, { streaming: streams })
        }
      }
      modelCache = { at: Date.now(), models }
      return models
    } catch {
      return null
    } finally {
      modelInflight = undefined
    }
  })()
  return modelInflight
}

/** Test-only: clear the per-isolate model cache so each test controls the probe. */
export function resetModelCache() {
  modelCache = undefined
  modelInflight = undefined
}

/** Turns a Groq failure into something safe to show. Never includes the key. */
async function failure(response: Response): Promise<AiError> {
  let detail = ''
  try {
    const body = (await response.json()) as { error?: { code?: string; message?: string } }
    detail = (body.error?.message ?? '').slice(0, 160)
  } catch {
    /* not JSON */
  }
  const status = response.status
  if (status === 401) return new AiError('invalid_key', 'The Groq API key is not valid. Update GROQ_API_KEY and try again.', 503)
  if (status === 403) return new AiError('key_disabled', 'The Groq API key is paused or not allowed for this model.', 503)
  if (status === 404) return new AiError('model_unavailable', 'This model is not available right now. Try another.', 503)
  if (status === 429) return new AiError('busy', 'Groq is busy right now. Try again in a moment.', 429)
  if (status === 400) return new AiError('refused', detail ? `The request was refused: ${detail}` : 'The request was refused.', 400)
  if (status === 413) return new AiError('too_large', 'That screenshot is too large. Try a smaller one.', 413)
  if (status === 415) return new AiError('unsupported_image', 'That image format is not supported. Use a PNG or JPG.', 415)
  return new AiError('unavailable', 'The model is unavailable right now. Try again shortly.', 503)
}

/**
 * One reply, as text pieces. Streams token by token when the model supports
 * streaming, otherwise yields the whole reply once. `signal` aborts the
 * upstream request.
 */
export async function* complete(env: Env, input: { model: ModelId; messages: ChatMessage[]; signal?: AbortSignal }): AsyncGenerator<string> {
  let stream = true
  try {
    const capabilities = await availableModels(env)
    stream = capabilities?.get(input.model)?.streaming ?? true
  } catch {
    /* use the default assumption: the short model list streams */
  }
  const timeout = AbortSignal.timeout(240_000)
  const signal = input.signal ? AbortSignal.any([input.signal, timeout]) : timeout

  let response: Response
  try {
    response = await fetch(`${apiBase(env)}/chat/completions`, {
      method: 'POST',
      headers: headers(env),
      body: JSON.stringify({ model: input.model, messages: input.messages, max_tokens: MAX_OUTPUT_TOKENS, stream }),
      signal,
    })
  } catch (error) {
    if (input.signal?.aborted) return
    if (timeout.aborted) throw new AiError('timeout', 'The model took too long to answer.', 504)
    throw new AiError('network', 'Could not reach Groq.', 503)
  }
  if (!response.ok) throw await failure(response)

  if (!stream) {
    const body = (await response.json()) as { choices?: { message?: { content?: string | null } }[] }
    const text = body.choices?.[0]?.message?.content
    if (typeof text !== 'string') throw new AiError('malformed', 'The model returned an empty reply.', 502)
    yield text
    return
  }

  yield* readSse(response, { client: input.signal, timeout })
}

/** Reads an OpenAI-style SSE body, yielding each delta's text. */
async function* readSse(response: Response, signals: { client?: AbortSignal; timeout: AbortSignal }): AsyncGenerator<string> {
  if (!response.body) throw new AiError('malformed', 'The model returned no reply.', 502)
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += value
      let end: number
      while ((end = buffer.indexOf('\n\n')) !== -1) {
        const event = buffer.slice(0, end)
        buffer = buffer.slice(end + 2)
        const data = event
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trim())
          .join('\n')
        if (!data || data === '[DONE]') continue
        let chunk: { choices?: { delta?: { content?: string | null } }[]; error?: { message?: string } }
        try {
          chunk = JSON.parse(data)
        } catch {
          throw new AiError('malformed', 'The reply was interrupted.', 502)
        }
        if (chunk.error) throw new AiError('unavailable', 'The model stopped unexpectedly.', 502)
        const text = chunk.choices?.[0]?.delta?.content
        if (text) yield text
      }
    }
  } catch (error) {
    if (error instanceof AiError) throw error
    if (signals.client?.aborted) return
    if (signals.timeout.aborted) throw new AiError('timeout', 'The model took too long to answer.', 504)
    throw new AiError('interrupted', 'The reply was interrupted.', 502)
  } finally {
    reader.releaseLock()
  }
}

/**
 * Reads a chat screenshot (or a pasted conversation) and returns three
 * copy-ready replies plus a short read of the conversation. Uses Groq's
 * vision-capable Llama 4 Scout. The image is a data URL, never stored.
 */
export async function generateReplies(
  env: Env,
  input: { image?: string; text?: string; context?: string; tone: string },
): Promise<ReplyResult> {
  const content: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = []
  const instruction = [
    `Write the next reply in a ${input.tone.toLowerCase()} tone.`,
    input.text ? `The pasted conversation is included below. Read it carefully and answer the last message.` : 'Read the screenshot carefully and answer the last message.',
    input.context ? `Extra context from the user: ${input.context}` : '',
    'Return JSON only, exactly in the shape described in the system prompt.',
  ]
    .filter(Boolean)
    .join('\n\n')
  content.push({ type: 'text', text: instruction })
  if (input.image) content.push({ type: 'image_url', image_url: { url: input.image } })
  if (input.text) content.push({ type: 'text', text: `Pasted conversation:\n${input.text}` })

  let response: Response
  try {
    response = await fetch(`${apiBase(env)}/chat/completions`, {
      method: 'POST',
      headers: headers(env),
      body: JSON.stringify({
        model: REPLY_MODEL,
        messages: [
          { role: 'system', content: REPLY_SYSTEM_PROMPT },
          { role: 'user', content },
        ],
        temperature: 0.85,
        max_tokens: 1_000,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(60_000),
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new AiError('timeout', 'The model took too long to answer. Try again.', 504)
    }
    throw new AiError('network', 'Could not reach Groq.', 503)
  }
  if (!response.ok) throw await failure(response)

  const body = (await response.json()) as { choices?: { message?: { content?: string | null } }[] }
  const raw = body.choices?.[0]?.message?.content
  if (typeof raw !== 'string' || !raw.trim()) throw new AiError('malformed', 'The model returned an empty reply. Try again.', 502)

  let parsed: unknown
  try {
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
    parsed = JSON.parse(cleaned)
  } catch {
    throw new AiError('malformed', 'The model returned an unexpected format. Try again.', 502)
  }
  const data = parsed as { analysis?: unknown; replies?: unknown }
  const analysis = typeof data.analysis === 'string' ? data.analysis.trim().slice(0, 600) : ''
  const replies = Array.isArray(data.replies)
    ? data.replies
        .filter((reply): reply is { tone: unknown; text: unknown } => Boolean(reply) && typeof reply === 'object')
        .map((reply) => ({ tone: typeof reply.tone === 'string' ? reply.tone.trim().slice(0, 24) : 'Reply', text: typeof reply.text === 'string' ? reply.text.trim().slice(0, 600) : '' }))
        .filter((reply) => reply.text.length > 0)
        .slice(0, 3)
    : []
  if (!replies.length) {
    throw new AiError('empty', analysis || 'I could not read a conversation in that image. Try a clearer screenshot.', 422)
  }
  return { analysis, replies }
}
