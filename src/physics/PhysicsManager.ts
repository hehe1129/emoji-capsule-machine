import Matter from 'matter-js'
import { arena, cabinet, hatchX, tubeCenters, type Settings } from '../core/config'
import type { Point } from '../input/InputManager'

const { Bodies, Body, Composite, Engine, Events } = Matter
export const physicsStep = 1000 / 120
const maxSpeed = 24
const matterVelocityStep = 1000 / 60
const followSpeed = 1650 // scene units per second
const followTimeMs = 45
const tubeTop = -cabinet.chamber.y - arena.radius * 3
const trayBottom = arena.height + cabinet.tray.height
const wall = { isStatic: true, friction: 0.05 }
const gateCategory = (index: number) => 1 << (index + 1)

function withinArena(point: Point, radius: number) {
  return {
    x: Math.min(arena.width - radius, Math.max(radius, point.x)),
    y: Math.min(arena.height - radius, Math.max(radius, point.y)),
  }
}

export class PhysicsManager {
  private readonly engine = Engine.create({ positionIterations: 8 })
  private readonly collisions: [Matter.Body, Matter.Body][] = []
  private readonly hatch = Bodies.rectangle((hatchX + arena.width) / 2, arena.height + 5,
    arena.width - hatchX, 10, wall)
  private hatchOpen = false

  constructor() {
    const { width, height } = arena
    const thickness = 30
    Composite.add(this.engine.world, [
      Bodies.rectangle((hatchX - thickness) / 2, height + thickness / 2, hatchX + thickness, thickness, wall),
      Bodies.rectangle(-thickness / 2, height / 2, thickness, height, wall),
      Bodies.rectangle(width + thickness / 2, trayBottom / 2, thickness, trayBottom, wall),
      Bodies.rectangle(hatchX - thickness / 2, height + cabinet.tray.height / 2, thickness, cabinet.tray.height, wall),
      Bodies.rectangle((hatchX + width) / 2, trayBottom + thickness / 2, width - hatchX + thickness * 2, thickness, wall),
      this.hatch,
    ])
    let roofStart = -thickness
    tubeCenters.forEach((center, index) => {
      const left = center - cabinet.tubeWidth / 2
      const right = center + cabinet.tubeWidth / 2
      Composite.add(this.engine.world, [
        Bodies.rectangle((roofStart + left) / 2, -thickness / 2, left - roofStart, thickness, wall),
        Bodies.rectangle(left - thickness / 2, tubeTop / 2, thickness, -tubeTop, wall),
        Bodies.rectangle(right + thickness / 2, tubeTop / 2, thickness, -tubeTop, wall),
        Bodies.rectangle(center, tubeTop - thickness / 2, cabinet.tubeWidth + thickness * 2, thickness, wall),
        Bodies.rectangle(center, -5, cabinet.tubeWidth, 10,
          { ...wall, collisionFilter: { category: gateCategory(index), mask: 1, group: 0 } }),
      ])
      roofStart = right
    })
    Composite.add(this.engine.world, Bodies.rectangle((roofStart + width + thickness) / 2, -thickness / 2,
      width + thickness - roofStart, thickness, wall))
    Events.on(this.engine, 'collisionStart', ({ pairs }) => {
      for (const { bodyA, bodyB } of pairs) {
        if (!bodyA.isStatic && !bodyB.isStatic) this.collisions.push([bodyA, bodyB])
      }
    })
  }

  create(position: Point, settings: Settings) {
    const body = Bodies.circle(position.x, position.y, arena.radius, { frictionAir: 0.009 })
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
    body.collisionFilter.mask = held ? 0 : 0xffffffff
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

  feed(body: Matter.Body, channel: number) {
    // The escapement lets the bottom body through and supports the remaining stack.
    body.collisionFilter.mask = 0xffffffff & ~gateCategory(channel)
    Body.setVelocity(body, { x: body.velocity.x * 0.35, y: Math.max(body.velocity.y, 4.2) })
  }

  clearFeed(body: Matter.Body) {
    if (!body.isStatic) body.collisionFilter.mask = 0xffffffff
  }

  shake(body: Matter.Body, phase: number) {
    const sideways = Math.sin(phase + body.position.y / 115 + body.id) * 10 + 6
    const vertical = Math.cos(phase + body.position.x / 86 + body.id) * 7 - 2
    Body.setVelocity(body, { x: body.velocity.x * 0.6 + sideways, y: body.velocity.y * 0.8 + vertical })
    Body.setAngularVelocity(body, sideways * 0.014)
  }

  contain(body: Matter.Body, radius: number, channel?: number) {
    const point = body.position
    if (![point.x, point.y, body.angle, body.velocity.x, body.velocity.y].every(Number.isFinite)) {
      return 'invalid'
    }
    if (point.x < -radius || point.x > arena.width + radius || point.y < tubeTop - radius || point.y > trayBottom + radius) {
      const recovery = channel === undefined ? { x: arena.width / 2, y: radius + 8 }
        : { x: tubeCenters[channel], y: tubeTop + radius + 3 }
      Body.setPosition(body, recovery)
      Body.setVelocity(body, { x: 0, y: 0 })
      Body.setAngularVelocity(body, 0)
      return 'recovered'
    }
    const speed = Math.hypot(body.velocity.x, body.velocity.y)
    if (speed > maxSpeed) Body.setSpeed(body, maxSpeed)
    return 'ok'
  }

  step(gravity: number, shakePhase?: number) {
    this.engine.gravity.x = shakePhase === undefined ? 0 : Math.sin(shakePhase) * 0.85 + 0.18
    this.engine.gravity.y = shakePhase === undefined ? gravity : Math.max(0.85, gravity) + Math.cos(shakePhase) * 0.35
    this.collisions.length = 0
    Engine.update(this.engine, physicsStep)
    return this.collisions
  }
}
