export const catalog = {
  chicken: '小鸡',
  worm: '虫子',
  turtle: '乌龟',
  cat: '小猫',
  fish: '小鱼',
  moon: '月亮',
  sun: '太阳',
  lightning: '闪电',
  heart: '爱心',
  angry: '生气脸',
  sad: '哭泣脸',
  dog: '小狗',
  rabbit: '兔子',
  panda: '熊猫',
  frog: '青蛙',
  butterfly: '蝴蝶',
  flower: '小花',
  star: '星星',
  cloud: '云朵',
  rainbow: '彩虹',
  fire: '火焰',
  snowflake: '雪花',
  smile: '笑脸',
  surprised: '惊讶脸',
} as const

export type EmojiKind = keyof typeof catalog
export const emojiKinds = Object.keys(catalog) as EmojiKind[]

export function randomKind() {
  return emojiKinds[Math.floor(Math.random() * emojiKinds.length)]
}
