import { catalog, emojiKinds, type EmojiKind } from '../emoji/catalog'
import type { CapsuleResult } from './CapsuleResult'
import type { EmojiArtwork } from '../emoji/emojiImage'

export const posterSize = { width: 600, height: 840 }
const legacyColors = [
  { paper: '#ffdc46', field: '#fff2d9' },
  { paper: '#a0d8f5', field: '#eef7fc' },
  { paper: '#fe6d5a', field: '#fff1e8' },
  { paper: '#a5d844', field: '#f6f4df' },
] as const
export const posterColors = [
  { name: '粉色', paper: '#f6c7cf' },
  { name: '绿色', paper: '#d2e4c4' },
  { name: '灰色', paper: '#e1dfda' },
  { name: '淡蓝色', paper: '#c9e2f0' },
  { name: '紫色', paper: '#ddd0ef' },
  { name: '亮黄色', paper: '#ffed16' },
] as const
export const artworkArea = { left: 42, right: 558, top: 142, bottom: 688 } as const
export const galleryArtwork = { left: 26, right: 574, top: 111, bottom: 648 } as const

type ReactionState = NonNullable<CapsuleResult['state']>
export const stateKeys = ['grow', 'sleep', 'dash', 'soothe', 'brighten', 'chase'] as const

export interface Sticker {
  kind: EmojiKind
  state?: ReactionState
  source?: EmojiKind[]
  x: number
  y: number
  size: number
  tilt: number
}

export interface Poster {
  version: 1 | 2 | 3
  id: string
  createdAt: string
  palette: number
  stickers: Sticker[]
  caption?: string
}

export function posterPalette(poster: Poster): { paper: string; field?: string } {
  return poster.version === 1 ? legacyColors[poster.palette] : posterColors[poster.palette]
}

export function moveSticker(sticker: Sticker, x: number, y: number, version: Poster['version'] = 3) {
  const area = version === 3 ? galleryArtwork : artworkArea
  const padding = Math.ceil(sticker.size * 0.78)
  sticker.x = Math.round(Math.max(area.left + padding, Math.min(area.right - padding, x)))
  sticker.y = Math.round(Math.max(area.top + padding, Math.min(area.bottom - padding, y)))
}

function writeCaption(items: readonly CapsuleResult[]) {
  const kinds = Array.from(new Set(items.map(item => item.kind)))
  if (items.some(item => item.state?.chase)) return '鱼跑得比猫快'
  if (items.some(item => item.state?.dash)) return '龟速今天请假'
  if (items.some(item => item.state?.sleep)) return '小鸡借月亮充电'
  if (items.some(item => item.state?.grow)) return '虫子不够塞牙'
  if (items.some(item => item.state?.brighten)) return '眼泪已晒干'
  if (items.some(item => item.state?.soothe)) return '脾气被爱心没收'
  if (kinds.length === 1) return catalog[kinds[0]] + (items.length === 1 ? '单飞中' : '组团包场')
  if (kinds.includes('sun') && kinds.includes('moon')) return '月亮误入晴天'
  return catalog[kinds[0]] + '约' + catalog[kinds[1]] + '串门'
}
export function portrait(kind: EmojiKind, state?: ReactionState): { kind: EmojiArtwork; badge?: EmojiKind; tilt: number } {
  if (state?.sleep) return { kind, badge: 'moon', tilt: 0.3 }
  if (state?.soothe) return { kind: 'soothed', badge: 'heart', tilt: -0.13 }
  if (state?.brighten) return { kind: 'delighted', badge: 'sun', tilt: 0.12 }
  if (state?.dash) return { kind, badge: 'lightning', tilt: -0.1 }
  return { kind, tilt: 0 }
}

