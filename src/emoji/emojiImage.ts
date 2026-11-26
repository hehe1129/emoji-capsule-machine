import flowerParts from './flower-parts.svg?raw'
import { flowerHeight } from './flower'
import { artwork, type EmojiKind } from './catalog'
export type EmojiArtwork = EmojiKind | 'sleeping-chick' | 'mounted-snail' | `tulip-${number}${'' | '-tray'}`

export function emojiImageUrl(kind: EmojiArtwork) {
  if (kind.startsWith('tulip-')) {
    const [, count, tray] = kind.split('-')
    return flowerUrl(Number(count), tray === 'tray')
  }
  const name = kind === 'sleeping-chick' || kind === 'mounted-snail' ? kind : artwork[kind as EmojiKind][1]
  return import.meta.env.BASE_URL + 'twemoji/' + name + '.svg'
}

export function emojiImage(kind: EmojiArtwork, className: string) {
  const image = document.createElement('img')
  image.className = className
  image.alt = ''
  image.draggable = false
  image.src = emojiImageUrl(kind)
  return image
}

const flowerImages = new Map<string, string>()
function flowerUrl(waterings: number, compact: boolean) {
  const key = waterings + (compact ? '-tray' : '')
  const cached = flowerImages.get(key)
  if (cached) return cached
  const height = 36 * flowerHeight(waterings, compact)
  const extension = height - 36
  // Extra stem folds back and forth when the bloom reaches the height of the display.
  // A triangular fold has the requested arc length regardless of its projected height.
  // Beyond screen resolution, draw the dense stem as a repeating SVG pattern.
  const length = 36 * (2 ** Math.min(waterings, 48) - 1)
  const horizontal = Math.sqrt(Math.max(0, length ** 2 - extension ** 2))
  const periods = Math.max(1, Math.ceil(horizontal / 40))
  const amplitude = horizontal / (4 * periods)
  const period = extension / periods
  const fold = `<defs><pattern id="fold" x="0" y="21" width="36" height="${period}" patternUnits="userSpaceOnUse"><path d="M18 0 L${18-amplitude} ${period/4} L${18+amplitude} ${3*period/4} L18 ${period}" fill="none" stroke="#77B255" stroke-width="2" stroke-linejoin="round"/></pattern></defs><rect x="0" y="21" width="36" height="${extension}" fill="url(#fold)"/>`
  const svg = flowerParts
    .replace('viewBox="0 0 36 36"', `viewBox="0 0 36 ${height}"`)
    .replace('translate(0 0)', `translate(0 ${extension})`)
    .replace('<!--stem-->', fold)
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  flowerImages.set(key, url)
  return url
}
