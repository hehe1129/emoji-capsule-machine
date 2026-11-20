import type { EmojiEntity } from '../emoji/EmojiEntity'
import { catalog } from '../emoji/catalog'
import { reactionRules } from './ReactionRules'

export class ReactionEngine {
  private elapsed = 0
  private lastReaction = new Map<string, number>()

  advance(entities: Iterable<EmojiEntity>, delta: number, cooldown: number) {
    this.elapsed += delta
    for (const [pair, time] of this.lastReaction) {
      if (this.elapsed - time >= cooldown) this.lastReaction.delete(pair)
    }
    for (const entity of entities) {
      if (!entity.reaction) continue
      entity.reaction.elapsed += delta
      if (entity.reaction.elapsed >= entity.reaction.duration) entity.reaction = undefined
    }
  }

  reset() {
    this.elapsed = 0
    this.lastReaction.clear()
  }

  match(first: EmojiEntity, second: EmojiEntity, cooldown: number) {
    for (const rule of reactionRules) {
      const [actor, ingredient] = first.kind === rule.actor ? [first, second] : [second, first]
      if (actor.kind !== rule.actor || ingredient.kind !== rule.ingredient || ingredient.result) continue
      const count = actor.reactionCounts?.[rule.effect] ?? 0
      if (count >= (rule.growth?.steps ?? rule.maxUses ?? 1)) continue
      if (rule.consumeIngredient === false) {
        const key = actor.body.id + ':' + ingredient.body.id
        const previous = this.lastReaction.get(key)
        if (previous !== undefined && this.elapsed - previous < cooldown) continue
        this.lastReaction.set(key, this.elapsed)
      }
      const counts = actor.reactionCounts ??= {}
      counts[rule.effect] = count + 1
      const ingredients = actor.result?.ingredients ?? []
      if (!ingredients.includes(ingredient.kind)) ingredients.push(ingredient.kind)
      actor.result = {
        name: counts.grow && counts.sleep ? '长大的小鸡（睡着了）' : rule.name,
        ingredients,
        glyph: rule.glyph ?? catalog[actor.kind].glyph,
        badge: rule.badge ?? actor.result?.badge,
      }
      actor.reaction = { elapsed: 0, duration: rule.duration, effect: rule.effect }
      return { actor, ingredient, rule }
    }
  }
}
