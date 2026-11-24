import { arena, cabinet, shakeDuration, tubeCenters, type Settings } from './config'
import { PhysicsManager, physicsStep } from '../physics/PhysicsManager'
import { ReactionEngine } from '../reactions/ReactionEngine'
import type { EmojiEntity } from '../emoji/EmojiEntity'
import type { EmojiKind } from '../emoji/catalog'
import type { Point } from '../input/InputManager'
import { captureCapsule, type CapsuleResult } from '../capsule/CapsuleResult'
import { channelCapacity, randomKind } from '../emoji/EmojiChannels'

const throwSmoothing = 1 - Math.exp(-physicsStep / 30)
const maxDragSpeed = 1.65 // scene units per millisecond

export class AppController {
  private readonly physics = new PhysicsManager()
  private readonly reactions = new ReactionEngine()
  private readonly objects = new Map<number, EmojiEntity>()
  private readonly stocks: EmojiEntity[][] = tubeCenters.map(() => [])
  private readonly feeding = new Map<number, EmojiEntity>()
  private held?: { entity: EmojiEntity; offset: Point; target?: Point; previous: Point; velocity: Point }
  private accumulated = 0
  private shakeStarted?: number
  private nextJolt = 0
  notice = ''

  constructor(readonly settings: Settings) {
    this.stocks.forEach((stock, index) => {
      for (let slot = 0; slot < channelCapacity; slot++) {
        this.stockTube(index, -arena.radius - 2 - slot * (arena.radius * 2 + 2), stock.at(-1)?.kind)
      }
    })
  }

  get entities() {
    return this.objects.values()
  }

  get count() {
    return this.objects.size - this.stocks.reduce((total, stock) => total + stock.length, 0)
  }

  get retainedCount() {
    let count = 0
    for (const entity of this.entities) {
      if (this.isRetained(entity)) count++
    }
    return count
  }

  gateOpen(index: number) {
    return this.feeding.has(index)
  }

  get heldId() {
    return this.held?.entity.body.id
  }

  get shaking() {
    return this.shakeStarted !== undefined
  }

  releaseChannel(index: number) {
    if (this.feeding.has(index)) return
    if (this.count >= this.settings.maxEmoji) {
      this.notice = '机器已满。'
      return
    }
    const bottom = this.stocks[index].shift()
    if (!bottom) return
    bottom.channel = undefined
    bottom.spawnRemaining = 940
    this.feeding.set(index, bottom)
    this.physics.feed(bottom.body, index)
    this.notice = ''
  }

  private stockTube(index: number, y: number, neighbor?: EmojiKind) {
    const body = this.physics.create({ x: tubeCenters[index], y }, this.settings)
    const entity = { body, kind: randomKind(neighbor), radius: arena.radius, channel: index, spawnRemaining: 0 }
    this.stocks[index].push(entity)
    this.objects.set(body.id, entity)
  }

  private updateChannels() {
    for (const [index, entity] of this.feeding) {
      if (this.objects.has(entity.body.id) && entity.body.position.y < entity.radius + 2) continue
      this.physics.clearFeed(entity.body)
      this.feeding.delete(index)
    }
    const inlet = -cabinet.chamber.y - arena.radius
    this.stocks.forEach((stock, index) => {
      if (stock.length >= channelCapacity) return
      const top = stock.at(-1)
      if (top && top.body.position.y - top.radius < inlet + arena.radius + 3) return
      this.stockTube(index, inlet, top?.kind)
    })
  }

  private remove(entity: EmojiEntity) {
    if (entity.channel !== undefined) {
      const stock = this.stocks[entity.channel]
      stock.splice(stock.indexOf(entity), 1)
    }
    this.physics.remove(entity.body)
    this.objects.delete(entity.body.id)
  }

  grab(point: Point) {
    if (this.held) return
    let closest: EmojiEntity | undefined
    let minDistance = Infinity
    for (const entity of this.entities) {
      if (entity.channel !== undefined || entity.body.position.y < entity.radius || entity.body.position.y > arena.height) continue
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
    return Array.from(this.entities).filter(entity => this.isRetained(entity)).map(captureCapsule)
  }

  private isRetained(entity: EmojiEntity) {
    return entity.body.position.y - entity.radius >= arena.height
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
        this.notice = rule.message
      }
      for (const entity of this.entities) {
        const { body, radius } = entity
        entity.spawnRemaining = Math.max(0, entity.spawnRemaining - physicsStep)
        const state = this.physics.contain(body, radius, entity.channel)
        if (state === 'recovered') this.notice = '一个 Emoji 越过边界，已移回容器。'
        if (state === 'invalid') {
          if (this.heldId === body.id) this.held = undefined
          this.remove(entity)
          this.notice = '一个 Emoji 的运动数据异常，已移出容器。'
        }
      }
      this.updateChannels()
    }
  }
}
