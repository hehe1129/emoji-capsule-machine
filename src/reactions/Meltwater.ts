import Matter from 'matter-js'
import { arena, cabinet, groundY, hatchEnd, hatchX, roofY, trayX } from '../core/config'
import type { EmojiEntity } from '../emoji/EmojiEntity'
import { resizeBody } from '../physics/resizeBody'

const portion = cabinet.tray.width * cabinet.tray.height * 2 / 3
const bucketCapacity = portion / 2
const floating = new Set<EmojiEntity['kind']>(['ice', 'seedling'])
const trayBottom = arena.height + cabinet.tray.height
const maxDroplets = 180
const gravity = 0.0019

// Settled particles share adjacent columns so the surface reads as a continuous pool.
class WaterPool {
  volume = 0
  incoming = 0
  readonly cells: Float64Array
  readonly width: number

  constructor(readonly left: number, readonly bottom: number, width: number, readonly maxDepth: number) {
    this.cells = new Float64Array(Math.ceil(width / 15))
    this.width = width / this.cells.length
  }

  get right() { return this.left + this.cells.length * this.width }
  get capacity() { return this.width * this.cells.length * this.maxDepth }

  private column(x: number) {
    return Math.max(0, Math.min(this.cells.length - 1, Math.floor((x - this.left) / this.width)))
  }

  surface(x: number) {
    return this.bottom - this.depth(this.column(x))
  }

  depth(index: number) {
    return Math.min(this.maxDepth, this.cells[index] / this.width)
  }

  add(amount: number, x?: number) {
    this.volume += amount
    if (x === undefined) {
      for (let i = 0; i < this.cells.length; i++) this.cells[i] += amount / this.cells.length
    } else {
      this.cells[this.column(x)] += amount
    }
  }

  take(x: number, limit: number) {
    const center = this.column(x)
    let taken = 0
    for (let offset = 0; offset < 2 * this.cells.length - 1 && taken < limit; offset++) {
      const index = center + (offset % 2 ? 1 : -1) * Math.ceil(offset / 2)
      if (index < 0 || index >= this.cells.length) continue
      const part = Math.min(limit - taken, this.cells[index])
      this.cells[index] -= part
      taken += part
    }
    this.volume -= taken
    return taken
  }

  spreadOnFloor(delta: number) {
    this.settle(delta)
    const remaining = Math.exp(-delta / 680)
    for (let i = 0; i < this.cells.length; i++) this.cells[i] *= remaining
    this.volume *= remaining
  }

  slosh(tilt: number) {
    if (tilt === 0) return
    const direction = Math.sign(tilt)
    const first = direction > 0 ? this.cells.length - 2 : 1
    for (let i = first; i >= 0 && i < this.cells.length - (direction > 0 ? 1 : 0); i -= direction) {
      if (i + direction < 0) break
      const transfer = this.cells[i] * Math.abs(tilt)
      this.cells[i] -= transfer
      this.cells[i + direction] += transfer
    }
  }

  settle(delta: number) {
    const rate = Math.min(0.23, delta * 0.024)
    for (let index = 0; index < this.cells.length - 1; index++) {
      const move = (this.cells[index] - this.cells[index + 1]) * rate
      this.cells[index] -= move
      this.cells[index + 1] += move
    }
  }
}

type Droplet = {
  x: number; y: number; vx: number; vy: number; volume: number; pool: WaterPool
}

export class Meltwater {
  private readonly mainPool = new WaterPool(0, arena.height, arena.width, arena.height - roofY)
  private readonly trayPool = new WaterPool(trayX, trayBottom, cabinet.tray.width, cabinet.tray.height)
  private readonly outside: WaterPool[] = []
  private shakeSpray = 0
  private readonly carried = new WeakMap<EmojiEntity, number>()
  private readonly contact = new WeakMap<EmojiEntity, { bottom: number; wet: boolean }>()
  readonly droplets: Droplet[] = []

  get chamber() { return this.mainPool.volume }
  get tray() { return this.trayPool.volume }
  get pools() { return [this.mainPool, this.trayPool, ...this.outside] }

  private poolAt(x: number, y: number, retained: boolean) {
    if (retained || (x >= trayX && x <= this.trayPool.right && y >= arena.height && y <= trayBottom)) {
      return this.trayPool
    }
    if (x >= 0 && x <= arena.width && y >= roofY && y <= arena.height) return this.mainPool
    return this.outside.find(pool => x >= pool.left && x <= pool.right)
  }

  private floorPool(x: number) {
    const existing = this.outside.find(pool => x >= pool.left && x <= pool.right)
    if (existing) return existing
    const pool = new WaterPool(x - 115, groundY, 230, 74)
    this.outside.push(pool)
    return pool
  }

