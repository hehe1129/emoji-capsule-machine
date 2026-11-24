export const cabinet = {
  width: 1600,
  height: 900,
  chamber: { x: 45, y: 305, width: 1355, height: 360 },
  tray: { x: 948, y: 665, width: 452, height: 208 },
  tubeWidth: 94,
  tubeCenters: [395, 615, 835, 1055, 1275],
} as const
export const arena = { width: cabinet.chamber.width, height: cabinet.chamber.height, radius: 30 }
export const hatchX = cabinet.tray.x - cabinet.chamber.x
export const tubeCenters = cabinet.tubeCenters.map(x => x - cabinet.chamber.x)
export const shakeDuration = 3000

export const settingsSchema = {
  gravity: { label: '重力', initial: 1, min: 0, max: 2, step: 0.05 },
  restitution: { label: '弹性', initial: 0.68, min: 0, max: 0.95, step: 0.01 },
  friction: { label: '摩擦力', initial: 0.08, min: 0, max: 0.6, step: 0.01 },
  maxEmoji: { label: '投放上限', initial: 120, min: 2, max: 240, step: 1 },
  smoothing: { label: '光标平滑', initial: 0.25, min: 0, max: 0.9, step: 0.05 },
  grabRange: { label: '抓取容差（场景单位）', initial: 30, min: 0, max: 80, step: 1 },
  reactionCooldown: { label: '反应冷却（毫秒）', initial: 600, min: 0, max: 3000, step: 50 },
} as const

export type Settings = { -readonly [Key in keyof typeof settingsSchema]: number }
export const initialSettings = Object.fromEntries(
  Object.entries(settingsSchema).map(([key, entry]) => [key, entry.initial]),
) as Settings
