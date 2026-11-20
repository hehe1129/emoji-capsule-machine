export type Point = { x: number; y: number }
export type InputSample = {
  position: Point
  gesture: 'hover' | 'open' | 'fist' | 'lost'
  sampledAt?: number
  holdPosition?: boolean
}

export interface InputSource {
  connect(emit: (sample: InputSample) => void): () => void
}

export type InputAction = {
  position: Point
  type: 'move' | 'grab' | 'release' | 'cancel'
  pressed: boolean
}

// Sources deliver normalized surface coordinates. Smoothing and transitions
// belong here so a camera can drive the same controls as a mouse.
export class InputManager {
  private disconnect?: () => void
  private position?: Point
  private sampledAt?: number
  private pressed = false
  private fistAnchor?: { offset: Point; previous: Point; remaining: number }

  constructor(
    private readonly send: (action: InputAction) => void,
    private readonly smoothing: () => number,
  ) {}

  use(source: InputSource) {
    this.disconnect?.()
    this.disconnect = source.connect((sample) => this.accept(sample))
  }

  private accept({ position, gesture, sampledAt, holdPosition }: InputSample) {
    if (gesture === 'lost') {
      this.position = undefined
      this.sampledAt = undefined
      this.pressed = false
      this.fistAnchor = undefined
      this.send({ position, type: 'cancel', pressed: false })
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

    const steps = sampledAt !== undefined && this.sampledAt !== undefined
      ? Math.max(1, (sampledAt - this.sampledAt) / (1000 / 60))
      : 1
    const weight = 1 - this.smoothing() ** steps
    if (!this.position || (changed && !camera)) {
      this.position = position
    } else if (!lockPosition) {
      this.position = {
        x: this.position.x + (position.x - this.position.x) * weight,
        y: this.position.y + (position.y - this.position.y) * weight,
      }
    }

    this.sampledAt = sampledAt
    this.pressed = pressed
    this.send({
      position: this.position,
      type: changed ? (pressed ? 'grab' : gesture === 'open' ? 'release' : 'cancel') : 'move',
      pressed,
    })
  }
}
