import { emojiKinds, type EmojiKind } from '../emoji/catalog'
import type { CapsuleResult } from './CapsuleResult'
import type { EmojiArtwork } from '../emoji/emojiImage'

export const posterSize = { width: 600, height: 840 }
export const posterColors = [
  { paper: '#ffdc46', field: '#fff2d9' },
  { paper: '#a0d8f5', field: '#eef7fc' },
  { paper: '#fe6d5a', field: '#fff1e8' },
  { paper: '#a5d844', field: '#f6f4df' },
] as const

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
  version: 1
  id: string
  createdAt: string
  palette: number
  stickers: Sticker[]
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
    version: 1,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    palette: Math.floor(Math.random() * posterColors.length),
    stickers: ordered.map((item, index) => {
      const row = Math.floor(index / columns)
      const rowLength = Math.min(columns, ordered.length - row * columns)
      const column = index % columns - (rowLength - 1) / 2
      const slot = Math.min(width, height)
      return {
        kind: item.kind,
        state: item.state,
        source: item.source,
        x: Math.round(300 + column * width + (Math.random() - 0.5) * slot * 0.12),
        y: Math.round(414 + (row - (rows - 1) / 2) * height + (Math.random() - 0.5) * slot * 0.12),
        size: Math.round(slot * (0.63 + Math.random() * 0.13 + Math.min(0.06, (item.state?.grow ?? 0) * 0.006))),
        tilt: Math.round((Math.random() - 0.5) * 32),
      }
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
  if (!hasOnly(p, ['version', 'id', 'createdAt', 'palette', 'stickers']) ||
    p.version !== 1 || typeof p.id !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(p.id) ||
    typeof p.createdAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(p.createdAt) ||
    !Number.isFinite(Date.parse(p.createdAt)) ||
    typeof p.palette !== 'number' || !Number.isInteger(p.palette) || p.palette < 0 || p.palette >= posterColors.length ||
    !Array.isArray(p.stickers) || !p.stickers.length || p.stickers.length > 80) return false
  return p.stickers.every(s => {
    if (!s || !hasOnly(s, ['kind', 'state', 'source', 'x', 'y', 'size', 'tilt']) ||
      !isKind(s.kind) || ![s.x, s.y, s.size, s.tilt].every(Number.isInteger) ||
      s.size < 12 || s.size > 430 || s.x < 40 || s.x > 560 || s.y < 130 || s.y > 700 ||
      Math.abs(s.tilt) > 16) return false
    if (s.source !== undefined && (!Array.isArray(s.source) || s.source.length > emojiKinds.length ||
      !s.source.every(isKind))) return false
    return s.state === undefined || (s.state && typeof s.state === 'object' && !Array.isArray(s.state) &&
      Object.entries(s.state).every(([key, count]) => stateKeys.includes(key as typeof stateKeys[number]) &&
        Number.isSafeInteger(count) && count >= 1))
  })
}
