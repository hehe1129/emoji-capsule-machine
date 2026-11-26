import { Application, Graphics } from 'pixi.js'
import { arena, cabinet, groundY, room, roofY } from '../core/config'
import { emojiImage } from '../emoji/emojiImage'
import type { EmojiEntity } from '../emoji/EmojiEntity'
import { portrait } from '../capsule/PosterLayout'

import { ReactionVisual } from './ReactionVisual'
import type { Meltwater } from '../reactions/Meltwater'
import { flowerHeight } from '../emoji/flower'
import './reactions.css'

type Visual = { root: HTMLDivElement; image: HTMLImageElement; fx?: ReactionVisual }

export class SceneRenderer {
  private readonly app = new Application()
  private readonly graphics = new Graphics()
  private readonly visuals = new Map<number, Visual>()
  private readonly layer = document.createElement('div')

  async init(host: HTMLElement) {
    const canvasLeft = room.left + cabinet.chamber.x
    const width = Math.ceil(room.right - room.left)
    await this.app.init({
      width, height: cabinet.height + 6, resolution: Math.min(devicePixelRatio, 2),
      backgroundAlpha: 0, antialias: true, autoStart: false,
    })
    this.app.stage.addChild(this.graphics)
    const layer = this.layer
    layer.className = 'emoji-layer'
    layer.setAttribute('aria-hidden', 'true')
    this.app.canvas.style.left = canvasLeft + 'px'
    this.app.canvas.style.width = width + 'px'
    this.app.canvas.style.height = cabinet.height + 6 + 'px'
    this.graphics.position.x = -canvasLeft
    layer.append(this.app.canvas)
    host.append(layer)
  }

  render(entities: Iterable<EmojiEntity>, heldIds: ReadonlySet<number>, water: Meltwater) {
    const graphics = this.graphics.clear()
    this.drawWater(water)
    const visible = new Set<number>()
    for (const entity of entities) {
      const { body, radius, reaction } = entity
      const held = heldIds.has(body.id)
      visible.add(body.id)
      let visual = this.visuals.get(body.id)
      const art = portrait(entity.kind, entity.reactionCounts)
      if (entity.compactFlower && entity.reactionCounts?.elongate) art.kind = `tulip-${entity.reactionCounts.elongate}-tray`
      if (!visual) {
        const root = document.createElement('div')
        root.className = 'scene-token'
        root.dataset.body = String(body.id)
        root.dataset.kind = entity.kind
        const image = emojiImage(art.kind, 'scene-portrait')
        image.dataset.kind = art.kind
        root.append(image)
        this.layer.append(root)
        visual = { root, image }
        this.visuals.set(body.id, visual)
      }
      if (visual.image.dataset.kind !== art.kind) {
        const image = emojiImage(art.kind, 'scene-portrait')
        image.dataset.kind = art.kind
        visual.image.replaceWith(image)
        visual.image = image
      }
      if (visual.root.dataset.kind !== entity.kind) visual.root.dataset.kind = entity.kind
      if (entity.kind === 'tulip') {
        const height = 46 * flowerHeight(entity.reactionCounts?.elongate ?? 0, entity.compactFlower)
        visual.image.style.height = height + 'px'
        visual.image.style.top = -height / 2 + 'px'
      }
      if (visual.fx && visual.fx.reaction !== reaction) {
        visual.fx.remove(visual.image)
        visual.fx = undefined
      }
      if (reaction && !visual.fx) visual.fx = new ReactionVisual(visual.root, reaction, entity)
      const x = body.position.x + cabinet.chamber.x
      const y = body.position.y + cabinet.chamber.y
      const progress = reaction ? reaction.elapsed / reaction.rule.duration : 1
      visual.fx?.update(entity, visual.image, progress)
      const entry = Math.sin(entity.spawnRemaining / 420 * Math.PI)
      const flex = entity.lidScale ?? 1
      const size = radius / arena.radius * (1 + entry * 0.09) * flex * (entity.waterScale ?? 1)
      visual.root.style.transform = 'translate(' + x + 'px,' + y + 'px) rotate(' + (body.angle + art.tilt) + 'rad) scale(' + size * (1 + (1 - flex) * 0.16) + ',' + size + ')'
      visual.root.toggleAttribute('data-retained', !!entity.retained)
      visual.root.toggleAttribute('data-held', held)
      visual.root.toggleAttribute('data-outside', !entity.retained &&
        (body.position.x < 0 || body.position.x > arena.width || body.position.y < roofY))
      const floorGap = groundY - body.position.y - radius
      const outsideOnFloor = !entity.retained && !held && floorGap < 38 &&
        (body.position.x < 0 || body.position.x > arena.width)
      visual.root.toggleAttribute('data-on-ground', outsideOnFloor)
      if (outsideOnFloor) {
        const contact = 1 - Math.max(0, floorGap) / 38
        graphics.ellipse(x, groundY + cabinet.chamber.y + 1, radius * (0.57 + contact * 0.22), 2.6)
          .fill({ color: 0x35536d, alpha: 0.2 * contact })
      }
      if (held) {
        graphics.circle(x, y, radius + 4).stroke({ color: 0x101012, width: 2.5, alpha: 0.8 })
      }
    }
    for (const [id, visual] of this.visuals) {
      if (visible.has(id)) continue
      visual.root.remove()
      this.visuals.delete(id)
    }
    this.app.render()
  }

  private drawWater(water: Meltwater) {
    const { x, y } = cabinet.chamber
    for (const pool of water.pools) {
      if (pool.volume <= 0.01) continue
      const bottom = y + pool.bottom
      const left = x + pool.left
      const surface: number[] = []
      for (let i = 0; i < pool.cells.length; i++) {
        surface.push(left + (i + 0.5) * pool.width, bottom - pool.depth(i))
      }
      const startY = surface[1]
      const endY = surface[surface.length - 1]
      const edge = [left, startY, ...surface, x + pool.right, endY]
      this.graphics.poly([left, bottom, ...edge, x + pool.right, bottom]).fill({ color: 0x7bdccd, alpha: 0.57 })
      this.graphics.poly(edge, false).stroke({ color: 0xb2eee6, width: 1.5 })
    }
    for (const particle of water.droplets) {
      const radius = Math.max(1.1, Math.min(5.5, Math.sqrt(particle.volume / Math.PI)))
      this.graphics.ellipse(x + particle.x, y + particle.y, radius, radius * (1 + Math.abs(particle.vy) * 0.65))
        .fill({ color: 0x8ce1d6, alpha: 0.85 })
    }
  }
}
