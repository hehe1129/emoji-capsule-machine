export const catalog = {
  chicken: { glyph: '🐔', name: '小鸡' },
  worm: { glyph: '🐛', name: '虫子' },
  moon: { glyph: '🌙', name: '月亮' },
  turtle: { glyph: '🐢', name: '乌龟' },
  lightning: { glyph: '⚡', name: '闪电' },
  angry: { glyph: '😡', name: '生气脸' },
  heart: { glyph: '❤️', name: '爱心' },
  sad: { glyph: '😭', name: '泪汪汪' },
  sun: { glyph: '☀️', name: '太阳' },
} as const

export type EmojiKind = keyof typeof catalog
export const emojiKinds = Object.keys(catalog) as EmojiKind[]
