import { catalog, type EmojiKind } from '../emoji/catalog'
import { emojiImage } from '../emoji/emojiImage'
import type { EmojiChannels } from '../emoji/EmojiChannels'

type Source = number | 'key' | 'hand'

export class ChannelControls {
  private readonly lanes: { shell: HTMLElement; stack: HTMLElement; button: HTMLButtonElement; stock?: EmojiKind[] }[] = []
  private readonly held = new Map<number, Source>()

  constructor(host: HTMLElement, private readonly channels: EmojiChannels) {
    channels.lanes.forEach((_, index) => {
      const shell = document.createElement('div')
      shell.className = 'channel'
      const tube = document.createElement('div')
      tube.className = 'tube'
      tube.setAttribute('aria-hidden', 'true')
      const stack = document.createElement('div')
      stack.className = 'channel-stock'
      const gate = document.createElement('span')
      gate.className = 'channel-gate'
      tube.append(stack, gate)
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'channel-button'
      button.dataset.channel = String(index)
      button.dataset.native = ''
      button.setAttribute('aria-pressed', 'false')
      button.setAttribute('aria-label', '按住投放，通道 ' + (index + 1))
      button.disabled = true
      button.addEventListener('pointerdown', event => {
        if (event.button === 0 && this.press(index, event.pointerId)) button.setPointerCapture(event.pointerId)
      })
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
        button.addEventListener(type, event => this.release(index, event.pointerId))
      }
      button.addEventListener('keydown', event => {
        if (event.key !== ' ' && event.key !== 'Enter') return
        event.preventDefault()
        if (!event.repeat) this.press(index, 'key')
      })
      button.addEventListener('keyup', event => {
        if (event.key === ' ' || event.key === 'Enter') this.release(index, 'key')
      })
      button.addEventListener('blur', () => this.release(index, 'key'))
      shell.append(tube, button)
      host.append(shell)
      this.lanes.push({ shell, stack, button })
    })
    window.addEventListener('blur', () => this.cancelAll())
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.cancelAll()
    })
    this.render()
  }

  ready() {
    for (const { button } of this.lanes) button.disabled = false
  }

  press(index: number, source: Source) {
    if (this.lanes[index].button.disabled || this.held.has(index)) return false
    this.held.set(index, source)
    this.channels.press(index, performance.now())
    this.setOpen(index, true)
    return true
  }

  releaseHand() {
    for (const index of this.held.keys()) this.release(index, 'hand')
  }

  cancelAll() {
    for (const [index, source] of this.held) this.release(index, source)
  }

  render() {
    this.channels.lanes.forEach(({ stock }, index) => {
      const visual = this.lanes[index]
      if (visual.stock === stock) return
      if (visual.stock) {
        visual.stack.lastElementChild?.remove()
        visual.stack.prepend(emojiImage(catalog[stock[0]].art, 'channel-art'))
        if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
          visual.stack.getAnimations().forEach(animation => animation.cancel())
          visual.stack.animate([{ transform: 'translateY(-25%)' }, { transform: 'translateY(0)' }],
            { duration: 180, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' })
        }
      } else {
        visual.stack.replaceChildren(...stock.map(kind => emojiImage(catalog[kind].art, 'channel-art')))
      }
      visual.stock = stock
    })
  }

  private release(index: number, source: Source) {
    if (this.held.get(index) !== source) return
    this.held.delete(index)
    this.channels.release(index)
    this.setOpen(index, false)
  }

  private setOpen(index: number, open: boolean) {
    const { shell, button } = this.lanes[index]
    shell.toggleAttribute('data-open', open)
    button.setAttribute('aria-pressed', String(open))
  }
}
