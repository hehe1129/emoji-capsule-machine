import { arena, groundY, hatchThickness, inletY, roofY, shakeDuration, trayX, trayEnd, type LidSide, type Settings } from './config'
import { PhysicsManager, physicsStep } from '../physics/PhysicsManager'
import { ReactionEngine } from '../reactions/ReactionEngine'
import type { EmojiEntity } from '../emoji/EmojiEntity'
import { randomKind, type EmojiKind } from '../emoji/catalog'
import type { Point, PointerId } from '../input/InputManager'
import { captureCapsule, collectible, type CapsuleResult } from '../capsule/CapsuleResult'

const throwSmoothing = 1 - Math.exp(-physicsStep / 30)
const maxDragSpeed = 1.65 // scene units per millisecond
type Held = { entity: EmojiEntity; offset: Point; target?: Point; smooth: boolean; previous: Point; velocity: Point }

export class AppController {
  private readonly physics = new PhysicsManager()
  private readonly reactions = new ReactionEngine()
  private readonly objects = new Map<number, EmojiEntity>()
  private readonly held = new Map<PointerId, Held>()
  private readonly posterSelection = new Set<number>()
  private readonly heldBodies = new Set<number>()
  private feedSide?: LidSide
  private dragSide?: LidSide
  private lidReleaseMs = 0
  private readonly arrivals = new Map<number, { entity: EmojiEntity; side: LidSide; elapsed: number; endX: number; velocity: Point }>()
  private accumulated = 0
  private shakeStarted?: number
  private nextJolt = 0
  notice = ''

  constructor(readonly settings: Settings) {
    for (let index = 0; index < 10; index++) {
      const x = 48 + index % 5 * 85 + Math.random() * 18
      const y = arena.height - 36 - Math.floor(index / 5) * 56
      this.spawn(x, y, false)
    }
  }

  private readonly reactionWorld = {
    remove: (entity: EmojiEntity) => this.remove(entity),
    spawn: (x: number, y: number, kind: EmojiKind) => {
      const body = this.spawn(x, y, true, kind)
      this.physics.launch(body, { x: (Math.random() - 0.5) * 0.32, y: -0.38 })
    },
  }

  get water() {
    return this.reactions.water
  }

  get entities() {
    return this.objects.values()
  }

  get retainedCount() {
    let count = 0
    for (const entity of this.entities) {
      if (collectible(entity)) count++
    }
    return count
  }

  get heldIds(): ReadonlySet<number> {
    return this.heldBodies
  }

  get hatchOpen() {
    return this.shaking || [...this.held.values()].some(({ entity, target }) => {
      const { x, y } = entity.body.position
      return entity.retained && !!target && x >= trayX && x <= trayEnd &&
        y < arena.height + entity.radius + 85 && target.y < arena.height + entity.radius + 25
    })
  }

  get hatchProgress() {
    return this.physics.hatchProgress
  }

  get shaking() {
    return this.shakeStarted !== undefined
  }

  get lidSide() {
    return this.physics.lidSide
  }

  resizeRoom(left: number, right: number, top?: number) {
    this.physics.resizeRoom(left, right, top)
  }

  setFeedLid(side?: LidSide) {
    this.feedSide = side
  }

  private updateLid() {
    const near = [...this.held.values()].find(({ entity, target }) => {
      const { x, y } = entity.body.position
      return target && y < roofY + 83 && y > roofY - 145 && x > -115 && x < arena.width + 115 &&
        target.y < roofY + 65 && target.y > roofY - 148
    })
    this.lidReleaseMs = Math.max(0, this.lidReleaseMs - physicsStep)
    if (near) this.dragSide ??= near.entity.body.position.x <= arena.width / 2 ? 'left' : 'right'
    else if (!this.lidReleaseMs) this.dragSide = undefined
    const side = this.arrivals.values().next().value?.side ?? this.feedSide ?? this.dragSide
    if (side !== this.lidSide) this.physics.setLid(side, Array.from(this.entities, entity => entity.body))
  }

