/**
 * Seeded, serializable random number generator.
 *
 * - Seeds are strings (a date for the Daily Setlist, a run id, a sim index).
 * - State is a plain object so it snapshots with the rest of the engine state.
 * - Algorithm: cyrb128 to hash the seed, sfc32 to generate. Both use 32-bit
 *   integer math only, so results are identical in every JS engine.
 *
 * The engine must NEVER call Math.random; everything random goes through here.
 */

export interface RngState {
  a: number;
  b: number;
  c: number;
  d: number;
}

/** Hash a string seed into four 32-bit words (cyrb128). */
function cyrb128(seed: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < seed.length; i++) {
    const k = seed.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

export function createRng(seed: string): RngState {
  const [a, b, c, d] = cyrb128(seed);
  const state: RngState = { a, b, c, d };
  // Warm up: early sfc32 outputs are weakly mixed for similar seeds.
  for (let i = 0; i < 15; i++) nextU32(state);
  return state;
}

/** Next unsigned 32-bit integer (sfc32). Mutates state. */
export function nextU32(s: RngState): number {
  let { a, b, c, d } = s;
  const t = (((a + b) | 0) + d) | 0;
  d = (d + 1) | 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) | 0;
  c = (c << 21) | (c >>> 11);
  c = (c + t) | 0;
  s.a = a >>> 0;
  s.b = b >>> 0;
  s.c = c >>> 0;
  s.d = d >>> 0;
  return t >>> 0;
}

/** Float in [0, 1). */
export function nextFloat(s: RngState): number {
  return nextU32(s) / 4294967296;
}

/** Unbiased integer in [min, maxExclusive). */
export function nextInt(s: RngState, min: number, maxExclusive: number): number {
  const range = maxExclusive - min;
  if (!Number.isInteger(min) || !Number.isInteger(maxExclusive) || range <= 0 || range > 4294967296) {
    throw new RangeError(`nextInt: bad range [${min}, ${maxExclusive})`);
  }
  // Rejection sampling removes modulo bias.
  const limit = 4294967296 - (4294967296 % range);
  let x = nextU32(s);
  while (x >= limit) x = nextU32(s);
  return min + (x % range);
}

/** True with probability numerator/denominator, using integers only. */
export function chance(s: RngState, numerator: number, denominator: number): boolean {
  return nextInt(s, 0, denominator) < numerator;
}

export function pick<T>(s: RngState, items: readonly T[]): T {
  if (items.length === 0) throw new RangeError('pick: empty list');
  return items[nextInt(s, 0, items.length)] as T;
}

/** Fisher–Yates shuffle, in place. */
export function shuffleInPlace<T>(s: RngState, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = nextInt(s, 0, i + 1);
    const tmp = items[i] as T;
    items[i] = items[j] as T;
    items[j] = tmp;
  }
  return items;
}
