import { isPoster, type Poster } from './PosterLayout'

const storageKey = 'egg-exhibit-posters-v1'
const endpoint = import.meta.env.BASE_URL + 'api/posters'
const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)

type Page = { items: Poster[]; next?: number }
const likesKey = storageKey + '-likes'
export const fourDigits = (count: number) => String(Math.min(count, 9999)).padStart(4, '0')

export class PosterStore {
  mode: 'local' | 'shared' | 'unknown' = 'unknown'
  private readonly counts = new Map<string, number>()

  likes(id: string) {
    return this.counts.get(id) ?? 0
  }

  async like(id: string) {
    if (this.mode !== 'local') {
      const result = await this.request(endpoint + '?like=' + encodeURIComponent(id), { method: 'POST' })
      if (result) {
        if (!Number.isSafeInteger(result.count) || result.count < 1) throw new Error('Invalid like count')
        const count = Math.max(this.likes(id), result.count)
        this.counts.set(id, count)
        return count
      }
    }
    const local = JSON.parse(localStorage.getItem(likesKey) ?? '{}') as Record<string, number>
    const count = (local[id] ?? 0) + 1
    local[id] = count
    localStorage.setItem(likesKey, JSON.stringify(local))
    this.counts.set(id, count)
    return count
  }

  async list(before?: number): Promise<Page> {
    if (this.mode === 'local') return { items: this.readLocal() }
    const result = await this.request(before ? endpoint + '?before=' + before : endpoint)
    if (!result) return { items: this.readLocal() }
    if (!Array.isArray(result.items) || !result.items.every(isPoster)) throw new Error('Invalid archive')
    for (const { id } of result.items as Poster[]) {
      const count = result.likes?.[id]
      if (Number.isSafeInteger(count) && count >= 0) this.counts.set(id, Math.max(this.likes(id), count))
    }
    return { items: result.items, next: Number.isSafeInteger(result.next) ? result.next : undefined }
  }

  async save(poster: Poster) {
    if (this.mode !== 'local') {
      const result = await this.request(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(poster),
      })
      if (result) {
        if (!isPoster(result.item) || result.item.id !== poster.id) throw new Error('Invalid acknowledgement')
        return result.item
      }
    }
    const items = this.readLocal()
    if (!items.some(item => item.id === poster.id)) {
      localStorage.setItem(storageKey, JSON.stringify([poster, ...items]))
    }
    return poster
  }

  private async request(url: string, options?: RequestInit) {
    const request = await fetch(url, { ...options, signal: AbortSignal.timeout(8000), cache: 'no-store' })
    const json = request.headers.get('content-type')?.includes('application/json')
    if (localHost && !json) {
      this.mode = 'local'
      return
    }
    const data = json ? await request.json() : undefined
    if (request.status === 503 && data?.mode === 'local') {
      // A deployment served before a database has been bound deliberately uses local storage.
      this.mode = 'local'
      return
    }
    if (!request.ok || data?.mode !== 'shared') throw new Error('Archive unavailable')
    this.mode = 'shared'
    return data
  }

  private readLocal(): Poster[] {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]')
    if (!Array.isArray(value) || !value.every(isPoster)) throw new Error('Unreadable local archive')
    const likes = JSON.parse(localStorage.getItem(likesKey) ?? '{}') as Record<string, number>
    for (const { id } of value) this.counts.set(id, likes[id] ?? 0)
    return value
  }
}
