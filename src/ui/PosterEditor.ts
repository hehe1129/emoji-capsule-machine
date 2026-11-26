import { moveSticker, posterColors, posterSize, type Poster } from '../capsule/PosterLayout'
import { catalog } from '../emoji/catalog'
import { posterElement, positionSticker } from './PosterWall'
import type { Point, PointerId } from '../input/InputManager'

const arrowSteps: Record<string, Point> = {
  ArrowLeft: { x: -8, y: 0 }, ArrowRight: { x: 8, y: 0 },
  ArrowUp: { x: 0, y: -8 }, ArrowDown: { x: 0, y: 8 },
}
type Grip = { index: number; offset: Point; pointer: PointerId; target: HTMLElement }
const angle = (a: Point, b: Point) => Math.atan2(b.y - a.y, b.x - a.x)
const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y)

export class PosterEditor {
  private poster?: Poster
  private print?: HTMLElement
  private readonly points = new Map<PointerId, Point>()
  private grip?: Grip
  private pair?: { pointer: PointerId; distance: number; bearing: number; size: number; tilt: number }
  private locked = false
  private readonly swatches: HTMLButtonElement[]

  constructor(private readonly view: HTMLElement, private readonly colors: HTMLElement) {
    this.swatches = posterColors.map((color, index) => {
      const swatch = document.createElement('button')
      swatch.type = 'button'
      swatch.dataset.hand = ''
      swatch.dataset.native = ''
      swatch.setAttribute('aria-label', color.name)
      swatch.title = color.name
      swatch.style.setProperty('--swatch', color.paper)
      swatch.addEventListener('click', () => this.selectColor(index))
      this.colors.append(swatch)
      return swatch
    })
    view.addEventListener('keydown', event => {
      const target = event.target as HTMLElement
      const index = Number(target.dataset.sticker)
      const step = arrowSteps[event.key]
      const sticker = this.poster?.stickers[index]
      if (!this.locked && step && sticker) {
        event.preventDefault()
        moveSticker(sticker, sticker.x + step.x, sticker.y + step.y, this.poster?.version)
        positionSticker(target, sticker)
      }
    })
  }

  open(poster: Poster) {
    this.close()
    this.poster = poster
    const print = this.print = posterElement(poster, true)
    print.classList.add('print-editor')
    for (const [index, sticker] of poster.stickers.entries()) {
      const node = print.querySelector<HTMLElement>('[data-sticker="' + index + '"]')!
      node.tabIndex = 0
      node.setAttribute('role', 'img')
      node.setAttribute('aria-label', catalog[sticker.kind] + '，可用方向键移动')
    }
    this.view.replaceChildren(print)
    this.colors.hidden = false
    this.lock(false)
    this.selectColor(poster.palette)
  }

  close() {
    this.release()
    this.poster = undefined
    this.print = undefined
    this.colors.hidden = true
  }

  lock(locked: boolean) {
    this.release()
    this.locked = locked
    this.print?.toggleAttribute('data-locked', locked)
    for (const swatch of this.swatches) swatch.disabled = locked
  }

  private selectColor(index: number) {
    if (!this.poster || !this.print || this.locked) return
    this.poster.palette = index
    this.print.style.setProperty('--print-paper', posterColors[index].paper)
    this.swatches.forEach((button, item) => button.setAttribute('aria-pressed', String(item === index)))
  }

  private coordinates(screen: Point) {
    const bounds = this.print!.getBoundingClientRect()
    return {
      x: (screen.x - bounds.left) * posterSize.width / bounds.width,
      y: (screen.y - bounds.top) * posterSize.height / bounds.height,
    }
  }

  get hasSelection() {
    return !!this.grip
  }

  grab(target: HTMLElement | undefined, screen: Point, pointer: PointerId, allowAssist: boolean) {
    if (this.locked || !this.print || !this.poster || this.points.has(pointer)) return false
    const index = Number(target?.dataset.sticker)
    const sticker = target && this.print.contains(target) ? this.poster.stickers[index] : undefined
    if (this.grip ? !allowAssist : !sticker && !allowAssist) return false
    const point = this.coordinates(screen)
    this.points.set(pointer, point)
    if (!this.grip && sticker && target) {
      this.grip = { index, offset: { x: sticker.x - point.x, y: sticker.y - point.y }, pointer, target }
      target.dataset.dragging = ''
    }
    this.startPair()
    return true
  }

  private startPair() {
    if (!this.grip || !this.poster || this.pair || this.points.size < 2) return
    const entry = [...this.points].find(([pointer]) => pointer !== this.grip?.pointer)
    if (!entry) return
    const [pointer, point] = entry
    const anchor = this.points.get(this.grip.pointer)!
    const span = distance(anchor, point)
    if (span < 8) return
    const { size, tilt, x, y } = this.poster.stickers[this.grip.index]
    this.grip.offset = { x: x - anchor.x, y: y - anchor.y }
    this.pair = { pointer, distance: span, bearing: angle(anchor, point), size, tilt }
  }

  drag(screen: Point, pointer: PointerId) {
    if (!this.points.has(pointer)) return
    this.points.set(pointer, this.coordinates(screen))
    const grip = this.grip
    if (!grip || !this.poster) return
    this.startPair()
    const { index, offset, target } = grip
    const anchor = this.points.get(grip.pointer)!
    const sticker = this.poster.stickers[index]
    const pair = this.pair
    if (pair) {
      const other = this.points.get(pair.pointer)!
      const rotation = angle(anchor, other) - pair.bearing
      const maxTilt = this.poster.version === 3 ? 180 : this.poster.version === 2 ? 41 : 16
      const tilt = Math.round(pair.tilt + rotation * 180 / Math.PI)
      sticker.tilt = Math.max(-maxTilt, Math.min(maxTilt, ((tilt + 540) % 360) - 180))
      sticker.size = Math.max(12, Math.min(296, Math.round(pair.size * distance(anchor, other) / pair.distance)))
      const scale = sticker.size / pair.size
      moveSticker(sticker, anchor.x + scale * (offset.x * Math.cos(rotation) - offset.y * Math.sin(rotation)),
        anchor.y + scale * (offset.x * Math.sin(rotation) + offset.y * Math.cos(rotation)), this.poster.version)
    } else {
      moveSticker(sticker, anchor.x + offset.x, anchor.y + offset.y, this.poster.version)
    }
    positionSticker(target, sticker)
  }

  release(pointer?: PointerId) {
    if (pointer) this.points.delete(pointer)
    else this.points.clear()
    const grip = this.grip
    if (!grip) return
    if (!pointer || pointer === grip.pointer) {
      grip.target.removeAttribute('data-dragging')
      this.grip = this.pair = undefined
    } else if (pointer === this.pair?.pointer && this.poster) {
      const { x, y } = this.poster.stickers[grip.index]
      const anchor = this.points.get(grip.pointer)!
      grip.offset = { x: x - anchor.x, y: y - anchor.y }
      this.pair = undefined
    }
  }
}