export function createPoster(items: readonly CapsuleResult[]): Poster {
  const ordered = [...items]
  for (let index = ordered.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1))
    ;[ordered[other], ordered[index]] = [ordered[index], ordered[other]]
  }
  const columns = Math.ceil(Math.sqrt(ordered.length * 0.9))
  const rows = Math.ceil(ordered.length / columns)
  const width = 463 / columns
  const height = 484 / rows
  const layouts = [
    [[323, 365, 264]],
    [[386, 255, 221], [181, 465, 204]],
    [[398, 251, 225], [166, 397, 177], [390, 537, 130]],
    [[406, 254, 204], [144, 359, 161], [393, 516, 153], [209, 558, 88]],
    [[406, 235, 195], [146, 318, 152], [375, 455, 160], [164, 544, 109], [479, 570, 92]],
  ]
  const largerLayout = [
    [422, 221, 188], [155, 325, 133], [302, 405, 105],
    [465, 462, 129], [140, 533, 143], [314, 565, 91],
    [235, 178, 83], [468, 589, 75], [87, 175, 84],
  ]
  const composition = layouts[ordered.length - 1] ?? (ordered.length <= largerLayout.length ? largerLayout : undefined)
  const mirrored = Math.random() < 0.5
  return {
    version: 3,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    palette: 5,
    caption: writeCaption(items),
    stickers: ordered.map((item, index) => {
      const row = Math.floor(index / columns)
      const rowLength = Math.min(columns, ordered.length - row * columns)
      const column = index % columns - (rowLength - 1) / 2
      const slot = Math.min(width, height)
      const [x, y, size] = composition?.[index] ?? [
        300 + column * width + (Math.random() - 0.5) * slot * 0.53,
        378 + (row - (rows - 1) / 2) * height + (Math.random() - 0.5) * slot * 0.44,
        Math.round(slot * (0.59 + Math.random() * 0.31)),
      ]
      const sticker: Sticker = {
        kind: item.kind,
        state: item.state,
        source: item.source,
        x: 0,
        y: 0,
        size: Math.min(296, size + Math.min(12, item.state?.grow ?? 0)),
        tilt: Math.round((Math.random() - 0.5) * 82),
      }
      moveSticker(sticker, mirrored ? 600 - x : x, y)
      return sticker
    }),
  }
}

function isKind(value: unknown): value is EmojiKind {
  return emojiKinds.includes(value as EmojiKind)
}

function hasOnly(value: object, keys: string[]) {
  return Object.keys(value).every(key => keys.includes(key))
}

export function isPoster(value: unknown): value is Poster {
  if (!value || typeof value !== 'object') return false
  const p = value as Partial<Poster>
  if (!hasOnly(p, ['version', 'id', 'createdAt', 'palette', 'stickers', 'caption']) ||
    (p.version !== 1 && p.version !== 2 && p.version !== 3) || typeof p.id !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(p.id) ||
    typeof p.createdAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(p.createdAt) ||
    !Number.isFinite(Date.parse(p.createdAt)) ||
    typeof p.palette !== 'number' || !Number.isInteger(p.palette) || p.palette < 0 ||
    p.palette >= (p.version === 1 ? legacyColors.length : p.version === 2 ? 5 : posterColors.length) ||
    (p.version === 1 && p.caption !== undefined) ||
    (p.version !== 1 && (typeof p.caption !== 'string' || !p.caption.trim() ||
      /[\x00-\x1f]/.test(p.caption) || Array.from(p.caption).length > (p.version === 3 ? 10 : 20))) ||
    !Array.isArray(p.stickers) || !p.stickers.length || p.stickers.length > 80) return false
  return p.stickers.every(s => {
    if (!s || !hasOnly(s, ['kind', 'state', 'source', 'x', 'y', 'size', 'tilt']) ||
      !isKind(s.kind) || ![s.x, s.y, s.size, s.tilt].every(Number.isInteger) ||
      s.size < 12 || s.size > 430 || s.x < 26 || s.x > 574 || s.y < 111 || s.y > 700 ||
      Math.abs(s.tilt) > (p.version === 1 ? 16 : 41)) return false
    if (p.version === 1 && (s.x < 40 || s.x > 560 || s.y < 130)) return false
    if (p.version !== 1) {
      const area = p.version === 3 ? galleryArtwork : artworkArea
      const padding = Math.ceil(s.size * 0.78)
      if (s.size > 296 || s.x - padding < area.left || s.x + padding > area.right ||
        s.y - padding < area.top || s.y + padding > area.bottom) return false
    }
    if (s.source !== undefined && (!Array.isArray(s.source) || s.source.length > emojiKinds.length ||
      !s.source.every(isKind))) return false
    return s.state === undefined || (s.state && typeof s.state === 'object' && !Array.isArray(s.state) &&
      Object.entries(s.state).every(([key, count]) => stateKeys.includes(key as typeof stateKeys[number]) &&
        Number.isSafeInteger(count) && count >= 1))
  })
}
