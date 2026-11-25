import Matter from 'matter-js'
import { arena, cabinet, hatchEnd, hatchX, type Settings } from '../core/config'
import type { Point } from '../input/InputManager'

const { Bodies, Body, Composite, Engine, Events } = Matter
export const physicsStep = 1000 / 120
const maxSpeed = 24
const matterVelocityStep = 1000 / 60
const followSpeed = 1650 // scene units per second
const followTimeMs = 45
const inletTop = -120
const trayBottom = arena.height + cabinet.tray.height
const wall = { isStatic: true, friction: 0.05 }
// The return grate becomes solid for each body after it crosses the threshold.
const shutterCategory = 2
const returnCategory = 4
const normalMask = 0xffffffff & ~returnCategory

function gate(category: number) {
  return Bodies.rectangle((hatchX + hatchEnd) / 2, arena.height + 3, hatchEnd - hatchX, 6,
    { ...wall, collisionFilter: { category, mask: 1, group: 0 } })
}

function withinArena(point: Point, radius: number) {
  return {
    x: Math.min(arena.width - radius, Math.max(radius, point.x)),
    y: Math.min(arena.height - radius, Math.max(radius, point.y)),
  }
}

export class PhysicsManager {
  private readonly engine = Engine.create({ positionIterations: 8 })
  private readonly collisions: [Matter.Body, Matter.Body][] = []
  private readonly hatch = gate(shutterCategory)
  private hatchOpen = false

  constructor() {
    const { width, height } = arena
    const thickness = 28
    Composite.add(this.engine.world, [
      Bodies.rectangle(hatchX / 2, height + thickness / 2, hatchX, thickness, wall),
      Bodies.rectangle((hatchEnd + width) / 2, height + thickness / 2, width - hatchEnd, thickness, wall),
      Bodies.rectangle(-thickness / 2, (height + inletTop) / 2, thickness, height - inletTop, wall),
      Bodies.rectangle(width + thickness / 2, (height + inletTop) / 2, thickness, height - inletTop, wall),
      Bodies.rectangle(hatchX - thickness / 2, height + cabinet.tray.height / 2, thickness, cabinet.tray.height, wall),
      Bodies.rectangle(hatchEnd + thickness / 2, height + cabinet.tray.height / 2, thickness, cabinet.tray.height, wall),
      Bodies.rectangle((hatchX + hatchEnd) / 2, trayBottom + thickness / 2, hatchEnd - hatchX + thickness, thickness, wall),
      this.hatch,
      gate(returnCategory),
    ])
    Events.on(this.engine, 'collisionStart', ({ pairs }) => {
      for (const { bodyA, bodyB } of pairs) {
        // Held Emoji are static while the pointer drives them, but can still collide.
        // The controller ignores cabinet bodies since those have no Emoji entity.
        if (!bodyA.isStatic || !bodyB.isStatic) this.collisions.push([bodyA, bodyB])
      }
    })
  }

  create(position: Point, settings: Settings) {
    const body = Bodies.circle(position.x, position.y, arena.radius, { frictionAir: 0.013, collisionFilter: { category: 1, mask: normalMask, group: 0 } })
    this.tune(body, settings)
    Composite.add(this.engine.world, body)
    return body
  }

  tune(body: Matter.Body, { restitution, friction }: Settings) {
    body.restitution = restitution
    body.friction = friction
  }

  remove(body: Matter.Body) {
    Composite.remove(this.engine.world, body)
  }

  move(body: Matter.Body, point: Point, radius: number) {
    Body.setPosition(body, withinArena(point, radius))
  }

  follow(body: Matter.Body, point: Point, radius: number) {
    const target = withinArena(point, radius)
    const { x, y } = body.position
    const dx = target.x - x
    const dy = target.y - y
    const distance = Math.hypot(dx, dy)
    if (distance < 0.1) {
      if (distance > 0) Body.setPosition(body, target)
      return
    }
    const fraction = Math.min(1 - Math.exp(-physicsStep / followTimeMs), followSpeed * physicsStep / (1000 * distance))
    Body.setPosition(body, { x: x + dx * fraction, y: y + dy * fraction })
  }

