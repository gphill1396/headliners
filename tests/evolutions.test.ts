import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, evolution, STAGE_LINE, step, type EngineState, type HeadlinerId } from '../src/engine';
import { giveCard, nextBeat, noWaves, ofType, playOnBeat, runTicks, testState, toBeatEdge } from './helpers';

/** A run on the field with an evolution already chosen. */
function evolved(h: HeadlinerId, index: 0 | 1, seed = `evo-${h}-${index}`): EngineState {
  const s = testState(seed);
  s.headliner.id = h;
  s.headliner.evolution = index;
  noWaves(s);
  return s;
}

test('after wave 5 the run stops to evolve; choosing one carries on to wave 6', () => {
  const s = createState({ seed: 'evolve' });
  s.wave.index = 5;
  s.wave.startBeat = s.clock.beat - 100;
  let offered = false;
  for (let t = 0; t < 200 && !offered; t++) offered = ofType(step(s), 'evolveOffered').length > 0;
  assert.ok(offered);
  assert.equal(s.phase, 'evolving');
  const beat = s.clock.beat;
  runTicks(s, 100);
  assert.equal(s.clock.beat, beat, 'the clock waits while you choose');
  const ev = step(s, [{ type: 'evolve', index: 1 }]);
  assert.equal(ofType(ev, 'evolved')[0]?.evolution, 'polyrhythm');
  assert.equal(evolution(s), 'polyrhythm');
  assert.equal(s.phase, 'playing');
  assert.equal(s.wave.index, 6);
  // It only happens once.
  s.wave.index = 5;
  s.wave.startBeat = s.clock.beat - 100;
  for (let t = 0; t < 100; t++) assert.equal(ofType(step(s), 'evolveOffered').length, 0);
});

test('Metronome: wider timing windows', () => {
  const graded = (index: 0 | 1 | null) => {
    const s = testState(`metro-${index}`);
    noWaves(s);
    s.headliner.evolution = index;
    toBeatEdge(s);
    step(s); // past the beat
    // 70 ms early (420 phase units at 100 BPM): outside the normal 60 ms Tight window, inside 78 ms.
    const target = 3600 - 420;
    while (s.clock.phase + s.clock.bpm <= target) step(s);
    const permille = Math.floor(((target - s.clock.phase) * 1000) / s.clock.bpm);
    const iid = giveCard(s, 'stagehand');
    return ofType(step(s, [{ type: 'commit', iid, lane: 0, permille }]), 'graded')[0]!.grade;
  };
  assert.equal(graded(null), 'good');
  assert.equal(graded(0), 'tight');
});

test('Polyrhythm: an Echo card in a different lane from the beat before echoes twice', () => {
  const echoes = (index: 0 | 1, switchLane: boolean) => {
    const s = evolved('thrum', index);
    playOnBeat(s, 'stagehand', 0);
    const ev = [...playOnBeat(s, 'paradiddle', switchLane ? 2 : 0)];
    for (let b = 0; b < 3; b++) ev.push(...nextBeat(s));
    return ofType(ev, 'resolved').filter((r) => r.cardId === 'paradiddle' && r.isEcho).length;
  };
  assert.equal(echoes(1, true), 2);
  assert.equal(echoes(1, false), 1);
  assert.equal(echoes(0, true), 1);
});

test('Crescendo: gates add damage as shots pass, up to double', () => {
  const s = evolved('lyra', 0);
  playOnBeat(s, 'double-stop', 1);
  s.gates[0]!.passes = 100;
  s.projectiles = [{ id: s.nextId++, lane: 1, x: 500, depth: STAGE_LINE, damage: 10, pierceLeft: 0, splash: false, gatesPassed: 0, sourceCardId: 't' }];
  runTicks(s, 12);
  const shots = s.projectiles.filter((p) => p.sourceCardId === 't');
  // +1 (Lyra) then ×1.5 (100 passes = 10 steps of 5%).
  assert.ok(shots.length === 2 && shots.every((p) => p.damage === 16.5), JSON.stringify(shots.map((p) => p.damage)));
});

test('Harmony: two gates in one lane both work as if Swelled', () => {
  const s = evolved('lyra', 1);
  playOnBeat(s, 'double-stop', 1);
  playOnBeat(s, 'distortion', 1);
  s.projectiles = [{ id: s.nextId++, lane: 1, x: 500, depth: STAGE_LINE, damage: 1, pierceLeft: 0, splash: false, gatesPassed: 0, sourceCardId: 't' }];
  runTicks(s, 20);
  const shots = s.projectiles.filter((p) => p.sourceCardId === 't');
  assert.equal(shots.length, 3); // ×2 Swelled = ×3
});

test('Load Out: a Roadie leaving brings a Riff back from the discard pile', () => {
  const s = evolved('clatter', 0);
  playOnBeat(s, 'load-in', 0);
  const before = s.hand.length;
  for (let b = 0; b < 12; b++) nextBeat(s);
  assert.ok(s.hand.some((c) => c.cardId === 'load-in'), `hand ${s.hand.map((c) => c.cardId)}`);
  assert.ok(s.hand.length >= before);
});

test('Mosh Pit: with 5+ Roadies on stage their shots Splash', () => {
  const s = evolved('clatter', 1);
  playOnBeat(s, 'crew-call', 0);
  playOnBeat(s, 'crew-call', 0);
  assert.ok(s.units.filter((u) => u.token).length >= 5);
  s.projectiles = [];
  runTicks(s, 40);
  const roadieShots = s.projectiles.filter((p) => p.sourceCardId === 'roadie');
  assert.ok(roadieShots.length > 0 && roadieShots.every((p) => p.splash));
});
