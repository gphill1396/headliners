import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, faded, STAGE_LINE, step, type EngineState, type EnemyKind } from '../src/engine';
import { ENEMIES } from '../src/content/enemies';
import { BOSS_ORDER, bossForWave, MEDIC_HEAL_MAX } from '../src/engine/waves';
import { addEnemy, giveCard, nextBeat, noWaves, ofType, playOnBeat, runTicks, testState } from './helpers';

function field(seed = 'enemies-2c'): EngineState {
  const s = testState(seed);
  noWaves(s);
  return s;
}

function shot(s: EngineState, lane: number, extra: Partial<EngineState['projectiles'][number]> = {}) {
  const p = { id: s.nextId++, lane, x: 500, depth: STAGE_LINE, damage: 5, pierceLeft: 0, splash: false, gatesPassed: 0, sourceCardId: 't', ...extra };
  s.projectiles.push(p);
  return p;
}

test('Charger: creeps in slowly, then charges once it is close', () => {
  const s = field();
  const c = addEnemy(s, { kind: 'charger', lane: 0, depth: 10_000, speed: 100, hp: 999, maxHp: 999 });
  runTicks(s, 10);
  const slow = c.depth - 10_000;
  c.depth = 60_000;
  runTicks(s, 10);
  const fast = c.depth - 60_000;
  assert.equal(slow, 10 * 55);
  assert.equal(fast, 10 * 230);
});

test('Medic: heals the others in its lane every beat (capped), not other lanes', () => {
  const s = field();
  addEnemy(s, { kind: 'medic', lane: 1, depth: 30_000, hp: 30, maxHp: 30 });
  const small = addEnemy(s, { lane: 1, depth: 40_000, hp: 10, maxHp: 100 });
  const big = addEnemy(s, { lane: 1, depth: 41_000, hp: 100, maxHp: 1000 });
  const away = addEnemy(s, { lane: 2, depth: 40_000, hp: 10, maxHp: 100 });
  const ev = nextBeat(s);
  assert.equal(small.hp, 10 + ENEMIES.medic.healsPct!); // a % of 100
  assert.equal(big.hp, 100 + MEDIC_HEAL_MAX); // that % of 1000 is over the cap
  assert.equal(away.hp, 10);
  assert.equal(ofType(ev, 'healed').length, 1);
});

test('Nest: hatches 2 Swarmlings where it stands every few beats', () => {
  const s = field();
  addEnemy(s, { kind: 'nest', lane: 2, depth: 20_000, hp: 80, maxHp: 80 });
  let hatched = 0;
  const every = ENEMIES.nest.hatches!.everyBeats;
  let kids: EngineState['enemies'] = [];
  for (let b = 0; b < every * 3; b++) {
    const ev = ofType(nextBeat(s), 'hatched');
    hatched += ev.length;
    if (ev.length > 0) kids = s.enemies.filter((e) => e.kind === 'swarmling' && !kids.includes(e)).concat(kids);
  }
  assert.equal(hatched, 3);
  assert.equal(kids.length, 6);
  assert.ok(kids.every((k) => k.hatchedBy === 'nest'));
  assert.ok(kids.every((k) => k.lane === 2));
});

test('Ghost: shots pass through it on beats 2 and 4, and land on beats 1 and 3', () => {
  const s = field();
  const g = addEnemy(s, { kind: 'ghost', lane: 0, depth: 50_000, hp: 10_000, maxHp: 10_000 });
  let hitsWhileFaded = 0;
  let hitsWhileSolid = 0;
  for (let t = 0; t < 400; t++) {
    shot(s, 0, { depth: g.depth + 2_000 + 500, damage: 1 });
    const before = g.hp;
    step(s);
    if (g.hp < before) faded(s, g) ? hitsWhileFaded++ : hitsWhileSolid++;
  }
  assert.equal(hitsWhileFaded, 0);
  assert.ok(hitsWhileSolid > 100, `${hitsWhileSolid}`);
});

// ---------------------------------------------------------------- bosses

test('three bosses: The Hush, The Critic, Dead Air, in that order, every 10 waves', () => {
  assert.deepEqual(BOSS_ORDER, ['hush', 'critic', 'dead-air']);
  assert.equal(bossForWave(10), 'hush');
  assert.equal(bossForWave(20), 'critic');
  assert.equal(bossForWave(30), 'dead-air');
  assert.equal(bossForWave(40), 'hush');
});

