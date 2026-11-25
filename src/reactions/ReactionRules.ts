import type { EmojiKind } from '../emoji/catalog'

export type ReactionEffect = 'grow' | 'sleep' | 'dash' | 'soothe' | 'brighten' | 'chase'

export interface ReactionRule {
  actor: EmojiKind
  ingredient: EmojiKind
  name: string
  message: string
  effect: ReactionEffect
  duration: number
  maxUses?: number
  consumeIngredient?: boolean
  growth?: { steps: number; maxRadiusRatio: number }
  motion?: 'settle' | 'boost'
}

export const reactionRules: readonly ReactionRule[] = [
  {
    actor: 'chicken', ingredient: 'worm', name: '吃饱的小鸡',
    message: '小鸡吃掉虫子，又长大了一点！', effect: 'grow',
    growth: { steps: 10, maxRadiusRatio: 0.12 }, duration: 480,
  },
  {
    actor: 'chicken', ingredient: 'moon', name: '睡着的小鸡',
    message: '月亮一出来，小鸡就睡着了。', effect: 'sleep', motion: 'settle', duration: 950,
  },
  {
    actor: 'turtle', ingredient: 'lightning', name: '闪电乌龟',
    message: '乌龟碰到闪电，突然加速！', effect: 'dash', motion: 'boost',
    maxUses: Infinity, consumeIngredient: false, duration: 720,
  },
  {
    actor: 'angry', ingredient: 'heart', name: '平静下来的脸',
    message: '收到爱心，气慢慢消了。', effect: 'soothe', duration: 800,
  },
  {
    actor: 'sad', ingredient: 'sun', name: '破涕为笑的脸',
    message: '太阳出来了，泪汪汪笑了。', effect: 'brighten', duration: 800,
  },
  {
    actor: 'cat', ingredient: 'fish', name: '追鱼的小猫',
    message: '小猫发现了小鱼。', effect: 'chase', maxUses: Infinity, consumeIngredient: false, duration: 680,
  },
]
