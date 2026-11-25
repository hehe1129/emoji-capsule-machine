import { Application, Graphics } from 'pixi.js'
import { arena, cabinet, groundY, room, roofY } from '../core/config'
import { emojiImage } from '../emoji/emojiImage'
import type { EmojiEntity } from '../emoji/EmojiEntity'
import { portrait } from '../capsule/PosterLayout'

const feedbackColors = { grow: 0xffc326, sleep: 0x3886c4, dash: 0xffbf15, soothe: 0xff5545, brighten: 0xf5b422, chase: 0x5ba942 }

type Visual = { root: HTMLDivElement; image: HTMLImageElement; badge?: HTMLImageElement }

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

  render(entities: Iterable<EmojiEntity>, heldId?: number) {
    const graphics = this.graphics.clear()
    const visible = new Set<number>()
    for (const entity of entities) {
      const { body, radius, reaction } = entity
      visible.add(body.id)
      let visual = this.visuals.get(body.id)
      const art = portrait(entity.kind, entity.reactionCounts)
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
      if (art.badge && !visual.badge) {
        visual.badge = emojiImage(art.badge, 'scene-badge')
        visual.root.append(visual.badge)
      }
      const x = body.position.x + cabinet.chamber.x
      const y = body.position.y + cabinet.chamber.y
      const progress = reaction ? reaction.elapsed / reaction.duration : 1
      const pulse = Math.sin(progress * Math.PI)
      const entry = Math.sin(entity.spawnRemaining / 420 * Math.PI)
      const size = radius / arena.radius * (1 + pulse * 0.11 + entry * 0.09)
      visual.root.style.transform = 'translate(' + x + 'px,' + y + 'px) rotate(' + (body.angle + art.tilt + pulse * 0.12) + 'rad) scale(' + size + ')'
      visual.root.toggleAttribute('data-retained', !!entity.retained)
      visual.root.toggleAttribute('data-outside', !entity.retained &&
        (body.position.x < 0 || body.position.x > arena.width || body.position.y < roofY))
      const floorGap = groundY - body.position.y - radius
      if (!entity.retained && heldId !== body.id && floorGap < 38 &&
        (body.position.x < 0 || body.position.x > arena.width)) {
        const contact = 1 - Math.max(0, floorGap) / 38
        graphics.ellipse(x, groundY + cabinet.chamber.y + 1, radius * (0.57 + contact * 0.22), 2.6)
          .fill({ color: 0x35536d, alpha: 0.2 * contact })
      }
      if (reaction || heldId === body.id) {
        graphics.circle(x, y, radius + 4 + (reaction ? progress * 12 : 0))
          .stroke({ color: reaction ? feedbackColors[reaction.effect] : 0x101012, width: 2.5, alpha: reaction ? 1 - progress : 0.8 })
      }
    }
    for (const [id, visual] of this.visuals) {
      if (visible.has(id)) continue
      visual.root.remove()
      this.visuals.delete(id)
    }
    this.app.render()
  }
}
