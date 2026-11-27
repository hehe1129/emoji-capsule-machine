import { archivedPosterIds } from './archivedPosterIds'
import { isPoster, type Poster } from '../../src/capsule/PosterLayout'

type Statement = {
  bind(...values: (number | string)[]): Statement
  all<T>(): Promise<{ results: T[] }>
  first<T>(): Promise<T | null>
  run(): Promise<unknown>
}
type Environment = { POSTERS?: { prepare(sql: string): Statement } }
type Context = { env: Environment; request: Request }
const pageSize = 24
const maxBytes = 256000
const archived = JSON.stringify(archivedPosterIds)

const response = (data: unknown, status = 200) => Response.json(data, {
  status,
  headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
})

export async function onRequestGet({ env, request }: Context) {
  if (!env.POSTERS) return response({ mode: 'local' }, 503)
  const before = new URL(request.url).searchParams.get('before')
  const cursor = before === null ? Number.MAX_SAFE_INTEGER : Number(before)
  if (!Number.isSafeInteger(cursor) || cursor < 1) return response({ error: 'Invalid cursor' }, 400)
  try {
    const { results } = await env.POSTERS.prepare(
      `SELECT p.seq, p.id, p.layout, COALESCE(CAST(l.layout AS INTEGER), 0) AS likes
       FROM posters p LEFT JOIN posters l ON l.id = 'like:' || p.id
       WHERE p.seq < ? AND p.id NOT LIKE 'like:%' AND p.id NOT IN (SELECT value FROM json_each(?))
       ORDER BY p.seq DESC LIMIT ?`,
    ).bind(cursor, archived, pageSize + 1).all<{ seq: number; id: string; layout: string; likes: number }>()
    return response({
      mode: 'shared',
      items: results.slice(0, pageSize).map(row => JSON.parse(row.layout)),
      likes: Object.fromEntries(results.slice(0, pageSize).map(row => [row.id, row.likes])),
      next: results.length > pageSize ? results[pageSize - 1].seq : undefined,
    })
  } catch {
    return response({ error: 'Archive unavailable' }, 503)
  }
}

async function readPoster(request: Request): Promise<unknown> {
  const reader = request.body?.getReader()
  if (!reader) return
  const decoder = new TextDecoder()
  let size = 0
  let result = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBytes) {
      await reader.cancel()
      return
    }
    result += decoder.decode(value, { stream: true })
  }
  return JSON.parse(result + decoder.decode())
}

export async function onRequestPost({ env, request }: Context) {
  const origin = request.headers.get('Origin')
  if (origin && origin !== new URL(request.url).origin) return response({ error: 'Invalid origin' }, 403)
  const like = new URL(request.url).searchParams.get('like')
  if (like !== null) {
    if (!env.POSTERS) return response({ mode: 'local' }, 503)
    if (!/^[0-9a-f-]{36}$/i.test(like)) return response({ error: 'Invalid poster ID' }, 400)
    try {
      // Use a separate counter row so repeated likes never rewrite the artwork.
      const row = await env.POSTERS.prepare(
        `INSERT INTO posters(id, layout)
         SELECT 'like:' || id, '1' FROM posters WHERE id = ? AND id NOT IN (SELECT value FROM json_each(?))
         ON CONFLICT(id) DO UPDATE SET layout = CAST(posters.layout AS INTEGER) + 1
         RETURNING CAST(layout AS INTEGER) AS count`,
      ).bind(like, archived).first<{ count: number }>()
      return row ? response({ mode: 'shared', count: row.count }) : response({ error: 'Poster not found' }, 404)
    } catch { return response({ error: 'Likes unavailable' }, 503) }
  }
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) {
    return response({ error: 'Expected JSON' }, 415)
  }
  if (!env.POSTERS) return response({ mode: 'local' }, 503)
  let poster: unknown
  try { poster = await readPoster(request) } catch { return response({ error: 'Invalid JSON' }, 400) }
  if (!isPoster(poster)) return response({ error: 'Invalid poster' }, 400)
  try {
    await env.POSTERS.prepare('INSERT OR IGNORE INTO posters (id, layout) VALUES (?, ?)')
      .bind(poster.id, JSON.stringify(poster)).run()
    const saved = await env.POSTERS.prepare('SELECT layout FROM posters WHERE id = ?')
      .bind(poster.id).first<{ layout: string }>()
    if (!saved) return response({ error: 'Archive unavailable' }, 503)
    const item = JSON.parse(saved.layout) as Poster
    if (JSON.stringify(item) !== JSON.stringify(poster)) return response({ error: 'ID already in use' }, 409)
    return response({ mode: 'shared', item }, 201)
  } catch {
    return response({ error: 'Archive unavailable' }, 503)
  }
}