  add(x: number, y: number, retained: boolean) {
    const pool = this.poolAt(x, y, retained) ?? this.floorPool(x)
    if (pool === this.trayPool) {
      const available = Math.max(0, pool.capacity - pool.volume - pool.incoming)
      pool.add(Math.min(portion, available))
      this.mainPool.add(Math.max(0, portion - available))
    } else {
      pool.add(portion)
    }
    const splash = pool.take(x, Math.min(160, pool.volume * 0.08))
    for (let i = 0; i < 8; i++) {
      const start = Math.min(y, pool.surface(x) - 2)
      this.launch(pool, x, start, splash / 8, (Math.random() - 0.5) * 0.46, -Math.random() * 0.2)
    }
  }

  private launch(pool: WaterPool, x: number, y: number, amount: number, vx: number, vy: number) {
    if (amount <= 0) return
    if (this.droplets.length >= maxDroplets) {
      pool.add(amount, x)
      return
    }
    pool.incoming += amount
    this.droplets.push({ x, y, vx, vy, pool, volume: amount })
  }

  step(delta: number, opening: number, shakePhase?: number) {
    if (shakePhase === undefined) this.shakeSpray = 0
    else {
      this.shakeSpray -= delta
      const tilt = Math.sin(shakePhase)
      for (const pool of [this.mainPool, this.trayPool]) {
        if (pool.volume < 5) continue
        pool.slosh(tilt * delta * 0.017)
        if (this.shakeSpray > 0 || Math.abs(tilt) < 0.55) continue
        const side = Math.sign(tilt)
        const x = side > 0 ? pool.right - 8 : pool.left + 8
        const y = pool.surface(x)
        const volume = pool.take(x, Math.min(150, pool.volume * 0.045))
        for (let i = 0; i < 6; i++) {
          this.launch(pool, x, y - 1, volume / 6, -side * (0.18 + Math.random() * 0.4),
            -(0.25 + Math.random() * 0.43))
        }
      }
      if (this.shakeSpray <= 0 && Math.abs(tilt) >= 0.55) this.shakeSpray = 125
    }
    if (opening > 0 && this.chamber > 0) {
      const tray = this.trayPool
      const available = Math.max(0, tray.capacity - tray.volume - tray.incoming)
      const amount = this.mainPool.take(hatchEnd, Math.min(available, delta * opening * 15))
      const x = hatchEnd - Math.random() * (hatchEnd - hatchX) * opening
      this.launch(tray, x, arena.height, amount, (Math.random() - 0.5) * 0.1, 0.12)
    }
    if (this.chamber > 0) this.mainPool.settle(delta)
    if (this.tray > 0) this.trayPool.settle(delta)
    for (let i = this.outside.length - 1; i >= 0; i--) {
      const pool = this.outside[i]
      if (pool.volume < 1 && pool.incoming < 1e-6) this.outside.splice(i, 1)
      else if (pool.volume > 0) pool.spreadOnFloor(delta)
    }
    for (let i = this.droplets.length - 1; i >= 0; i--) {
      const particle = this.droplets[i]
      const { pool } = particle
      particle.vy += gravity * delta
      particle.x += particle.vx * delta
      particle.y += particle.vy * delta
      if (particle.x < pool.left || particle.x > pool.right) {
        particle.x = Math.max(pool.left, Math.min(pool.right, particle.x))
        particle.vx *= -0.55
      }
      const surface = pool.surface(particle.x)
      if (particle.vy < 0 || (particle.y < surface && particle.y < pool.bottom)) continue
      pool.incoming -= particle.volume
      pool.add(particle.volume, particle.x)
      this.droplets[i] = this.droplets[this.droplets.length - 1]
      this.droplets.pop()
    }
  }

