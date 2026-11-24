import type { EmojiArt } from './catalog'

export function emojiImage(art: EmojiArt, className: string, alt = '') {
  const base = import.meta.env.BASE_URL + 'emoji/' + art
  const picture = document.createElement('picture')
  picture.className = className
  const still = document.createElement('source')
  still.media = '(prefers-reduced-motion: reduce)'
  still.srcset = base + '-still.webp'
  const image = document.createElement('img')
  image.alt = alt
  image.draggable = false
  image.src = base + '.webp'
  picture.append(still, image)
  return picture
}
