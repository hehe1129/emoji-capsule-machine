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
  smoothing: 0.55,
}

export interface HandObservation {
  position: Point
  pinchRatio: number
  side?: string
}

const dwellMs: Record<Gesture, number> = { open: 50, pinch: 45 }
const evidenceGapMs = 125
const lossGraceMs = 240
const gripLossGraceMs = 100
const cursorGraceMs = 420

function normalizeAxis(value: number, margin: number, center = 0.5) {
  const span = 1 - 2 * margin
  const start = Math.max(0, Math.min(1 - span, center - span / 2))
  return Math.max(0, Math.min(1, (value - start) / span))
}

export class GestureFilter {
  private stable?: Gesture
  private armed = false
  private pending?: { gesture: Gesture; since: number; lastSeen: number }
  private lastSeen = -Infinity
  private trackingInterrupted = false

  observe(observation: HandObservation | undefined, now: number, config: HandCalibration): InputSample | undefined {
    if (!observation) return this.expire(now)
    if (now - this.lastSeen >= lossGraceMs) this.resetPose()
    this.trackingInterrupted = false
    this.lastSeen = now
    const { position } = observation
    const threshold = config.pinchThreshold + (this.stable === 'pinch' ? 0.12 : 0)
    const pose = observation.pinchRatio <= threshold ? 'pinch' : 'open'
    this.updatePose(pose, now)

    return {
      gesture: this.stable ?? 'hover',
      position: {
        x: normalizeAxis(config.mirror ? 1 - position.x : position.x, config.horizontalMargin),
        y: normalizeAxis(position.y, config.verticalMargin, config.verticalCenter),
      },
      sampledAt: now,
      pinchProgress: Math.max(0, Math.min(1, (config.pinchThreshold + 0.42 - observation.pinchRatio) / 0.42)),
      holdPosition: this.stable !== undefined && this.pending !== undefined,
    }
  }

  private updatePose(gesture: Gesture, now: number) {
    if (this.pending && now - this.pending.lastSeen > evidenceGapMs) this.pending = undefined
    // Require separation after tracking loss before accepting another pinch.
    if (gesture === this.stable || (!this.armed && gesture === 'pinch')) {
      this.pending = undefined
    } else if (this.pending?.gesture !== gesture) {
      this.pending = { gesture, since: now, lastSeen: now }
    } else if (now - this.pending.since >= dwellMs[gesture]) {
      this.stable = gesture
      if (gesture === 'open') this.armed = true
      this.pending = undefined
    } else {
      this.pending.lastSeen = now
    }
  }

  expire(now: number): InputSample | undefined {
    if (this.lastSeen === -Infinity) return
    const gap = now - this.lastSeen
    if (gap >= cursorGraceMs) {
      this.reset()
      return { gesture: 'lost', trackingTimeout: { at: now, hidden: true } }
    }
    if (gap < (this.stable === 'pinch' ? gripLossGraceMs : lossGraceMs) || this.trackingInterrupted) return
    // Release a held item on schedule, but keep the cursor parked through brief tracking loss.
    this.resetPose()
    this.trackingInterrupted = true
    return { gesture: 'lost', trackingTimeout: { at: now, hidden: false } }
  }

  private resetPose() {
    this.stable = undefined
    this.armed = false
    this.pending = undefined
  }

  reset(): InputSample {
    this.resetPose()
    this.lastSeen = -Infinity
    this.trackingInterrupted = false
    return { gesture: 'lost' }
  }
}
