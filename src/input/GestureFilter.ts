import type { InputSample, Point } from './InputManager'

type Gesture = 'open' | 'pinch'

export interface HandCalibration {
  pinchThreshold: number
  mirror: boolean
  horizontalMargin: number
  verticalMargin: number
  verticalCenter: number
  smoothing: number
}

export const defaultHandCalibration: HandCalibration = {
  pinchThreshold: 0.29,
  mirror: true,
  horizontalMargin: 0.12,
  verticalMargin: 0.18,
  verticalCenter: 0.62,
  smoothing: 0.34,
}

export interface HandObservation {
  position: Point
  pinchRatio: number
  palm?: Point
  side?: string
}

const evidenceGapMs = 120
const gripLossGraceMs = 135
const cursorGraceMs = 360

function normalizeAxis(value: number, margin: number, center = 0.5, bounded = true) {
  const span = 1 - 2 * margin
  const start = Math.max(0, Math.min(1 - span, center - span / 2))
  const normalized = (value - start) / span
  return bounded ? Math.max(0, Math.min(1, normalized)) : normalized
}

export class GestureFilter {
  private stable?: Gesture
  private pending?: Gesture
  private lastSeen = -Infinity
  private trackingInterrupted = false

  observe(observation: HandObservation | undefined, now: number, config: HandCalibration): InputSample | undefined {
    if (!observation) return this.expire(now)
    const gap = now - this.lastSeen
    if (gap > evidenceGapMs) this.pending = undefined
    this.trackingInterrupted = false
    this.lastSeen = now
    const { position, pinchRatio, palm } = observation
    const close = config.pinchThreshold
    const open = close + 0.075
    const pose: Gesture | undefined = pinchRatio <= close ? 'pinch' : pinchRatio >= open ? 'open' : undefined
    if (!pose || pose === this.stable) {
      this.pending = undefined
    } else if (this.pending === pose || (pose === 'pinch' ? pinchRatio <= close - 0.055 : pinchRatio >= open + 0.045)) {
      this.stable = pose
      this.pending = undefined
    } else {
      this.pending = pose
    }

    return {
      gesture: this.stable ?? 'hover',
      position: {
        x: normalizeAxis(config.mirror ? 1 - position.x : position.x, config.horizontalMargin),
        y: normalizeAxis(position.y, config.verticalMargin, config.verticalCenter),
      },
      palm: palm && {
        x: normalizeAxis(config.mirror ? 1 - palm.x : palm.x, config.horizontalMargin, 0.5, false),
        y: normalizeAxis(palm.y, config.verticalMargin, config.verticalCenter, false),
      },
      sampledAt: now,
      closing: this.pending === 'pinch',
      pinchProgress: Math.max(0, Math.min(1, (close + 0.38 - pinchRatio) / 0.38)),
    }
  }

  expire(now: number): InputSample | undefined {
    if (this.lastSeen === -Infinity) return
    const gap = now - this.lastSeen
    if (gap >= cursorGraceMs) {
      this.reset()
      return { gesture: 'lost', trackingTimeout: { at: now, hidden: true } }
    }
    if (gap < gripLossGraceMs || this.trackingInterrupted) return
    // Release a held item on schedule, but keep the cursor parked through brief tracking loss.
    this.resetPose()
    this.trackingInterrupted = true
    return { gesture: 'lost', trackingTimeout: { at: now, hidden: false } }
  }

  private resetPose() {
    this.stable = undefined
    this.pending = undefined
  }

  reset(): InputSample {
    this.resetPose()
    this.lastSeen = -Infinity
    this.trackingInterrupted = false
    return { gesture: 'lost' }
  }
}