  hold(body: Matter.Body, held: boolean) {
    Body.setVelocity(body, { x: 0, y: 0 })
    Body.setAngularVelocity(body, 0)
    Body.setStatic(body, held)
    body.collisionFilter.mask = normalMask
  }

  grow(body: Matter.Body, factor: number) {
    Body.scale(body, factor, factor)
  }

  launch(body: Matter.Body, velocity: Point) {
    const speed = Math.hypot(velocity.x, velocity.y)
    if (speed < 0.06) return
    // Matter measures velocity per base 60 Hz step. Drag estimates use scene units per millisecond.
    const scale = Math.min(matterVelocityStep, maxSpeed / speed)
    Body.setVelocity(body, { x: velocity.x * scale, y: velocity.y * scale })
  }

  settle(body: Matter.Body) {
    Body.setVelocity(body, { x: body.velocity.x * 0.15, y: body.velocity.y * 0.15 })
    Body.setAngularVelocity(body, 0)
  }

  boost(body: Matter.Body) {
    const direction = body.position.x < arena.width / 2 ? 1 : -1
    Body.setVelocity(body, { x: 20 * direction, y: -7 })
  }

  setHatch(open: boolean) {
    if (open === this.hatchOpen) return
    this.hatchOpen = open
    if (open) Composite.remove(this.engine.world, this.hatch)
    else Composite.add(this.engine.world, this.hatch)
  }

  finishPassage(body: Matter.Body) {
    body.collisionFilter.mask = normalMask & ~shutterCategory
  }

  retain(body: Matter.Body) {
    body.collisionFilter.mask = 0xffffffff
  }

  chase(cat: Matter.Body, fish: Matter.Body) {
    const direction = Math.sign(fish.position.x - cat.position.x) || 1
    Body.setVelocity(fish, { x: direction * 13, y: -6 })
    Body.setVelocity(cat, { x: direction * 16, y: -8 })
  }

  shake(body: Matter.Body, phase: number, retained: boolean) {
    const swing = phase + body.id * 1.4
    const direction = Math.sign((hatchX + hatchEnd) / 2 - body.position.x)
    const sideways = Math.sin(swing) * 9 + (retained ? 0 : direction * 7)
    const vertical = retained ? Math.cos(swing) * 4 : Math.cos(swing) * 8 - 4
    Body.setVelocity(body, { x: body.velocity.x * 0.55 + sideways, y: body.velocity.y * 0.65 + vertical })
    Body.setAngularVelocity(body, sideways * 0.014)
  }

  contain(body: Matter.Body, radius: number, retained: boolean) {
    const point = body.position
    if (![point.x, point.y, body.angle, body.velocity.x, body.velocity.y].every(Number.isFinite)) return 'invalid'
    const left = retained ? hatchX : 0
    const right = retained ? hatchEnd : arena.width
    const top = retained ? arena.height : inletTop
    if (point.x < left - radius || point.x > right + radius || point.y < top - radius || point.y > trayBottom + radius) {
      Body.setPosition(body, {
        x: Math.min(right - radius, Math.max(left + radius, point.x)),
        y: retained ? trayBottom - radius - 2 : radius + 8,
      })
      Body.setVelocity(body, { x: 0, y: 0 })
      Body.setAngularVelocity(body, 0)
      return 'recovered'
    }
    const speed = Math.hypot(body.velocity.x, body.velocity.y)
    if (speed > maxSpeed) Body.setSpeed(body, maxSpeed)
    return 'ok'
  }

  step(gravity: number, shakePhase?: number) {
    this.engine.gravity.x = shakePhase === undefined ? 0 : Math.sin(shakePhase) * 0.85
    this.engine.gravity.y = shakePhase === undefined ? gravity : Math.max(0.85, gravity) + Math.cos(shakePhase) * 0.35
    this.collisions.length = 0
    Engine.update(this.engine, physicsStep)
    return this.collisions
  }
}
