import type { EmojiKind } from '../emoji/catalog'

// The tulip continuation belongs to the plant-growth recipe.
export const reactionRules = [
  { actor: 'chick', ingredient: 'caterpillar', effect: 'grow', duration: 620, name: '小鸡吃虫' },
  { actor: 'chick', ingredient: 'moon', effect: 'sleep', duration: 760, name: '小鸡睡觉' },
  { actor: 'turtle', ingredient: 'lightning', effect: 'dash', duration: 2000, name: '闪电乌龟' },
  { actor: 'cat', ingredient: 'fish', effect: 'chase', duration: 650, result: 'heart_eyes_cat', name: '猫咪开饭' },
  { actor: 'angry', ingredient: 'heart', effect: 'soothe', duration: 880, result: 'smiling', name: '情绪治愈' },
  { actor: 'crying', ingredient: 'sun', effect: 'brighten', duration: 900, result: 'happy', name: '雨过天晴' },
  { actor: 'seedling', ingredient: 'water', effect: 'bloom', duration: 820, result: 'tulip', name: '植物生长' },
  { actor: 'tulip', ingredient: 'water', effect: 'elongate', duration: 650, name: '郁金香长高' },
  { actor: 'rain_cloud', ingredient: 'sun', effect: 'rainbow', duration: 1050, result: 'rainbow', name: '彩虹诞生' },
  { actor: 'ice', ingredient: 'fire', effect: 'melt', duration: 920, name: '冰块融水' },
  { actor: 'snail', ingredient: 'rocket', effect: 'thrust', duration: 1050, name: '火箭蜗牛' },
  { actor: 'heart', ingredient: 'lightning', effect: 'break', duration: 680, result: 'broken_heart', name: '心碎瞬间' },
  { actor: 'gift', ingredient: 'star', effect: 'unwrap', duration: 720, name: '惊喜礼物' },
] as const satisfies readonly { actor: EmojiKind; ingredient: EmojiKind; effect: string; duration: number; name: string; result?: EmojiKind }[]
export type ReactionRule = typeof reactionRules[number]
export type ReactionEffect = ReactionRule['effect']
export const stateKeys = reactionRules.map(rule => rule.effect)

// Index both orders once. Ordinary contacts are common in a full machine.
const contacts = new Map<EmojiKind, Map<EmojiKind, ReactionRule>>()
for (const rule of reactionRules) {
  for (const [a, b] of [[rule.actor, rule.ingredient], [rule.ingredient, rule.actor]] as const) {
    let row = contacts.get(a)
    if (!row) contacts.set(a, row = new Map())
    row.set(b, rule)
  }
}

export const findRecipe = (a: EmojiKind, b: EmojiKind) => contacts.get(a)?.get(b)
