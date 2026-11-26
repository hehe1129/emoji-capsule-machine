import type { EmojiEntity } from '../emoji/EmojiEntity'
import type { EmojiKind } from '../emoji/catalog'

export type CapsuleResult = {
  entityId: number
  kind: EmojiKind
  name?: string
  source?: EmojiKind[]
  state?: Partial<Record<import('../reactions/ReactionRules').ReactionEffect, number>>
}

export function collectible(entity: EmojiEntity) {
  const effect = entity.reaction?.rule.effect
  return entity.retained && effect !== 'melt' && effect !== 'unwrap'
}

export function captureCapsule(entity: EmojiEntity): CapsuleResult {
  const rule = entity.reaction?.rule
  const state = entity.reactionCounts || rule ? { ...entity.reactionCounts } : undefined
  if (state && rule) state[rule.effect] = (state[rule.effect] ?? 0) + 1
  return {
    entityId: entity.body.id,
    kind: rule && 'result' in rule ? rule.result : entity.kind,
    name: entity.result?.name,
    source: entity.result?.ingredients.slice(),
    state,
  }
}
