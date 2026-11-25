import { arena, hatchX, hatchEnd, roofY, shakeDuration, type LidSide, type Settings } from './config'
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
  private held?: { entity: EmojiEntity; offset: Point; target?: Point; smooth: boolean; previous: Point; velocity: Point }
  private feedSide?: LidSide
  private dragSide?: LidSide
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

  get lidSide() {
    return this.physics.lidSide
  }

  setFeedLid(side?: LidSide) {
    this.feedSide = side
  }

  private updateLid() {
    const position = this.held?.entity.body.position
    const aim = this.held?.target
    const near = position && aim && position.y < roofY + 83 && position.y > roofY - 145 &&
      position.x > -115 && position.x < arena.width + 115 &&
      aim.y < roofY + 65 && aim.y > roofY - 148
    this.dragSide = near ? this.dragSide ?? (position.x <= arena.width / 2 ? 'left' : 'right') : undefined
    const side = this.feedSide ?? this.dragSide
    if (side !== this.lidSide) this.physics.setLid(side, Array.from(this.entities, entity => entity.body))
  }

  drop(side: LidSide) {
    if (this.objects.size >= this.settings.maxEmoji) {
      this.notice = '机器已满。'
      return false
    }
    const inset = 35 + Math.random() * 58
    const x = side === 'left' ? inset : arena.width - inset
    const body = this.spawn(x, -44 + Math.random() * 13, true)
    const direction = side === 'left' ? 1 : -1
    this.physics.launch(body, {
      x: direction * (0.13 + Math.random() * 0.42),
      y: 0.13 + Math.random() * 0.19,
    })
    this.notice = ''
    return true
  }

  private spawn(x: number, y: number, active: boolean) {
    const body = this.physics.create({ x, y }, this.settings)
    const entity = { body, kind: randomKind(), radius: arena.radius, spawnRemaining: active ? 420 : 0 }
    this.objects.set(body.id, entity)
    return body
  }

  private remove(entity: EmojiEntity) {
    if (this.heldId === entity.body.id) this.release()
    this.physics.remove(entity.body)
    this.objects.delete(entity.body.id)
  }

  grab(point: Point) {
    if (this.held) return
    let closest: EmojiEntity | undefined
    let minDistance = Infinity
    for (const entity of this.entities) {
      if (entity.retained) continue
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
      previous: { x, y }, smooth: false,
      velocity: { x: 0, y: 0 },
    }
    this.physics.hold(closest.body, true)
  }

  drag(point: Point, smooth = false) {
    if (!this.held) return
    const { offset } = this.held
    const target = { x: point.x + offset.x, y: point.y + offset.y }
    this.held.target = target
    this.held.smooth = smooth
  }

  release(throwHeld = false) {
    if (!this.held) return
    if (throwHeld) this.stepDrag()
    const { entity: { body }, velocity } = this.held
    this.physics.hold(body, false)
    this.physics.tune(body, this.settings)
    if (throwHeld) this.physics.launch(body, velocity)
    this.held = undefined
  }

  private stepDrag() {
    if (!this.held) return
    const { entity, target, smooth, previous, velocity } = this.held
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
    this.physics.setHatch(true)
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
        if (!body.isStatic && body.position.x >= 0 && body.position.x <= arena.width &&
          body.position.y >= roofY) this.physics.shake(body, phase, !!retained)
      }
    }
    this.accumulated += Math.min(delta, 64)
    while (this.accumulated >= physicsStep) {
      this.accumulated -= physicsStep
      this.updateLid()
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
          this.remove(entity)
          this.notice = '一个 Emoji 的运动数据异常，已移出容器。'
        }
      }
    }
  }
}
