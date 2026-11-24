export const catalog = {
  chicken: { art: '1f425', name: '小鸡' },
  worm: { art: '1f41b', name: '虫子' },
  moon: { art: '1f319', name: '月亮' },
  turtle: { art: '1f422', name: '乌龟' },
  lightning: { art: '26a1', name: '闪电' },
  angry: { art: '1f621', name: '生气脸' },
  heart: { art: '2764', name: '爱心' },
  sad: { art: '1f62d', name: '泪汪汪' },
  sun: { art: '2600', name: '太阳' },
  cat: { art: '1f431', name: '猫' },
  dog: { art: '1f436', name: '狗' },
  star: { art: '2b50', name: '星星' },
  fish: { art: '1f41f', name: '鱼' },
} as const

export const reactionArt = { asleep: '1f634', calm: '1f60c', happy: '1f604' } as const
export type EmojiKind = keyof typeof catalog
export type EmojiArt = (typeof catalog)[EmojiKind]['art'] | (typeof reactionArt)[keyof typeof reactionArt]
export const emojiKinds = Object.keys(catalog) as EmojiKind[]
