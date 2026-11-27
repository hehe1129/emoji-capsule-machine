import { creditPoster } from '../emoji/artworkCredit'
import { emojiImageUrl, type EmojiArtwork } from '../emoji/emojiImage'
import { portrait, posterBackground, posterLabels, posterPalette, posterSize, type Poster } from './PosterLayout'

const ink = '#111113'
const title = '扭蛋黄'
const font = '"Source Han Sans", sans-serif'
const imageCache = new Map<EmojiArtwork, Promise<HTMLImageElement>>()

function load(kind: EmojiArtwork) {
  const cached = imageCache.get(kind)
  if (cached) return cached
  const image = new Image(900, 900)
  image.src = emojiImageUrl(kind)
  const promise = image.decode().then(() => image).catch(error => {
    imageCache.delete(kind)
    throw error
  })
  imageCache.set(kind, promise)
  return promise
}

export async function createSouvenir(poster: Poster) {
  await Promise.all([500, 600, 700, 900].map(weight => document.fonts.load(weight + ' 28px ' + font, title + (poster.caption ?? ''))))
  const canvas = document.createElement('canvas')
  const { width, height } = posterSize
  canvas.width = width * 2
  canvas.height = height * 2
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas unavailable')
  context.scale(2, 2)
  context.imageSmoothingEnabled = true
  const colors = posterPalette(poster)
  context.fillStyle = colors.paper
  context.fillRect(0, 0, width, height)
  if (poster.version === 4) {
    const background = new Image()
    background.src = posterBackground(poster.palette, poster.template ?? 0, poster.secondPalette)
    await background.decode()
    context.drawImage(background, 0, 0, width, height)
  }
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
    context.font = '900 67px ' + font
    context.fillText(title, 46, 104)
    context.font = '700 22px ' + font
    context.fillText('扭蛋黄纪念海报', 46, 747)
    context.font = '700 19px ' + font
    context.fillText(edition + '  /  ' + poster.createdAt.slice(0, 10), 46, 782)
  } else if (poster.version === 2) {
    context.font = '900 78px ' + font
    context.fillText(title, 42, 102)
    context.font = '600 17px ' + font
    context.textAlign = 'right'
    context.fillText(edition, 558, 100)
    context.textAlign = 'left'
    context.fillRect(42, 124, 516, 3)
    context.fillRect(42, 710, 516, 3)
    context.font = '600 26px ' + font
    context.fillText(poster.caption ?? '', 42, 759, 516)
  } else if (poster.version === 3) {
    context.font = '900 67px ' + font
    context.fillText(title, 27, 81)
    context.textAlign = 'right'
    context.font = '600 28px ' + font
    context.fillText(poster.caption ?? '', 564, 690, 514)
    context.fillStyle = '#fffefb'
    context.fillRect(0, 735, width, height - 735)
    context.fillStyle = ink
    context.font = '500 17px ' + font
    context.fillText(edition, 566, 791)
    context.textAlign = 'left'
    context.fillText(poster.createdAt.slice(0, 10).replaceAll('-', '.'), 30, 791)
  }
  const images = await Promise.all(poster.stickers.map(sticker => load(portrait(sticker.kind, sticker.state).kind)))
  for (const [index, sticker] of poster.stickers.entries()) {
    const { x, y, size, tilt } = sticker
    context.save()
    context.translate(x, y)
    context.rotate(tilt * Math.PI / 180)
    const image = images[index]
    const longestSide = poster.version === 4 ? Math.max(image.naturalWidth, image.naturalHeight) : 0
    const width = longestSide ? size * image.naturalWidth / longestSide : size
    const height = longestSide ? size * image.naturalHeight / longestSide : size
    context.drawImage(image, -width / 2, -height / 2, width, height)
    context.restore()
  }
  if (poster.version === 4) {
    const dark = poster.palette === 6 || poster.secondPalette === 6
    context.fillStyle = dark ? '#fff' : ink
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    for (const { text, weight, placement } of posterLabels(poster)) {
      const { x, y, size, tilt } = placement
      context.save()
      context.translate(x, y)
      context.rotate(tilt * Math.PI / 180)
      context.font = weight + ' ' + size + 'px ' + font
      context.fillText(text, 0, 0)
      context.restore()
    }
  }
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(creditPoster(blob)) : reject(new Error('PNG encoding failed')), 'image/png')
  })
}
