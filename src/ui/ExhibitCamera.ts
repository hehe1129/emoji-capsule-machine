import { cabinet, exhibit, machineCamera, room, roomBaseline, roomHorizon, roomScale } from '../core/config'
import { place } from './placement'

export type View = 'overview' | 'machine' | 'wall'

const cameraEase = 'cubic-bezier(0.77, 0, 0.175, 1)'
const cameraTime = 550
const machineSize = 0.6

export class ExhibitCamera {
  view: View = 'overview'
  locked = false
  private readonly cabinet = document.getElementById('cabinet')!
  private readonly floor = document.querySelector<HTMLElement>('.floor')!
  private readonly viewport = document.getElementById('poster-viewport')!
  private readonly grid = this.viewport.querySelector<HTMLElement>('.poster-grid')!

  constructor(
    private readonly surface: HTMLElement,
    private readonly world: HTMLElement,
    private readonly onChange: () => void,
    private readonly resizeRoom: (left: number, right: number, top: number) => void,
  ) {
    place(this.cabinet, cabinet)
    new ResizeObserver(() => this.layout()).observe(surface)
    this.layout()
  }

  private layout() {
    const width = this.surface.clientWidth
    const height = this.surface.clientHeight
    if (!width || !height) return
    const overviewScale = roomScale(width, height)
    const base = roomBaseline(height)
    const floor = roomHorizon(width, height)
    const overviewObjectScale = overviewScale * machineSize
    const visibleWidth = width / overviewObjectScale
    const arenaCenter = cabinet.width / 2 - cabinet.chamber.x
    this.resizeRoom(arenaCenter - visibleWidth / 2, arenaCenter + visibleWidth / 2,
      cabinet.height - cabinet.chamber.y - base / overviewObjectScale)
    this.surface.style.setProperty('--horizon', floor + 'px')
    this.world.style.setProperty('--room-ground', room.floor + 'px')
    this.world.style.setProperty('--machine-size', String(machineSize))
    this.floor.style.transform = 'translateY(' + (this.view === 'overview' ? floor : height) + 'px)'
    const close = this.view === 'machine'
    this.cabinet.style.scale = String(close ? 1 : machineSize)
    const scale = close ? Math.min(width / machineCamera.framingWidth, height / machineCamera.framingHeight) : overviewScale
    const x = width / 2 - exhibit.width / 2 * scale
    const headroom = Math.max(height * 0.018, (height - scale * machineCamera.framingHeight) * 0.22)
    const y = close ? headroom - (cabinet.y + machineCamera.top) * scale : base - room.floor * scale
    this.world.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + scale + ')'
  }

  async go(view: View, focus?: HTMLElement) {
    if (this.locked || view === this.view) return
    const previous = this.view
    const worldBefore = getComputedStyle(this.world).transform
    const cabinetBefore = getComputedStyle(this.cabinet).scale
    const poster = focus ?? this.grid.querySelector<HTMLElement>('[data-poster]')
    const posterBefore = poster?.getBoundingClientRect()
    this.locked = true
    this.view = view
    this.surface.dataset.navigation = ''
    this.surface.dataset.view = view
    this.world.dataset.view = view
    this.world.dataset.transition = ''
    this.layout()
    this.onChange()
    const alignWall = () => {
      const index = poster ? Array.from(this.grid.children).indexOf(poster) : 0
      const columns = parseFloat(this.grid.style.getPropertyValue('--poster-columns')) || 15
      const dx = parseFloat(this.grid.style.getPropertyValue('--poster-focus-column')) || 0
      const dy = parseFloat(this.grid.style.getPropertyValue('--poster-focus-row')) || 0
      this.viewport.scrollTo(Math.max(0, index % columns - 1) * dx,
        Math.max(0, Math.floor(index / columns) - 1) * dy)
    }
    if (view === 'wall') alignWall()
    else if (previous === 'wall') this.viewport.scrollTo(0, 0)
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const timing = { duration: cameraTime, easing: cameraEase }
      const motion = [
        this.world.animate([{ transform: worldBefore }, { transform: this.world.style.transform }], timing),
        this.cabinet.animate([{ scale: cabinetBefore }, { scale: this.cabinet.style.scale }], timing),
      ]
      if ((view === 'wall' || previous === 'wall') && poster && posterBefore) {
        const wallAfter = this.grid.getBoundingClientRect()
        const posterAfter = poster.getBoundingClientRect()
        const zoom = posterBefore.width / posterAfter.width
        const displayZoom = Number(getComputedStyle(this.grid).zoom) || 1
        const x = (posterBefore.left - wallAfter.left - (posterAfter.left - wallAfter.left) * zoom) / displayZoom
        const y = (posterBefore.top - wallAfter.top - (posterAfter.top - wallAfter.top) * zoom) / displayZoom
        motion.push(this.grid.animate([
          { transform: 'translate(' + x + 'px,' + y + 'px) scale(' + zoom + ')' },
          { transform: 'none' },
        ], timing))
      }
      await Promise.allSettled(motion.map(animation => animation.finished))
    }
    delete this.world.dataset.transition
    if (view === 'wall') {
      // Apply the final scroll once the focused grid has its full scrollable dimensions.
      await new Promise<void>(resolve => requestAnimationFrame(() => {
        this.grid.getBoundingClientRect()
        alignWall()
        resolve()
      }))
    }
    delete this.surface.dataset.navigation
    this.locked = false
    this.onChange()
  }
}
