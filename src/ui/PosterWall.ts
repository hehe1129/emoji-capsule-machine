import { emojiImage } from '../emoji/emojiImage'
import type { EmojiKind } from '../emoji/catalog'
import { portrait, posterColors, posterSize, type Poster, type Sticker } from '../capsule/PosterLayout'
import { PosterStore } from '../capsule/PosterStore'

type ExhibitPoster = Pick<Poster, 'id' | 'palette' | 'stickers'> & Partial<Pick<Poster, 'createdAt'>>

const samples: EmojiKind[] = ['sun', 'moon', 'turtle', 'heart', 'angry', 'lightning',
  'fish', 'worm', 'cat', 'chicken', 'sad', 'moon']
const initial: ExhibitPoster[] = samples.map((kind, index) => ({
  id: 'example-' + (index + 1),
  palette: [0, 1, 3, 2, 2, 0, 1, 3, 3, 2, 0, 1][index],
  stickers: [{ kind, x: 300, y: 414, size: 375, tilt: index % 2 ? 14 : -8 }],
}))

function stickerElement(sticker: Sticker) {
  const art = portrait(sticker.kind, sticker.state)
  const wrapper = document.createElement('span')
  wrapper.className = 'poster-sticker'
  wrapper.style.left = sticker.x / posterSize.width * 100 + '%'
  wrapper.style.top = sticker.y / posterSize.height * 100 + '%'
  wrapper.style.width = sticker.size / posterSize.width * 100 + '%'
  wrapper.style.transform = 'translate(-50%, -50%) rotate(' + (sticker.tilt + art.tilt * 180 / Math.PI) + 'deg)'
  wrapper.append(emojiImage(art.kind, 'poster-art'))
  if (art.badge) wrapper.append(emojiImage(art.badge, 'poster-badge'))
  return wrapper
}

export function posterElement(poster: ExhibitPoster) {
  const print = document.createElement('span')
  print.className = 'print'
  print.classList.toggle('print-sample', !poster.createdAt)
  const colors = posterColors[poster.palette]
  print.style.setProperty('--print-paper', colors.paper)
  print.style.setProperty('--print-field', colors.field)
  const field = document.createElement('span')
  field.className = 'print-field'
  print.append(field, ...poster.stickers.map(stickerElement))
  if (poster.createdAt) {
    const title = document.createElement('span')
    const number = document.createElement('span')
    title.className = 'print-title'
    number.className = 'print-number'
    title.textContent = '扭蛋黄'
    number.textContent = '#' + poster.id.slice(0, 8).toUpperCase()
    print.append(title, number)
  }
  return print
}

export class PosterWall {
  private readonly grid: HTMLElement
  readonly store = new PosterStore()
  private items: Poster[] = []
  private next?: number
  private busy = false
  private tiles = new Map<string, HTMLButtonElement>()
  private hoveredY?: number
  private fractionalScroll = 0

  constructor(
    readonly viewport: HTMLElement,
    private readonly show: (poster: ExhibitPoster) => void,
    private readonly report: (message: string) => void,
  ) {
    this.grid = viewport.querySelector<HTMLElement>('.poster-grid')!
    this.render()
    viewport.addEventListener('scroll', () => this.loadNearEnd(), { passive: true })
    window.addEventListener('storage', () => {
      if (this.store.mode === 'local') void this.refresh()
    })
  }

  async refresh() {
    if (this.busy || document.hidden) return
    this.busy = true
    try {
      const page = await this.store.list()
      const lastId = page.items.at(-1)?.id
      const overlap = lastId ? this.items.findIndex(item => item.id === lastId) : -1
      if (overlap >= 0 && page.next) {
        this.items = [...page.items, ...this.items.slice(overlap + 1)]
        if (this.items.length === page.items.length) this.next = page.next
      } else {
        this.items = page.items
        this.next = page.next
      }
      this.render()
    } catch {
      this.report('海报墙暂时无法同步。')
    } finally {
      this.busy = false
    }
  }

  async loadNearEnd() {
    if (this.busy || !this.next || this.viewport.scrollTop + this.viewport.clientHeight * 1.6 < this.viewport.scrollHeight) return
    this.busy = true
    try {
      const page = await this.store.list(this.next)
      const ids = new Set(this.items.map(item => item.id))
      this.items.push(...page.items.filter(item => !ids.has(item.id)))
      this.next = page.next
      this.render()
    } catch {
      this.report('其余海报暂时无法载入。')
    } finally {
      this.busy = false
    }
  }

  add(poster: Poster) {
    this.items = [poster, ...this.items.filter(item => item.id !== poster.id)]
    this.render()
  }

  aim(screenY?: number) {
    this.hoveredY = screenY
    if (screenY === undefined) this.fractionalScroll = 0
  }

  tick(delta: number) {
    if (this.hoveredY === undefined) return
    const bounds = this.viewport.getBoundingClientRect()
    const cursor = (this.hoveredY - bounds.top) / bounds.height
    const edge = 0.18
    const weight = cursor < 0 || cursor > 1 ? 0
      : cursor < edge ? -(1 - cursor / edge) : Math.max(0, (cursor - 1 + edge) / edge)
    this.fractionalScroll += Math.sign(weight) * weight ** 2 * Math.min(36, delta) * 0.72
    const step = Math.trunc(this.fractionalScroll)
    this.fractionalScroll -= step
    if (step) this.viewport.scrollTop += step
  }

  private render() {
    const posters = [...this.items, ...initial.slice(this.items.length)]
    const ids = new Set(posters.map(item => item.id))
    const before = this.viewport.getBoundingClientRect().top
    const anchor = this.viewport.scrollTop > 0
      ? [...this.grid.children].find(child => child.getBoundingClientRect().bottom > before && ids.has((child as HTMLElement).dataset.poster!))
      : undefined
    const oldTop = anchor?.getBoundingClientRect().top
    for (const [id, tile] of this.tiles) {
      if (!ids.has(id)) {
        tile.remove()
        this.tiles.delete(id)
      }
    }
    posters.forEach((poster, index) => {
      let tile = this.tiles.get(poster.id)
      if (!tile) {
        tile = document.createElement('button')
        tile.type = 'button'
        tile.className = 'poster-tile'
        tile.dataset.hand = ''
        tile.dataset.native = ''
        tile.dataset.poster = poster.id
        tile.setAttribute('aria-label', poster.createdAt ? '查看海报 ' + poster.id.slice(0, 8) : '查看示例海报 ' + poster.id.slice(8))
        tile.append(posterElement(poster))
        tile.addEventListener('click', () => this.show(poster))
        this.tiles.set(poster.id, tile)
      }
      const at = this.grid.children.item(index)
      if (at !== tile) this.grid.insertBefore(tile, at)
    })
    if (oldTop !== undefined && anchor) {
      const scale = this.viewport.getBoundingClientRect().height / this.viewport.offsetHeight
      this.viewport.scrollTop += (anchor.getBoundingClientRect().top - oldTop) / scale
    }
  }
}
