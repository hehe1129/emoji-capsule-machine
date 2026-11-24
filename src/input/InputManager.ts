export type Point = { x: number; y: number }
export type InputSample = {
  position: Point
  gesture: 'hover' | 'open' | 'pinch'
  sampledAt?: number
  holdPosition?: boolean
} | { gesture: 'lost'; trackingTimeout?: { at: number; hidden: boolean } }

export interface InputSource {
  connect(emit: (sample: InputSample) => void): () => void
}

export type InputAction = {
  position: Point
  type: 'move' | 'grab' | 'release'
  pressed: boolean
} | { type: 'cancel'; position?: Point; pressed: false }

const displayFrameMs = 1000 / 60
const maxCursorSpeed = 0.0036 // normalized units per millisecond
const largeSampleJump = 0.18 // normalized distance between camera observations
const resumeAfterHideMs = 650

// Sources deliver normalized surface coordinates. Smoothing and transitions
// belong here so a camera can drive the same controls as a mouse.
export class InputManager {
  private disconnect?: () => void
  private position?: Point
  private pressed = false
  private pinchAnchor?: { offset: Point; previous: Point; remaining: number }
  private cameraTarget?: Point
  private lastCameraPoint?: Point
  private suspectCameraPoint?: Point
  private resumeUntil?: number
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
    // A delayed paint gets the same travel budget as a normal frame.
    const elapsed = Math.min(now - (this.frameAt ?? now), displayFrameMs)
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

  private accept(sample: InputSample) {
    const { gesture } = sample
    if (gesture === 'lost') {
      const timeout = sample.trackingTimeout
      if (timeout?.hidden && this.position) this.resumeUntil = timeout.at + resumeAfterHideMs
      if (!timeout) {
        this.position = undefined
        this.resumeUntil = undefined
      }
      this.pressed = false
      this.pinchAnchor = undefined
      this.cameraTarget = undefined
      this.lastCameraPoint = undefined
      this.suspectCameraPoint = undefined
      this.send({ position: timeout?.hidden ? undefined : this.position, type: 'cancel', pressed: false })
      return
    }

    let { position } = sample
    const { sampledAt, holdPosition } = sample
    const resumeUntil = this.resumeUntil
    if (resumeUntil !== undefined) {
      if (sampledAt === undefined || sampledAt > resumeUntil) this.position = undefined
      this.resumeUntil = undefined
    }
    const pressed = gesture === 'pinch'
    const changed = pressed !== this.pressed
    const camera = sampledAt !== undefined
    if (camera && changed && pressed && this.position) {
      this.pinchAnchor = {
        offset: { x: this.position.x - position.x, y: this.position.y - position.y },
        previous: position,
        remaining: 1,
      }
    } else if (!pressed) {
      this.pinchAnchor = undefined
    }

    const lockPosition = camera && (changed || holdPosition)
    if (this.pinchAnchor && !lockPosition) {
      const anchor = this.pinchAnchor
      const distance = Math.hypot(position.x - anchor.previous.x, position.y - anchor.previous.y)
      // Blend away the pose offset when the pinch actually moves.
      anchor.remaining = Math.max(0, anchor.remaining - Math.max(0, distance - 0.004) / 0.14)
      anchor.previous = position
      position = {
        x: Math.max(0, Math.min(1, position.x + anchor.offset.x * anchor.remaining)),
        y: Math.max(0, Math.min(1, position.y + anchor.offset.y * anchor.remaining)),
      }
    }

    if (camera) {
      // The display loop follows the latest sample and never jumps ahead of it.
      if (lockPosition) {
        this.cameraTarget = undefined
        this.lastCameraPoint = undefined
        this.suspectCameraPoint = undefined
      } else {
        this.cameraTarget = this.confirmCameraPoint(position)
      }
      if (this.position && !changed && resumeUntil === undefined) return
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

  private confirmCameraPoint(point: Point): Point {
    const previous = this.lastCameraPoint
    if (previous) {
      const dx = point.x - previous.x
      const dy = point.y - previous.y
      if (Math.hypot(dx, dy) >= largeSampleJump) {
        const suspect = this.suspectCameraPoint
        this.suspectCameraPoint = point
        if (!suspect) return previous
        const sx = suspect.x - previous.x
        const sy = suspect.y - previous.y
        // A second observation must still be displaced in the same direction.
        if (dx * sx + dy * sy < (sx * sx + sy * sy) / 2) return previous
      }
    }
    this.suspectCameraPoint = undefined
    this.lastCameraPoint = point
    return point
  }
}
