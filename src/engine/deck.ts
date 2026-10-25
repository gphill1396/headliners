import { HAND_SIZE } from './constants';
import type { EngineEvent } from './events';
import { nextInt, shuffleInPlace } from './rng';
import type { EngineState } from './state';

/** Draw up to `count` cards, reshuffling the discard pile into the draw pile when it runs out. */
export function drawCards(state: EngineState, count: number, events: EngineEvent[]): number {
  let drawn = 0;
  for (let i = 0; i < count; i++) {
    if (state.draw.length === 0) {
      if (state.discard.length === 0) break;
      state.draw = shuffleInPlace(state.rng, state.discard);
      state.discard = [];
    }
    const card = state.draw.shift();
    if (!card) break;
    state.hand.push(card);
    drawn++;
  }
  if (drawn > 0) events.push({ type: 'drew', count: drawn });
  return drawn;
}

/** Start of each bar: refill the hand to HAND_SIZE. */
export function refillHand(state: EngineState, events: EngineEvent[]): void {
  const missing = HAND_SIZE - state.hand.length;
  if (missing > 0) drawCards(state, missing, events);
}

/** Add a new card to the deck (card picks), shuffled into a random spot in the draw pile. */
export function addCardToDeck(state: EngineState, cardId: string): void {
  const at = nextInt(state.rng, 0, state.draw.length + 1);
  state.draw.splice(at, 0, { iid: state.nextId++, cardId });
}
