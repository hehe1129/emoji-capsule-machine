import type { Body } from 'matter-js'
import type { EmojiArt, EmojiKind } from './catalog'
import type { ReactionEffect } from '../reactions/ReactionRules'

export interface EmojiEntity {
  readonly kind: EmojiKind
  readonly body: Body
  radius: number
  spawnRemaining: number
  result?: { name: string; ingredients: EmojiKind[]; art: EmojiArt; badge?: EmojiArt }
  reactionCounts?: Partial<Record<ReactionEffect, number>>
  reaction?: { elapsed: number; duration: number; effect: ReactionEffect }
}
