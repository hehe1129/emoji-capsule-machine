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
] as const
export const artworkArea = { left: 42, right: 558, top: 142, bottom: 688 } as const

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
  version: 1 | 2
  id: string
  createdAt: string
  palette: number
  stickers: Sticker[]
  caption?: string
}

export function posterPalette(poster: Poster): { paper: string; field?: string } {
  return poster.version === 1 ? legacyColors[poster.palette] : posterColors[poster.palette]
}

export function moveSticker(sticker: Sticker, x: number, y: number) {
  const padding = Math.ceil(sticker.size * 0.78)
  sticker.x = Math.round(Math.max(artworkArea.left + padding, Math.min(artworkArea.right - padding, x)))
  sticker.y = Math.round(Math.max(artworkArea.top + padding, Math.min(artworkArea.bottom - padding, y)))
}

function writeCaption(items: readonly CapsuleResult[]) {
  const kinds = Array.from(new Set(items.map(item => item.kind)))
  if (items.some(item => item.state?.chase)) return '小猫追着小鱼跑进画里'
  if (items.some(item => item.state?.dash)) return '乌龟借一道闪电抢先到场'
  if (items.some(item => item.state?.sleep)) return '小鸡把月亮带进梦里'
  if (items.some(item => item.state?.grow)) return '小鸡长大了，虫子少了一只'
  if (items.some(item => item.state?.brighten)) return '太阳把眼泪晒成了晴天'
  if (items.some(item => item.state?.soothe)) return '一颗爱心，把脾气哄好了'
  if (kinds.length === 1) return items.length === 1 ? catalog[kinds[0]] + '独占了这一页' : '这一页由' + catalog[kinds[0]] + '包场'
  if (kinds.includes('sun') && kinds.includes('moon')) return '太阳和月亮在此碰面'
  return catalog[kinds[0]] + '与' + catalog[kinds[1]] + '刚好同框'
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
  const width = 488 / columns
  const height = 548 / rows
  return {
    version: 2,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    palette: 3,
    caption: writeCaption(items),
    stickers: ordered.map((item, index) => {
      const row = Math.floor(index / columns)
      const rowLength = Math.min(columns, ordered.length - row * columns)
      const column = index % columns - (rowLength - 1) / 2
      const slot = Math.min(width, height)
      const sticker: Sticker = {
        kind: item.kind,
        state: item.state,
        source: item.source,
        x: 0,
        y: 0,
        size: Math.min(296, Math.round(slot * (0.64 + Math.random() * 0.16 + Math.min(0.06, (item.state?.grow ?? 0) * 0.006)))),
        tilt: Math.round((Math.random() - 0.5) * 82),
      }
      moveSticker(sticker,
        300 + column * width + (Math.random() - 0.5) * slot * 0.28,
        415 + (row - (rows - 1) / 2) * height + (Math.random() - 0.5) * slot * 0.24)
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
    (p.version !== 1 && p.version !== 2) || typeof p.id !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(p.id) ||
    typeof p.createdAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(p.createdAt) ||
    !Number.isFinite(Date.parse(p.createdAt)) ||
    typeof p.palette !== 'number' || !Number.isInteger(p.palette) || p.palette < 0 ||
    p.palette >= (p.version === 1 ? legacyColors.length : posterColors.length) ||
    (p.version === 1 && p.caption !== undefined) ||
    (p.version === 2 && (typeof p.caption !== 'string' || !p.caption.trim() ||
      /[\x00-\x1f]/.test(p.caption) || Array.from(p.caption).length > 20)) ||
    !Array.isArray(p.stickers) || !p.stickers.length || p.stickers.length > 80) return false
  return p.stickers.every(s => {
    if (!s || !hasOnly(s, ['kind', 'state', 'source', 'x', 'y', 'size', 'tilt']) ||
      !isKind(s.kind) || ![s.x, s.y, s.size, s.tilt].every(Number.isInteger) ||
      s.size < 12 || s.size > 430 || s.x < 40 || s.x > 560 || s.y < 130 || s.y > 700 ||
      Math.abs(s.tilt) > (p.version === 1 ? 16 : 41)) return false
    if (p.version === 2) {
      const padding = Math.ceil(s.size * 0.78)
      if (s.size > 296 || s.x - padding < artworkArea.left || s.x + padding > artworkArea.right ||
        s.y - padding < artworkArea.top || s.y + padding > artworkArea.bottom) return false
    }
    if (s.source !== undefined && (!Array.isArray(s.source) || s.source.length > emojiKinds.length ||
      !s.source.every(isKind))) return false
    return s.state === undefined || (s.state && typeof s.state === 'object' && !Array.isArray(s.state) &&
      Object.entries(s.state).every(([key, count]) => stateKeys.includes(key as typeof stateKeys[number]) &&
        Number.isSafeInteger(count) && count >= 1))
  })
}
