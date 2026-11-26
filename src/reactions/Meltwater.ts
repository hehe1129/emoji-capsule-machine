import { arena, cabinet, trayX, trayEnd, roofY } from '../core/config'

// Cross-sectional area keeps water volume constant across the two different vessel widths.
const portion = Math.PI * arena.radius ** 2
const trayCapacity = cabinet.tray.width * cabinet.tray.height
export class Meltwater {
  chamber = 0
  tray = 0
  readonly puddles: { x: number; volume: number }[] = []
  flow = 0

  add(x: number, y: number, retained: boolean) {
    if (retained || (x >= trayX && x <= trayEnd && y > arena.height)) {
      const available = Math.min(portion, trayCapacity - this.tray)
      this.tray += available
      this.chamber += portion - available
    } else if (x >= 0 && x <= arena.width && y <= arena.height && y >= roofY) {
      this.chamber += portion
    } else {
      const puddle = this.puddles.find(p => Math.abs(p.x - x) < 50)
      if (puddle) puddle.volume += portion
      else this.puddles.push({ x, volume: portion })
    }
  }

  step(delta: number, opening: number) {
    const volume = Math.min(this.chamber, trayCapacity - this.tray, delta * opening * 15)
    this.flow = volume > 0 ? opening : 0
    this.chamber -= volume
    this.tray += volume
  }
}
