export type Point = { x: number; y: number }
export type InputSample = {
  position: Point
  gesture: 'hover' | 'open' | 'fist' | 'lost'
  sampledAt?: number
  holdPosition?: boolean
  retainCursor?: boolean
}

export interface InputSource {
  connect(emit: (sample: InputSample) => void): () => void
}

export type InputAction = {
  position: Point
  type: 'move' | 'grab' | 'release'
  pressed: boolean
} | { type: 'cancel'; position?: Point; pressed: false }

const displayFrameMs = 1000 / 60
const maxCursorSpeed = 0.006 // normalized units per millisecond

// Sources deliver normalized surface coordinates. Smoothing and transitions
// belong here so a camera can drive the same controls as a mouse.
export class InputManager {
  private disconnect?: () => void
  private position?: Point
  private pressed = false
  private fistAnchor?: { offset: Point; previous: Point; remaining: number }
  private cameraTarget?: Point
  private frameAt?: number

  constructor(
    private readonly send: (action: InputAction) => void,
    private readonly smoothing: () => number,
  ) {}

  use(source: InputSource) {
    this.disconnect?.()
    this.disconnect = source.connect((sample) => this.accept(sample))
  }

  update(now: number) {
    const elapsed = Math.min(now - (this.frameAt ?? now), 2 * displayFrameMs)
    this.frameAt = now
    const target = this.cameraTarget
    if (!target || !this.position || elapsed <= 0) return
    const dx = target.x - this.position.x
    const dy = target.y - this.position.y
    const distance = Math.hypot(dx, dy)
    const fraction = distance <= 0.0005 ? 1
      : Math.min(1 - this.smoothing() ** (elapsed / displayFrameMs), maxCursorSpeed * elapsed / distance)
    this.position = {
      x: this.position.x + dx * fraction,
      y: this.position.y + dy * fraction,
    }
    if (fraction === 1) this.cameraTarget = undefined
    this.send({ position: this.position, type: 'move', pressed: this.pressed })
  }

  private accept({ position, gesture, sampledAt, holdPosition, retainCursor }: InputSample) {
    if (gesture === 'lost') {
      if (!retainCursor) this.position = undefined
      this.pressed = false
      this.fistAnchor = undefined
      this.cameraTarget = undefined
      this.send({ position: this.position, type: 'cancel', pressed: false })
      return
    }

    const pressed = gesture === 'fist'
    const changed = pressed !== this.pressed
    const camera = sampledAt !== undefined
    if (camera && changed && pressed && this.position) {
      this.fistAnchor = {
        offset: { x: this.position.x - position.x, y: this.position.y - position.y },
        previous: position,
        remaining: 1,
      }
    } else if (!pressed) {
      this.fistAnchor = undefined
    }

    const lockPosition = camera && (changed || holdPosition)
    if (this.fistAnchor && !lockPosition) {
      const anchor = this.fistAnchor
      const distance = Math.hypot(position.x - anchor.previous.x, position.y - anchor.previous.y)
      // Blend away the pose offset when the fist actually moves.
      anchor.remaining = Math.max(0, anchor.remaining - Math.max(0, distance - 0.004) / 0.14)
      anchor.previous = position
      position = {
        x: Math.max(0, Math.min(1, position.x + anchor.offset.x * anchor.remaining)),
        y: Math.max(0, Math.min(1, position.y + anchor.offset.y * anchor.remaining)),
      }
    }

    if (camera) {
      // The display loop follows the latest sample and never jumps ahead of it.
      this.cameraTarget = lockPosition ? undefined : position
      if (this.position && !changed) return
      this.position ??= position
    } else if (!this.position || changed) {
      this.position = position
    } else {
      const weight = 1 - this.smoothing()
      this.position = {
        x: this.position.x + (position.x - this.position.x) * weight,
        y: this.position.y + (position.y - this.position.y) * weight,
      }
    }

    this.pressed = pressed
    if (changed && gesture === 'hover') {
      this.send({ position: this.position, type: 'cancel', pressed: false })
    } else {
      this.send({ position: this.position, type: changed ? (pressed ? 'grab' : 'release') : 'move', pressed })
    }
  }
}
