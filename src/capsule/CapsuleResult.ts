import type { EmojiEntity } from '../emoji/EmojiEntity'
import { catalog, type EmojiArt, type EmojiKind } from '../emoji/catalog'
import { arena } from '../core/config'

export interface CapsuleResult {
  entityId: number
  exitX: number
  art: EmojiArt
  badge?: EmojiArt
  name: string
  source?: EmojiKind[]
}

export function captureCapsule(chosen: EmojiEntity): CapsuleResult {
  return {
    entityId: chosen.body.id,
    exitX: chosen.body.position.x / arena.width,
    art: chosen.result?.art ?? catalog[chosen.kind].art,
    badge: chosen.result?.badge,
    name: chosen.result?.name ?? catalog[chosen.kind].name,
    source: chosen.result && [chosen.kind, ...chosen.result.ingredients],
  }
}
