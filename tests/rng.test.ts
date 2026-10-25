import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chance, createRng, nextFloat, nextInt, nextU32, pick, shuffleInPlace } from '../src/engine/rng';

const take = (seed: string, n: number) => {
  const s = createRng(seed);
  return Array.from({ length: n }, () => nextU32(s));
};

test('same seed gives the same sequence', () => {
  assert.deepEqual(take('2026-10-25', 1000), take('2026-10-25', 1000));
});

test('different seeds give different sequences', () => {
  const a = take('seed-a', 50);
  const b = take('seed-b', 50);
  assert.notDeepEqual(a, b);
  // Similar seeds must not share early output either.
  assert.notEqual(take('run-1', 1)[0], take('run-2', 1)[0]);
});

test('known-answer vector (catches accidental algorithm changes)', () => {
  // If this fails, every saved seed, daily setlist and replay changes. Only update deliberately.
  assert.deepEqual(take('headliners', 5), KNOWN_HEADLINERS_FIRST_FIVE);
});

test('state is plain data and resumes the exact sequence', () => {
  const s = createRng('resume');
  for (let i = 0; i < 123; i++) nextU32(s);
  const saved = JSON.parse(JSON.stringify(s));
  const expected = Array.from({ length: 20 }, () => nextU32(s));
  const resumed = Array.from({ length: 20 }, () => nextU32(saved));
  assert.deepEqual(resumed, expected);
});

test('nextFloat is in [0, 1)', () => {
  const s = createRng('float');
  for (let i = 0; i < 10_000; i++) {
    const x = nextFloat(s);
    assert.ok(x >= 0 && x < 1);
  }
});

test('nextInt stays in range and is roughly uniform', () => {
  const s = createRng('uniform');
  const counts = new Array(6).fill(0);
  const n = 60_000;
  for (let i = 0; i < n; i++) {
    const v = nextInt(s, 0, 6);
    assert.ok(Number.isInteger(v) && v >= 0 && v < 6);
    counts[v]++;
  }
  for (const c of counts) assert.ok(Math.abs(c - n / 6) < n / 6 * 0.05, `bucket ${c} too far from ${n / 6}`);
});

test('nextInt rejects bad ranges', () => {
  const s = createRng('x');
  assert.throws(() => nextInt(s, 5, 5));
  assert.throws(() => nextInt(s, 0, 1.5));
});

test('chance respects integer odds', () => {
  const s = createRng('chance');
  let hits = 0;
  for (let i = 0; i < 40_000; i++) if (chance(s, 1, 4)) hits++;
  assert.ok(Math.abs(hits - 10_000) < 600);
});

test('shuffle is a permutation and pick returns a member', () => {
  const s = createRng('shuffle');
  const items = Array.from({ length: 30 }, (_, i) => i);
  const shuffled = shuffleInPlace(s, [...items]);
  assert.deepEqual([...shuffled].sort((a, b) => a - b), items);
  assert.notDeepEqual(shuffled, items);
  assert.ok(items.includes(pick(s, items)));
  assert.throws(() => pick(s, []));
});

// First five nextU32 outputs for seed 'headliners'.
const KNOWN_HEADLINERS_FIRST_FIVE = [1708747827, 2796427715, 3786665868, 3717807686, 1155067871];
