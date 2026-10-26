import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAGE_LINE, step, type EngineState } from '../src/engine';
import { addEnemy, giveCard, nextBeat, noWaves, ofType, playOnBeat, runTicks, testState, toBeatEdge } from './helpers';

function as(h: 'aria' | 'riot', evolution: 0 | 1 | null = null, seed = `${h}-${evolution}`): EngineState {
  const s = testState(seed);
  s.headliner.id = h;
  s.headliner.evolution = evolution;
  noWaves(s);
  return s;
}

const shot = (s: EngineState, lane: number, extra: Partial<EngineState['projectiles'][number]> = {}) =>
  s.projectiles.push({ id: s.nextId++, lane, x: 500, depth: STAGE_LINE, damage: 10, pierceLeft: 0, splash: false, gatesPassed: 0, sourceCardId: 't', ...extra });

/** Commit a card `ms` milliseconds early (100 BPM: 6 phase units per ms). */
function playEarly(s: EngineState, cardId: string, lane: number, ms: number) {
  toBeatEdge(s);
  step(s);
  const target = 3600 - ms * 6;
  while (s.clock.phase + s.clock.bpm <= target) step(s);
  const permille = Math.floor(((target - s.clock.phase) * 1000) / s.clock.bpm);
  const iid = giveCard(s, cardId);
  return step(s, [{ type: 'commit', iid, lane, permille }]);
}

test("Aria's passive: her Tight riffs slow their lane; Off ones don't", () => {
  const s = as('aria');
  const e = addEnemy(s, { lane: 1, depth: 20_000, hp: 1_000, maxHp: 1_000 });
  playOnBeat(s, 'power-chord', 1);
  assert.ok((e.slowUntilBeat ?? -1) > s.clock.beat);
  const t = as('aria', null, 'aria-off');
  const f = addEnemy(t, { lane: 1, depth: 20_000, hp: 1_000, maxHp: 1_000 });
  playEarly(t, 'power-chord', 1, 300);
  for (let i = 0; i < 40; i++) step(t);
  assert.ok(!((f.slowUntilBeat ?? -1) > t.clock.beat));
});

test('slowed enemies walk at part speed', () => {
  const s = as('aria');
  const a = addEnemy(s, { lane: 0, depth: 10_000, speed: 100, hp: 1_000, maxHp: 1_000 });
  const b = addEnemy(s, { lane: 2, depth: 10_000, speed: 100, hp: 1_000, maxHp: 1_000 });
  playOnBeat(s, 'lullaby', 0);
  const before = [a.depth, b.depth];
  runTicks(s, 30);
  const moved = [a.depth - before[0]!, b.depth - before[1]!];
  assert.ok(moved[0]! < moved[1]! * 0.6, JSON.stringify(moved));
});

test('Hold: on the beat, every enemy stops; Off the beat, it fizzles', () => {
  const s = as('aria');
  const e = addEnemy(s, { lane: 0, depth: 10_000, speed: 100, hp: 1_000, maxHp: 1_000 });
  toBeatEdge(s);
  const ev = step(s, [{ type: 'activate', permille: 0 }]);
  assert.equal(ofType(ev, 'fill')[0]?.grade, 'tight');
  const at = e.depth;
  runTicks(s, 50);
  assert.equal(e.depth, at);

  const t = as('aria', null, 'hold-off');
  const f = addEnemy(t, { lane: 0, depth: 10_000, speed: 100, hp: 1_000, maxHp: 1_000 });
  toBeatEdge(t);
  for (let i = 0; i < 15; i++) step(t); // halfway between beats
  const off = ofType(step(t, [{ type: 'activate', permille: 0 }]), 'fill')[0];
  assert.equal(off?.grade, 'off');
  const before = f.depth;
  runTicks(t, 20);
  assert.ok(f.depth > before);
});

