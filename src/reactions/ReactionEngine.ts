import Matter from 'matter-js'
import { arena, trayX, trayEnd } from '../core/config'
import { flowerHeight } from '../emoji/flower'
import { randomKind, type EmojiKind } from '../emoji/catalog'
import type { EmojiEntity } from '../emoji/EmojiEntity'
import { findRecipe } from './ReactionRules'
import { Meltwater } from './Meltwater'
import { resizeBody } from '../physics/resizeBody'

type World = {
  remove: (entity: EmojiEntity) => void
  spawn: (x: number, y: number, kind: EmojiKind) => void
}
const { Body } = Matter
export class ReactionEngine {
  readonly water = new Meltwater()

  contact(first: EmojiEntity, second: EmojiEntity, world: World) {
    if (first.reaction || second.reaction || first.cooldown || second.cooldown) return
    const rule = findRecipe(first.kind, second.kind)
    if (!rule) return
    const [actor, ingredient] = first.kind === rule.actor ? [first, second] : [second, first]
    const offset = Matter.Vector.sub(ingredient.body.position, actor.body.position)
    actor.reaction = { rule, elapsed: 0, offset }
    const sources = new Set(actor.result?.ingredients)
    sources.add(ingredient.kind)
    actor.result = { name: rule.name, ingredients: [...sources] }
    world.remove(ingredient)
    if (actor.body.isStatic) return
    if (rule.effect === 'dash') Body.setVelocity(actor.body, { x: actor.body.position.x < arena.width / 2 ? 17 : -17, y: -5 })
    if (rule.effect === 'chase') Body.setVelocity(actor.body, { x: Math.sign(offset.x) * 8, y: -4 })
    if (rule.effect === 'sleep') Body.setVelocity(actor.body, { x: 0, y: 0 })
  }

  advance(actor: EmojiEntity, delta: number, cooldown: number, world: World, hatchOpen: boolean) {
    actor.cooldown = Math.max(0, (actor.cooldown ?? 0) - delta)
    const reaction = actor.reaction
    if (actor.kind === 'tulip') {
      const { x, y } = actor.body.position
      const compact = !!actor.retained || (hatchOpen && x >= trayX && x <= trayEnd && y > arena.height / 2)
      const count = actor.reactionCounts?.elongate ?? 0
      const start = flowerHeight(count, compact)
      const progress = reaction?.rule.effect === 'elongate' ? Math.min(1, (reaction.elapsed + delta) / reaction.rule.duration) : 0
      const height = start + (flowerHeight(count + 1, compact) - start) * progress
      const previous = actor.heightScale ?? 1
      if (height !== previous) resizeBody(actor.body, 1, height / previous)
      actor.heightScale = height
      actor.compactFlower = compact
    }
    if (!reaction) return
    reaction.elapsed += delta
    const { rule } = reaction
    const progress = Math.min(1, reaction.elapsed / rule.duration)
    const body = actor.body
    if (rule.effect === 'grow' && !actor.reactionCounts?.grow && progress > 0.25) {
      const radius = arena.radius * (1 + 2 * (progress - 0.25) / 0.75)
      resizeBody(body, radius / actor.radius, radius / actor.radius)
      actor.radius = radius
    }
    if (!body.isStatic) {
      if (rule.effect === 'dash') {
        if (body.speed < 1) Body.setVelocity(body, { x: body.position.x < arena.width / 2 ? 16 : -16, y: -5 })
        Body.setSpeed(body, 17)
      }
      if (rule.effect === 'thrust') Body.setVelocity(body, { x: 0, y: -15 })
    }
    if (progress < 1) return
    actor.reaction = undefined
    if (rule.effect === 'unwrap' || rule.effect === 'melt') {
      const { x, y } = body.position
      if (rule.effect === 'melt') this.water.add(x, y, !!actor.retained)
      world.remove(actor)
      if (rule.effect === 'unwrap') world.spawn(x, y, randomKind())
      return
    }
    if ('result' in rule) actor.kind = rule.result
    const counts = actor.reactionCounts ??= {}
    counts[rule.effect] = (counts[rule.effect] ?? 0) + 1
    if ((rule.effect === 'dash' || rule.effect === 'thrust') && !body.isStatic) {
      Body.setVelocity(body, { x: body.velocity.x * 0.18, y: body.velocity.y * 0.18 })
    }
    actor.cooldown = cooldown
  }
}
