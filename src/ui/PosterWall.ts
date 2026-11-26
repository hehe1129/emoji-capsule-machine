import { emojiImage } from '../emoji/emojiImage'
import { portrait, posterPalette, posterSize, type Poster, type Sticker } from '../capsule/PosterLayout'
import { PosterStore } from '../capsule/PosterStore'
import type { Point } from '../input/InputManager'
import { roomHorizon } from '../core/config'
import { PosterBreeze } from './PosterBreeze'

const posterColumns = 15

export function positionSticker(wrapper: HTMLElement, sticker: Sticker) {
  wrapper.style.left = sticker.x / posterSize.width * 100 + '%'
  wrapper.style.top = sticker.y / posterSize.height * 100 + '%'
  wrapper.style.width = sticker.size / posterSize.width * 100 + '%'
  wrapper.style.transform = 'translate(-50%, -50%) rotate(' + sticker.tilt + 'deg)'
}

function stickerElement(sticker: Sticker) {
  const art = portrait(sticker.kind, sticker.state)
  const wrapper = document.createElement('span')
  wrapper.className = 'poster-sticker'
  positionSticker(wrapper, sticker)
  wrapper.append(emojiImage(art.kind, 'poster-art'))
  return wrapper
}

export function posterElement(poster: Poster, editable = false) {
  const print = document.createElement('span')
  print.className = poster.version === 3 ? 'print print-exhibition' : poster.version === 2 ? 'print print-edition' : 'print'
  const colors = posterPalette(poster)
  print.style.setProperty('--print-paper', colors.paper)
  if (poster.version === 1 && colors.field) {
    print.style.setProperty('--print-field', colors.field)
    const field = document.createElement('span')
    field.className = 'print-field'
    print.append(field)
  }
  poster.stickers.forEach((sticker, index) => {
    const mark = stickerElement(sticker)
    if (editable) mark.dataset.sticker = String(index)
    print.append(mark)
  })
  const title = document.createElement('span')
  const number = document.createElement('span')
  title.className = 'print-title'
  number.className = 'print-number'
  title.textContent = '扭蛋黄'
  number.textContent = '#' + poster.id.slice(0, 8).toUpperCase()
  print.append(title, number)
  if (poster.version === 3) {
    const date = document.createElement('span')
    date.className = 'print-date'
    date.textContent = poster.createdAt.slice(0, 10).replaceAll('-', '.')
    print.append(date)
  }
  if (poster.caption) {
    const caption = document.createElement('span')
    caption.className = 'print-caption'
    caption.textContent = poster.caption
    print.append(caption)
  }
  return print
}

export class PosterWall {
  private readonly grid: HTMLElement
  private readonly breeze: PosterBreeze
  readonly store = new PosterStore()
  private items: Poster[] = []
  private next?: number
  private busy = false
  private tiles = new Map<string, HTMLElement>()
  private showcaseCount = 0
  private pan?: { start: Point; left: number; top: number }

  constructor(
    readonly viewport: HTMLElement,
    private readonly surface: HTMLElement,
    private readonly show: (poster: Poster, tile: HTMLElement) => void,
    private readonly report: (message: string) => void,
    private readonly samples: readonly Poster[],
  ) {
    this.grid = viewport.querySelector<HTMLElement>('.poster-grid')!
    this.breeze = new PosterBreeze(viewport)
    new ResizeObserver(() => this.layout()).observe(this.surface)
    this.layout()
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
    if (this.surface.dataset.view !== 'wall' || this.busy || !this.next ||
      this.viewport.scrollTop + this.viewport.clientHeight * 1.6 < this.viewport.scrollHeight) return
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

  startPan(start: Point) {
    this.pan = { start, left: this.viewport.scrollLeft, top: this.viewport.scrollTop }
    this.viewport.dataset.panning = ''
  }

  movePan(point: Point) {
    if (!this.pan) return
    const { start, left, top } = this.pan
    this.viewport.scrollTo(left + start.x - point.x, top + start.y - point.y)
  }

  stopPan() {
    this.pan = undefined
    delete this.viewport.dataset.panning
  }

  layout() {
    const { clientWidth: width, clientHeight: height } = this.surface
    const base = Math.max(48, width * 0.093)
    const poster = base * 0.65
    const gap = base * 0.45 * 0.3
    const padding = Math.max(52, gap * 0.65)
    const rows = Math.max(1, Math.ceil((roomHorizon(width, height) - padding + gap) / (poster * 1.4 + gap)))
    this.showcaseCount = posterColumns * (rows + 1)
    this.grid.style.setProperty('--poster-width', poster + 'px')
    this.grid.style.setProperty('--poster-gap', gap + 'px')
    this.grid.style.setProperty('--poster-top', padding + 'px')
    this.grid.style.setProperty('--poster-columns', String(posterColumns))
    this.grid.style.setProperty('--poster-field-width', (posterColumns * (poster + gap) - gap) + 'px')
    this.grid.style.setProperty('--poster-focus-pad', width * 0.26 + 'px')
    this.grid.style.setProperty('--poster-focus-block', height * 0.08 + 'px')
    this.render()
  }

  private render() {
    const posters = this.items.length ? this.items : this.samples
    const count = Math.max(this.showcaseCount, Math.ceil(posters.length / posterColumns) * posterColumns)
    const slots = Array.from({ length: count }, (_, index) => {
      const poster = posters[index]
      return { poster, key: poster?.id ?? 'blank-' + index }
    })
    const ids = new Set(slots.map(slot => slot.key))
    const { top, left, bottom, right } = this.viewport.getBoundingClientRect()
    const anchor = this.viewport.scrollTop > 0 && !this.pan
      ? [...this.tiles].find(([key, tile]) => {
        const rect = tile.getBoundingClientRect()
        return ids.has(key) && rect.bottom > top && rect.right > left && rect.top < bottom && rect.left < right
      })?.[1] : undefined
    const oldTop = anchor?.getBoundingClientRect().top
    for (const [id, tile] of this.tiles) {
      if (!ids.has(id)) {
        this.breeze.remove(tile)
        tile.remove()
        this.tiles.delete(id)
      }
    }
    slots.forEach(({ poster, key }, index) => {
      let tile = this.tiles.get(key)
      if (!tile && !poster) {
        tile = document.createElement('span')
        tile.className = 'poster-tile poster-empty'
        tile.setAttribute('aria-hidden', 'true')
        this.tiles.set(key, tile)
      } else if (!tile && poster) {
        const button = document.createElement('button')
        tile = button
        button.type = 'button'
        button.className = 'poster-tile'
        button.dataset.hand = ''
        button.dataset.native = ''
        button.dataset.poster = poster.id
        button.setAttribute('aria-label', '查看海报 ' + poster.id.slice(0, 8))
        const pin = document.createElement('span')
        pin.className = 'poster-pin'
        pin.setAttribute('aria-hidden', 'true')
        const colors = ['#f74e42', '#ffcf2d', '#57a7ef']
        pin.style.setProperty('--pin', colors[parseInt(poster.id.slice(-4), 16) % colors.length])
        button.append(posterElement(poster), pin)
        button.addEventListener('click', () => this.show(poster, button))
        this.tiles.set(key, button)
        this.breeze.observe(button)
      }
      if (!tile) return
      const at = this.grid.children.item(index)
      if (at !== tile) this.grid.insertBefore(tile, at)
    })
    if (oldTop !== undefined && anchor) {
      this.viewport.scrollTop += anchor.getBoundingClientRect().top - oldTop
    }
  }
}
