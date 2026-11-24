import { emojiKinds, type EmojiKind } from './catalog'
import { reactionRules } from '../reactions/ReactionRules'
import { tubeCenters } from '../core/config'

export const channelCapacity = 4
const interval = 700

export function randomKind(neighbor?: EmojiKind): EmojiKind {
  const pool = emojiKinds.filter(kind => !reactionRules.some(({ actor, ingredient }) =>
    (actor === neighbor && ingredient === kind) || (ingredient === neighbor && actor === kind),
  ))
  return pool[Math.floor(Math.random() * pool.length)]
}

export class EmojiChannels {
  private readonly deadlines: (number | undefined)[] = tubeCenters.map(() => undefined)

  press(index: number, now: number) {
    this.deadlines[index] ??= now + interval
  }

  release(index: number) {
    this.deadlines[index] = undefined
  }

  tick(now: number, drop: (index: number) => void) {
    this.deadlines.forEach((nextDrop, index) => {
      if (nextDrop === undefined || now < nextDrop) return
      this.deadlines[index] = now + interval
      drop(index)
    })
  }
}
