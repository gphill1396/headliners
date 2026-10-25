import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accuracyPct, BEAT_UNITS, chainStepPct, step, type EngineState } from '../src/engine';
import { giveCard, noWaves, ofType, testState } from './helpers';

const BPM = 100;
const MILLI_PER_MS = 60 * BPM;
const acc = (ms: number, relaxed = false) => accuracyPct(ms * MILLI_PER_MS, BPM, relaxed);

test('accuracy slides continuously: dead-on 1.6×, Tight edge 1.3×, Good edge 1.05×, Off 0.75×', () => {
  assert.equal(acc(0), 160);
  assert.equal(acc(30), 145);
  assert.equal(acc(-60), 130);
  assert.equal(acc(120), 105);
  assert.equal(acc(121), 75);
  let prev = Infinity;
  for (let ms = 0; ms <= 120; ms += 5) {
    assert.ok(acc(ms) <= prev, `not monotonic at ${ms}`);
    prev = acc(ms);
  }
  assert.ok(acc(100, true) > acc(100)); // relaxed timing widens the windows
});

test('chain steps: dead-on +30, Tight +20, Good +8, Off 0', () => {
  const st = (ms: number) => chainStepPct(ms * MILLI_PER_MS, BPM, false);
  assert.deepEqual([st(0), st(15), st(16), st(60), st(61), st(120), st(121)], [30, 30, 20, 20, 8, 8, 0]);
});

/** Commit a card `offsetMs` from the next beat (negative = early). Returns that tick's events. */
function playAt(s: EngineState, offsetMs: number) {
  // Advance to the tick where the target time falls, then commit at the right sub-tick.
  const ticksPerBeat = BEAT_UNITS / s.clock.bpm;
  const msPerTick = 1000 / 60;
  // Next beat lands after (BEAT_UNITS - phase)/bpm ticks from now.
  while ((BEAT_UNITS - s.clock.phase) / s.clock.bpm < ticksPerBeat / 2) step(s);
  const ticksToBeat = (BEAT_UNITS - s.clock.phase) / s.clock.bpm;
  const target = ticksToBeat + offsetMs / msPerTick;
  const whole = Math.floor(target);
  for (let i = 0; i < whole; i++) step(s);
  const permille = Math.floor((target - whole) * 1000);
  const iid = giveCard(s, 'paradiddle');
  s.energy = 10;
  return step(s, [{ type: 'commit', iid, lane: 0, permille }]);
}

test('the pocket: consistent timing deepens it, even slightly behind the beat', () => {
  const s = testState('pocket');
  noWaves(s);
  for (let i = 0; i < 14; i++) playAt(s, 22); // always 22 ms late: consistent
  assert.equal(s.pocket.depth, 10);
});

test('the pocket: scattered timing never settles, Good plays cost 2, Off empties it', () => {
  const s = testState('scatter');
  noWaves(s);
  for (let i = 0; i < 12; i++) playAt(s, i % 2 ? -50 : 50); // Tight, but all over the place
  assert.ok(s.pocket.depth <= 2, `depth ${s.pocket.depth}`);

  const t = testState('drops');
  noWaves(t);
  for (let i = 0; i < 6; i++) playAt(t, 5);
  const before = t.pocket.depth;
  const good = playAt(t, 90);
  assert.equal(t.pocket.depth, before - 2);
  assert.deepEqual(ofType(good, 'pocket').map((e) => e.delta), [-2]);
  playAt(t, 250);
  assert.equal(t.pocket.depth, 0);
});

test('the pocket boosts all damage, including units firing on their own', () => {
  const s = testState('boost');
  noWaves(s);
  s.units.push({ id: s.nextId++, card: { iid: 999, cardId: 'stagehand' }, cardId: 'stagehand', lane: 0, slot: 0, damage: 10, fireEvery: 2, pierce: 0, splash: false, placedBeat: 0 });
  const shotDamage = () => {
    s.projectiles = [];
    while (s.projectiles.length === 0) step(s);
    return s.projectiles[0]!.damage;
  };
  s.pocket.depth = 0;
  const flat = shotDamage();
  s.pocket.depth = 10;
  assert.equal(shotDamage(), flat * 1.4);
});