test('Vibrato slows what its shots hit; High Note hits a slowed enemy twice as hard', () => {
  const s = as('aria');
  playOnBeat(s, 'vibrato', 0);
  const e = addEnemy(s, { lane: 0, depth: 20_000, hp: 1_000, maxHp: 1_000 });
  s.projectiles = [];
  shot(s, 0);
  runTicks(s, 40);
  assert.ok((e.slowUntilBeat ?? -1) > s.clock.beat);

  const hit = (slowed: boolean) => {
    const t = as('riot', null, `hn-${slowed}`); // not Aria: no passive slow from the riff itself
    const f = addEnemy(t, { lane: 1, depth: 20_000, hp: 1_000, maxHp: 1_000, ...(slowed ? { slowUntilBeat: 1_000, slowPct: 50 } : {}) });
    playOnBeat(t, 'high-note', 1);
    return 1_000 - f.hp;
  };
  assert.ok(Math.abs(hit(true) - 2 * hit(false)) < 1e-6);
});

test('Banshee: slowed enemies take 50% more damage', () => {
  const dmg = (evo: 0 | 1 | null) => {
    const s = as('aria', evo);
    const e = addEnemy(s, { lane: 0, depth: 20_000, hp: 1_000, maxHp: 1_000, slowUntilBeat: 1_000, slowPct: 50 });
    shot(s, 0);
    runTicks(s, 40);
    return 1_000 - e.hp;
  };
  assert.equal(dmg(1), dmg(null) * 1.5);
});

test("Riot: kills win back crowd while the chain is 3+; his ability doubles damage", () => {
  const s = as('riot');
  s.crowd = 20;
  s.chain = { links: 4, multPct: 100, lastLinkBeat: s.clock.beat + 100 };
  for (let i = 0; i < 8; i++) addEnemy(s, { lane: i % 3, depth: 20_000, hp: 0.5, maxHp: 1 });
  for (let i = 0; i < 3; i++) shot(s, i, { pierceLeft: 5 });
  runTicks(s, 40);
  assert.equal(s.crowd, 21);
  // Up to 2 a wave: 20 more kills this wave win back only 1 more.
  for (let i = 0; i < 20; i++) addEnemy(s, { lane: i % 3, depth: 20_000, hp: 0.5, maxHp: 1 });
  for (let i = 0; i < 3; i++) shot(s, i, { pierceLeft: 10 });
  runTicks(s, 40);
  assert.equal(s.crowd, 22);
  // A new wave starts the count again.
  s.wave.startBeat += 1;
  for (let i = 0; i < 5; i++) addEnemy(s, { lane: 0, depth: 20_000, hp: 0.5, maxHp: 1 });
  shot(s, 0, { pierceLeft: 10 });
  runTicks(s, 40);
  assert.equal(s.crowd, 23);

  const dmg = (rioting: boolean) => {
    const t = as('riot', null, `riot-${rioting}`);
    if (rioting) {
      toBeatEdge(t);
      step(t, [{ type: 'activate', permille: 0 }]);
    }
    const e = addEnemy(t, { lane: 0, depth: 20_000, hp: 1_000, maxHp: 1_000 });
    shot(t, 0);
    runTicks(t, 40);
    return 1_000 - e.hp;
  };
  assert.equal(dmg(true), dmg(false) * 2);
});

test('Anarchy: no Feedback cost on a long chain; Comeback: hit harder when crowd is low', () => {
  const s = as('riot', 0);
  s.chain = { links: 6, multPct: 100, lastLinkBeat: 1e9 };
  s.crowd = 20;
  playOnBeat(s, 'power-slide', 0);
  assert.equal(s.crowd, 20);

  const dmg = (crowd: number) => {
    const t = as('riot', 1, `cb-${crowd}`);
    t.crowd = crowd;
    const e = addEnemy(t, { lane: 0, depth: 20_000, hp: 1_000, maxHp: 1_000 });
    shot(t, 0);
    runTicks(t, 40);
    return 1_000 - e.hp;
  };
  assert.ok(Math.abs(dmg(20) - dmg(30) * 1.3) < 1e-6);
});

test('a Good ability is a beat shorter than a Tight one', () => {
  const s = as('riot');
  // ~90 ms early: Good.
  toBeatEdge(s);
  step(s);
  const target = 3600 - 90 * 6;
  while (s.clock.phase + s.clock.bpm <= target) step(s);
  const permille = Math.floor(((target - s.clock.phase) * 1000) / s.clock.bpm);
  const ev = ofType(step(s, [{ type: 'activate', permille }]), 'fill')[0]!;
  assert.equal(ev.grade, 'good');
  assert.equal(ev.untilBeat - (s.clock.beat + 1), 1);
  nextBeat(s);
});
