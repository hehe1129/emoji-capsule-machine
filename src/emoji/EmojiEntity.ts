import type { Body } from 'matter-js'
import type { EmojiKind } from './catalog'
import type { ReactionEffect, ReactionRule } from '../reactions/ReactionRules'

export interface EmojiEntity {
  kind: EmojiKind
  readonly body: Body
  radius: number
  heightScale?: number
  lidScale?: number
  waterScale?: number
  compactFlower?: boolean
  retained?: boolean
  spawnRemaining: number
  result?: { name: string; ingredients: EmojiKind[] }
  reactionCounts?: Partial<Record<ReactionEffect, number>>
  reaction?: {
    rule: ReactionRule; elapsed: number; offset: { x: number; y: number }
  }
  cooldown?: number
}
