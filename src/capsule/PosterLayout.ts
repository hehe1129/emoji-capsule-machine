import { stateKeys } from '../reactions/ReactionRules'
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

export type Placement = { x: number; y: number; size: number; tilt: number }
export const labelKeys = ['title', 'date', 'number'] as const
export type LabelKey = typeof labelKeys[number]
export const posterTemplates = ['纯色', '渐变色', '波点', '条纹'] as const
const defaultLabels: Record<LabelKey, Placement> = {
  title: { x: 126, y: 60, size: 67, tilt: 0 },
  date: { x: 75, y: 785, size: 17, tilt: 0 },
  number: { x: 518, y: 785, size: 17, tilt: 0 },
}
export function posterLabels(poster: Poster) {
  const text = {
    title: '扭蛋黄',
    date: poster.createdAt.slice(0, 10).replaceAll('-', '.'),
    number: '#' + poster.id.slice(0, 8).toUpperCase(),
  }
  return labelKeys.map(key => ({ key, text: text[key], weight: key === 'title' ? 900 : 500,
    placement: poster.labels?.[key] ?? defaultLabels[key] }))
}

function mixColors(first: string, second: string) {
  return '#' + [1, 3, 5].map(index => {
    const a = Number.parseInt(first.slice(index, index + 2), 16)
    const b = Number.parseInt(second.slice(index, index + 2), 16)
    return Math.round((a + b) / 2).toString(16).padStart(2, '0')
  }).join('')
}