/** A field with the boss of wave `index` on it, and nothing else. */
function bossField(index: number): { s: EngineState; boss: EngineState['enemies'][number] } {
  const s = createState({ seed: `boss-${index}` });
  s.energy = 10;
  s.crowd = 999;
  s.maxCrowd = 999;
  s.wave.index = index - 1;
  s.wave.startBeat = s.clock.beat - 100;
  for (let t = 0; t < 400 && !s.boss; t++) step(s, s.phase === 'picking' ? [{ type: 'pick', index: null }] : s.phase === 'evolving' ? [{ type: 'evolve', index: 0 }] : []);
  const boss = s.enemies.find((e) => e.id === s.boss?.enemyId)!;
  s.enemies = [boss];
  s.wave.nextSpawn = s.wave.spawns.length;
  return { s, boss };
}

test('The Critic: armored, then unimpressed (chain stops building), then calls Medics', () => {
  const { s, boss } = bossField(20);
  assert.equal(s.boss!.kind, 'critic');
  assert.equal(boss.armor, 6);
  // Phase 1 does not shield the others (that's The Hush).
  const other = addEnemy(s, { lane: 0, depth: 60_000, hp: 100, maxHp: 100 });
  shot(s, 0, { damage: 10 });
  runTicks(s, 20);
  assert.equal(other.hp, 90);
  s.enemies = [boss];

  boss.hp = boss.maxHp * 0.5;
  const phases = ofType(runTicks(s, 1), 'bossPhase');
  assert.deepEqual(phases.map((p) => [p.phase, p.boss]), [[2, 'critic']]);
  assert.equal(boss.armor, 0);
  giveCard(s, 'power-chord');
  playOnBeat(s, 'power-chord', 0);
  assert.equal(s.chain.links, 1); // a play still starts a chain...
  const held = s.chain.multPct;
  giveCard(s, 'power-chord');
  playOnBeat(s, 'power-chord', 1);
  giveCard(s, 'power-chord');
  playOnBeat(s, 'power-chord', 2);
  assert.equal(s.chain.links, 1); // ...but it doesn't grow
  assert.equal(s.chain.multPct, held);

  boss.hp = boss.maxHp * 0.2;
  runTicks(s, 1);
  assert.equal(s.boss!.phase, 3);
  for (let b = 0; b < 8; b++) nextBeat(s);
  assert.ok(s.enemies.some((e) => e.kind === 'medic'));
});

test('Dead Air: flies (plain shots pass under), lands and calls Ghosts, then everything rushes', () => {
  const { s, boss } = bossField(30);
  assert.equal(s.boss!.kind, 'dead-air');
  boss.depth = 20_000;
  const hp = boss.hp;
  shot(s, 1, { damage: 10 });
  runTicks(s, 40);
  assert.equal(boss.hp, hp);
  shot(s, 1, { damage: 10, antiAir: true });
  runTicks(s, 40);
  assert.equal(boss.hp, hp - 10);

  boss.hp = boss.maxHp * 0.5;
  runTicks(s, 1);
  assert.equal(s.boss!.phase, 2);
  shot(s, 1, { damage: 10 });
  runTicks(s, 40);
  assert.ok(boss.hp < boss.maxHp * 0.5);
  for (let b = 0; b < 8; b++) nextBeat(s);
  assert.ok(s.enemies.some((e) => e.kind === 'ghost'));

  boss.hp = boss.maxHp * 0.2;
  runTicks(s, 1);
  assert.equal(s.boss!.phase, 3);
  s.enemies = [boss];
  const walker = addEnemy(s, { lane: 0, depth: 10_000, speed: 100 });
  runTicks(s, 10);
  assert.equal(walker.depth - 10_000, 10 * 150);
});

test('Tour: each act has its own boss', () => {
  for (const act of [1, 2, 3]) {
    const s = createState({ seed: `tour-boss-${act}`, mode: 'tour' });
    s.tour!.act = act;
    s.tour!.at = s.tour!.nodes.find((n) => n.row === 4)!.id;
    step(s, [{ type: 'travel', node: s.tour!.nodes.find((n) => n.kind === 'boss')!.id }]);
    let seen: string | undefined;
    for (let t = 0; t < 60 * 60 * 5 && s.phase === 'playing' && !seen; t++) {
      seen = s.boss?.kind;
      for (const e of s.enemies) e.hp = 0;
      step(s);
    }
    assert.equal(seen, (['hush', 'critic', 'dead-air'] as const)[act - 1], `act ${act}`);
  }
});

test('Feedback cards say what they cost: a crowdCost event, not a silent loss', () => {
  const s = field();
  const crowd = s.crowd;
  giveCard(s, 'feedback-loop');
  const ev = playOnBeat(s, 'feedback-loop', 1);
  const cost = ofType(ev, 'crowdCost');
  assert.equal(cost.length, 1);
  assert.equal(cost[0]!.amount, 1);
  assert.equal(s.crowd, crowd - 1);
  assert.equal(s.stats.leaks, 0);
});
