import { cabinet, exhibit, posterWall } from '../core/config'
import { place } from './placement'

export type View = 'overview' | 'machine' | 'wall'

export class ExhibitCamera {
  view: View = 'overview'
  locked = false

  constructor(
    surface: HTMLElement,
    fit: HTMLElement,
    private readonly world: HTMLElement,
    private readonly onChange: () => void,
  ) {
    const update = () => { fit.style.transform = 'scale(' + surface.clientWidth / exhibit.width + ')' }
    const observer = new ResizeObserver(update)
    observer.observe(surface)
    update()
    place(document.getElementById('cabinet')!, cabinet)
    place(document.getElementById('poster-wall')!, posterWall)
  }

  async go(view: View) {
    if (this.locked || view === this.view) return
    this.locked = true
    this.view = view
    this.world.dataset.view = view
    this.world.dataset.transition = ''
    this.onChange()
    const bounds = view === 'machine' ? cabinet : posterWall
    const zoom = view === 'overview' ? 1 : view === 'machine' ? 1.66 : 1.33
    const x = view === 'overview' ? 0 : exhibit.width / 2 - (bounds.x + bounds.width / 2) * zoom
    const focusY = view === 'machine' ? cabinet.y + 377 : bounds.y + bounds.height / 2
    const y = view === 'overview' ? 0 : exhibit.height / 2 - focusY * zoom
    const before = this.world.style.transform || 'translate(0px, 0px) scale(1)'
    const after = 'translate(' + x + 'px, ' + y + 'px) scale(' + zoom + ')'
    this.world.style.transform = after
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const animation = this.world.animate([{ transform: before }, { transform: after }], {
        duration: 550, easing: 'cubic-bezier(0.77, 0, 0.175, 1)',
      })
      await animation.finished.catch(() => undefined)
    }
    delete this.world.dataset.transition
    this.locked = false
    this.onChange()
  }
}
