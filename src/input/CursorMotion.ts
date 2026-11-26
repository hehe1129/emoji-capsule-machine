import type { Point, PointerId } from './InputManager'

type Reading = { point: Point; at: number }

export class CursorMotion {
  private readonly tracks = new Map<PointerId, { previous: Reading; latest: Reading }>()

  sample(id: PointerId, point: Point, at: number) {
    const track = this.tracks.get(id)
    const previous = track?.latest
    if (previous && at <= previous.at) return
    if (!previous || at - previous.at > 130) {
      const latest = { point, at }
      this.tracks.set(id, { previous: latest, latest })
      return
    }

    const dx = point.x - previous.point.x
    const dy = point.y - previous.point.y
    const distance = Math.hypot(dx, dy)
    const deadZone = 0.0045
    const speed = distance / (at - previous.at)
    const response = Math.min(1, 0.24 + speed * 430)
    const weight = distance <= deadZone ? 0 : response * (1 - deadZone / distance)
    const filtered = weight ? {
      x: previous.point.x + dx * weight,
      y: previous.point.y + dy * weight,
    } : previous.point
    this.tracks.set(id, { previous, latest: { point: filtered, at } })
  }

  clear(id: PointerId) {
    this.tracks.delete(id)
  }

  read(id: PointerId, now: number): Point | undefined {
    const track = this.tracks.get(id)
    if (!track) return
    const { previous, latest } = track
    const interval = latest.at - previous.at
    if (interval <= 0) return latest.point
    const age = now - latest.at
    const displayDelay = Math.min(30, interval * 0.65)
    const dx = latest.point.x - previous.point.x
    const dy = latest.point.y - previous.point.y
    // Interpolate between observations, then taper prediction until the next camera frame.
    const ahead = Math.min(34, Math.max(0, age - displayDelay))
    const prediction = ahead * (1 - ahead / 68)
    const capped = Math.min(prediction / interval, 0.028 / (Math.hypot(dx, dy) || 1))
    const t = age < displayDelay ? Math.max(0, 1 + (age - displayDelay) / interval) : 1 + capped
    // A stale cursor settles back onto its last tracked position before it is hidden.
    const factor = t <= 1 ? t : 1 + (t - 1) * Math.max(0, Math.min(1, (125 - age) / 62))
    return {
      x: Math.max(0, Math.min(1, previous.point.x + dx * factor)),
      y: Math.max(0, Math.min(1, previous.point.y + dy * factor)),
    }
  }
}
