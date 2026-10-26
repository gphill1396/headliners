/**
 * Headliners engine — pure, deterministic game rules (SPEC §2).
 *
 * Rules for everything under src/engine/ and src/content/:
 * - No DOM, React or Node APIs (tsconfig.engine.json compiles it with the ES library only).
 * - No Math.random, Math.pow/exp/log, Date or performance timers (tests/engine-purity.test.ts checks).
 * - All randomness through ./rng, all time in ticks through ./clock.
 * - State is plain JSON-safe data.
 */
export * from './constants';
export * from './rng';
export * from './clock';
export * from './types';
export * from './events';
export * from './state';
export * from './step';
export * from './snapshot';
export * from './evolution';
export { boostPct, chainMultPct, isBigChain, pocketPct } from './effects';
export { frontEnemy } from './combat';
export { getCard, CARDS, STARTER_DECK } from '../content/cards';
export { ENEMIES } from '../content/enemies';
export { HEADLINERS } from '../content/headliners';

import { getCard as lookupCard } from '../content/cards';
export const getCardCost = (cardId: string): number => lookupCard(cardId).cost;
export * from './tour';
