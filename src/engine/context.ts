import { LANES } from './constants';
import type { EngineEvent } from './events';

/** Scratch data for one tick. Not part of the saved state. */
export interface TickCtx {
  events: EngineEvent[];
  /** Damage dealt per lane this tick, emitted as one grouped event per lane. */
  laneDamage: number[];
  laneDamageDepth: number[];
}

export function createCtx(): TickCtx {
  return { events: [], laneDamage: new Array<number>(LANES).fill(0), laneDamageDepth: new Array<number>(LANES).fill(0) };
}

export function flushDamage(ctx: TickCtx): void {
  for (let lane = 0; lane < LANES; lane++) {
    const amount = ctx.laneDamage[lane] ?? 0;
    if (amount > 0) ctx.events.push({ type: 'damage', lane, depth: ctx.laneDamageDepth[lane] ?? 0, amount });
    ctx.laneDamage[lane] = 0;
  }
}
