const pullThreshold = 0.72

export class CapsuleLever {
  private readonly track: HTMLElement
  private pull?: { startY: number; travel: number; progress: number }

  constructor(readonly button: HTMLButtonElement, private readonly draw: () => void) {
    this.track = button.querySelector<HTMLElement>('.lever-track')!
    button.addEventListener('keydown', event => {
      if (event.key !== 'ArrowDown') return
      event.preventDefault()
      if (!event.repeat && !this.pull && !button.disabled) this.draw()
    })
  }

  start(y: number) {
    if (this.button.disabled || this.pull) return false
    this.pull = { startY: y, travel: this.track.getBoundingClientRect().height * 0.38, progress: 0 }
    this.button.dataset.pulling = ''
    return true
  }

  move(y: number) {
    if (!this.pull) return
    const progress = Math.max(0, Math.min(1, (y - this.pull.startY) / this.pull.travel))
    this.pull.progress = progress
    this.track.style.setProperty('--pull', String(progress))
    this.button.toggleAttribute('data-armed', progress >= pullThreshold)
  }

  release() {
    const commit = (this.pull?.progress ?? 0) >= pullThreshold
    this.cancel()
    if (commit && !this.button.disabled) this.draw()
  }

  cancel() {
    this.pull = undefined
    this.track.style.removeProperty('--pull')
    delete this.button.dataset.pulling
    delete this.button.dataset.armed
  }
}
