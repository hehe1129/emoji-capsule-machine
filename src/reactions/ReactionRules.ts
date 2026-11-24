import { reactionArt, type EmojiArt, type EmojiKind } from '../emoji/catalog'

export type ReactionEffect = 'grow' | 'sleep' | 'dash' | 'soothe' | 'brighten'

export interface ReactionRule {
  actor: EmojiKind
  ingredient: EmojiKind
  name: string
  message: string
  effect: ReactionEffect
  duration: number
  art?: EmojiArt
  badge?: EmojiArt
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
    message: '月亮一出来，小鸡就睡着了。', effect: 'sleep', badge: reactionArt.asleep, motion: 'settle', duration: 950,
  },
  {
    actor: 'turtle', ingredient: 'lightning', name: '闪电乌龟',
    message: '乌龟碰到闪电，突然加速！', effect: 'dash', motion: 'boost',
    maxUses: Infinity, consumeIngredient: false, duration: 720,
  },
  {
    actor: 'angry', ingredient: 'heart', name: '平静下来的脸',
    message: '收到爱心，气慢慢消了。', effect: 'soothe', art: reactionArt.calm, duration: 800,
  },
  {
    actor: 'sad', ingredient: 'sun', name: '破涕为笑的脸',
    message: '太阳出来了，泪汪汪笑了。', effect: 'brighten', art: reactionArt.happy, duration: 800,
  },
]
