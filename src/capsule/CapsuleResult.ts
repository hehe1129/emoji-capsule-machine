import type { EmojiEntity } from '../emoji/EmojiEntity'
import { catalog, type EmojiArt, type EmojiKind } from '../emoji/catalog'

export interface CapsuleResult {
  entityId: number
  art: EmojiArt
  badge?: EmojiArt
  name: string
  source?: EmojiKind[]
}

export function drawCapsule(entities: Iterable<EmojiEntity>): CapsuleResult | undefined {
  const candidates = Array.from(entities)
  const chosen = candidates[Math.floor(Math.random() * candidates.length)]
  if (!chosen) return
  return {
    entityId: chosen.body.id,
    art: chosen.result?.art ?? catalog[chosen.kind].art,
    badge: chosen.result?.badge,
    name: chosen.result?.name ?? catalog[chosen.kind].name,
    source: chosen.result && [chosen.kind, ...chosen.result.ingredients],
  }
}
