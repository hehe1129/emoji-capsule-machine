import Matter from 'matter-js'
import { arena, cabinet, groundY, hatchEnd, hatchMotionMs, hatchThickness, hatchX, lid, roofY, room, trayEnd, trayX, type LidSide, type Settings } from '../core/config'
import type { Point } from '../input/InputManager'

const { Bodies, Body, Composite, Engine, Events, Query, Vertices } = Matter
export const physicsStep = 1000 / 120
const maxSpeed = 24
const matterVelocityStep = 1000 / 60
const followSpeed = 1650 // scene units per second
const followTimeMs = 45
const roomTop = -240
const trayBottom = arena.height + cabinet.tray.height
const wall = { isStatic: true, friction: 0.05 }
const gateWidth = hatchEnd - hatchX
const gateY = arena.height + hatchThickness / 2

function segment(a: Point, b: Point, thickness = 12) {
  return Bodies.rectangle((a.x + b.x) / 2, (a.y + b.y) / 2,
    Math.hypot(b.x - a.x, b.y - a.y), thickness,
    { ...wall, angle: Math.atan2(b.y - a.y, b.x - a.x) })
}

const capOutline = [
  { x: 0, y: roofY }, { x: 0, y: 68 - cabinet.chamber.y },
  { x: arena.width / 2, y: 7 - cabinet.chamber.y },
  { x: arena.width, y: 68 - cabinet.chamber.y }, { x: arena.width, y: roofY },
]
const capCenter = Vertices.centre(capOutline as Matter.Vector[])

export class PhysicsManager {
  private readonly engine = Engine.create({ positionIterations: 8 })
  private readonly collisions: [Matter.Body, Matter.Body][] = []
  private readonly hatch = Bodies.rectangle((hatchX + hatchEnd) / 2, gateY, gateWidth, hatchThickness, wall)
  private hatchTravel = 0
  hatchProgress = 0
  private readonly roof = Bodies.fromVertices(capCenter.x, capCenter.y, [capOutline], wall)
  private readonly dragObstacles: Matter.Body[]
  private readonly roomSides = [room.left, room.right].map(x =>
    Bodies.rectangle(x, 0, 20, 100, wall))
  private readonly ground = Bodies.rectangle(0, groundY + 20, 100, 40, { ...wall, friction: 0.16 })
  private readonly ceiling = Bodies.rectangle(0, roomTop - 10, 100, 20, wall)
  private roomBounds = { left: 0, right: 0, top: roomTop }
  lidSide?: LidSide

  constructor() {
    const { width, height } = arena
    const thickness = 28
    const boundaries = [
      Bodies.rectangle(hatchX / 2, height + thickness / 2, hatchX, thickness, wall),
      Bodies.rectangle((hatchEnd + width) / 2, height + thickness / 2, width - hatchEnd, thickness, wall),
      Bodies.rectangle(-6, (height + roofY) / 2, 12, height - roofY, wall),
      Bodies.rectangle(width + 6, (height + roofY) / 2, 12, height - roofY, wall),
      Bodies.rectangle(trayX - thickness / 2, height + cabinet.tray.height / 2, thickness, cabinet.tray.height, wall),
      Bodies.rectangle(trayEnd + thickness / 2, height + cabinet.tray.height / 2, thickness, cabinet.tray.height, wall),
      Bodies.rectangle((trayX + trayEnd) / 2, trayBottom + thickness / 2, trayEnd - trayX + thickness, thickness, wall),
      this.hatch,
      segment({ x: -2, y: height - 4 }, { x: -50, y: groundY - 52 }),
      segment({ x: width + 2, y: height - 4 }, { x: width + 50, y: groundY - 52 }),
      segment({ x: -50, y: groundY - 53 }, { x: -50, y: groundY }),
      segment({ x: width + 50, y: groundY - 53 }, { x: width + 50, y: groundY }),
      this.ground, this.ceiling, ...this.roomSides,
      this.roof,
    ]
    this.dragObstacles = boundaries
    Composite.add(this.engine.world, boundaries)
    this.resizeRoom(room.left, room.right)
    const recordContacts = ({ pairs }: Matter.IEventCollision<Matter.Engine>) => {
      for (const { bodyA, bodyB } of pairs) {
        // Held Emoji are static while the pointer drives them, but can still collide.
        // The controller ignores cabinet bodies since those have no Emoji entity.
        if (!bodyA.isStatic || !bodyB.isStatic) this.collisions.push([bodyA, bodyB])
      }
    }
    Events.on(this.engine, 'collisionStart', recordContacts)
    Events.on(this.engine, 'collisionActive', recordContacts)
  }

  resizeRoom(left: number, right: number, top = roomTop) {
    top = Math.min(top, roomTop)
    if (this.roomBounds.left === left && this.roomBounds.right === right && this.roomBounds.top === top) return
    this.roomBounds = { left, right, top }
    const wallY = (groundY + top) / 2
    for (const [index, side] of this.roomSides.entries()) {
      Body.scale(side, 1, (groundY - top + 40) / (side.bounds.max.y - side.bounds.min.y))
      Body.setPosition(side, { x: index === 0 ? left - 10 : right + 10, y: wallY })
    }
    Body.setPosition(this.ceiling, { x: this.ceiling.position.x, y: top - 10 })
    for (const boundary of [this.ground, this.ceiling]) {
      const width = boundary.bounds.max.x - boundary.bounds.min.x
      Body.scale(boundary, (right - left + 60) / width, 1)
      Body.setPosition(boundary, { x: (left + right) / 2, y: boundary.position.y })
    }
  }

