import { ArrowUpRight, Check, ClipboardPaste, Copy, ImagePlus, KeyRound, RefreshCw, Sparkles, X } from 'lucide-react'
import { useEffect, useRef, useState, type DragEvent } from 'react'

import { DAILY_REPLY_LIMIT, GROQ_API_KEYS_URL, REPLY_TONES, type ReplyTone } from '../../shared/config'
import type { ReplyResult, ReplySuggestion } from '../../shared/types'
import { Badge, Button, Spinner, useToast } from '../components/ui'
import { useGenerateReplies, useMe } from '../lib/api'
import { cx } from '../lib/cx'
import { imageFileToDataUrl } from '../lib/image'

export function ReplyStudio() {
  const { data: me, isLoading } = useMe()
  const generate = useGenerateReplies()
  const toast = useToast()
  const fileInput = useRef<HTMLInputElement>(null)
  const [image, setImage] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [context, setContext] = useState('')
  const [tone, setTone] = useState<ReplyTone>('Playful')
  const [result, setResult] = useState<ReplyResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const ai = me?.capabilities.ai ?? true
  const busy = generate.isPending

  const acceptFile = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    try {
      setImage(await imageFileToDataUrl(file))
      setResult(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not read that image.')
    }
  }

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const items = event.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) {
            event.preventDefault()
            void acceptFile(file)
          }
          return
        }
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    void acceptFile(event.dataTransfer.files[0])
  }

  const submit = async () => {
    if (!image && !text.trim()) {
      setError('Add a screenshot or paste the conversation first.')
      return
    }
    setError(null)
    setResult(null)
    try {
      const next = await generate.mutateAsync({ image: image ?? undefined, text: text.trim() || undefined, context: context.trim() || undefined, tone })
      setResult(next)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Could not generate replies.'
      setError(message)
      toast(message, 'danger')
    }
  }

  if (isLoading) {
    return (
      <div className="grid flex-1 place-items-center">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[1100px] px-4 pb-16 pt-6 md:px-8 md:pt-10">
        <div className="max-w-2xl">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-[11.5px] font-medium text-accent">
            <Sparkles className="size-3.5" />
            Screenshot to reply
          </p>
          <h1 className="mt-4 text-balance text-[30px] font-semibold tracking-[-0.03em] md:text-[38px]">She texted. Now what?</h1>
          <p className="mt-3 max-w-xl text-[14.5px] leading-relaxed text-muted">
            Drop a screenshot of the chat. FlirtGPT reads the vibe, the last message, and the subtext, then writes three replies you can copy straight into Instagram, Snapchat, or wherever you matched.
          </p>
        </div>

        {!ai && (
          <div className="mt-6 flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface p-4 shadow-card">
            <span className="grid size-9 place-items-center rounded-tile bg-surface-2">
              <KeyRound className="size-4 text-muted" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-medium">Connect Groq to read screenshots</p>
              <p className="text-[12.5px] text-faint">Add GROQ_API_KEY on the server. It stays out of the browser.</p>
            </div>
            <a href={GROQ_API_KEYS_URL} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 rounded-tile px-2.5 text-[13px] font-medium text-fg hover:bg-surface-2">
              Get a key
              <ArrowUpRight className="size-3.5" />
            </a>
          </div>
        )}

        <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <section className="min-w-0 space-y-4">
            <div
              onDragOver={(event) => event.preventDefault()}
              onDrop={onDrop}
              className={cx(
                'relative overflow-hidden rounded-[24px] border border-dashed border-line-strong bg-surface shadow-card transition-colors',
                image ? 'border-solid' : 'hover:border-fg/30',
              )}
            >
              {image ? (
                <div className="relative">
                  <img src={image} alt="Uploaded chat screenshot" className="max-h-[440px] w-full object-contain bg-surface-2" />
                  <div className="absolute right-2 top-2 flex gap-1.5">
                    <Button size="icon-sm" variant="secondary" aria-label="Replace screenshot" onClick={() => fileInput.current?.click()}>
                      <ImagePlus />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="secondary"
                      aria-label="Remove screenshot"
                      onClick={() => {
                        setImage(null)
                        setResult(null)
                      }}
                    >
                      <X />
                    </Button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => fileInput.current?.click()} className="flex min-h-[260px] w-full flex-col items-center justify-center gap-3 px-6 py-10 text-center">
                  <span className="grid size-12 place-items-center rounded-card bg-surface-2">
                    <ImagePlus className="size-5 text-muted" />
                  </span>
                  <span className="text-[15px] font-medium">Drop a chat screenshot here</span>
                  <span className="max-w-xs text-[13px] leading-relaxed text-muted">or click to upload. You can also paste one with Ctrl+V / ⌘V.</span>
                  <span className="mt-1 inline-flex items-center gap-1.5 text-[12px] text-faint">
                    <ClipboardPaste className="size-3.5" />
                    PNG, JPG, or WebP
                  </span>
                </button>
              )}
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(event) => {
                  void acceptFile(event.target.files?.[0])
                  event.target.value = ''
                }}
              />
            </div>

            <div className="rounded-card bg-surface p-4 shadow-card">
              <label htmlFor="pasted" className="text-[13.5px] font-medium">
                Or paste the conversation
              </label>
              <p className="mt-0.5 text-[12.5px] text-faint">Useful when the screenshot is hard to read, or you are on desktop.</p>
              <textarea
                id="pasted"
                value={text}
                onChange={(event) => setText(event.target.value)}
                rows={4}
                placeholder={'Her: hey, sorry I disappeared\nYou: no worries, busy week?\nHer: yeah, work has been crazy'}
                className="scrollbar-thin mt-3 block w-full resize-y rounded-control border border-line-strong bg-surface px-3 py-2.5 text-[13.5px] leading-relaxed text-fg placeholder:text-faint focus:border-fg/40 focus:outline-none focus:ring-[3px] focus:ring-fg/8"
              />
            </div>

            <div className="rounded-card bg-surface p-4 shadow-card">
              <label htmlFor="context" className="text-[13.5px] font-medium">
                Anything I should know?
              </label>
              <p className="mt-0.5 text-[12.5px] text-faint">Optional. The app you met on, how long you have been talking, what you want.</p>
              <input
                id="context"
                value={context}
                maxLength={800}
                onChange={(event) => setContext(event.target.value)}
                placeholder="We matched on Hinge yesterday. She replied once, then went quiet."
                className="mt-3 h-9 w-full rounded-control border border-line-strong bg-surface px-3 text-[13.5px] text-fg placeholder:text-faint focus:border-fg/40 focus:outline-none focus:ring-[3px] focus:ring-fg/8"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-[12.5px] font-medium text-muted">Tone</span>
              {REPLY_TONES.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setTone(option)}
                  className={cx(
                    'h-8 rounded-tile border px-3 text-[12.5px] font-medium transition-colors',
                    tone === option ? 'border-fg bg-fg text-white' : 'border-line-strong bg-surface text-muted hover:text-fg',
                  )}
                >
                  {option}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary" size="md" loading={busy} disabled={!ai || (!image && !text.trim())} onClick={() => void submit()} className="h-10 px-5">
                <Sparkles />
                {busy ? 'Reading the chat…' : 'Generate replies'}
              </Button>
              {(image || text || context || result) && (
                <Button
                  size="md"
                  onClick={() => {
                    setImage(null)
                    setText('')
                    setContext('')
                    setResult(null)
                    setError(null)
                  }}
                >
                  Clear
                </Button>
              )}
            </div>
            <p className="text-[12px] text-faint">Up to {DAILY_REPLY_LIMIT} screenshot reads a day.</p>
            {error && <p className="text-[13px] text-danger">{error}</p>}
          </section>

          <aside className="min-w-0">
            <ResultPanel result={result} busy={busy} onRegenerate={() => void submit()} tone={tone} />
          </aside>
        </div>
      </div>
    </div>
  )
}

