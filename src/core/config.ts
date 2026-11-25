export const exhibit = { width: 1920, height: 1080 } as const
export const cabinet = {
  x: 247, y: 145, width: 560, height: 780,
  chamber: { x: 60, y: 152, width: 440, height: 370 },
  tray: { x: 195, y: 522, width: 170, height: 182 },
} as const
export const posterWall = { x: 815, y: 173, width: 760, height: 752 } as const
export const arena = { width: cabinet.chamber.width, height: cabinet.chamber.height, radius: 22 }
export const hatchX = cabinet.tray.x - cabinet.chamber.x
export const hatchEnd = hatchX + cabinet.tray.width
export const dropInterval = 700
export const shakeDuration = 3000

export const settingsSchema = {
  gravity: { label: '重力', initial: 1, min: 0, max: 2, step: 0.05 },
  restitution: { label: '弹性', initial: 0.68, min: 0, max: 0.95, step: 0.01 },
  friction: { label: '摩擦力', initial: 0.08, min: 0, max: 0.6, step: 0.01 },
  maxEmoji: { label: '投放上限', initial: 48, min: 10, max: 80, step: 1 },
  smoothing: { label: '光标平滑', initial: 0.25, min: 0, max: 0.9, step: 0.05 },
  grabRange: { label: '抓取容差（场景单位）', initial: 15, min: 0, max: 45, step: 1 },
  reactionCooldown: { label: '反应冷却（毫秒）', initial: 600, min: 0, max: 3000, step: 50 },
} as const

export type Settings = { -readonly [Key in keyof typeof settingsSchema]: number }
export const initialSettings = Object.fromEntries(
  Object.entries(settingsSchema).map(([key, entry]) => [key, entry.initial]),
) as Settings
