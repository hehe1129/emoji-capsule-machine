import type { EmojiEntity } from '../emoji/EmojiEntity'
import { emojiImage, type EmojiArtwork } from '../emoji/emojiImage'
import { flowerHeight } from '../emoji/flower'

type Reaction = NonNullable<EmojiEntity['reaction']>
const clamp = (n: number) => Math.max(0, Math.min(1, n))

// Decorative participants have no hit targets or physics bodies. Their lifetime is the reaction's.
export class ReactionVisual {
  private readonly group = document.createElement('span')
  private readonly ingredient: HTMLImageElement
  private readonly next?: HTMLImageElement
  private readonly accent = document.createElement('span')

  constructor(root: HTMLElement, readonly reaction: Reaction, actor: EmojiEntity) {
    const { rule } = reaction
    this.ingredient = emojiImage(rule.ingredient, 'fx-art')
    let destination: EmojiArtwork | undefined
    if ('result' in rule) destination = rule.result
    if (rule.effect === 'sleep') destination = 'sleeping-chick'
    if (rule.effect === 'elongate') destination = `tulip-${(actor.reactionCounts?.elongate ?? 0) + 1}${actor.compactFlower ? '-tray' : ''}`
    if (rule.effect === 'unwrap') destination = 'gift'
    if (destination) this.next = emojiImage(destination, 'fx-art')
    this.group.className = 'reaction-fx'
    this.accent.className = 'fx-accent fx-' + rule.effect
    if (rule.effect === 'sleep') this.accent.textContent = 'Zzz'
    this.group.append(this.ingredient)
    if (this.next) this.group.append(this.next)
    this.group.append(this.accent)
    root.append(this.group)
  }

  update(entity: EmojiEntity, image: HTMLImageElement, p: number) {
    const effect = this.reaction.rule.effect
    const wave = Math.sin(Math.PI * p)
    const cross = clamp((p - 0.32) / 0.58)
    const { x, y } = this.reaction.offset
    const a = -entity.body.angle
    const scale = 22 / entity.radius
    const dx = (x * Math.cos(a) - y * Math.sin(a)) * scale
    const dy = (x * Math.sin(a) + y * Math.cos(a)) * scale
    const absorb = 1 - clamp(p / 0.63)
    this.ingredient.style.transform = `translate(${dx * absorb}px,${dy * absorb}px) scale(${absorb})`
    this.ingredient.style.opacity = String(Math.min(1, absorb * 2))
    image.style.opacity = this.next ? String(1 - cross) : '1'
    if (this.next) this.next.style.opacity = String(cross)
    this.accent.style.opacity = String(wave)
    switch (effect) {
      case 'grow':
        image.style.transform = `scale(${1 + 0.16 * wave},${1 - 0.12 * wave})`
        break
      case 'sleep':
        this.accent.style.transform = `translate(${8 * p}px,${-12 * p}px)`
        break
      case 'dash':
        this.accent.style.transform = `rotate(${Math.floor(p * 15) * 53}deg)`
        break
      case 'chase':
        image.style.transform = `translate(${dx * wave * 0.42}px,${dy * wave * 0.42 - 4 * wave}px)`
        break
      case 'soothe':
        this.ingredient.style.transform += ` scale(${1 + 0.25 * Math.sin(5 * Math.PI * p)})`
        break
      case 'brighten':
        // Wipe the tear streaks upward as the new face replaces the old one.
        image.style.clipPath = `inset(0 0 ${cross * 100}% 0)`
        this.next!.style.clipPath = `inset(${(1 - cross) * 100}% 0 0 0)`
        this.next!.style.opacity = image.style.opacity = '1'
        break
      case 'bloom':
        this.next!.style.transformOrigin = '50% 90%'
        this.next!.style.transform = `scale(${0.35 + cross * 0.65}) rotate(${-18 * (1 - cross)}deg)`
        break
      case 'elongate': {
        const height = 46 * flowerHeight((entity.reactionCounts?.elongate ?? 0) + 1, entity.compactFlower)
        Object.assign(this.next!.style, { height: height + 'px', top: -height / 2 + 'px',
          transform: `scaleY(${0.5 + cross / 2})` })
        break
      }
      case 'rainbow':
        this.accent.style.transform = `translateY(${(p * 48) % 12}px)`
        this.next!.style.clipPath = `inset(0 ${(1 - cross) * 100}% 0 0)`
        this.ingredient.style.filter = `drop-shadow(0 0 ${6 * wave}px #ffd65c)`
        break
      case 'melt':
        image.style.transformOrigin = 'center bottom'
        image.style.transform = `scale(${1 + p * 0.35},${1 - 0.94 * p})`
        image.style.opacity = String(1 - p * p)
        break
      case 'thrust':
        this.ingredient.style.opacity = '1'
        this.ingredient.style.transform = `translate(${dx * absorb + 6 * (1 - absorb)}px,${dy * absorb - 12 * (1 - absorb)}px) scale(${0.54 + 0.46 * absorb})`
        this.accent.style.transform = `scaleY(${0.7 + 0.3 * Math.sin(p * 60)})`
        break
      case 'break':
        image.style.transform = `translateX(${wave * Math.sin(p * 70) * 3}px)`
        this.ingredient.style.transform = `translate(0,${-52 + 42 * clamp(p * 3)}px) scale(${1 - cross})`
        break
      case 'unwrap':
        image.style.clipPath = 'inset(35% 0 0)'
        image.style.opacity = String(1 - p ** 4)
        this.next!.style.clipPath = 'inset(0 0 64% 0)'
        this.next!.style.opacity = String(1 - p ** 3)
        this.next!.style.transform = `translate(${12 * cross}px,${-20 * cross}px) rotate(${cross * 25}deg)`
        break
    }
  }

  remove(image: HTMLImageElement) {
    this.group.remove()
    for (const property of ['opacity', 'clip-path', 'transform', 'transform-origin']) image.style.removeProperty(property)
  }
}
