import { describe, expect, test, vi, beforeEach, afterEach } from 'bun:test'

import { AiError, aiConfigured, complete, generateReplies, isModelId, resetModelCache } from '../worker/ai'
import { DEFAULT_MODEL, REPLY_MODEL } from '../shared/config'

const MODELS_URL = 'https://api.groq.com/openai/v1/models'
const CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions'

describe('ai', () => {
  describe('aiConfigured', () => {
    test('is false when the key is missing', () => {
      expect(aiConfigured({ GROQ_API_KEY: undefined } as never)).toBe(false)
      expect(aiConfigured({ GROQ_API_KEY: '' } as never)).toBe(false)
    })

    test('is true when the key is set', () => {
      expect(aiConfigured({ GROQ_API_KEY: 'gsk-test' } as never)).toBe(true)
    })
  })

  describe('isModelId', () => {
    test('accepts a configured model id', () => {
      expect(isModelId('openai/gpt-oss-20b')).toBe(true)
    })

    test('rejects an unknown id', () => {
      expect(isModelId('not-a-real-model')).toBe(false)
    })

    test('rejects non-strings', () => {
      expect(isModelId(null)).toBe(false)
      expect(isModelId(42)).toBe(false)
    })
  })

  describe('AiError', () => {
    test('carries its code, message and status', () => {
      const error = new AiError('busy', 'Groq is busy', 429)
      expect(error.code).toBe('busy')
      expect(error.message).toBe('Groq is busy')
      expect(error.status).toBe(429)
    })
  })

  describe('complete', () => {
    let originalFetch: typeof globalThis.fetch

    beforeEach(() => {
      originalFetch = globalThis.fetch
    })
    afterEach(() => {
      globalThis.fetch = originalFetch
      resetModelCache()
    })

    test('throws not_configured when no key is set', async () => {
      let modelsCall = false
      globalThis.fetch = vi.fn().mockImplementation(
        async (input: RequestInfo | URL, _init?: RequestInit) => {
          if (String(input) === MODELS_URL) {
            modelsCall = true
            return new Response(
              JSON.stringify({
                data: [{ id: DEFAULT_MODEL, permissions: { chat: { create: { streamed: true } } } }],
              }),
              { status: 200, headers: { 'content-type': 'application/json' } },
            )
          }
          if (String(input) === CHAT_URL) {
            throw new Error('unexpected chat call')
          }
          throw new Error(`unexpected url: ${input}`)
        },
      )

      const gen = complete({ GROQ_API_KEY: undefined } as never, {
        model: DEFAULT_MODEL,
        messages: [{ role: 'user', content: 'hi' }],
      })

      await expect(gen.next()).rejects.toBeInstanceOf(AiError)
      expect(modelsCall).toBe(true)
    })

    test('forwards a streamed Groq reply token by token', async () => {
      globalThis.fetch = vi.fn().mockImplementation(
        async (input: RequestInfo | URL, _init?: RequestInit) => {
          if (String(input) === MODELS_URL) {
            return new Response(
              JSON.stringify({
                data: [{ id: DEFAULT_MODEL, permissions: { chat: { create: { streamed: true } } } }],
              }),
              { status: 200, headers: { 'content-type': 'application/json' } },
            )
          }
          if (String(input) === CHAT_URL) {
            const encoder = new TextEncoder()
            const pieces = ['Hello ', 'there. ', 'How are you?']
            const chunks = pieces.map(
              (piece) => `data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`,
            )
            const body = new ReadableStream({
              start(controller) {
                for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
                controller.enqueue(encoder.encode('data: [DONE]\n\n'))
                controller.close()
              },
            })
            return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
          }
          throw new Error(`unexpected url: ${input}`)
        },
      )

      const gen = complete({ GROQ_API_KEY: 'gsk-test' } as never, {
        model: DEFAULT_MODEL,
        messages: [{ role: 'user', content: 'hi' }],
      })

      const pieces: string[] = []
      for await (const piece of gen) pieces.push(piece)

      expect(pieces).toEqual(['Hello ', 'there. ', 'How are you?'])

      const f = globalThis.fetch as ReturnType<typeof vi.fn>
      const chatCalls = f.mock.calls.filter(
        ([url]: [RequestInfo | URL, RequestInit?]) => String(url) === CHAT_URL,
      )
      expect(chatCalls).toHaveLength(1)
      const init = chatCalls[0][1] ?? {}
      const bodyRaw = init.body
      const body =
        typeof bodyRaw === 'string'
          ? JSON.parse(bodyRaw)
          : JSON.parse(new TextDecoder().decode(new Uint8Array(bodyRaw as ArrayBuffer)))
      expect(body.model).toBe(DEFAULT_MODEL)
      expect(body.messages).toEqual([{ role: 'user', content: 'hi' }])
      expect(body.max_tokens).toBe(4096)
      expect(body.stream).toBe(true)
    })

    test('parses a non-streamed reply as a single piece', async () => {
      const seen = new Set<string>()
      globalThis.fetch = vi.fn().mockImplementation(
        async (input: RequestInfo | URL, _init?: RequestInit) => {
          seen.add(String(input))
          if (String(input) === MODELS_URL) {
            return new Response(
              JSON.stringify({
                data: [{ id: DEFAULT_MODEL, permissions: { chat: { create: { streamed: false } } } }],
              }),
              { status: 200, headers: { 'content-type': 'application/json' } },
            )
          }
          if (String(input) === CHAT_URL) {
            return new Response(
              JSON.stringify({ choices: [{ message: { content: 'one shot.' } }] }),
              { status: 200, headers: { 'content-type': 'application/json' } },
            )
          }
          return new Response(JSON.stringify({ error: { message: `no handler for ${input}` } }), {
            status: 404,
          })
        },
      )

      const gen = complete({ GROQ_API_KEY: 'gsk-test' } as never, {
        model: DEFAULT_MODEL,
        messages: [{ role: 'user', content: 'hi' }],
        signal: new AbortController().signal,
      })

      const pieces: string[] = []
      for await (const piece of gen) pieces.push(piece)

      expect(pieces).toEqual(['one shot.'])
      expect([...seen]).toEqual([MODELS_URL, CHAT_URL])
    })

    test('stops when the client signal is aborted', async () => {
      let chatInvoked = false
      let abortErrorThrown = false
      globalThis.fetch = vi.fn().mockImplementation(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          if (String(input) === MODELS_URL) {
            return new Response(
              JSON.stringify({
                data: [{ id: DEFAULT_MODEL, permissions: { chat: { create: { streamed: true } } } }],
              }),
              { status: 200, headers: { 'content-type': 'application/json' } },
            )
          }
          if (String(input) === CHAT_URL) {
            chatInvoked = true
            // Honor the abort signal the way a real fetch would: if it is already
            // aborted, reject with an AbortError.
            if ((init?.signal as AbortSignal | undefined)?.aborted) {
              abortErrorThrown = true
              throw new DOMException('The operation was aborted.', 'AbortError')
            }
            await new Promise((resolve) => setTimeout(resolve, 50))
            return new Response(
              JSON.stringify({ choices: [{ message: { content: 'too late' } }] }),
              { status: 200, headers: { 'content-type': 'application/json' } },
            )
          }
          throw new Error(`unexpected url: ${input}`)
        },
      )

      const controller = new AbortController()
      const gen = complete(
        { GROQ_API_KEY: 'gsk-test' } as never,
        {
          model: DEFAULT_MODEL,
          messages: [{ role: 'user', content: 'hi' }],
          signal: controller.signal,
        },
      )

      // Kick off the generator, then abort before the first chunk arrives.
      const first = gen.next()
      controller.abort()
      await first

      // After a client abort, the generator ends cleanly (partial text was
      // already saved by the caller). Assert the upstream call was made and the
      // abort was honored.
      expect(chatInvoked).toBe(true)
      expect(abortErrorThrown).toBe(true)
      await expect(gen.next()).resolves.toMatchObject({ done: true, value: undefined })
    })
  })

  describe('generateReplies', () => {
    let originalFetch: typeof globalThis.fetch

    beforeEach(() => {
      originalFetch = globalThis.fetch
    })
    afterEach(() => {
      globalThis.fetch = originalFetch
    })

    test('sends the screenshot to the vision model and parses the replies', async () => {
      let requestBody: { model?: string; messages?: { role: string; content: unknown }[] } = {}
      globalThis.fetch = vi.fn().mockImplementation(async (_input: RequestInfo | URL, init?: RequestInit) => {
        requestBody = JSON.parse(String(init?.body))
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    analysis: 'She is teasing you and leaving the door open.',
                    replies: [
                      { tone: 'Playful', text: 'Careful, I might take that as an invitation.' },
                      { tone: 'Warm', text: 'You are trouble. I like it.' },
                    ],
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      })

      const result = await generateReplies({ GROQ_API_KEY: 'gsk-test' } as never, {
        image: 'data:image/png;base64,abc',
        tone: 'Playful',
      })

      expect(result.analysis).toContain('teasing')
      expect(result.replies).toHaveLength(2)
      expect(result.replies[0]).toMatchObject({ tone: 'Playful' })
      expect(result.replies[0]!.text).toContain('invitation')
      expect(requestBody.model).toBe(REPLY_MODEL)
      const userMessage = requestBody.messages?.find((message) => message.role === 'user')
      expect(userMessage?.content).toEqual(
        expect.arrayContaining([expect.objectContaining({ type: 'image_url' })]),
      )
    })

    test('throws a usable error when the model returns no replies', async () => {
      globalThis.fetch = vi.fn().mockImplementation(async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify({ analysis: 'The screenshot is unreadable.', replies: [] }) } }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )

      await expect(
        generateReplies({ GROQ_API_KEY: 'gsk-test' } as never, { text: 'Her: hey', tone: 'Playful' }),
      ).rejects.toMatchObject({ code: 'empty', message: 'The screenshot is unreadable.' })
    })
  })
})
