import { arena, cabinet, roofY } from '../core/config'

// A long stem folds when it reaches the available glass height.
export const flowerHeight = (waterings: number, compact = false) => {
  const available = compact ? cabinet.tray.height : arena.height - roofY
  return Math.min((available - 12) / (arena.radius * 2), 2 ** waterings)
}
