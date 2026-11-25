import { emojiImage } from '../emoji/emojiImage'
import { portrait, posterPalette, posterSize, type Poster, type Sticker } from '../capsule/PosterLayout'
import { PosterStore } from '../capsule/PosterStore'

export function positionSticker(wrapper: HTMLElement, sticker: Sticker) {
  wrapper.style.left = sticker.x / posterSize.width * 100 + '%'
  wrapper.style.top = sticker.y / posterSize.height * 100 + '%'
}

function stickerElement(sticker: Sticker) {
  const art = portrait(sticker.kind, sticker.state)
  const wrapper = document.createElement('span')
  wrapper.className = 'poster-sticker'
  positionSticker(wrapper, sticker)
  wrapper.style.width = sticker.size / posterSize.width * 100 + '%'
  wrapper.style.transform = 'translate(-50%, -50%) rotate(' + (sticker.tilt + art.tilt * 180 / Math.PI) + 'deg)'
  wrapper.append(emojiImage(art.kind, 'poster-art'))
  if (art.badge) wrapper.append(emojiImage(art.badge, 'poster-badge'))
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
  readonly store = new PosterStore()
  private items: Poster[] = []
  private next?: number
  private emptyTiles: HTMLElement[] = []
  private busy = false
  private tiles = new Map<string, HTMLButtonElement>()
  private hoveredY?: number
  private fractionalScroll = 0

  constructor(
    readonly viewport: HTMLElement,
    private readonly show: (poster: Poster) => void,
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
    const posters = this.items
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
        tile.setAttribute('aria-label', '查看海报 ' + poster.id.slice(0, 8))
        const pin = document.createElement('span')
        pin.className = 'poster-pin'
        pin.setAttribute('aria-hidden', 'true')
        const colors = ['#f74e42', '#ffcf2d', '#57a7ef']
        pin.style.setProperty('--pin', colors[parseInt(poster.id.slice(-4), 16) % colors.length])
        tile.append(posterElement(poster), pin)
        tile.addEventListener('click', () => this.show(poster))
        this.tiles.set(poster.id, tile)
      }
      const at = this.grid.children.item(index)
      if (at !== tile) this.grid.insertBefore(tile, at)
    })
    const blankCount = Math.max(0, 12 - posters.length)
    while (this.emptyTiles.length > blankCount) this.emptyTiles.pop()?.remove()
    while (this.emptyTiles.length < blankCount) {
      const empty = document.createElement('span')
      empty.className = 'poster-tile poster-empty'
      empty.setAttribute('aria-hidden', 'true')
      this.grid.append(empty)
      this.emptyTiles.push(empty)
    }
    if (oldTop !== undefined && anchor) {
      const scale = this.viewport.getBoundingClientRect().height / this.viewport.offsetHeight
      this.viewport.scrollTop += (anchor.getBoundingClientRect().top - oldTop) / scale
    }
  }
}
