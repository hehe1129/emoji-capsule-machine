const maxMoving = 20

export class PosterBreeze {
  private readonly visible = new Set<HTMLElement>()
  private readonly active = new Map<HTMLElement, Animation>()
  private readonly reduced = matchMedia('(prefers-reduced-motion: reduce)')
  private readonly observer: IntersectionObserver
  private timer?: number

  constructor(viewport: HTMLElement) {
    this.observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const tile = entry.target as HTMLElement
        if (tile.isConnected && entry.intersectionRatio >= 0.3) this.visible.add(tile)
        else this.visible.delete(tile)
      }
      this.schedule()
    }, { root: viewport, threshold: 0.3 })
    const applyPreference = () => {
      if (document.hidden || this.reduced.matches) {
        window.clearTimeout(this.timer)
        this.timer = undefined
        for (const motion of this.active.values()) motion.cancel()
        this.active.clear()
      } else {
        this.schedule()
      }
    }
    document.addEventListener('visibilitychange', applyPreference)
    this.reduced.addEventListener('change', applyPreference)
  }

  observe(tile: HTMLElement) {
    this.observer.observe(tile)
  }

  remove(tile: HTMLElement) {
    if (!tile.hasAttribute('data-poster')) return
    this.observer.unobserve(tile)
    this.visible.delete(tile)
    this.active.get(tile)?.cancel()
    this.active.delete(tile)
  }

  private schedule() {
    if (this.timer !== undefined || !this.visible.size || this.reduced.matches || document.hidden) return
    this.timer = window.setTimeout(() => {
      this.timer = undefined
      this.gust()
      this.schedule()
    }, 650 + Math.random() * 850)
  }

  private gust() {
    const idle = [...this.visible].filter(tile => tile.isConnected && !this.active.has(tile))
    const available = Math.min(idle.length, maxMoving - this.active.size, 5)
    const count = Math.ceil(Math.random() * available)
    for (let index = 0; index < count; index++) {
      const [tile] = idle.splice(Math.floor(Math.random() * idle.length), 1)
      const angle = (2 + Math.random() * 1.5) * (Math.random() < 0.5 ? -1 : 1)
      const motion = tile.animate([
        { rotate: '0deg', easing: 'ease-in-out' },
        { rotate: angle + 'deg', offset: 0.34, easing: 'ease-in-out' },
        { rotate: -0.45 * angle + 'deg', offset: 0.71, easing: 'ease-in-out' },
        { rotate: '0deg' },
      ], { duration: 2800 + Math.random() * 1800 })
      this.active.set(tile, motion)
      void motion.finished.catch(() => undefined).finally(() => {
        if (this.active.get(tile) === motion) this.active.delete(tile)
      })
    }
  }
}
