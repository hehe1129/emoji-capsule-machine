import type { CapsuleResult } from './CapsuleResult'
import { emojiImageUrl } from '../emoji/emojiImage'

async function loadImage(src: string) {
  const image = new Image()
  image.src = src
  await image.decode()
  return image
}

export async function createSouvenir(items: readonly CapsuleResult[]): Promise<Blob> {
  const portraits = await Promise.all(items.map(async ({ art, badge }) => ({
    art: await loadImage(emojiImageUrl(art)),
    badge: badge ? await loadImage(emojiImageUrl(badge)) : undefined,
  })))
  for (let i = portraits.length - 1; i > 0; i--) {
    const other = Math.floor(Math.random() * (i + 1))
    ;[portraits[i], portraits[other]] = [portraits[other], portraits[i]]
  }

  const canvas = document.createElement('canvas')
  canvas.width = 960
  canvas.height = 720
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas unavailable')
  const { width, height } = canvas
  context.fillStyle = '#9991e9'
  context.fillRect(0, 0, width, height)
  context.fillStyle = '#c9d7f6'
  context.fillRect(36, 36, width - 72, height - 72)
  context.strokeStyle = '#211932'
  context.lineWidth = 4
  context.strokeRect(36, 36, width - 72, height - 72)
  const title = await loadImage(import.meta.env.BASE_URL + 'art/dot-title.svg')
  context.drawImage(title, 350, 66, 260, 260 * title.naturalHeight / title.naturalWidth)
  context.fillStyle = '#211932'
  context.textAlign = 'center'
  context.font = '22px system-ui, sans-serif'
  context.fillText('本次抽取结果', width / 2, 190)
  context.font = '18px system-ui, sans-serif'
  context.fillText('来自扭蛋黄装置', width / 2, 655)

  const columns = Math.ceil(Math.sqrt(items.length * 1.9))
  const rows = Math.ceil(items.length / columns)
  const cell = Math.min(840 / columns, 400 / rows, 190)
  const size = cell * 0.83
  portraits.forEach(({ art, badge }, i) => {
    const row = Math.floor(i / columns)
    const inRow = Math.min(columns, portraits.length - row * columns)
    const x = width / 2 + ((i % columns) - (inRow - 1) / 2) * cell
    const y = 420 + (row - (rows - 1) / 2) * cell
    context.save()
    context.translate(x, y)
    context.rotate((Math.random() - 0.5) * 0.5)
    context.drawImage(art, -size / 2, -size / 2, size, size)
    if (badge) context.drawImage(badge, size * 0.2, -size * 0.48, size * 0.36, size * 0.36)
    context.restore()
  })
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG export failed')), 'image/png')
  })
}
