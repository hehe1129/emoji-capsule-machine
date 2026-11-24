import { cabinet } from '../core/config'
import type { EmojiChannels } from '../emoji/EmojiChannels'
import { placeOnCabinet } from './placement'

type Source = number | 'key' | 'hand'

export class ChannelControls {
  private readonly lanes: { shell: HTMLElement; button: HTMLButtonElement }[] = []
  private readonly held = new Map<number, Source>()

  constructor(host: HTMLElement, private readonly channels: EmojiChannels) {
    cabinet.tubeCenters.forEach((center, index) => {
      const shell = document.createElement('div')
      shell.className = 'channel'
      placeOnCabinet(shell, { x: center - cabinet.tubeWidth / 2, y: 0,
        width: cabinet.tubeWidth, height: cabinet.chamber.y })
      const tube = document.createElement('div')
      tube.className = 'tube'
      tube.setAttribute('aria-hidden', 'true')
      const gate = document.createElement('span')
      gate.className = 'channel-gate'
      gate.setAttribute('aria-hidden', 'true')
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
      shell.append(tube, gate, button)
      host.append(shell)
      this.lanes.push({ shell, button })
    })
    window.addEventListener('blur', () => this.cancelAll())
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.cancelAll()
    })
  }

  ready() {
    for (const { button } of this.lanes) button.disabled = false
  }

  press(index: number, source: Source) {
    if (this.lanes[index].button.disabled || this.held.has(index)) return false
    this.held.set(index, source)
    this.channels.press(index, performance.now())
    this.setPressed(index, true)
    return true
  }

  releaseHand() {
    for (const index of this.held.keys()) this.release(index, 'hand')
  }

  cancelAll() {
    for (const [index, source] of this.held) this.release(index, source)
  }

  render(gateOpen: (index: number) => boolean) {
    this.lanes.forEach(({ shell }, index) => shell.toggleAttribute('data-open', gateOpen(index)))
  }

  private release(index: number, source: Source) {
    if (this.held.get(index) !== source) return
    this.held.delete(index)
    this.channels.release(index)
    this.setPressed(index, false)
  }

  private setPressed(index: number, open: boolean) {
    const { shell, button } = this.lanes[index]
    shell.toggleAttribute('data-pressed', open)
    button.setAttribute('aria-pressed', String(open))
  }
}
