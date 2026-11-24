import { arena, shakeDuration, type Settings } from './config'
import { PhysicsManager, physicsStep } from '../physics/PhysicsManager'
import { ReactionEngine } from '../reactions/ReactionEngine'
import type { EmojiEntity } from '../emoji/EmojiEntity'
import type { EmojiKind } from '../emoji/catalog'
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
  readonly retained: CapsuleResult[] = []
  notice = ''

  constructor(readonly settings: Settings) {}

  get entities() {
    return this.objects.values()
  }

  get count() {
    return this.objects.size
  }

  get heldId() {
    return this.held?.entity.body.id
  }

  get shaking() {
    return this.shakeStarted !== undefined
  }

  drop(kind: EmojiKind, lane: number) {
    if (this.count + this.retained.length >= this.settings.maxEmoji) {
      this.notice = '机器已满。'
      return false
    }
    const radius = arena.radius
    const position = { x: arena.width * lane, y: radius + 1 }
    for (const entity of this.entities) {
      if (Math.hypot(entity.body.position.x - position.x, entity.body.position.y - position.y) < entity.radius + radius) {
        return false
      }
    }
    const body = this.physics.create(position, this.settings)
    this.objects.set(body.id, { body, kind, radius, spawnRemaining: 940 })
    this.notice = ''
    return true
  }

  grab(point: Point) {
    if (this.held) return
    let closest: EmojiEntity | undefined
    let minDistance = Infinity
    for (const entity of this.entities) {
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
    const selected = new Set(items)
    for (let i = this.retained.length - 1; i >= 0; i--) {
      if (selected.has(this.retained[i])) this.retained.splice(i, 1)
    }
  }

  tune() {
    for (const { body } of this.entities) {
      if (!body.isStatic) this.physics.tune(body, this.settings)
    }
  }

  tick(now: number, delta: number) {
    if (this.shakeStarted !== undefined && now - this.shakeStarted >= shakeDuration) {
      this.shakeStarted = undefined
      this.physics.setHatch(false)
    }
    const phase = this.shakeStarted === undefined ? undefined : (now - this.shakeStarted) / 53
    if (phase !== undefined && now >= this.nextJolt) {
      this.nextJolt = now + 310
      for (const { body } of this.entities) {
        if (!body.isStatic) this.physics.shake(body, phase)
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
          this.physics.remove(ingredient.body)
          this.objects.delete(ingredient.body.id)
        }
        if (rule.growth) {
          const previousRadius = actor.radius
          const maxRadius = Math.min(arena.width, arena.height) * rule.growth.maxRadiusRatio
          const growthCount = actor.reactionCounts?.grow ?? 0
          actor.radius = arena.radius + (maxRadius - arena.radius) * growthCount / rule.growth.steps
          this.physics.grow(actor.body, actor.radius / previousRadius, actor.radius)
        }
        if (rule.motion === 'settle') this.physics.settle(actor.body)
        if (rule.motion === 'boost') this.physics.boost(actor.body)
        this.notice = rule.message
      }
      for (const entity of this.entities) {
        const { body, radius } = entity
        entity.spawnRemaining = Math.max(0, entity.spawnRemaining - physicsStep)
        // Only a body that crosses the open floor can enter the collection tray.
        if (this.physics.canExit(body) && body.position.y >= arena.height && body.velocity.y > 0) {
          this.retained.push(captureCapsule(entity))
          this.physics.remove(body)
          this.objects.delete(body.id)
          continue
        }
        const state = this.physics.contain(body, radius)
        if (state === 'recovered') this.notice = '一个 Emoji 越过边界，已移回容器。'
        if (state === 'invalid') {
          if (this.heldId === body.id) this.held = undefined
          this.physics.remove(body)
          this.objects.delete(body.id)
          this.notice = '一个 Emoji 的运动数据异常，已移出容器。'
        }
      }
    }
  }
}
