const pullThreshold = 0.72

export class CapsuleLever {
  private readonly track: HTMLElement
  private pull?: { source: number | 'hand'; startY: number; travel: number; progress: number }

  constructor(readonly button: HTMLButtonElement, private readonly draw: () => void) {
    this.track = button.querySelector<HTMLElement>('.lever-track')!
    button.addEventListener('pointerdown', event => {
      if (event.button !== 0 || !event.isPrimary || !this.start(event.pointerId, event.clientY)) return
      button.setPointerCapture(event.pointerId)
    })
    button.addEventListener('pointermove', event => {
      if (this.pull?.source === event.pointerId) this.move(event.clientY)
    })
    button.addEventListener('pointerup', event => {
      if (this.pull?.source !== event.pointerId) return
      this.move(event.clientY)
      this.finish()
    })
    for (const type of ['pointercancel', 'lostpointercapture'] as const) {
      button.addEventListener(type, event => {
        if (this.pull?.source === event.pointerId) this.reset()
      })
    }
    button.addEventListener('keydown', event => {
      if (event.key !== 'ArrowDown') return
      event.preventDefault()
      if (!event.repeat && !this.pull && !button.disabled) this.draw()
    })
  }

  startHand(y: number) {
    return this.start('hand', y)
  }

  moveHand(y: number) {
    if (this.pull?.source !== 'hand') return false
    this.move(y)
    return true
  }

  releaseHand() {
    if (this.pull?.source !== 'hand') return false
    this.finish()
    return true
  }

  cancelHand() {
    if (this.pull?.source === 'hand') this.reset()
  }

  private start(source: number | 'hand', y: number) {
    if (this.button.disabled || this.pull) return false
    this.pull = { source, startY: y, travel: this.track.clientHeight * 0.48, progress: 0 }
    this.button.dataset.pulling = ''
    return true
  }

  private move(y: number) {
    if (!this.pull) return
    const progress = Math.max(0, Math.min(1, (y - this.pull.startY) / this.pull.travel))
    this.pull.progress = progress
    this.track.style.setProperty('--pull', String(progress))
    this.button.toggleAttribute('data-armed', progress >= pullThreshold)
  }

  private finish() {
    const commit = (this.pull?.progress ?? 0) >= pullThreshold
    this.reset()
    if (commit && !this.button.disabled) this.draw()
  }

  private reset() {
    this.pull = undefined
    this.track.style.removeProperty('--pull')
    delete this.button.dataset.pulling
    delete this.button.dataset.armed
  }
}
