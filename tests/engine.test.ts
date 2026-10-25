import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cloneState,
  createRng,
  createState,
  fromSnapshot,
  getCardCost,
  hashState,
  nextInt,
  step,
  toSnapshot,
  type EngineEvent,
  type EngineState,
  type Input,
  type RngState,
} from '../src/engine';

/**
 * A bot player with its own seeded RNG. It reads the state to choose legal
 * plays, so runs exercise cards, chains, waves and picks — reproducibly.
 */
function botInputs(s: EngineState, r: RngState): Input[] {
  if (s.phase === 'picking') return [{ type: 'pick', index: nextInt(r, 0, 2) === 0 ? null : nextInt(r, 0, 3) }];
  const inputs: Input[] = [];
  if (nextInt(r, 0, 14) === 0) {
    const affordable = s.hand.filter((c) => getCardCost(c.cardId) <= s.energy);
    if (affordable.length) {
      const card = affordable[nextInt(r, 0, affordable.length)]!;
      inputs.push({ type: 'commit', iid: card.iid, lane: nextInt(r, 0, 3), permille: nextInt(r, 0, 1000) });
    }
  }
  if (nextInt(r, 0, 600) === 0) inputs.push({ type: 'activate', permille: nextInt(r, 0, 1000) });
  if (nextInt(r, 0, 9000) === 0) inputs.push({ type: 'setRelaxedTiming', value: nextInt(r, 0, 2) === 1 });
  return inputs;
}

function runBot(s: EngineState, botSeed: string, ticks: number, r: RngState = createRng(botSeed)): EngineEvent[][] {
  const log: EngineEvent[][] = [];
  for (let t = 0; t < ticks; t++) log.push(step(s, botInputs(s, r)));
  return log;
}

test('S0.2: same seed + same inputs over 10,000 ticks → identical state hash and events', () => {
  const a = createState({ seed: 'determinism' });
  const b = createState({ seed: 'determinism' });
  const logA = runBot(a, 'bot-1', 10_000);
  const logB = runBot(b, 'bot-1', 10_000);
  assert.equal(a.tick, 10_000);
  assert.equal(hashState(a), hashState(b));
  assert.deepEqual(logA, logB);
  // The run actually exercised the game.
  assert.ok(a.stats.cardsPlayed > 50, `cards ${a.stats.cardsPlayed}`);
  assert.ok(a.stats.kills > 20, `kills ${a.stats.kills}`);
  assert.ok(a.wave.index >= 2, `wave ${a.wave.index}`);
});

test('different seeds diverge; different players diverge', () => {
  const a = createState({ seed: 'alpha' });
  const b = createState({ seed: 'beta' });
  runBot(a, 'bot', 3_000);
  runBot(b, 'bot', 3_000);
  assert.notEqual(hashState(a), hashState(b));
  const c = createState({ seed: 'alpha' });
  runBot(c, 'other-bot', 3_000);
  assert.notEqual(hashState(a), hashState(c));
});

test('snapshot mid-run and resume → identical to an uninterrupted run', () => {
  const straight = createState({ seed: 'resume' });
  runBot(straight, 'bot-3', 10_000);

  const first = createState({ seed: 'resume' });
  const r = createRng('bot-3');
  runBot(first, 'bot-3', 5_000, r);
  const restored = fromSnapshot(toSnapshot(first));
  const rCopy = JSON.parse(JSON.stringify(r)) as RngState;
  runBot(restored, 'bot-3', 5_000, rCopy);

  assert.equal(hashState(restored), hashState(straight));
});

test('cloneState is a deep copy', () => {
  const a = createState({ seed: 'clone' });
  runBot(a, 'p', 500);
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

test('snapshots from other engine versions are refused', () => {
  const s = createState({ seed: 'v' });
  assert.throws(() => fromSnapshot(toSnapshot({ ...s, version: s.version + 1 })));
  assert.throws(() => fromSnapshot(toSnapshot({ ...s, version: 1 })));
  assert.throws(() => fromSnapshot('{"hello":1}'));
});

test('a long bot run stays within performance bounds', () => {
  const s = createState({ seed: 'perf' });
  const t0 = process.hrtime.bigint();
  runBot(s, 'perf-bot', 20_000);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  // 20,000 ticks is ~5.5 minutes of play. Must simulate far faster than real time.
  assert.ok(ms < 20_000, `took ${ms.toFixed(0)} ms`);
  assert.ok(s.projectiles.length <= 1_200);
});

test('v2 saves migrate forward as Encore runs', () => {
  const s = createState({ seed: 'migrate' });
  const v2 = JSON.parse(toSnapshot(s));
  delete v2.mode;
  v2.version = 2;
  const restored = fromSnapshot(JSON.stringify(v2));
  assert.equal(restored.version, 4);
  assert.equal(restored.mode, 'encore');
  assert.deepEqual(restored.pocket, { depth: 0, avgOffsetMilli: 0 });
});
