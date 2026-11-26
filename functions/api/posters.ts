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
      'SELECT seq, layout FROM posters WHERE seq < ? ORDER BY seq DESC LIMIT ?',
    ).bind(cursor, pageSize + 1).all<{ seq: number; layout: string }>()
    return response({
      mode: 'shared',
      items: results.slice(0, pageSize).map(row => JSON.parse(row.layout)),
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
