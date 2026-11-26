export type Point = { x: number; y: number }
export const handPointers = ['hand-0', 'hand-1'] as const
export type PointerId = 'mouse' | typeof handPointers[number]
export type InputSample = ({
  position: Point
  gesture: 'hover' | 'open' | 'pinch'
  sampledAt?: number
  palm?: Point
  closing?: boolean
  pinchProgress?: number
} | { gesture: 'lost'; trackingTimeout?: { at: number; hidden: boolean } }) & { pointer?: PointerId }

export interface InputSource {
  connect(emit: (sample: InputSample) => void): () => void
}

type PointerAction = {
  position: Point
  type: 'move' | 'grab' | 'release'
  pressed: boolean
  pinchProgress: number
} | { type: 'cancel'; position?: Point; pressed: false }
export type InputAction = PointerAction & { pointer: PointerId }

const displayFrameMs = 1000 / 60
const largeSampleJump = 0.32 // normalized distance between camera observations
const resumeAfterHideMs = 650

// Sources deliver normalized surface coordinates. Smoothing and transitions
// belong here so a camera can drive the same controls as a mouse.
export class InputManager {
  private disconnect?: () => void
  private readonly pointers = new Map<PointerId, PointerFilter>()

  constructor(
    private readonly send: (action: InputAction) => void,
    private readonly smoothing: () => number,
    private readonly showCameraPoint?: (pointer: PointerId, point: Point, at: number, reset: boolean) => void,
    private readonly paintedCameraPoint?: (pointer: PointerId) => Point | undefined,
  ) {}

  use(source: InputSource) {
    this.disconnect?.()
    this.pointers.clear()
    this.disconnect = source.connect(sample => {
      const pointer = sample.pointer ?? 'mouse'
      let filter = this.pointers.get(pointer)
      if (!filter) {
        filter = new PointerFilter(action => this.send({ ...action, pointer }), this.smoothing,
          (point, at, reset) => this.showCameraPoint?.(pointer, point, at, reset),
          () => this.paintedCameraPoint?.(pointer))
        this.pointers.set(pointer, filter)
      }
      filter.accept(sample)
    })
  }

  update(now: number) {
    for (const filter of this.pointers.values()) filter.update(now)
  }
}

class PointerFilter {
  private position?: Point
  private pressed = false
  private cameraAnchor?: { aim: Point; hand: Point; usesPalm: boolean }
  private cameraTarget?: Point
  private lastCameraPoint?: Point
  private suspectCameraPoint?: Point
  private resumeUntil?: number
  private frameAt?: number
  private pinchProgress = 0
  private paintProgress = false

  constructor(
    private readonly send: (action: PointerAction) => void,
    private readonly smoothing: () => number,
    private readonly showCameraPoint: (point: Point, at: number, reset: boolean) => void,
    private readonly paintedCameraPoint: () => Point | undefined,
  ) {}

  update(now: number) {
    const elapsed = Math.min(now - (this.frameAt ?? now), 40)
    this.frameAt = now
    const target = this.cameraTarget
    if (!this.position || elapsed <= 0) return
    if (!target) {
      if (!this.paintProgress) return
      this.paintProgress = false
      this.send({ position: this.position, type: 'move', pressed: this.pressed, pinchProgress: this.pinchProgress })
      return
    }
    const dx = target.x - this.position.x
    const dy = target.y - this.position.y
    const distance = Math.hypot(dx, dy)
    const retention = this.smoothing() / (1 + distance * 24)
    const fraction = distance <= 0.0005 ? 1 : 1 - retention ** (elapsed / displayFrameMs)
    this.position = {
      x: this.position.x + dx * fraction,
      y: this.position.y + dy * fraction,
    }
    if (fraction === 1) this.cameraTarget = undefined
    this.paintProgress = false
    this.send({ position: this.position, type: 'move', pressed: this.pressed, pinchProgress: this.pinchProgress })
  }

  accept(sample: InputSample) {
    const { gesture } = sample
    if (gesture === 'lost') {
      const timeout = sample.trackingTimeout
      if (timeout?.hidden && this.position) this.resumeUntil = timeout.at + resumeAfterHideMs
      if (!timeout) {
        this.position = undefined
        this.resumeUntil = undefined
      }
      this.pressed = false
      this.pinchProgress = 0
      this.paintProgress = false
      this.cameraAnchor = undefined
      this.cameraTarget = undefined
      this.lastCameraPoint = undefined
      this.suspectCameraPoint = undefined
      this.send({ position: timeout?.hidden ? undefined : this.position, type: 'cancel', pressed: false })
      return
    }

    let { position } = sample
    const { sampledAt } = sample
    const resumeUntil = this.resumeUntil
    if (resumeUntil !== undefined) {
      if (sampledAt === undefined || sampledAt > resumeUntil) this.position = undefined
      this.resumeUntil = undefined
    }
    const pressed = gesture === 'pinch'
    const progress = sample.pinchProgress ?? Number(pressed)
    this.paintProgress = progress !== this.pinchProgress
    this.pinchProgress = progress
    const changed = pressed !== this.pressed
    if (sampledAt !== undefined) {
      // Use the same physical point before, during and after the pinch.
      const usesPalm = sample.palm !== undefined
      if (this.cameraAnchor?.usesPalm !== usesPalm) this.lastCameraPoint = this.suspectCameraPoint = undefined
      const hand = this.confirmCameraPoint(sample.palm ?? position)
      const rebase = changed || !this.cameraAnchor || this.cameraAnchor.usesPalm !== usesPalm
      if (rebase) {
        const aim = this.paintedCameraPoint() ?? this.position ?? position
        this.cameraAnchor = { aim, hand, usesPalm }
      }
      if (sample.closing && !pressed && this.position) {
        const aim = this.paintedCameraPoint() ?? this.position
        this.cameraAnchor = { aim, hand, usesPalm }
        this.position = aim
        this.cameraTarget = undefined
        this.showCameraPoint(aim, sampledAt, true)
        return
      }
      const { aim, hand: origin } = this.cameraAnchor!
      position = {
        x: Math.max(0, Math.min(1, aim.x + (hand.x - origin.x))),
        y: Math.max(0, Math.min(1, aim.y + (hand.y - origin.y))),
      }
      this.showCameraPoint(position, sampledAt, rebase)
      this.cameraTarget = position
      if (this.position && !changed && resumeUntil === undefined) return
      this.position = position
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
      this.send({ position: this.position, type: changed ? (pressed ? 'grab' : 'release') : 'move', pressed, pinchProgress: this.pinchProgress })
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
