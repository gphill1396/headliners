import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GATE_DEPTHS, type CardDef, type Effect, type EngineState } from '../src/engine';
import { createCtx } from '../src/engine/context';
import { lanesFor, runEffects } from '../src/engine/effects';
import { cardText } from '../src/content/text';
import { addEnemy, nextBeat, noWaves, playOnBeat, testState } from './helpers';

/** Content pass 2d (SPEC): the new engine parts, tested on their own before any card uses them. */

function run(s: EngineState, effects: Effect[], lane: number) {
  const ctx = createCtx();
  runEffects(s, ctx, effects, { cardId: 'test', lane, multPct: 100, unit: null });
  return ctx.events;
}

function beats(s: EngineState, n: number) {
  for (let i = 0; i < n; i++) nextBeat(s);
}

test('a turning unit sends its shots into the next lane, in from the side', () => {
  const s = testState('turns');
  noWaves(s);
  playOnBeat(s, 'stagehand', 0);
  s.units[0]!.turns = true;
  s.projectiles = []; // shots already in the air before it learned to turn
  const own = addEnemy(s, { lane: 0, depth: 30_000, hp: 1_000, maxHp: 1_000 });
  const next = addEnemy(s, { lane: 1, depth: 30_000, hp: 1_000, maxHp: 1_000 });
  beats(s, 4);
  assert.equal(own.hp, 1_000, 'its own lane is left alone');
  assert.ok(next.hp < 1_000, 'the lane beside it is hit');
});

test('a turning unit in the middle alternates left and right', () => {
  const s = testState('turns-mid');
  noWaves(s);
  playOnBeat(s, 'stagehand', 1);
  s.units[0]!.turns = true;
  s.projectiles = [];
  const left = addEnemy(s, { lane: 0, depth: 30_000, hp: 1_000, maxHp: 1_000 });
  const mid = addEnemy(s, { lane: 1, depth: 30_000, hp: 1_000, maxHp: 1_000 });
  const right = addEnemy(s, { lane: 2, depth: 30_000, hp: 1_000, maxHp: 1_000 });
  beats(s, 6);
  assert.equal(mid.hp, 1_000);
  assert.ok(left.hp < 1_000 && right.hp < 1_000, 'both sides are hit');
});

test('turned shots come in from the side and get past a shield', () => {
  const s = testState('turns-shield');
  noWaves(s);
  playOnBeat(s, 'stagehand', 0);
  s.units[0]!.turns = true;
  const shielded = addEnemy(s, { lane: 1, depth: 30_000, hp: 1_000, maxHp: 1_000, kind: 'shieldbearer', shieldLeft: 50 });
  beats(s, 4);
  assert.equal(shielded.shieldLeft, 50, 'the shield never blocks');
  assert.ok(shielded.hp < 1_000);
});

function fanGate(s: EngineState, lane: number, durability: number) {
  s.gates.push({
    id: s.nextId++,
    card: { iid: -1, cardId: 'double-stop' },
    cardId: 'double-stop',
    lane,
    slot: 0,
    depth: GATE_DEPTHS[0]!,
    kind: 'fan',
    amount: 1,
    durability,
    maxDurability: durability,
    placedBeat: s.clock.beat,
  });
}

test('a fan gate sends each shot up every lane and wears 3 durability a shot', () => {
  const s = testState('fan');
  noWaves(s);
  playOnBeat(s, 'stagehand', 1);
  fanGate(s, 1, 60);
  const lanes = [0, 1, 2].map((lane) => addEnemy(s, { lane, depth: 30_000, hp: 1_000, maxHp: 1_000 }));
  beats(s, 4);
  for (const e of lanes) assert.ok(e.hp < 1_000, `lane ${e.lane} is hit`);
  const gate = s.gates[0]!;
  assert.equal((60 - gate.durability) % 3, 0, 'durability goes down in threes');
  assert.ok(gate.durability < 60);
});

test("'beside' reaches this lane and its neighbours only", () => {
  assert.deepEqual(lanesFor('beside', 0), [0, 1]);
  assert.deepEqual(lanesFor('beside', 1), [0, 1, 2]);
  assert.deepEqual(lanesFor('beside', 2), [1, 2]);
  assert.deepEqual(lanesFor('lane', 2), [2]);
  assert.deepEqual(lanesFor('all', 0), [0, 1, 2]);
});

