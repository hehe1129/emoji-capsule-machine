import type { InputSample, InputSource } from './InputManager'

export class MouseInput implements InputSource {
  constructor(private readonly surface: HTMLElement) {}

  connect(emit: (sample: InputSample) => void) {
    const controller = new AbortController()
    const options = { signal: controller.signal }
    let active: number | undefined

    const send = (event: PointerEvent, gesture: InputSample['gesture']) => {
      const rect = this.surface.getBoundingClientRect()
      emit({
        position: {
          x: (event.clientX - rect.left) / rect.width,
          y: (event.clientY - rect.top) / rect.height,
        },
        gesture,
      })
    }
    const cancel = () => {
      const pointer = active
      active = undefined
      if (pointer !== undefined && this.surface.hasPointerCapture(pointer)) {
        this.surface.releasePointerCapture(pointer)
      }
      emit({ position: { x: 0, y: 0 }, gesture: 'lost' })
    }

    this.surface.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || !event.isPrimary || active !== undefined) return
      if (event.target instanceof Element && event.target.closest('[data-native]')) return
      active = event.pointerId
      this.surface.setPointerCapture(active)
      send(event, 'fist')
    }, options)
    this.surface.addEventListener('pointermove', (event) => {
      if (!event.isPrimary || (active !== undefined && event.pointerId !== active)) return
      send(event, active === undefined ? 'open' : 'fist')
    }, options)
    this.surface.addEventListener('pointerup', (event) => {
      if (active !== event.pointerId) return
      active = undefined
      send(event, 'open')
    }, options)
    this.surface.addEventListener('pointerleave', () => {
      if (active === undefined) cancel()
    }, options)
    this.surface.addEventListener('pointercancel', cancel, options)
    this.surface.addEventListener('lostpointercapture', () => {
      if (active !== undefined) cancel()
    }, options)
    window.addEventListener('blur', cancel, options)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) cancel()
    }, options)

    return () => {
      controller.abort()
      cancel()
    }
  }
}
