import { Application, Container, Graphics, Text } from 'pixi.js'
import { arena } from '../core/config'
import { catalog } from '../emoji/catalog'
import type { EmojiEntity } from '../emoji/EmojiEntity'
import type { ReactionEffect } from '../reactions/ReactionRules'

type Visual = { root: Container; text: Text; ring: Graphics; badge?: Text }

const emojiFont = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif'
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
    host.prepend(this.app.canvas)
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
      const defaultGlyph = catalog[entity.kind].glyph
      const glyph = progress >= 0.5 ? entity.result?.glyph ?? defaultGlyph : defaultGlyph
      if (visual.text.text !== glyph) visual.text.text = glyph
      visual.text.alpha = effect === 'soothe' || effect === 'brighten' ? 1 - pulse * 0.7 : 1
      visual.text.rotation = body.angle + (resting ? (1 - (1 - sleepProgress) ** 2) * 0.3 : 0)
      const bounce = effect === 'grow' ? 0.08 : effect === 'brighten' ? 0.25 : 0
      const scale = radius / arena.radius * (1 + pulse * bounce)
      visual.text.scale.set(scale)
      if (entity.result?.badge) {
        if (!visual.badge) {
          visual.badge = visual.root.addChild(new Text({
            text: entity.result.badge,
            style: { fontFamily: emojiFont, fontSize: arena.radius * 0.7 },
          }))
          visual.badge.anchor.set(0.5)
        }
        visual.badge.alpha = Math.min(1, sleepProgress * 3)
        visual.badge.position.set(radius * 0.78, -radius * 0.73 - Math.sin(sleepProgress * Math.PI) * 8)
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
      this.visuals.delete(id)
    }
    this.app.render()
  }

  private createVisual(entity: EmojiEntity): Visual {
    const root = new Container()
    const ring = root.addChild(new Graphics())
    ring.visible = false
    const text = root.addChild(new Text({
      text: catalog[entity.kind].glyph,
      style: {
        fontFamily: emojiFont,
        fontSize: arena.radius * 1.58,
        padding: 5,
      },
    }))
    text.anchor.set(0.5)
    this.app.stage.addChild(root)
    const visual = { root, ring, text }
    this.visuals.set(entity.body.id, visual)
    return visual
  }
}
