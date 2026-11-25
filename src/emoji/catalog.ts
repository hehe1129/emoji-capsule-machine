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
} as const

export type EmojiKind = keyof typeof catalog
export const emojiKinds = Object.keys(catalog) as EmojiKind[]

export function randomKind() {
  return emojiKinds[Math.floor(Math.random() * emojiKinds.length)]
}
