export const arena = { width: 1200, height: 440, radius: 24 }
export const hatchStart = 0.77
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
