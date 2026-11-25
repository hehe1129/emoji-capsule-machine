import type { InputSample, InputSource } from './InputManager'

export class MouseInput implements InputSource {
  constructor(private readonly surface: HTMLElement, private readonly bounds = () => surface.getBoundingClientRect()) {}

  connect(emit: (sample: InputSample) => void) {
    const controller = new AbortController()
    const options = { signal: controller.signal }
    let active: { id: number; target: HTMLElement } | undefined

    const send = (event: PointerEvent, gesture: InputSample['gesture']) => {
      const rect = this.bounds()
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
      if (pointer?.target.hasPointerCapture(pointer.id)) {
        pointer.target.releasePointerCapture(pointer.id)
      }
      emit({ gesture: 'lost' })
    }

    this.surface.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || !event.isPrimary || active !== undefined) return
      if (event.target instanceof Element && event.target.closest('[data-native]')) return
      const target = event.target instanceof Element ? event.target.closest('dialog') ?? this.surface : this.surface
      active = { id: event.pointerId, target }
      target.setPointerCapture(event.pointerId)
      send(event, 'pinch')
    }, options)
    this.surface.addEventListener('pointermove', (event) => {
      if (!event.isPrimary || (active && event.pointerId !== active.id)) return
      send(event, active === undefined ? 'open' : 'pinch')
    }, options)
    this.surface.addEventListener('pointerup', (event) => {
      if (active?.id !== event.pointerId) return
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
