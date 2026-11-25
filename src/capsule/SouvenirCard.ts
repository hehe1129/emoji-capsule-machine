import { emojiImageUrl, type EmojiArtwork } from '../emoji/emojiImage'
import { portrait, posterColors, posterSize, type Poster } from './PosterLayout'

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
  const colors = posterColors[poster.palette]
  context.fillStyle = colors.paper
  context.fillRect(0, 0, width, height)
  context.lineWidth = 8
  context.strokeStyle = ink
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
  context.fillText('#' + poster.id.slice(0, 8).toUpperCase() + '  /  ' + poster.createdAt.slice(0, 10), 46, 782)
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
