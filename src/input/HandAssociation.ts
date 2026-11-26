import type { HandObservation } from './GestureFilter'

export type SeenHand = HandObservation & { at: number }

export function associateHands(hands: HandObservation[], previous: (SeenHand | undefined)[], now: number) {
  const cost = (hand: HandObservation | undefined, slot: number) => {
    const seen = previous[slot]
    if (!hand) return 0
    if (!seen || now - seen.at > 420) return 0.48
    const distance = Math.hypot(hand.position.x - seen.position.x, hand.position.y - seen.position.y)
    return distance + (hand.side && seen.side && hand.side !== seen.side ? 0.33 : 0)
  }
  const [first, second] = hands
  return cost(first, 0) + cost(second, 1) <= cost(second, 0) + cost(first, 1)
    ? [first, second] : [second, first]
}
