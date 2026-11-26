export const exhibit = { width: 1920, height: 1080 } as const
export const cabinet = {
  x: 680, y: 201, width: 560, height: 780,
  chamber: { x: 60, y: 152, width: 440, height: 370 },
  tray: { x: 211, y: 522, width: 138, height: 171 },
} as const
export type LidSide = 'left' | 'right'
export const arena = { width: cabinet.chamber.width, height: cabinet.chamber.height, radius: 22 }
export const machineCamera = { top: 78, framingWidth: 595, framingHeight: 670 }
export const lid = { seam: 115, angle: 12 * Math.PI / 180 }
export const room = {
  floor: cabinet.y + cabinet.height,
  left: -cabinet.x - cabinet.chamber.x + 3,
  right: exhibit.width - cabinet.x - cabinet.chamber.x - 3,
}
export const roomScale = (width: number, height: number) => Math.min(width / 1320, height / exhibit.height)
export const roomBaseline = (height: number) => height * 0.87
export const roomHorizon = (width: number, height: number) => roomBaseline(height) - 120 * roomScale(width, height)
export const roofY = lid.seam - cabinet.chamber.y
export const inletY = machineCamera.top - cabinet.chamber.y
export const groundY = room.floor - cabinet.y - cabinet.chamber.y
export const trayX = cabinet.tray.x - cabinet.chamber.x
export const trayEnd = trayX + cabinet.tray.width
export const hatchInset = cabinet.tray.width * (1 - 2 / 3 * 0.8) / 2
export const hatchMotionMs = 260
export const hatchX = trayX + hatchInset
export const hatchEnd = trayEnd - hatchInset
export const hatchThickness = 13
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
