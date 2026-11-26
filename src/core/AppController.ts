import { arena, groundY, hatchThickness, inletY, roofY, shakeDuration, trayX, trayEnd, type LidSide, type Settings } from './config'
import { PhysicsManager, physicsStep } from '../physics/PhysicsManager'
import { ReactionEngine } from '../reactions/ReactionEngine'
import type { EmojiEntity } from '../emoji/EmojiEntity'
import { randomKind } from '../emoji/catalog'
import type { Point, PointerId } from '../input/InputManager'
import { captureCapsule, type CapsuleResult } from '../capsule/CapsuleResult'

const throwSmoothing = 1 - Math.exp(-physicsStep / 30)
const maxDragSpeed = 1.65 // scene units per millisecond
type Held = { entity: EmojiEntity; offset: Point; target?: Point; smooth: boolean; previous: Point; velocity: Point }

export class AppController {
  private readonly physics = new PhysicsManager()
  private readonly reactions = new ReactionEngine()
  private readonly objects = new Map<number, EmojiEntity>()
  private readonly held = new Map<PointerId, Held>()
  private readonly heldBodies = new Set<number>()
  private feedSide?: LidSide
  private dragSide?: LidSide
  private lidReleaseMs = 0
  private arriving?: { entity: EmojiEntity; side: LidSide; elapsed: number; endX: number; velocity: Point }
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

  get entities() {
    return this.objects.values()
  }

  get retainedCount() {
    let count = 0
    for (const entity of this.entities) {
      if (entity.retained) count++
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
    const side = this.arriving?.side ?? this.feedSide ?? this.dragSide
    if (side !== this.lidSide) this.physics.setLid(side, Array.from(this.entities, entity => entity.body))
  }

  drop(side: LidSide) {
    if (this.arriving) return false
    if (this.objects.size >= this.settings.maxEmoji) {
      this.notice = '机器已满。'
      return false
    }
    const direction = side === 'left' ? 1 : -1
    const body = this.spawn(side === 'left' ? -75 : arena.width + 75, inletY - 32, true)
    this.physics.hold(body, true)
    this.arriving = {
      entity: this.objects.get(body.id)!, side, elapsed: 0, endX: 57 + Math.random() * 27,
      velocity: { x: direction * (0.17 + Math.random() * 0.28), y: 0.24 + Math.random() * 0.18 },
    }
    this.notice = ''
    return true
  }

  private advanceDrop() {
    const entry = this.arriving
    if (!entry) return
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
      this.arriving = undefined
    }
  }

  private spawn(x: number, y: number, active: boolean) {
    const body = this.physics.create({ x, y }, this.settings)
    const entity = { body, kind: randomKind(), radius: arena.radius, spawnRemaining: active ? 420 : 0 }
    this.objects.set(body.id, entity)
    return body
  }

  private remove(entity: EmojiEntity) {
    for (const [pointer, held] of this.held) {
      if (held.entity === entity) this.release(false, pointer)
    }
    this.physics.remove(entity.body)
    this.objects.delete(entity.body.id)
  }

  grab(point: Point, outsideOnly = false, hideGround = false, pointer: PointerId = 'mouse') {
    if (this.held.has(pointer)) return false
    let closest: EmojiEntity | undefined
    let minDistance = Infinity
    for (const entity of this.entities) {
      const { x, y } = entity.body.position
      const outside = x < 0 || x > arena.width
      if (entity === this.arriving?.entity || this.heldBodies.has(entity.body.id) ||
        (outsideOnly && (entity.retained || (!outside && y >= roofY))) ||
        (hideGround && outside && groundY - y - entity.radius < 38)) continue
      const distance = Math.hypot(x - point.x, y - point.y)
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
    return Array.from(this.entities).filter(entity => entity.retained).map(captureCapsule)
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
      this.physics.moveHatch(this.hatchOpen, this.entities)
      for (const held of this.held.values()) this.stepDrag(held)
      this.reactions.advance(this.entities, physicsStep, this.settings.reactionCooldown)
      for (const [bodyA, bodyB] of this.physics.step(this.settings.gravity, phase)) {
        const first = this.objects.get(bodyA.id)
        const second = this.objects.get(bodyB.id)
        if (!first || !second || first === this.arriving?.entity || second === this.arriving?.entity) continue
        const reaction = this.reactions.match(first, second, this.settings.reactionCooldown)
        if (!reaction) continue
        const { actor, ingredient, rule } = reaction
        if (rule.consumeIngredient !== false) {
          this.remove(ingredient)
        }
        if (rule.growth) {
          const previousRadius = actor.radius
          const maxRadius = Math.min(arena.width, arena.height) * rule.growth.maxRadiusRatio
          const growthCount = actor.reactionCounts?.grow ?? 0
          actor.radius = arena.radius + (maxRadius - arena.radius) * growthCount / rule.growth.steps
          this.physics.grow(actor.body, actor.radius / previousRadius)
        }
        if (rule.motion === 'settle') this.physics.settle(actor.body)
        if (rule.motion === 'boost') this.physics.boost(actor.body)
        if (rule.effect === 'chase') this.physics.chase(actor.body, ingredient.body)
        this.notice = rule.message
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
