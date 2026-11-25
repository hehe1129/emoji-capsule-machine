import { arena, hatchX, hatchEnd, shakeDuration, type Settings } from './config'
import { PhysicsManager, physicsStep } from '../physics/PhysicsManager'
import { ReactionEngine } from '../reactions/ReactionEngine'
import type { EmojiEntity } from '../emoji/EmojiEntity'
import { randomKind } from '../emoji/catalog'
import type { Point } from '../input/InputManager'
import { captureCapsule, type CapsuleResult } from '../capsule/CapsuleResult'

const throwSmoothing = 1 - Math.exp(-physicsStep / 30)
const maxDragSpeed = 1.65 // scene units per millisecond

export class AppController {
  private readonly physics = new PhysicsManager()
  private readonly reactions = new ReactionEngine()
  private readonly objects = new Map<number, EmojiEntity>()
  private held?: { entity: EmojiEntity; offset: Point; target?: Point; previous: Point; velocity: Point }
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

  get heldId() {
    return this.held?.entity.body.id
  }

  get shaking() {
    return this.shakeStarted !== undefined
  }

  drop() {
    if (this.objects.size >= this.settings.maxEmoji) {
      this.notice = '机器已满。'
      return false
    }
    this.spawn(arena.radius + 10 + Math.random() * (arena.width - arena.radius * 2 - 20), -arena.radius - 2, true)
    this.notice = ''
    return true
  }

  private spawn(x: number, y: number, active: boolean) {
    const body = this.physics.create({ x, y }, this.settings)
    const entity = { body, kind: randomKind(), radius: arena.radius, spawnRemaining: active ? 420 : 0 }
    this.objects.set(body.id, entity)
  }

  private remove(entity: EmojiEntity) {
    this.physics.remove(entity.body)
    this.objects.delete(entity.body.id)
  }

  grab(point: Point) {
    if (this.held) return
    let closest: EmojiEntity | undefined
    let minDistance = Infinity
    for (const entity of this.entities) {
      if (entity.retained || entity.body.position.y < entity.radius || entity.body.position.y > arena.height) continue
      const distance = Math.hypot(entity.body.position.x - point.x, entity.body.position.y - point.y)
      if (distance <= entity.radius + this.settings.grabRange && distance <= minDistance) {
        closest = entity
        minDistance = distance
      }
    }
    if (!closest) return
    const { x, y } = closest.body.position
    this.held = {
      entity: closest,
      offset: { x: x - point.x, y: y - point.y },
      previous: { x, y },
      velocity: { x: 0, y: 0 },
    }
    this.physics.hold(closest.body, true)
  }

  drag(point: Point, smooth = false) {
    if (!this.held) return
    const { entity, offset } = this.held
    const target = { x: point.x + offset.x, y: point.y + offset.y }
    if (smooth) this.held.target = target
    else this.physics.move(entity.body, target, entity.radius)
  }

  release(throwHeld = false) {
    if (!this.held) return
    const { previous, entity } = this.held
    if (throwHeld && (entity.body.position.x !== previous.x || entity.body.position.y !== previous.y)) {
      this.stepDrag()
    }
    const { entity: { body }, velocity } = this.held
    this.physics.hold(body, false)
    this.physics.tune(body, this.settings)
    if (throwHeld) this.physics.launch(body, velocity)
    this.held = undefined
  }

  private stepDrag() {
    if (!this.held) return
    const { entity, target, previous, velocity } = this.held
    if (target) this.physics.follow(entity.body, target, entity.radius)
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
    this.physics.setHatch(true)
  }

  take(items: readonly CapsuleResult[]) {
    for (const { entityId } of items) {
      const entity = this.objects.get(entityId)
      if (!entity) continue
      if (this.heldId === entityId) this.release()
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
      for (const entity of this.entities) {
        const { x, y } = entity.body.position
        if (!entity.retained && x > hatchX && x < hatchEnd && y >= arena.height) {
          this.physics.finishPassage(entity.body)
        }
      }
      this.physics.setHatch(false)
    }
    const phase = this.shakeStarted === undefined ? undefined : (now - this.shakeStarted) / 53
    if (phase !== undefined && now >= this.nextJolt) {
      this.nextJolt = now + 310
      for (const { body, retained } of this.entities) {
        if (!body.isStatic) this.physics.shake(body, phase, !!retained)
      }
    }
    this.accumulated += Math.min(delta, 64)
    while (this.accumulated >= physicsStep) {
      this.accumulated -= physicsStep
      this.stepDrag()
      this.reactions.advance(this.entities, physicsStep, this.settings.reactionCooldown)
      for (const [bodyA, bodyB] of this.physics.step(this.settings.gravity, phase)) {
        const first = this.objects.get(bodyA.id)
        const second = this.objects.get(bodyB.id)
        if (!first || !second) continue
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
        if (!entity.retained && x >= hatchX && x <= hatchEnd && y - radius >= arena.height + 6) {
          entity.retained = true
          this.physics.retain(body)
        }
        const state = this.physics.contain(body, radius, !!entity.retained)
        if (state === 'recovered') this.notice = '一个 Emoji 越过边界，已移回容器。'
        if (state === 'invalid') {
          if (this.heldId === body.id) this.held = undefined
          this.remove(entity)
          this.notice = '一个 Emoji 的运动数据异常，已移出容器。'
        }
      }
    }
  }
}