function ResultPanel({ result, busy, onRegenerate, tone }: { result: ReplyResult | null; busy: boolean; onRegenerate: () => void; tone: ReplyTone }) {
  if (busy) {
    return (
      <div className="rounded-[24px] bg-surface p-5 shadow-card">
        <div className="flex items-center gap-2 text-[13px] font-medium text-muted">
          <Spinner className="size-4" />
          Reading the conversation…
        </div>
        <div className="mt-5 space-y-2.5">
          <div className="h-3 w-4/5 animate-pulse rounded bg-surface-2" />
          <div className="h-3 w-full animate-pulse rounded bg-surface-2" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-surface-2" />
        </div>
        <div className="mt-7 space-y-3">
          {[0, 1, 2].map((index) => (
            <div key={index} className="h-24 animate-pulse rounded-card bg-surface-2" />
          ))}
        </div>
      </div>
    )
  }

  if (!result) {
    return (
      <div className="rounded-[24px] border border-line bg-surface p-6 text-center shadow-card">
        <span className="mx-auto grid size-11 place-items-center rounded-card bg-surface-2">
          <Sparkles className="size-5 text-muted" />
        </span>
        <p className="mt-4 text-[14px] font-medium">Your replies will land here</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">Upload a screenshot, pick a tone, and FlirtGPT will write three replies that sound like you on a good day.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="rounded-[24px] bg-surface p-5 shadow-card">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[13.5px] font-semibold">Read of the chat</h2>
          <Badge tone="neutral">{tone}</Badge>
        </div>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{result.analysis}</p>
      </div>

      {result.replies.map((reply, index) => (
        <ReplyCard key={`${reply.tone}-${index}`} reply={reply} index={index} />
      ))}

      <Button className="w-full" onClick={onRegenerate}>
        <RefreshCw />
        Try another angle
      </Button>
    </div>
  )
}

function ReplyCard({ reply, index }: { reply: ReplySuggestion; index: number }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(reply.text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard unavailable */
    }
  }
  return (
    <div className="rounded-[20px] bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-faint">
          {reply.tone || `Option ${index + 1}`}
        </span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex h-7 items-center gap-1.5 rounded-[8px] px-2 text-[12px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-[14.5px] leading-relaxed">{reply.text}</p>
    </div>
  )
}