  create(position: Point, settings: Settings) {
    const body = Bodies.circle(position.x, position.y, arena.radius, { frictionAir: 0.013 })
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

  setLid(side: LidSide | undefined, pieces: Matter.Body[]) {
    if (this.lidSide === side) return
    const previous = this.lidSide
    this.placeLid(side)
    // Wait for the opening to clear before closing across an Emoji.
    if (!side && Query.collides(this.roof, pieces).some(contact => contact.depth > 1)) {
      this.placeLid(previous)
      return
    }
    this.lidSide = side
  }

  private placeLid(side: LidSide | undefined) {
    const angle = side === 'left' ? lid.angle : side === 'right' ? -lid.angle : 0
    const pivot = side === 'left' ? arena.width : 0
    const x = capCenter.x - pivot
    const y = capCenter.y - roofY
    Body.setAngle(this.roof, angle)
    Body.setPosition(this.roof, {
      x: pivot + x * Math.cos(angle) - y * Math.sin(angle),
      y: roofY + x * Math.sin(angle) + y * Math.cos(angle),
    })
  }

  follow(body: Matter.Body, point: Point, smooth: boolean) {
    const start = { ...body.position }
    const dx = point.x - start.x
    const dy = point.y - start.y
    const distance = Math.hypot(dx, dy)
    if (distance < 0.05) return
    const fraction = Math.min(smooth ? 1 - Math.exp(-physicsStep / followTimeMs) : 1,
      followSpeed * physicsStep / (1000 * distance))
    const x = dx * fraction
    const y = dy * fraction
    if (this.tryMove(body, start, x, y)) return
    if (Math.abs(x) >= Math.abs(y)) {
      if (!this.tryMove(body, start, x, 0)) this.tryMove(body, start, 0, y)
    } else if (!this.tryMove(body, start, 0, y)) {
      this.tryMove(body, start, x, 0)
    }
  }

  touch(first: Matter.Body, second: Matter.Body) {
    return Matter.Bounds.overlaps(first.bounds, second.bounds) && !!Matter.Collision.collides(first, second)
  }

  guideDrop(body: Matter.Body, point: Point) {
    Body.setPosition(body, point)
  }

  private tryMove(body: Matter.Body, start: Point, x: number, y: number) {
    if (Math.hypot(x, y) < 0.05) return false
    Body.setPosition(body, { x: start.x + x, y: start.y + y })
    if (!Query.collides(body, this.dragObstacles).some(contact => contact.depth > 0.8)) return true
    Body.setPosition(body, start)
    return false
  }

  hold(body: Matter.Body, held: boolean) {
    Body.setVelocity(body, { x: 0, y: 0 })
    Body.setAngularVelocity(body, 0)
    Body.setStatic(body, held)
  }

  launch(body: Matter.Body, velocity: Point) {
    const speed = Math.hypot(velocity.x, velocity.y)
    if (speed < 0.06) return
    // Matter measures velocity per base 60 Hz step. Drag estimates use scene units per millisecond.
    const scale = Math.min(matterVelocityStep, maxSpeed / speed)
    Body.setVelocity(body, { x: velocity.x * scale, y: velocity.y * scale })
  }

  moveHatch(open: boolean, pieces: Iterable<{ body: Matter.Body; radius: number }>) {
    const target = open ? 1 : 0
    if (this.hatchTravel === target) return
    this.hatchTravel = open ? Math.min(1, this.hatchTravel + physicsStep / hatchMotionMs)
      : Math.max(0, this.hatchTravel - physicsStep / hatchMotionMs)
    const travel = this.hatchTravel
    this.hatchProgress = travel ** 2 * (3 - 2 * travel)
    Body.setPosition(this.hatch, { x: (hatchX + hatchEnd) / 2 - gateWidth * this.hatchProgress, y: gateY })
    if (open) return
    // Clear the thickness of the moving slab on the nearest side before the solver runs.
    for (const { body } of pieces) {
      if (!Query.collides(body, [this.hatch]).length) continue
      const radius = (body.bounds.max.y - body.bounds.min.y) / 2
      const side = body.position.y < gateY ? -1 : 1
      Body.setPosition(body, { x: body.position.x, y: gateY + side * (hatchThickness / 2 + radius + 0.5) })
      if (!body.isStatic) Body.setVelocity(body, { x: body.velocity.x, y: side * 1.8 })
    }
  }

  shake(body: Matter.Body, phase: number, retained: boolean) {
    const swing = phase + body.id * 1.4
    const direction = Math.sign((hatchX + hatchEnd) / 2 - body.position.x)
    const sideways = Math.sin(swing) * (retained ? 3 : 6) + (retained ? 0 : direction * 6)
    Body.setVelocity(body, { x: body.velocity.x * 0.55 + sideways, y: Math.max(-2, body.velocity.y) })
    Body.setAngularVelocity(body, sideways * 0.011)
  }

  contain(body: Matter.Body, radius: number, retained: boolean) {
    const point = body.position
    if (![point.x, point.y, body.angle, body.velocity.x, body.velocity.y].every(Number.isFinite)) return 'invalid'
    const left = retained ? trayX : this.roomBounds.left
    const right = retained ? trayEnd : this.roomBounds.right
    const top = retained ? arena.height - 20 : this.roomBounds.top
    if (point.x < left - radius || point.x > right + radius || point.y < top - radius || point.y > (retained ? trayBottom : groundY) + radius) {
      Body.setPosition(body, {
        x: Math.min(right - radius, Math.max(left + radius, point.x)),
        y: retained ? trayBottom - radius - 2 : Math.min(groundY - radius - 2, Math.max(top + radius + 2, point.y)),
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
    this.engine.gravity.x = shakePhase === undefined ? 0 : Math.sin(shakePhase) * 0.28
    this.engine.gravity.y = shakePhase === undefined ? gravity : Math.max(0.55, gravity)
    this.collisions.length = 0
    Engine.update(this.engine, physicsStep)
    return this.collisions
  }
}
