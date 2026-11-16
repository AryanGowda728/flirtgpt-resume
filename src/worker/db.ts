import type { MiddlewareHandler } from 'hono'

import type { Conversation, Message } from '../shared/types'
import type { AppContext } from './env'

// Schema lives with the Worker: D1 has no migration tool on Freebuff Sites, so
// tables are created on the first request of each isolate. Add new statements
// at the end; never edit existing ones in place once deployed.
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    owner_sub TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    owner_sub TEXT NOT NULL,
    title TEXT NOT NULL,
    model TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS conversations_owner ON conversations(owner_sub, updated_at DESC)`,
  `CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    owner_sub TEXT NOT NULL,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    model TEXT,
    interrupted INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS messages_conversation ON messages(owner_sub, conversation_id, created_at)`,
  // The daily usage count: replies generated per owner per day.
  `CREATE INDEX IF NOT EXISTS messages_owner_role_created ON messages(owner_sub, role, created_at)`,
  // Screenshot reads in the reply studio, counted separately from chats.
  `CREATE TABLE IF NOT EXISTS reply_scans (
    id TEXT PRIMARY KEY,
    owner_sub TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS reply_scans_owner_created ON reply_scans(owner_sub, created_at)`,
]

let ready: Promise<void> | undefined

export function ensureSchema(db: D1Database): Promise<void> {
  ready ??= db.batch(SCHEMA.map((sql) => db.prepare(sql))).then(
    () => undefined,
    (error) => {
      ready = undefined
      throw error
    },
  )
  return ready
}

export const requireDb: MiddlewareHandler<AppContext> = async (c, next) => {
  const db = c.env.DB
  if (!db) {
    return c.json({ error: 'database_missing', message: 'No database is attached yet. Add D1 storage named DB and redeploy.' }, 503)
  }
  await ensureSchema(db)
  c.set('db', db)
  await next()
}

export const id = () => crypto.randomUUID()
export const now = () => Date.now()

type Row = Record<string, unknown>

export function mapConversation(r: Row): Conversation {
  return {
    id: r.id as string,
    title: r.title as string,
    model: r.model as string,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  }
}

export function mapMessage(r: Row): Message {
  return {
    id: r.id as string,
    conversationId: r.conversation_id as string,
    role: r.role as Message['role'],
    content: r.content as string,
    model: (r.model as string | null) ?? null,
    interrupted: Boolean(r.interrupted),
    createdAt: Number(r.created_at),
  }
}

/** Midnight UTC that started the current day, and the next one. */
export function utcDay(at = now()): { start: number; end: number } {
  const start = new Date(at)
  start.setUTCHours(0, 0, 0, 0)
  return { start: start.getTime(), end: start.getTime() + 86_400_000 }
}

/**
 * Replies generated today, including ones still streaming and ones the user
 * stopped: each one spent API credits. Regenerating counts; a request the API
 * refused does not.
 */
export async function repliesToday(db: D1Database, owner: string): Promise<number> {
  const { start } = utcDay()
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM messages WHERE owner_sub = ? AND role = 'assistant' AND created_at >= ?`)
    .bind(owner, start)
    .first<{ n: number }>()
  return Number(row?.n ?? 0)
}

/** Screenshot reads today, used to cap the vision model's spend. */
export async function replyScansToday(db: D1Database, owner: string): Promise<number> {
  const { start } = utcDay()
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM reply_scans WHERE owner_sub = ? AND created_at >= ?`)
    .bind(owner, start)
    .first<{ n: number }>()
  return Number(row?.n ?? 0)
}

/** Records one successful screenshot read. */
export function recordReplyScan(db: D1Database, owner: string): Promise<unknown> {
  return db
    .prepare(`INSERT INTO reply_scans (id, owner_sub, created_at) VALUES (?, ?, ?)`)
    .bind(id(), owner, now())
    .run()
}

/** A conversation title from its first message: the first line, cut at a word. */
export function titleFrom(content: string): string {
  const line = content.trim().split(/\r?\n/)[0]?.replace(/\s+/g, ' ').trim() ?? ''
  if (line.length <= 48) return line || 'New chat'
  const cut = line.slice(0, 48)
  const space = cut.lastIndexOf(' ')
  return `${(space > 24 ? cut.slice(0, space) : cut).replace(/[\s,.;:!?-]+$/, '')}…`
}
