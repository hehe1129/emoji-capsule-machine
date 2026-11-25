import { isPoster, type Poster } from './PosterLayout'

const storageKey = 'egg-exhibit-posters-v1'
const endpoint = import.meta.env.BASE_URL + 'api/posters'
const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)

type Page = { items: Poster[]; next?: number }

export class PosterStore {
  mode: 'local' | 'shared' | 'unknown' = 'unknown'

  async list(before?: number): Promise<Page> {
    if (this.mode === 'local') return { items: this.readLocal() }
    const result = await this.request(before ? endpoint + '?before=' + before : endpoint)
    if (!result) return { items: this.readLocal() }
    if (!Array.isArray(result.items) || !result.items.every(isPoster)) throw new Error('Invalid archive')
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
    return value
  }
}
