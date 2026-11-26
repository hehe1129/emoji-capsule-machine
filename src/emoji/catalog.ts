// The appearance of archived stickers is resolved separately from the dispenser pool.
const base = {
  chick: ['小鸡', '1f425'], caterpillar: ['虫子', '1f41b'], moon: ['月亮', '1f319'],
  turtle: ['乌龟', '1f422'], lightning: ['闪电', '26a1'], cat: ['小猫', '1f431'],
  fish: ['小鱼', '1f41f'], angry: ['生气脸', '1f621'], heart: ['爱心', '2764'],
  crying: ['哭泣脸', '1f62d'], sun: ['太阳', '2600'], seedling: ['嫩芽', '1f331'],
  water: ['水滴', '1f4a7'], rain_cloud: ['雨云', '1f327'], star: ['星星', '2b50'],
  fire: ['火焰', '1f525'], snail: ['蜗牛', '1f40c'], rocket: ['火箭', '1f680'],
  ice: ['冰块', '1f9ca'], gift: ['礼物', '1f381'], bucket: ['铁桶', '1faa3'],
} as const
const derived = {
  heart_eyes_cat: ['爱心眼猫', '1f63b'], smiling: ['微笑脸', '1f60a'], happy: ['开心脸', '1f604'],
  tulip: ['郁金香', '1f337'], rainbow: ['彩虹', '1f308'], broken_heart: ['破碎爱心', '1f494'],
} as const
const archive = {
  chicken: base.chick, worm: base.caterpillar, sad: base.crying, smile: derived.smiling,
  dog: ['小狗', '1f436'], rabbit: ['兔子', '1f430'], panda: ['熊猫', '1f43c'], frog: ['青蛙', '1f438'],
  butterfly: ['蝴蝶', '1f98b'], flower: ['小花', '1f338'], cloud: ['云朵', '2601'],
  snowflake: ['雪花', '2744'], surprised: ['惊讶脸', '1f62e'],
} as const
export const artwork = { ...base, ...derived, ...archive }
export type EmojiKind = keyof typeof artwork
export const catalog = Object.fromEntries(Object.entries(artwork).map(([id, [name]]) => [id, name])) as Record<EmojiKind, string>
export const emojiKinds = Object.keys(artwork) as EmojiKind[]
export const baseKinds = Object.keys(base) as (keyof typeof base)[]
export function randomKind() {
  return baseKinds[Math.floor(Math.random() * baseKinds.length)]
}
