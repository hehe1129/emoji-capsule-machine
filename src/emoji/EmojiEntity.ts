import type { Body } from 'matter-js'
import type { EmojiKind } from './catalog'
import type { ReactionEffect } from '../reactions/ReactionRules'

export interface EmojiEntity {
  readonly kind: EmojiKind
  readonly body: Body
  radius: number
  retained?: boolean
  spawnRemaining: number
  result?: { name: string; ingredients: EmojiKind[] }
  reactionCounts?: Partial<Record<ReactionEffect, number>>
  reaction?: { elapsed: number; duration: number; effect: ReactionEffect }
}