export function posterBackground(palette: number, template: number, secondPalette?: number) {
  const first = posterColors[palette].paper
  const second = secondPalette === undefined ? '#ffffff' : posterColors[secondPalette].paper
  const background = template === 0 ? (secondPalette === undefined ? first : mixColors(first, second))
    : template === 2 ? second : first
  const patterns = [
    '',
    `<linearGradient id="p" x2="100%" y2="100%"><stop stop-color="${first}"/><stop offset="1" stop-color="${second}"/></linearGradient>`,
    `<pattern id="p" width="56" height="56" patternUnits="userSpaceOnUse"><circle cx="28" cy="28" r="9" fill="${first}"/></pattern>`,
    `<pattern id="p" width="64" height="64" patternUnits="userSpaceOnUse" patternTransform="rotate(28)"><rect width="32" height="64" fill="${second}"/></pattern>`,
  ]
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 840"><defs>${patterns[template]}</defs><path fill="${background}" d="M0 0h600v840H0z"/>${template ? '<path fill="url(#p)" d="M0 0h600v840H0z"/>' : ''}</svg>`
  return 'data:image/svg+xml,' + encodeURIComponent(svg)
}

export interface Sticker extends Placement {
  kind: EmojiKind
  state?: ReactionState
  source?: EmojiKind[]
}

export interface Poster {
  version: 1 | 2 | 3 | 4
  id: string
  createdAt: string
  palette: number
  secondPalette?: number
  stickers: Sticker[]
  caption?: string
  template?: number
  labels?: Record<LabelKey, Placement>
}

export function posterPalette(poster: Poster): { paper: string; field?: string } {
  return poster.version === 1 ? legacyColors[poster.palette] : posterColors[poster.palette]
}

export function moveSticker(sticker: Placement, x: number, y: number, version: Poster['version'] = 4) {
  if (version === 4) {
    sticker.x = Math.round(Math.max(0, Math.min(posterSize.width, x)))
    sticker.y = Math.round(Math.max(0, Math.min(posterSize.height, y)))
    return
  }
  const area = version === 3 ? galleryArtwork : artworkArea
  const padding = Math.ceil(sticker.size * 0.78)
  sticker.x = Math.round(Math.max(area.left + padding, Math.min(area.right - padding, x)))
  sticker.y = Math.round(Math.max(area.top + padding, Math.min(area.bottom - padding, y)))
}

function writeCaption(items: readonly CapsuleResult[], variation: number) {
  const kinds = Array.from(new Set(items.map(item => item.kind)))
  const choose = (lines: string[]) => lines[variation % lines.length]
  if (items.some(item => item.state?.chase)) return choose(['猫把午饭吃成心', '一口吃出心动', '小鱼今天加餐'])
  if (items.some(item => item.state?.dash)) return choose(['龟速今天请假', '乌龟偷了道闪电', '壳里装了马达'])
  if (items.some(item => item.state?.sleep)) return choose(['小鸡借月亮充电', '鸡先睡为敬', '月亮值夜班'])
  if (items.some(item => item.state?.grow)) return choose(['虫子不够塞牙', '小鸡偷偷加餐', '一口吃大一圈'])
  if (items.some(item => item.state?.brighten)) return choose(['眼泪已晒干', '太阳发来晴天', '哭完刚好放晴'])
  if (items.some(item => item.state?.soothe)) return choose(['脾气被爱心没收', '怒气临时休假', '红脸偷偷和好'])
  if (kinds.length === 1) {
    return catalog[kinds[0]] + (items.length === 1
      ? choose(['单飞中', '今天独角戏', '抢到头等座']) : choose(['组团包场', '排队占领画面', '集体逃课']))
  }
  if (kinds.includes('sun') && kinds.includes('moon')) return choose(['月亮误入晴天', '日月换个班', '太阳约月亮宵夜'])
  const first = catalog[kinds[0]]
  const second = catalog[kinds[1]]
  if (first.length + second.length > 7) return choose([first + '遇见' + second, first + '约' + second])
  return choose([first + '约' + second + '串门', first + '和' + second + '同桌', first + '拉' + second + '出逃'])
}
export function portrait(kind: EmojiKind, state?: ReactionState): { kind: EmojiArtwork; tilt: number } {
  if (state?.sleep && (kind === 'chick' || kind === 'chicken')) return { kind: 'sleeping-chick', tilt: 0.3 }
  if (state?.thrust && kind === 'snail') return { kind: 'mounted-snail', tilt: 0 }
  if (state?.elongate && kind === 'tulip') return { kind: `tulip-${state.elongate}`, tilt: 0 }
  if (state?.soothe && kind === 'angry') return { kind: 'smiling', tilt: 0 }
  if (state?.brighten && kind === 'sad') return { kind: 'happy', tilt: 0 }
  if (state?.dash) return { kind, tilt: -0.1 }
  return { kind, tilt: 0 }
}

export function createPoster(items: readonly CapsuleResult[], variation = 0, previous?: Poster): Poster {
  const ordered = [...items]
  for (let index = ordered.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1))
    ;[ordered[other], ordered[index]] = [ordered[index], ordered[other]]
  }
  const columns = Math.ceil(Math.sqrt(ordered.length * 0.9))
  const rows = Math.ceil(ordered.length / columns)
  const width = 463 / columns
  const height = 484 / rows
  const size = Math.round(Math.min(260, width * 0.75, height * 0.75))
  const layouts = [
    [[323, 365]],
    [[386, 255], [181, 465]],
    [[398, 251], [166, 397], [390, 537]],
    [[406, 254], [144, 359], [393, 516], [209, 558]],
    [[406, 235], [146, 318], [375, 455], [164, 544], [479, 570]],
  ]
  const largerLayout = [
    [422, 221], [155, 325], [302, 405],
    [465, 462], [140, 533], [314, 565],
    [235, 178], [468, 589], [87, 175],
  ]
  const composition = layouts[ordered.length - 1] ?? (ordered.length <= largerLayout.length ? largerLayout : undefined)
  const mirrored = Math.random() < 0.5
  return {
    version: 4,
    template: previous?.template ?? 0,
    labels: previous?.labels ?? { title: { ...defaultLabels.title }, date: { ...defaultLabels.date }, number: { ...defaultLabels.number } },
    id: previous?.id ?? crypto.randomUUID(),
    createdAt: previous?.createdAt ?? new Date().toISOString(),
    palette: previous?.palette ?? Math.floor(Math.random() * posterColors.length),
    secondPalette: previous?.secondPalette,
    caption: writeCaption(items, variation),
    stickers: ordered.map((item, index) => {
      const row = Math.floor(index / columns)
      const rowLength = Math.min(columns, ordered.length - row * columns)
      const column = index % columns - (rowLength - 1) / 2
      const slot = Math.min(width, height)
      const [x, y] = composition?.[index] ?? [
        300 + column * width + (Math.random() - 0.5) * slot * 0.53,
        378 + (row - (rows - 1) / 2) * height + (Math.random() - 0.5) * slot * 0.44,
      ]
      const layoutVariant = variation % 4
      const angle = Math.round((Math.random() - 0.5) * 82) + [0, 29, -26, 15][layoutVariant]
      const sticker: Sticker = {
        kind: item.kind,
        state: item.state,
        source: item.source,
        x: 0,
        y: 0,
        size,
        tilt: ((angle + 123) % 82) - 41,
      }
      const layoutX = mirrored !== (layoutVariant % 2 === 1) ? 600 - x : x
      moveSticker(sticker, layoutX + [0, -29, 22, 41][layoutVariant] * (index % 2 ? -1 : 1),
        y + [0, 48, -43, 29][layoutVariant] * (index % 2 ? -1 : 1), 3)
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
  if (!hasOnly(p, ['version', 'id', 'createdAt', 'palette', 'stickers', 'caption', 'template', 'labels', 'secondPalette']) ||
    (p.version !== 1 && p.version !== 2 && p.version !== 3 && p.version !== 4) || typeof p.id !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(p.id) ||
    typeof p.createdAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(p.createdAt) ||
    !Number.isFinite(Date.parse(p.createdAt)) ||
    typeof p.palette !== 'number' || !Number.isInteger(p.palette) || p.palette < 0 ||
    p.palette >= (p.version === 1 ? legacyColors.length : p.version === 2 ? 5 : posterColors.length) ||
    (p.version === 1 && p.caption !== undefined) ||
    (p.version !== 1 && (typeof p.caption !== 'string' || !p.caption.trim() ||
      /[\x00-\x1f]/.test(p.caption) || Array.from(p.caption).length > (p.version >= 3 ? 10 : 20))) ||
    !Array.isArray(p.stickers) || !p.stickers.length || p.stickers.length > 500) return false
  if (p.version === 4) {
    if (p.secondPalette !== undefined && (!Number.isInteger(p.secondPalette) ||
      p.secondPalette < 0 || p.secondPalette >= posterColors.length || p.secondPalette === p.palette)) return false
    if (typeof p.template !== 'number' || !Number.isInteger(p.template) || p.template < 0 || p.template >= posterTemplates.length ||
      !p.labels || !hasOnly(p.labels, [...labelKeys]) || !labelKeys.every(key => {
        const value = p.labels?.[key]
        return !!value && hasOnly(value, ['x', 'y', 'size', 'tilt']) && isPlacement(value)
      })) return false
  } else if (p.template !== undefined || p.labels !== undefined || p.secondPalette !== undefined) return false
  return p.stickers.every(s => {
    if (!s || !hasOnly(s, ['kind', 'state', 'source', 'x', 'y', 'size', 'tilt']) ||
      !isKind(s.kind) || ![s.x, s.y, s.size, s.tilt].every(Number.isInteger) ||
      (p.version === 4 ? !isPlacement(s) : (s.size < 12 || s.size > 430 || s.x < 26 || s.x > 574 || s.y < 111 || s.y > 700 ||
      Math.abs(s.tilt) > (p.version === 1 ? 16 : p.version === 2 ? 41 : 180)))) return false
    if (p.version === 1 && (s.x < 40 || s.x > 560 || s.y < 130)) return false
    if (p.version === 2 || p.version === 3) {
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

function isPlacement(value: Placement) {
  return [value.x, value.y, value.size, value.tilt].every(Number.isInteger) &&
    value.x >= 0 && value.x <= posterSize.width && value.y >= 0 && value.y <= posterSize.height &&
    value.size >= 12 && value.size <= 296 && Math.abs(value.tilt) <= 180
}
