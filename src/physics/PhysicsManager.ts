import Matter from 'matter-js'
import { arena, hatchStart, type Settings } from '../core/config'
import type { Point } from '../input/InputManager'

const { Bodies, Body, Composite, Engine, Events } = Matter
export const physicsStep = 1000 / 120
const maxSpeed = 24
const matterVelocityStep = 1000 / 60
const followSpeed = 1650 // scene units per second
const followTimeMs = 45
const floorOpening = arena.width * hatchStart

function withinArena(point: Point, radius: number) {
  return {
    x: Math.min(arena.width - radius, Math.max(radius, point.x)),
    y: Math.min(arena.height - radius, Math.max(radius, point.y)),
  }
}

export class PhysicsManager {
  private readonly engine = Engine.create({ positionIterations: 8 })
  private readonly collisions: [Matter.Body, Matter.Body][] = []
  private readonly hatch = Bodies.rectangle((floorOpening + arena.width) / 2, arena.height + 75,
    arena.width - floorOpening, 150, { isStatic: true, friction: 0.05 })
  private hatchOpen = false

  constructor() {
    const { width, height } = arena
    const wall = { isStatic: true, friction: 0.05 }
    const thickness = 150
    Composite.add(this.engine.world, [
      Bodies.rectangle(width / 2, -thickness / 2, width + thickness * 2, thickness, wall),
      Bodies.rectangle((floorOpening - thickness) / 2, height + thickness / 2, floorOpening + thickness, thickness, wall),
      Bodies.rectangle(-thickness / 2, height / 2, thickness, height, wall),
      Bodies.rectangle(width + thickness / 2, (height + thickness) / 2, thickness, height + thickness, wall),
      this.hatch,
    ])
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

  grow(body: Matter.Body, factor: number, radius: number) {
    Body.scale(body, factor, factor)
    this.move(body, body.position, radius)
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

  canExit(body: Matter.Body) {
    return this.hatchOpen && !body.isStatic && body.position.x >= floorOpening && body.position.x <= arena.width
  }

  shake(body: Matter.Body, phase: number) {
    const sideways = Math.sin(phase + body.position.y / 115 + body.id) * 10 + 6
    const vertical = Math.cos(phase + body.position.x / 86 + body.id) * 7 - 2
    Body.setVelocity(body, { x: body.velocity.x * 0.6 + sideways, y: body.velocity.y * 0.8 + vertical })
    Body.setAngularVelocity(body, sideways * 0.014)
  }

  contain(body: Matter.Body, radius: number) {
    const point = body.position
    if (![point.x, point.y, body.angle, body.velocity.x, body.velocity.y].every(Number.isFinite)) {
      return 'invalid'
    }
    if (point.x < 0 || point.x > arena.width || point.y < 0 || point.y > arena.height + (this.canExit(body) ? radius : 0)) {
      this.move(body, { x: arena.width / 2, y: radius + 8 }, radius)
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