  drop(side: LidSide) {
    if (this.objects.size >= this.settings.maxEmoji) {
      this.notice = '机器已满。'
      return false
    }
    const direction = side === 'left' ? 1 : -1
    const body = this.spawn(side === 'left' ? -75 : arena.width + 75, inletY - 32, true)
    this.physics.hold(body, true)
    this.arrivals.set(body.id, {
      entity: this.objects.get(body.id)!, side, elapsed: 0, endX: 57 + Math.random() * 27,
      velocity: { x: direction * (0.17 + Math.random() * 0.28), y: 0.24 + Math.random() * 0.18 },
    })
    this.notice = ''
    return true
  }

  private advanceDrop() {
    for (const entry of this.arrivals.values()) {
      entry.elapsed += physicsStep
      const t = Math.min(1, entry.elapsed / 370)
      const u = 1 - t
      const x = -75 * u ** 3 - 123 * u ** 2 * t + 102 * u * t ** 2 + entry.endX * t ** 3
      const y = (inletY - 32) * u ** 3 + (inletY - 28) * 3 * u ** 2 * t +
        (roofY - 56) * 3 * u * t ** 2 + (roofY + 24) * t ** 3
      this.physics.guideDrop(entry.entity.body, { x: entry.side === 'left' ? x : arena.width - x, y })
      if (t === 1) {
        this.physics.hold(entry.entity.body, false)
        this.physics.tune(entry.entity.body, this.settings)
        this.physics.launch(entry.entity.body, entry.velocity)
        this.arrivals.delete(entry.entity.body.id)
      }
    }
  }

  private spawn(x: number, y: number, active: boolean, kind: EmojiKind = randomKind()) {
    const body = this.physics.create({ x, y }, this.settings)
    const entity = { body, kind, radius: arena.radius, spawnRemaining: active ? 420 : 0 }
    this.objects.set(body.id, entity)
    return body
  }

  private remove(entity: EmojiEntity) {
    for (const [pointer, held] of this.held) {
      if (held.entity === entity) this.release(false, pointer)
    }
    this.physics.remove(entity.body)
    this.objects.delete(entity.body.id)
    this.posterSelection.delete(entity.body.id)
  }

  grab(point: Point, outsideOnly = false, hideGround = false, pointer: PointerId = 'mouse') {
    if (this.held.has(pointer)) return false
    let closest: EmojiEntity | undefined
    let minDistance = Infinity
    for (const entity of this.entities) {
      const { x, y } = entity.body.position
      const outside = x < 0 || x > arena.width
      if (this.arrivals.has(entity.body.id) || this.heldBodies.has(entity.body.id) ||
        (outsideOnly && (entity.retained || (!outside && y >= roofY))) ||
        (hideGround && outside && groundY - y - entity.radius < 38)) continue
      const dx = point.x - x
      const dy = point.y - y
      const angle = entity.body.angle
      const distance = entity.heightScale
        ? Math.hypot(dx * Math.cos(angle) + dy * Math.sin(angle), (dy * Math.cos(angle) - dx * Math.sin(angle)) / entity.heightScale)
        : Math.hypot(dx, dy)
      if (distance <= entity.radius + this.settings.grabRange && distance <= minDistance) {
        closest = entity
        minDistance = distance
      }
    }
    if (!closest) return false
    const { x, y } = closest.body.position
    this.held.set(pointer, {
      entity: closest,
      offset: { x: x - point.x, y: y - point.y },
      previous: { x, y }, smooth: false,
      velocity: { x: 0, y: 0 },
    })
    this.heldBodies.add(closest.body.id)
    this.physics.hold(closest.body, true)
    return true
  }

  drag(point: Point, smooth = false, pointer: PointerId = 'mouse') {
    const held = this.held.get(pointer)
    if (!held) return
    const { offset } = held
    const target = { x: point.x + offset.x, y: point.y + offset.y }
    held.target = target
    held.smooth = smooth
  }

  release(throwHeld = false, pointer: PointerId = 'mouse') {
    const held = this.held.get(pointer)
    if (!held) return
    if (throwHeld) this.stepDrag(held)
    const { entity: { body }, velocity } = held
    this.physics.hold(body, false)
    this.physics.tune(body, this.settings)
    if (throwHeld) {
      this.physics.launch(body, velocity)
      if (this.dragSide) this.lidReleaseMs = 460
    }
    this.held.delete(pointer)
    this.heldBodies.delete(body.id)
  }

