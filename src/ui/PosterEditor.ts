import { moveSticker, posterBackground, posterColors, posterLabels, posterSize, posterTemplates, type Placement, type Poster, type Sticker } from '../capsule/PosterLayout'
import { catalog } from '../emoji/catalog'
import { posterElement, positionLabel, positionSticker } from './PosterWall'
import type { Point, PointerId } from '../input/InputManager'

const arrowSteps: Record<string, Point> = {
  ArrowLeft: { x: -8, y: 0 }, ArrowRight: { x: 8, y: 0 },
  ArrowUp: { x: 0, y: -8 }, ArrowDown: { x: 0, y: 8 },
}
type Grip = { item: Placement; offset: Point; pointer: PointerId; target: HTMLElement }
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
  private readonly templates: HTMLButtonElement[]
  private readonly items = new Map<HTMLElement, Placement>()

  constructor(private readonly view: HTMLElement, private readonly colors: HTMLElement, private readonly templatePanel: HTMLElement) {
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
    this.templates = posterTemplates.map((name, index) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.dataset.hand = ''
      button.dataset.native = ''
      button.setAttribute('aria-label', name + '模板')
      button.title = name
      button.addEventListener('click', () => {
        if (this.poster && !this.locked) {
          this.poster.template = index
          this.updateBackground()
        }
      })
      this.templatePanel.append(button)
      return button
    })
    view.addEventListener('focusin', event => {
      const target = event.target as HTMLElement
      if (!this.locked) this.raiseSticker(target)
    })
    view.addEventListener('keydown', event => {
      const target = event.target as HTMLElement
      const item = this.items.get(target)
      if (this.locked || !item || !this.poster) return
      const step = arrowSteps[event.key]
      if (step) moveSticker(item, item.x + step.x, item.y + step.y, this.poster.version)
      else if (event.key === '+' || event.key === '=') item.size = Math.min(296, item.size + 8)
      else if (event.key === '-') item.size = Math.max(12, item.size - 8)
      else if (event.key === '[' || event.key === ']') {
        item.tilt = ((item.tilt + (event.key === '[' ? -5 : 5) + 540) % 360) - 180
      } else return
      event.preventDefault()
      this.position(target, item)
    })
    view.addEventListener('wheel', event => {
      const target = (event.target as HTMLElement).closest<HTMLElement>('[data-sticker], [data-label]')
      const item = target && this.items.get(target)
      if (this.locked || !target || !item || event.deltaY === 0) return
      event.preventDefault()
      this.raiseSticker(target)
      const step = -Math.sign(event.deltaY)
      if (event.shiftKey) item.tilt = ((item.tilt + step * 5 + 540) % 360) - 180
      else item.size = Math.max(12, Math.min(296, item.size + step * 6))
      this.position(target, item)
    }, { passive: false })
  }

  private raiseSticker(target: HTMLElement) {
    const item = this.items.get(target)
    if (!this.poster || !item || !('kind' in item)) return
    const stickers = this.poster.stickers
    const index = stickers.indexOf(item as Sticker)
    if (index < 0 || index === stickers.length - 1) return
    stickers.push(...stickers.splice(index, 1))
    this.items.forEach((placement, node) => {
      if ('kind' in placement) node.style.zIndex = String(stickers.indexOf(placement as Sticker))
    })
  }

  private position(node: HTMLElement, placement: Placement) {
    if (node.hasAttribute('data-label')) positionLabel(node, placement)
    else positionSticker(node, placement)
  }

  open(poster: Poster) {
    this.close()
    this.poster = poster
    const print = this.print = posterElement(poster, true)
    print.classList.add('print-editor')
    for (const [index, sticker] of poster.stickers.entries()) {
      const node = print.querySelector<HTMLElement>('[data-sticker="' + index + '"]')!
      this.items.set(node, sticker)
      node.tabIndex = 0
      node.setAttribute('role', 'img')
      node.setAttribute('aria-label', catalog[sticker.kind] + '，可用方向键移动')
    }
    if (poster.version === 4) {
      for (const { key, text, placement } of posterLabels(poster)) {
        const node = print.querySelector<HTMLElement>('[data-label="' + key + '"]')!
        this.items.set(node, poster.labels![key] ??= { ...placement })
        node.tabIndex = 0
        node.setAttribute('aria-label', text + '，方向键移动，加减键缩放，方括号键旋转')
      }
    }
    this.view.replaceChildren(print)
    this.colors.hidden = false
    this.templatePanel.hidden = poster.version !== 4
    this.lock(false)
    this.updateBackground()
  }

  close() {
    this.release()
    this.poster = undefined
    this.print = undefined
    this.colors.hidden = true
    this.templatePanel.hidden = true
    this.items.clear()
  }

  lock(locked: boolean) {
    this.release()
    this.locked = locked
    this.print?.toggleAttribute('data-locked', locked)
    for (const swatch of [...this.swatches, ...this.templates]) swatch.disabled = locked
  }

  private selectColor(index: number) {
    if (!this.poster || !this.print || this.locked) return
    const poster = this.poster
    if (poster.version !== 4) poster.palette = index
    else if (index === poster.secondPalette) poster.secondPalette = undefined
    else if (index === poster.palette) {
      if (poster.secondPalette !== undefined) {
        poster.palette = poster.secondPalette
        poster.secondPalette = undefined
      }
    } else {
      if (poster.secondPalette !== undefined) poster.palette = poster.secondPalette
      poster.secondPalette = index
    }
    this.updateBackground()
  }

  private updateBackground() {
    if (!this.poster || !this.print) return
    const { palette, secondPalette, template = 0 } = this.poster
    this.swatches.forEach((button, index) => {
      button.setAttribute('aria-pressed', String(index === palette || index === secondPalette))
      button.dataset.colorOrder = index === palette ? '1' : index === secondPalette ? '2' : ''
    })
    this.print.style.setProperty('--print-paper', posterColors[palette].paper)
    this.print.toggleAttribute('data-dark-palette', palette === 6 || secondPalette === 6)
    if (this.poster.version === 4) this.print.style.backgroundImage = `url("${posterBackground(palette, template, secondPalette)}")`
    this.templates.forEach((button, index) => {
      button.setAttribute('aria-pressed', String(index === template))
    })
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
    const sticker = target && this.items.get(target)
    if (this.grip ? !allowAssist : !sticker && !allowAssist) return false
    const point = this.coordinates(screen)
    this.points.set(pointer, point)
    if (!this.grip && sticker && target) {
      this.raiseSticker(target)
      this.grip = { item: sticker, offset: { x: sticker.x - point.x, y: sticker.y - point.y }, pointer, target }
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
    const { size, tilt, x, y } = this.grip.item
    this.grip.offset = { x: x - anchor.x, y: y - anchor.y }
    this.pair = { pointer, distance: span, bearing: angle(anchor, point), size, tilt }
  }

  drag(screen: Point, pointer: PointerId) {
    if (!this.points.has(pointer)) return
    this.points.set(pointer, this.coordinates(screen))
    const grip = this.grip
    if (!grip || !this.poster) return
    this.startPair()
    const { item: sticker, offset, target } = grip
    const anchor = this.points.get(grip.pointer)!
    const pair = this.pair
    if (pair) {
      const other = this.points.get(pair.pointer)!
      const rotation = angle(anchor, other) - pair.bearing
      const maxTilt = this.poster.version >= 3 ? 180 : this.poster.version === 2 ? 41 : 16
      const tilt = Math.round(pair.tilt + rotation * 180 / Math.PI)
      sticker.tilt = Math.max(-maxTilt, Math.min(maxTilt, ((tilt + 540) % 360) - 180))
      sticker.size = Math.max(12, Math.min(296, Math.round(pair.size * distance(anchor, other) / pair.distance)))
      const scale = sticker.size / pair.size
      moveSticker(sticker, anchor.x + scale * (offset.x * Math.cos(rotation) - offset.y * Math.sin(rotation)),
        anchor.y + scale * (offset.x * Math.sin(rotation) + offset.y * Math.cos(rotation)), this.poster.version)
    } else {
      moveSticker(sticker, anchor.x + offset.x, anchor.y + offset.y, this.poster.version)
    }
    this.position(target, sticker)
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
      const { x, y } = grip.item
      const anchor = this.points.get(grip.pointer)!
      grip.offset = { x: x - anchor.x, y: y - anchor.y }
      this.pair = undefined
    }
  }
}
