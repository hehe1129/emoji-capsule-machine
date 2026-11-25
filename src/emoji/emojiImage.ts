import type { EmojiKind } from './catalog'
export type EmojiArtwork = EmojiKind | 'soothed' | 'delighted'

export function emojiImageUrl(kind: EmojiArtwork) {
  const directory = kind === 'soothed' || kind === 'delighted' ? 'original-emoji-states/' : 'original-emoji/'
  return import.meta.env.BASE_URL + directory + kind + '.png'
}

export function emojiImage(kind: EmojiArtwork, className: string) {
  const image = document.createElement('img')
  image.className = className
  image.alt = ''
  image.draggable = false
  image.src = emojiImageUrl(kind)
  return image
}