  private stepDrag(held: Held) {
    const { entity, target, smooth, previous, velocity } = held
    if (target) this.physics.follow(entity.body, target, smooth)
    const { x, y } = entity.body.position
    const dx = x - previous.x
    const dy = y - previous.y
    const distance = Math.hypot(dx, dy)
    const scale = distance > 0 ? Math.min(1 / physicsStep, maxDragSpeed / distance) : 0
    velocity.x += (dx * scale - velocity.x) * throwSmoothing
    velocity.y += (dy * scale - velocity.y) * throwSmoothing
    previous.x = x
    previous.y = y
  }

  shake(now: number) {
    if (this.shaking) return
    this.shakeStarted = now
    this.nextJolt = now
    this.notice = ''
  }

  take(items: readonly CapsuleResult[]) {
    for (const { entityId } of items) {
      const entity = this.objects.get(entityId)
      if (!entity) continue
      this.remove(entity)
    }
  }

  capture() {
    const items = Array.from(this.entities).filter(collectible).map(captureCapsule)
    for (const item of items) this.posterSelection.add(item.entityId)
    return items
  }

  releasePosterSelection() {
    this.posterSelection.clear()
  }

  tune() {
    for (const { body } of this.entities) {
      if (!body.isStatic) this.physics.tune(body, this.settings)
    }
  }

  tick(now: number, delta: number) {
    if (this.shakeStarted !== undefined && now - this.shakeStarted >= shakeDuration) {
      this.shakeStarted = undefined
    }
    const phase = this.shakeStarted === undefined ? undefined : (now - this.shakeStarted) / 53
    if (phase !== undefined && now >= this.nextJolt) {
      this.nextJolt = now + 310
      for (const { body, retained } of this.entities) {
        if (!body.isStatic && body.position.x >= 0 && body.position.x <= arena.width &&
          body.position.y >= roofY) this.physics.shake(body, phase, !!retained)
      }
    }
    this.accumulated += Math.min(delta, 64)
    while (this.accumulated >= physicsStep) {
      this.accumulated -= physicsStep
      this.updateLid()
      this.advanceDrop()
      const hatchOpen = this.hatchOpen
      this.physics.moveHatch(hatchOpen, this.entities)
      for (const held of this.held.values()) this.stepDrag(held)
      // The solver skips static/static pairs. Both pinched pieces are static during a two-hand drag.
      if (this.held.size === 2) {
        const [a, b] = this.held.values()
        if (this.physics.touch(a.entity.body, b.entity.body)) this.reactions.contact(a.entity, b.entity, this.reactionWorld)
      }
      this.water.step(physicsStep, this.hatchProgress)
      for (const entity of this.entities) {
        this.reactions.advance(entity, physicsStep, this.settings.reactionCooldown, this.reactionWorld, hatchOpen)
      }
      for (const [bodyA, bodyB] of this.physics.step(this.settings.gravity, phase)) {
        const first = this.objects.get(bodyA.id)
        const second = this.objects.get(bodyB.id)
        if (first && second && !this.arrivals.has(bodyA.id) && !this.arrivals.has(bodyB.id) &&
          !this.posterSelection.has(bodyA.id) && !this.posterSelection.has(bodyB.id)) {
          this.reactions.contact(first, second, this.reactionWorld)
        }
      }
      for (const entity of this.entities) {
        const { body, radius } = entity
        entity.spawnRemaining = Math.max(0, entity.spawnRemaining - physicsStep)
        const { x, y } = body.position
        if (!entity.retained && x >= trayX && x <= trayEnd && y - radius >= arena.height + hatchThickness) {
          entity.retained = true
        }
        if (entity.retained && y + radius <= arena.height) entity.retained = false
        const state = this.physics.contain(body, radius, !!entity.retained)
        if (state === 'recovered') this.notice = '一个 Emoji 越过边界，已移回容器。'
        if (state === 'invalid') {
          this.remove(entity)
          this.notice = '一个 Emoji 的运动数据异常，已移出容器。'
        }
      }
    }
  }
}
