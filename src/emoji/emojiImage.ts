import type { EmojiArt } from './catalog'

export function emojiImageUrl(art: EmojiArt, animated = false) {
  return import.meta.env.BASE_URL + 'emoji/' + art + (animated ? '.webp' : '-still.webp')
}

export function emojiImage(art: EmojiArt, className: string, alt = '', animated = false) {
  const picture = document.createElement('picture')
  picture.className = className
  if (animated) {
    const still = document.createElement('source')
    still.media = '(prefers-reduced-motion: reduce)'
    still.srcset = emojiImageUrl(art)
    picture.append(still)
  }
  const image = document.createElement('img')
  image.alt = alt
  image.draggable = false
  image.src = emojiImageUrl(art, animated)
  picture.append(image)
  return picture
}
