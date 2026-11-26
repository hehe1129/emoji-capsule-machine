import type { EmojiKind } from './catalog'
export type EmojiArtwork = EmojiKind

export function emojiImageUrl(kind: EmojiArtwork) {
  return import.meta.env.BASE_URL + 'pixel-emoji/' + kind + '.png'
}

export function emojiImage(kind: EmojiArtwork, className: string) {
  const image = document.createElement('img')
  image.className = className
  image.alt = ''
  image.draggable = false
  image.src = emojiImageUrl(kind)
  return image
}
