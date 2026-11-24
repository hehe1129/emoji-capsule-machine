import type { EmojiArt } from './catalog'

export function emojiImageUrl(art: EmojiArt) {
  return import.meta.env.BASE_URL + 'twemoji/' + art + '.svg'
}

export function emojiImage(art: EmojiArt, className: string, alt = '') {
  const image = document.createElement('img')
  image.className = className
  image.alt = alt
  image.draggable = false
  image.src = emojiImageUrl(art)
  return image
}