test("damageLane 'beside' hits two lanes from the edge, not the far one", () => {
  const s = testState('beside-lane');
  noWaves(s);
  const [a, b, c] = [0, 1, 2].map((lane) => addEnemy(s, { lane, depth: 30_000 }));
  run(s, [{ do: 'damageLane', amount: 10, scope: 'beside' }], 0);
  assert.equal(a!.hp, 90);
  assert.equal(b!.hp, 90);
  assert.equal(c!.hp, 100);
});

test("damageFront 'beside' takes one enemy per lane, and a boss across the lanes only once", () => {
  const s = testState('beside-front');
  noWaves(s);
  const boss = addEnemy(s, { lane: 1, depth: 40_000, kind: 'hush', hp: 1_000, maxHp: 1_000 });
  run(s, [{ do: 'damageFront', amount: 10, scope: 'beside' }], 1);
  assert.equal(boss.hp, 990);
  const back = addEnemy(s, { lane: 0, depth: 10_000 });
  const front = addEnemy(s, { lane: 2, depth: 80_000 });
  run(s, [{ do: 'damageFront', amount: 10, scope: 'beside' }], 1);
  assert.equal(front.hp, 90, 'the enemy ahead of the boss in its lane is hit');
  assert.equal(back.hp, 100, 'the boss is in front of this one');
  assert.equal(boss.hp, 980, 'the boss is front in two lanes but hit only once more');
});

test('without a scope, damage effects still stay in their own lane', () => {
  const s = testState('lane-default');
  noWaves(s);
  const [a, b] = [0, 1].map((lane) => addEnemy(s, { lane, depth: 30_000 }));
  run(s, [{ do: 'damageLane', amount: 10 }, { do: 'damageFront', amount: 5 }], 0);
  assert.equal(a!.hp, 85);
  assert.equal(b!.hp, 100);
});

test('squireTime keeps Squires longer, but never past twice their stay', () => {
  const s = testState('squire-time');
  noWaves(s);
  run(s, [{ do: 'roadie', count: 1 }], 0);
  const squire = s.units.find((u) => u.token)!;
  const placed = squire.placedBeat;
  assert.equal(squire.expiresBeat, placed + 10);
  run(s, [{ do: 'squireTime', beats: 2 }], 1);
  assert.equal(squire.expiresBeat, placed + 12, 'Squires in any lane stay longer');
  for (let i = 0; i < 10; i++) run(s, [{ do: 'squireTime', beats: 2 }], 1);
  assert.equal(squire.expiresBeat, placed + 20);
});

test('squireTime leaves real units alone', () => {
  const s = testState('squire-time-units');
  noWaves(s);
  playOnBeat(s, 'stagehand', 0);
  run(s, [{ do: 'squireTime', beats: 2 }], 0);
  assert.equal(s.units[0]!.expiresBeat, -1);
});

test('rules text covers the new parts', () => {
  const base = { id: 'x', name: 'X', cost: 1, rarity: 'common' as const, keywords: [], short: '', flavor: '' };
  const herald: CardDef = { ...base, type: 'unit', unit: { damage: 3, fireEvery: 2, turns: true } };
  assert.match(cardText(herald), /turn into the next lane/);
  const bell: CardDef = { ...base, type: 'gate', gate: { kind: 'fan', amount: 1, durability: 30 } };
  assert.match(cardText(bell), /becomes 3, one up each lane/);
  const ricochet: CardDef = { ...base, type: 'riff', onPlay: [{ do: 'damageLane', amount: 4, scope: 'beside' }] };
  assert.equal(cardText(ricochet), 'Riff. Deal 4 to every enemy in this lane and the lanes beside it.');
  const oath: CardDef = { ...base, type: 'amp', triggers: [{ when: 'downbeat', link: false, effects: [{ do: 'squireTime', beats: 2 }] }] };
  assert.equal(cardText(oath), 'Amp. On every beat 1: Squires on stage stay 2 beats longer (never more than twice their usual stay).');
});
