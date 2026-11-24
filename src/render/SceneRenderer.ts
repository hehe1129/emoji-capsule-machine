import { Application, Container, Graphics } from 'pixi.js'
import { arena } from '../core/config'
import { catalog, type EmojiArt } from '../emoji/catalog'
import { emojiImage } from '../emoji/emojiImage'
import type { EmojiEntity } from '../emoji/EmojiEntity'
import type { ReactionEffect } from '../reactions/ReactionRules'

type Visual = {
  root: Container
  ring: Graphics
  token: HTMLDivElement
  portrait: HTMLPictureElement
  art: EmojiArt
  badge?: HTMLPictureElement
}

const feedbackColors: Record<ReactionEffect, number> = {
  grow: 0xf9d856,
  sleep: 0x818cf8,
  dash: 0xf4a223,
  soothe: 0xe6749c,
  brighten: 0xffaf36,
}

export class SceneRenderer {
  private readonly app = new Application()
  private readonly visuals = new Map<number, Visual>()
  private readonly emojiLayer = document.createElement('div')

  async init(host: HTMLElement) {
    await this.app.init({
      width: arena.width,
      height: arena.height,
      resolution: Math.min(devicePixelRatio, 2),
      backgroundAlpha: 0,
      antialias: true,
      autoStart: false,
    })
    this.app.canvas.setAttribute('aria-hidden', 'true')
    const layer = this.emojiLayer
    layer.className = 'emoji-layer'
    layer.setAttribute('aria-hidden', 'true')
    layer.style.width = arena.width + 'px'
    layer.style.height = arena.height + 'px'
    host.prepend(layer, this.app.canvas)
    const resize = () => {
      layer.style.transform = 'scale(' + host.clientWidth / arena.width + ', ' + host.clientHeight / arena.height + ')'
    }
    new ResizeObserver(resize).observe(host)
    resize()
  }

  render(entities: Iterable<EmojiEntity>, heldId?: number) {
    const visible = new Set<number>()
    for (const entity of entities) {
      const { body, radius, reaction } = entity
      const visual = this.visuals.get(body.id) ?? this.createVisual(entity)
      visible.add(body.id)
      visual.root.position.set(body.position.x, body.position.y)
      const progress = reaction ? reaction.elapsed / reaction.duration : 1
      const pulse = Math.sin(progress * Math.PI)
      const resting = !!entity.result?.badge
      const effect = reaction?.effect
      const sleepProgress = effect === 'sleep' ? progress : 1
      const defaultArt = catalog[entity.kind].art
      const art = progress >= 0.5 ? entity.result?.art ?? defaultArt : defaultArt
      if (visual.art !== art) {
        const portrait = emojiImage(art, 'scene-portrait')
        visual.portrait.replaceWith(portrait)
        visual.portrait = portrait
        visual.art = art
      }
      const opacity = effect === 'soothe' || effect === 'brighten' ? 1 - pulse * 0.7 : 1
      const angle = body.angle + (resting ? (1 - (1 - sleepProgress) ** 2) * 0.3 : 0)
      const bounce = effect === 'grow' ? 0.08 : effect === 'brighten' ? 0.25 : 0
      const scale = radius / arena.radius * (1 + pulse * bounce)
      const { x, y } = body.position
      visual.token.style.transform = `translate(${x}px, ${y}px)`
      visual.portrait.style.transform = `translate(-50%, -50%) rotate(${angle}rad) scale(${scale})`
      visual.portrait.style.opacity = String(opacity)
      if (entity.result?.badge) {
        if (!visual.badge) {
          visual.badge = emojiImage(entity.result.badge, 'scene-badge')
          visual.token.append(visual.badge)
        }
        visual.badge.style.opacity = String(Math.min(1, sleepProgress * 3))
        visual.badge.style.transform = `translate(${radius * 0.48}px, ${-radius * 0.85 - Math.sin(sleepProgress * Math.PI) * 8}px)`
      }
      if (visual.ring.visible) visual.ring.clear()
      visual.ring.visible = !!effect || heldId === body.id
      if (effect === 'dash') {
        const direction = Math.atan2(body.velocity.y, body.velocity.x)
        const x = Math.cos(direction)
        const y = Math.sin(direction)
        for (const offset of [-7, 7]) {
          visual.ring.moveTo(-x * radius - y * offset, -y * radius + x * offset)
            .lineTo(-x * (radius + 28) - y * offset, -y * (radius + 28) + x * offset)
            .stroke({ color: feedbackColors.dash, width: 3, alpha: 1 - progress })
        }
      }
      if (visual.ring.visible) {
        visual.ring.circle(0, 0, radius + 6 + (effect ? (1 - (1 - progress) ** 2) * 22 : 0))
          .stroke({ color: effect ? feedbackColors[effect] : 0xf9d856, width: 3, alpha: effect ? 1 - progress : 1 })
      }
    }
    for (const [id, visual] of this.visuals) {
      if (visible.has(id)) continue
      visual.root.destroy({ children: true })
      visual.token.remove()
      this.visuals.delete(id)
    }
    this.app.render()
  }

  private createVisual(entity: EmojiEntity): Visual {
    const root = new Container()
    const ring = root.addChild(new Graphics())
    ring.visible = false
    const art = catalog[entity.kind].art
    const portrait = emojiImage(art, 'scene-portrait')
    const token = document.createElement('div')
    token.className = 'scene-token'
    token.append(portrait)
    this.emojiLayer.append(token)
    this.app.stage.addChild(root)
    const visual = { root, ring, token, portrait, art }
    this.visuals.set(entity.body.id, visual)
    return visual
  }
}
