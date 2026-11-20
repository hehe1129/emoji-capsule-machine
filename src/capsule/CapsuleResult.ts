import type { EmojiEntity } from '../emoji/EmojiEntity'
import { catalog } from '../emoji/catalog'

export interface CapsuleResult {
  entityId: number
  glyph: string
  name: string
  source?: string
}

export function drawCapsule(entities: Iterable<EmojiEntity>): CapsuleResult | undefined {
  const candidates = Array.from(entities)
  const chosen = candidates[Math.floor(Math.random() * candidates.length)]
  if (!chosen) return
  return {
    entityId: chosen.body.id,
    glyph: chosen.result ? chosen.result.glyph + (chosen.result.badge ?? '') : catalog[chosen.kind].glyph,
    name: chosen.result?.name ?? catalog[chosen.kind].name,
    source: chosen.result && [chosen.kind, ...chosen.result.ingredients].map(kind => catalog[kind].glyph).join(' + '),
  }
}
