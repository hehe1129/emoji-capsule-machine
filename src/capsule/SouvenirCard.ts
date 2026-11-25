import { emojiImageUrl, type EmojiArtwork } from '../emoji/emojiImage'
import { portrait, posterPalette, posterSize, type Poster } from './PosterLayout'

const ink = '#111113'
const title = '扭蛋黄'
const imageCache = new Map<EmojiArtwork, Promise<HTMLImageElement>>()

function load(kind: EmojiArtwork) {
  const cached = imageCache.get(kind)
  if (cached) return cached
  const image = new Image()
  image.src = emojiImageUrl(kind)
  const promise = image.decode().then(() => image).catch(error => {
    imageCache.delete(kind)
    throw error
  })
  imageCache.set(kind, promise)
  return promise
}

export async function createSouvenir(poster: Poster) {
  const canvas = document.createElement('canvas')
  const { width, height } = posterSize
  canvas.width = width * 2
  canvas.height = height * 2
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas unavailable')
  context.scale(2, 2)
  const colors = posterPalette(poster)
  context.fillStyle = colors.paper
  context.fillRect(0, 0, width, height)
  context.fillStyle = ink
  context.strokeStyle = ink
  const edition = '#' + poster.id.slice(0, 8).toUpperCase()
  if (poster.version === 1 && colors.field) {
    context.lineWidth = 8
    context.strokeRect(25, 25, 550, 790)
    context.fillStyle = colors.field
    context.fillRect(42, 135, 516, 558)
    context.strokeRect(42, 135, 516, 558)
    context.fillStyle = ink
    context.font = '900 67px "Microsoft YaHei", "PingFang SC", sans-serif'
    context.fillText(title, 46, 104)
    context.font = '700 22px "Microsoft YaHei", sans-serif'
    context.fillText('扭蛋黄纪念海报', 46, 747)
    context.font = '700 19px system-ui'
    context.fillText(edition + '  /  ' + poster.createdAt.slice(0, 10), 46, 782)
  } else if (poster.version === 2) {
    context.font = '900 78px "Microsoft YaHei", "PingFang SC", sans-serif'
    context.fillText(title, 42, 102)
    context.font = '600 17px system-ui'
    context.textAlign = 'right'
    context.fillText(edition, 558, 100)
    context.textAlign = 'left'
    context.fillRect(42, 124, 516, 3)
    context.fillRect(42, 710, 516, 3)
    context.font = '600 26px "Microsoft YaHei", "PingFang SC", sans-serif'
    context.fillText(poster.caption ?? '', 42, 759, 516)
  } else {
    context.font = '900 64px "Microsoft YaHei", "PingFang SC", sans-serif'
    context.fillText(title, 27, 81)
    context.textAlign = 'right'
    context.font = '600 28px "Microsoft YaHei", "PingFang SC", sans-serif'
    context.fillText(poster.caption ?? '', 564, 690, 514)
    context.fillStyle = '#fffefb'
    context.fillRect(0, 735, width, height - 735)
    context.fillStyle = ink
    context.font = '500 17px system-ui'
    context.fillText(edition, 566, 791)
    context.textAlign = 'left'
    context.fillText(poster.createdAt.slice(0, 10).replaceAll('-', '.'), 30, 791)
  }
  const artwork = await Promise.all(poster.stickers.map(async sticker => {
    const art = portrait(sticker.kind, sticker.state)
    return { sticker, art, image: await load(art.kind), badge: art.badge && await load(art.badge) }
  }))
  for (const { sticker, art, image, badge } of artwork) {
    const { x, y, size, tilt } = sticker
    context.save()
    context.translate(x, y)
    context.rotate(tilt * Math.PI / 180 + art.tilt)
    context.drawImage(image, -size / 2, -size / 2, size, size)
    if (badge) context.drawImage(badge, size * 0.19, -size * 0.53, size * 0.36, size * 0.36)
    context.restore()
  }
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG encoding failed')), 'image/png')
  })
}