  releaseContents(entity: EmojiEntity, limit = Infinity) {
    const volume = this.carried.get(entity) ?? 0
    const amount = Math.min(volume, limit)
    if (amount <= 0) return
    if (amount === volume) this.carried.delete(entity)
    else this.carried.set(entity, volume - amount)

    const { x, y } = entity.body.position
    const target = this.poolAt(x, y, !!entity.retained) ??
      (x >= 0 && x <= arena.width && y < roofY ? this.mainPool : this.floorPool(x))
    const toTarget = target === this.trayPool
      ? Math.min(amount, Math.max(0, target.capacity - target.volume - target.incoming))
      : amount
    const floor = this.outside.includes(target)
    const angle = Math.atan2(Math.sin(entity.body.angle), Math.cos(entity.body.angle))
    const direction = angle < 0 ? -1 : 1
    const tilted = Math.abs(angle) < 1.18 && !entity.body.isStatic && limit !== Infinity
      ? angle + (direction * 1.18 - angle) * 0.18 : angle
    if (tilted !== angle) Matter.Body.setAngle(entity.body, tilted)
    // The SVG mouth sits above the center. Rotate its lower rim into world space.
    const lip = direction * 12
    const mouth = -16
    const rimX = x + lip * Math.cos(tilted) - mouth * Math.sin(tilted)
    const rimY = y + lip * Math.sin(tilted) + mouth * Math.cos(tilted)
    this.launch(target, rimX, rimY, toTarget, direction * 0.12, 0.17)
    if (amount > toTarget) this.launch(this.mainPool, x, arena.height - 12, amount - toTarget, 0, 0.1)
    if (floor && target.volume > 0) {
      // Split the landing stream sideways into the same outward-moving floor particles.
      const spray = target.take(x, Math.min(toTarget * 0.35, target.volume))
      this.launch(target, x, groundY - 2, spray / 2, -0.45, -0.12)
      this.launch(target, x, groundY - 2, spray / 2, 0.45, -0.12)
    }
  }

  private scoop(entity: EmojiEntity, limit: number) {
    const { min, max } = entity.body.bounds
    let collected = 0
    for (let index = this.droplets.length - 1; index >= 0 && collected < limit; index--) {
      const particle = this.droplets[index]
      if (particle.x < min.x || particle.x > max.x || particle.y < min.y || particle.y > max.y) continue
      const amount = Math.min(particle.volume, limit - collected)
      collected += amount
      particle.pool.incoming -= amount
      particle.volume -= amount
      if (particle.volume === 0) {
        this.droplets[index] = this.droplets[this.droplets.length - 1]
        this.droplets.pop()
      }
    }
    return collected
  }

  interact(entity: EmojiEntity, delta: number, held: boolean, sceneGravity: number) {
    const { body } = entity
    const { x, y } = body.position
    const bottom = body.bounds.max.y
    const previous = this.contact.get(entity)
    const pool = this.poolAt(x, y, !!entity.retained)
    const surface = pool?.surface(x) ?? Infinity
    const depth = bottom - surface
    const wet = !!pool && depth > 0 && pool.bottom > surface
    if (pool && pool.volume > 0 || previous) this.contact.set(entity, { bottom, wet })
    if (entity.kind === 'bucket') {
      if (!held) this.releaseContents(entity, delta * 14)
      else {
        const filled = this.carried.get(entity) ?? 0
        const allowance = Math.max(0, Math.min(bucketCapacity - filled, delta * 27))
        const settled = pool && wet ? pool.take(x, allowance) : 0
        const amount = settled + this.scoop(entity, allowance - settled)
        if (amount > 0) this.carried.set(entity, filled + amount)
      }
    }
    if (entity.kind === 'fire') {
      const previousScale = entity.waterScale ?? 1
      const desired = wet ? 0.32 : 1
      const scale = Math.abs(desired - previousScale) < 0.004 ? desired
        : desired + (previousScale - desired) * Math.exp(-delta / (wet ? 85 : 170))
      if (scale !== previousScale) {
        resizeBody(body, scale / previousScale, scale / previousScale)
        entity.waterScale = scale
      }
    }
    if (!pool || !wet) return

    const fallSpeed = body.isStatic ? (previous ? (bottom - previous.bottom) / delta : 0) : body.velocity.y / (1000 / 60)
    if (!previous?.wet && fallSpeed > 0.12) {
      const count = Math.min(15, Math.ceil(5 + fallSpeed * 13))
      const volume = pool.take(x, Math.min(pool.volume * 0.11, entity.radius * (2 + 4 * fallSpeed)))
      for (let i = 0; i < count; i++) {
        const spread = (i / (count - 1) - 0.5) * 2
        const speed = Math.min(0.74, 0.26 + fallSpeed * 0.4)
        this.launch(pool, x, surface - 1, volume / count,
          spread * speed, -speed * (1.15 - 0.48 * Math.abs(spread)) * (0.65 + 0.35 * Math.random()))
      }
    }
    if (!body.isStatic) {
      const immersion = Math.min(1, depth / (bottom - body.bounds.min.y))
      const resistance = Math.exp(-delta * immersion * 0.018)
      const lift = floating.has(entity.kind) ? delta * immersion * sceneGravity * 0.029 : 0
      Matter.Body.setVelocity(body, {
        x: body.velocity.x * resistance,
        y: body.velocity.y * resistance - lift,
      })
    }
  }
}
