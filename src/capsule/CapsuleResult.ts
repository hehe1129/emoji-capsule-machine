import type { EmojiEntity } from '../emoji/EmojiEntity'
import type { EmojiKind } from '../emoji/catalog'

export type CapsuleResult = {
  entityId: number
  kind: EmojiKind
  name?: string
  source?: EmojiKind[]
  state?: Partial<Record<import('../reactions/ReactionRules').ReactionEffect, number>>
}

export function captureCapsule(entity: EmojiEntity): CapsuleResult {
  return {
    entityId: entity.body.id,
    kind: entity.kind,
    name: entity.result?.name,
    source: entity.result?.ingredients.slice(),
    state: entity.reactionCounts && { ...entity.reactionCounts },
  }
}
