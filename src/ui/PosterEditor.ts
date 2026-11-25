import { moveSticker, posterColors, posterSize, type Poster } from '../capsule/PosterLayout'
import { catalog } from '../emoji/catalog'
import { posterElement, positionSticker } from './PosterWall'
import type { Point } from '../input/InputManager'

const arrowSteps: Record<string, Point> = {
  ArrowLeft: { x: -8, y: 0 }, ArrowRight: { x: 8, y: 0 },
  ArrowUp: { x: 0, y: -8 }, ArrowDown: { x: 0, y: 8 },
}

export class PosterEditor {
  private poster?: Poster
  private print?: HTMLElement
  private held?: { index: number; offset: Point; target: HTMLElement }
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
        moveSticker(sticker, sticker.x + step.x, sticker.y + step.y)
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

  grab(target: HTMLElement, screen: Point) {
    const index = Number(target.dataset.sticker)
    const sticker = this.poster?.stickers[index]
    if (this.locked || !this.print?.contains(target) || !sticker) return false
    const point = this.coordinates(screen)
    this.held = { index, offset: { x: sticker.x - point.x, y: sticker.y - point.y }, target }
    target.dataset.dragging = ''
    return true
  }

  drag(screen: Point) {
    if (!this.held || !this.poster) return
    const { index, offset, target } = this.held
    const point = this.coordinates(screen)
    const sticker = this.poster.stickers[index]
    moveSticker(sticker, point.x + offset.x, point.y + offset.y)
    positionSticker(target, sticker)
  }

  release() {
    this.held?.target.removeAttribute('data-dragging')
    this.held = undefined
  }
}
