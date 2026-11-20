import type { InputSample, Point } from './InputManager'

type Gesture = 'open' | 'fist'

export interface HandCalibration {
  confidence: number
  mirror: boolean
  horizontalMargin: number
  verticalMargin: number
  verticalCenter: number
  smoothing: number
}

export const defaultHandCalibration: HandCalibration = {
  confidence: 0.55,
  mirror: true,
  horizontalMargin: 0.12,
  verticalMargin: 0.18,
  verticalCenter: 0.62,
  smoothing: 0.55,
}

export interface HandObservation {
  position: Point
  gesture?: Gesture
  confidence?: number
  extendedPalm?: boolean
  curledFingers?: number
}

const dwellMs: Record<Gesture, number> = { open: 50, fist: 45 }
const evidenceGapMs = 125
const lossGraceMs = 240
const cursorGraceMs = 420

function normalizeAxis(value: number, margin: number, center = 0.5) {
  const span = 1 - 2 * margin
  const start = Math.max(0, Math.min(1 - span, center - span / 2))
  return Math.max(0, Math.min(1, (value - start) / span))
}

function classify(observation: HandObservation, confidence: number): Gesture | undefined {
  const score = observation.confidence ?? 0
  if (score >= confidence && observation.gesture) return observation.gesture
  const curledFingers = observation.curledFingers ?? 0
  if (curledFingers === 4 || (curledFingers === 3 && observation.gesture === 'fist' && score >= confidence * 0.65)) {
    return 'fist'
  }
  if (observation.extendedPalm) return 'open'
}

export class GestureFilter {
  private stable?: Gesture
  private armed = false
  private pending?: { gesture: Gesture; since: number; lastSeen: number }
  private lastSeen = -Infinity
  private lastPose = -Infinity
  private lastOpen = -Infinity
  private trackingInterrupted = false

  observe(observation: HandObservation | undefined, now: number, config: HandCalibration): InputSample | undefined {
    if (!observation) return this.expire(now)
    if (now - this.lastSeen >= lossGraceMs) this.resetPose()
    this.trackingInterrupted = false
    this.lastSeen = now
    const { position } = observation
    const pose = classify(observation, config.confidence)
    if (pose === 'open') this.lastOpen = now
    this.updatePose(pose, now)

    return {
      gesture: this.stable ?? 'hover',
      position: {
        x: normalizeAxis(config.mirror ? 1 - position.x : position.x, config.horizontalMargin),
        y: normalizeAxis(position.y, config.verticalMargin, config.verticalCenter),
      },
      sampledAt: now,
      holdPosition: (this.stable === 'open' && (this.pending?.gesture === 'fist' ||
        (pose === undefined && now - this.lastOpen <= evidenceGapMs))) ||
        (this.stable === 'fist' && this.pending?.gesture === 'open'),
    }
  }

  private updatePose(gesture: Gesture | undefined, now: number) {
    if (this.pending && now - this.pending.lastSeen > evidenceGapMs) this.pending = undefined
    if (!gesture) {
      // Keep an ambiguous transition briefly, but release a held object on persistent uncertainty.
      if (now - this.lastPose >= lossGraceMs) {
        if (this.stable === 'fist') this.armed = false
        this.stable = undefined
      }
      return
    }
    this.lastPose = now
    // Recover with an open palm so a fist entering the frame cannot click.
    if (gesture === this.stable || (!this.armed && gesture === 'fist')) {
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
    if (gap < lossGraceMs || this.trackingInterrupted) return
    // Release a held item on schedule, but keep the cursor parked through brief tracking loss.
    this.resetPose()
    this.trackingInterrupted = true
    return { gesture: 'lost', trackingTimeout: { at: now, hidden: false } }
  }

  private resetPose() {
    this.stable = undefined
    this.armed = false
    this.pending = undefined
    this.lastPose = -Infinity
    this.lastOpen = -Infinity
  }

  reset(): InputSample {
    this.resetPose()
    this.lastSeen = -Infinity
    this.trackingInterrupted = false
    return { gesture: 'lost' }
  }
}
