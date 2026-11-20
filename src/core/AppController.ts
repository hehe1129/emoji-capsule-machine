import { arena, type Settings } from './config'
import { PhysicsManager, physicsStep } from '../physics/PhysicsManager'
import { ReactionEngine } from '../reactions/ReactionEngine'
import type { EmojiEntity } from '../emoji/EmojiEntity'
import type { EmojiKind } from '../emoji/catalog'
import type { Point } from '../input/InputManager'
import { drawCapsule, type CapsuleResult } from '../capsule/CapsuleResult'

const throwSmoothing = 1 - Math.exp(-physicsStep / 30)
const maxDragSpeed = 1.65 // scene units per millisecond

export class AppController {
  private readonly physics = new PhysicsManager()
  private readonly reactions = new ReactionEngine()
  private readonly objects = new Map<number, EmojiEntity>()
  private held?: { entity: EmojiEntity; offset: Point; target?: Point; previous: Point; velocity: Point }
  private accumulated = 0
  result?: CapsuleResult
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

  drop(kind: EmojiKind, lane: number) {
    if (this.result) return
    if (this.count >= this.settings.maxEmoji) {
      this.notice = '容器已满，可以先抽取扭蛋。'
      return
    }
    const radius = arena.radius
    const y = radius + 12
    const position = { x: this.findSpawnX(lane, radius, y), y }
    const body = this.physics.create(position, this.settings)
    this.objects.set(body.id, { body, kind, radius })
    this.notice = ''
  }

  private findSpawnX(lane: number, radius: number, y: number) {
    const preferred = arena.width * (0.14 + lane * 0.72)
    const nearby = Array.from(this.entities).filter(entity => Math.abs(entity.body.position.y - y) < entity.radius + radius)
    const spacing = radius * 2 + 2
    const available = (x: number) => x >= radius && x <= arena.width - radius && nearby.every(entity =>
      Math.hypot(entity.body.position.x - x, entity.body.position.y - y) >= radius + entity.radius,
    )
    if (available(preferred)) return preferred
    for (let offset = spacing; offset < arena.width; offset += spacing) {
      if (available(preferred + offset)) return preferred + offset
      if (available(preferred - offset)) return preferred - offset
    }
    return preferred
  }

  grab(point: Point) {
    if (this.result || this.held) return
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

  draw() {
    if (this.result) return
    this.release()
    this.result = drawCapsule(this.entities)
    this.notice = this.result ? '' : '先投放一个 Emoji，再来抽扭蛋。'
  }

  reset() {
    this.release()
    for (const { body } of this.entities) this.physics.remove(body)
    this.objects.clear()
    this.reactions.reset()
    this.result = undefined
    this.notice = ''
    this.accumulated = 0
  }

  tune() {
    for (const { body } of this.entities) {
      if (!body.isStatic) this.physics.tune(body, this.settings)
    }
  }

  tick(delta: number) {
    if (this.result) {
      this.reactions.advance(this.entities, Math.min(delta, 64), this.settings.reactionCooldown)
      return
    }
    this.accumulated += Math.min(delta, 64)
    while (this.accumulated >= physicsStep) {
      this.accumulated -= physicsStep
      this.stepDrag()
      this.reactions.advance(this.entities, physicsStep, this.settings.reactionCooldown)
      for (const [bodyA, bodyB] of this.physics.step(this.settings.gravity)) {
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
      for (const { body, radius } of this.entities) {
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
