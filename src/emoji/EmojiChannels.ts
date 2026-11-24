import { emojiKinds, type EmojiKind } from './catalog'
import { reactionRules } from '../reactions/ReactionRules'

export const channelCount = 5
const capacity = 4
const interval = 700

type Channel = { stock: EmojiKind[]; nextDrop?: number }

function randomKind(neighbor?: EmojiKind): EmojiKind {
  const pool = emojiKinds.filter(kind => !reactionRules.some(({ actor, ingredient }) =>
    (actor === neighbor && ingredient === kind) || (ingredient === neighbor && actor === kind),
  ))
  return pool[Math.floor(Math.random() * pool.length)]
}

export class EmojiChannels {
  readonly lanes: Channel[] = Array.from({ length: channelCount }, () => {
    const stock: EmojiKind[] = []
    while (stock.length < capacity) stock.push(randomKind(stock.at(-1)))
    return { stock }
  })

  press(index: number, now: number) {
    this.lanes[index].nextDrop ??= now + interval
  }

  release(index: number) {
    this.lanes[index].nextDrop = undefined
  }

  tick(now: number, drop: (kind: EmojiKind, lane: number) => boolean) {
    this.lanes.forEach((channel, index) => {
      if (channel.nextDrop === undefined || now < channel.nextDrop) return
      channel.nextDrop = now + interval
      const bottom = channel.stock.at(-1)!
      if (!drop(bottom, (index + 0.5) / channelCount)) return
      channel.stock = [randomKind(channel.stock[0]), ...channel.stock.slice(0, -1)]
    })
  }
}
