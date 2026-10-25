import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BEAT_UNITS,
  cloneState,
  createRng,
  createState,
  fromSnapshot,
  hashState,
  nextInt,
  step,
  toSnapshot,
  type EngineEvent,
  type EngineState,
  type Input,
} from '../src/engine';

/**
 * A scripted "player" driven by its own seed, so tests can generate thousands
 * of varied inputs reproducibly without touching the engine's RNG.
 */
function scriptedInputs(scriptSeed: string, ticks: number): Input[][] {
  const r = createRng(scriptSeed);
  const script: Input[][] = [];
  for (let t = 0; t < ticks; t++) {
    const inputs: Input[] = [];
    if (nextInt(r, 0, 10) === 0) {
      inputs.push({ type: 'commit', lane: nextInt(r, 0, 3), slot: -1, permille: nextInt(r, 0, 1000) });
    }
    if (nextInt(r, 0, 4000) === 0) inputs.push({ type: 'setTempo', bpm: nextInt(r, 90, 160) });
    if (nextInt(r, 0, 5000) === 0) inputs.push({ type: 'setRelaxedTiming', value: nextInt(r, 0, 2) === 1 });
    script.push(inputs);
  }
  return script;
}

function run(state: EngineState, script: Input[][], from = 0, to = script.length): EngineEvent[][] {
  const log: EngineEvent[][] = [];
  for (let t = from; t < to; t++) log.push(step(state, script[t]));
  return log;
}

test('S0.2: same seed + same inputs over 10,000 ticks → identical state hash and events', () => {
  const script = scriptedInputs('player-1', 10_000);
  const a = createState({ seed: 'determinism' });
  const b = createState({ seed: 'determinism' });
  const logA = run(a, script);
  const logB = run(b, script);
  assert.equal(a.tick, 10_000);
  assert.equal(hashState(a), hashState(b));
  assert.deepEqual(logA, logB);
  // The run actually exercised the systems under test.
  assert.ok(a.clock.beat > 100);
  assert.ok(a.stats.tight + a.stats.good + a.stats.off > 500);
  assert.ok(a.stats.cleared > 0 && a.stats.missed > 0);
});

test('different seeds diverge', () => {
  const script = scriptedInputs('player-1', 3_000);
  const a = createState({ seed: 'alpha' });
  const b = createState({ seed: 'beta' });
  run(a, script);
  run(b, script);
  assert.notEqual(hashState(a), hashState(b));
});

test('different inputs diverge', () => {
  const a = createState({ seed: 'same' });
  const b = createState({ seed: 'same' });
  run(a, scriptedInputs('player-1', 3_000));
  run(b, scriptedInputs('player-2', 3_000));
  assert.notEqual(hashState(a), hashState(b));
});

test('snapshot mid-run and resume → identical to an uninterrupted run', () => {
  const script = scriptedInputs('player-3', 10_000);
  const straight = createState({ seed: 'resume' });
  run(straight, script);

  const first = createState({ seed: 'resume' });
  run(first, script, 0, 5_000);
  const restored = fromSnapshot(toSnapshot(first));
  run(restored, script, 5_000, 10_000);

  assert.equal(hashState(restored), hashState(straight));
});

test('cloneState is a deep copy', () => {
  const a = createState({ seed: 'clone' });
  run(a, scriptedInputs('p', 500));
  const b = cloneState(a);
  assert.equal(hashState(a), hashState(b));
  step(b);
  assert.notEqual(hashState(a), hashState(b));
});

test('state hash ignores property creation order', () => {
  const a = createState({ seed: 'order' });
  const b = JSON.parse(JSON.stringify(a)) as EngineState;
  const reordered = Object.fromEntries(Object.entries(b).reverse()) as unknown as EngineState;
  assert.equal(hashState(a), hashState(reordered));
});

test('snapshots from a newer engine version are refused', () => {
  const s = createState({ seed: 'v' });
  const future = toSnapshot({ ...s, version: s.version + 1 });
  assert.throws(() => fromSnapshot(future));
  assert.throws(() => fromSnapshot('{"hello":1}'));
});

test('beat events fire on the right ticks, with downbeats every 4th beat', () => {
  const s = createState({ seed: 'beats', bpm: 100 });
  const beats: { tick: number; beat: number; downbeat: boolean }[] = [];
  for (let t = 0; t < 36 * 8; t++) {
    for (const e of step(s)) if (e.type === 'beat') beats.push({ tick: s.tick, beat: e.beat, downbeat: e.downbeat });
  }
  assert.deepEqual(beats.map((b) => b.tick), [36, 72, 108, 144, 180, 216, 252, 288]);
  assert.deepEqual(beats.map((b) => b.downbeat), [false, false, false, true, false, false, false, true]);
});

test('an early commit is graded now and resolves on the next beat', () => {
  const s = createState({ seed: 'commit', bpm: 100 });
  // Advance to 2 ticks (~33 ms) before beat 1.
  for (let t = 0; t < 34; t++) step(s);
  const graded = step(s, [{ type: 'commit', lane: 1, slot: -1, permille: 0 }]);
  const g = graded.find((e) => e.type === 'graded');
  assert.ok(g && g.type === 'graded');
  assert.equal(g.grade, 'tight');
  assert.equal(g.resolveBeat, 1);
  assert.equal(graded.some((e) => e.type === 'resolved'), false);

  const onBeat = step(s);
  assert.ok(onBeat.some((e) => e.type === 'beat'));
  const r = onBeat.find((e) => e.type === 'resolved');
  assert.ok(r && r.type === 'resolved');
  assert.equal(r.beat, 1);
  assert.equal(s.queue.length, 0);
});

test('a late-but-Good commit resolves right away', () => {
  const s = createState({ seed: 'late', bpm: 100 });
  for (let t = 0; t < 38; t++) step(s); // ~33 ms after beat 1
  const events = step(s, [{ type: 'commit', lane: 0, slot: -1, permille: 0 }]);
  assert.ok(events.some((e) => e.type === 'graded' && e.grade === 'tight'));
  assert.ok(events.some((e) => e.type === 'resolved' && e.beat === 1));
});

test('invalid lanes are ignored', () => {
  const s = createState({ seed: 'lanes' });
  const events = step(s, [{ type: 'commit', lane: 7, slot: -1, permille: 0 }]);
  assert.equal(events.some((e) => e.type === 'graded'), false);
  assert.equal(s.queue.length, 0);
});

test('inputs within a tick are applied in time order', () => {
  const s = createState({ seed: 'order', bpm: 100 });
  for (let t = 0; t < 30; t++) step(s);
  const events = step(s, [
    { type: 'commit', lane: 2, slot: -1, permille: 900 },
    { type: 'commit', lane: 0, slot: -1, permille: 100 },
  ]);
  const lanes = events.filter((e) => e.type === 'graded').map((e) => (e.type === 'graded' ? e.lane : -1));
  assert.deepEqual(lanes, [0, 2]);
});

test('a marker spawns on every downbeat', () => {
  const s = createState({ seed: 'spawn', bpm: 120 });
  let downbeats = 0;
  let spawnsOnDownbeat = 0;
  for (let t = 0; t < BEAT_UNITS * 2; t++) {
    const events = step(s);
    if (events.some((e) => e.type === 'beat' && e.downbeat)) {
      downbeats++;
      if (events.some((e) => e.type === 'markerSpawned')) spawnsOnDownbeat++;
    }
  }
  assert.ok(downbeats > 10);
  assert.equal(spawnsOnDownbeat, downbeats);
});
