import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, tourBoss, type EngineState } from '../src/engine';
import { GALE_EVERY_BEATS, LIGHTNING_DAMAGE, LIGHTNING_EVERY_BEATS, laneFirepower, DEBUT_WAVE } from '../src/engine/waves';
import { addEnemy, countShots, nextBeat, noWaves, ofType, playOnBeat, testState } from './helpers';

/** Content pass 2e (SPEC S2.7, S2.8): the Boggart, the Mire Golem and The Tempest. */

function beatsWith(s: EngineState, n: number) {
  const ev = [];
  for (let i = 0; i < n; i++) ev.push(...nextBeat(s));
  return ev;
}

test('a Boggart hops every 4 beats, to the neighbouring lane with less firepower', () => {
  const s = testState('boggart');
  noWaves(s);
  playOnBeat(s, 'bassline', 0);
  const b = addEnemy(s, { kind: 'boggart', lane: 1, depth: 10_000, hp: 10_000, maxHp: 10_000 });
  assert.ok(laneFirepower(s, 0) > laneFirepower(s, 2));
  const ev = beatsWith(s, 4);
  const hops = ofType(ev, 'hopped');
  assert.equal(hops.length, 1);
  assert.equal(hops[0]!.to, 2, 'away from the Bass Viol');
  assert.equal(b.lane, 2);
  // From an edge lane there's only one way to go.
  beatsWith(s, 4);
  assert.equal(b.lane, 1);
});

test('a turning unit counts toward the lanes it shoots into', () => {
  const s = testState('firepower');
  noWaves(s);
  playOnBeat(s, 'herald', 0);
  assert.equal(laneFirepower(s, 0), 0);
  assert.ok(laneFirepower(s, 1) > 0);
});

test('a Mire Golem halves the fire of units in its lane, and only there', () => {
  const shots = (golem: boolean) => {
    const s = testState(`golem-${golem}`);
    noWaves(s);
    playOnBeat(s, 'stagehand', 0);
    playOnBeat(s, 'stagehand', 2);
    nextBeat(s);
    if (golem) addEnemy(s, { kind: 'golem', lane: 0, depth: 5_000, hp: 100_000, maxHp: 100_000 });
    const seen = new Set(s.projectiles.map((p) => p.id));
    const by = [0, 0, 0];
    for (let i = 0; i < 8; i++) {
      nextBeat(s);
      for (const p of s.projectiles) if (!seen.has(p.id)) { seen.add(p.id); by[p.lane]! += 1; }
    }
    return by;
  };
  const free = shots(false);
  const bogged = shots(true);
  assert.equal(bogged[2], free[2], 'the other lane is untouched');
  assert.ok(bogged[0]! * 2 <= free[0]! + 1 && bogged[0]! > 0, `bogged ${bogged[0]}, free ${free[0]}`);
  void countShots;
});

test('they debut on waves 15 and 17', () => {
  assert.equal(DEBUT_WAVE.boggart, 15);
  assert.equal(DEBUT_WAVE.golem, 17);
});

function tempest(seed: string) {
  const s = testState(seed);
  noWaves(s);
  const boss = addEnemy(s, { kind: 'tempest', lane: 1, depth: 0, hp: 1_500, maxHp: 1_500 });
  s.boss = { enemyId: boss.id, kind: 'tempest', phase: 1, nextBruteBeat: 0 };
  s.mode = 'encore';
  return { s, boss };
}

test('The Tempest, Gale: warns a beat ahead, then swaps two lanes of your band', () => {
  const { s } = tempest('gale');
  playOnBeat(s, 'stagehand', 0);
  playOnBeat(s, 'stagehand', 0);
  const before = s.units.map((u) => u.lane);
  const ev = beatsWith(s, GALE_EVERY_BEATS + 2);
  const warn = ofType(ev, 'galeWarning');
  const gale = ofType(ev, 'gale');
  assert.equal(warn.length >= 1, true);
  assert.equal(gale.length >= 1, true);
  assert.equal(warn[0]!.from, 0, 'the lane with the most of the band');
  assert.deepEqual([gale[0]!.from, gale[0]!.to], [warn[0]!.from, warn[0]!.to]);
  assert.ok(ev.indexOf(warn[0]!) < ev.indexOf(gale[0]!));
  assert.notDeepEqual(s.units.map((u) => u.lane), before);
  assert.equal(s.gates.length, 0);
});

test('The Tempest, Lightning: every 6 beats it strikes the sturdiest gate', () => {
  const { s, boss } = tempest('lightning');
  playOnBeat(s, 'double-stop', 0); // 40
  playOnBeat(s, 'harmonizer', 2); // 24
  boss.hp = 900; // phase 2
  const sturdy = s.gates.find((g) => g.cardId === 'double-stop')!;
  const full = sturdy.durability;
  const ev = beatsWith(s, LIGHTNING_EVERY_BEATS + 2);
  assert.equal(s.boss!.phase, 2);
  const bolts = ofType(ev, 'lightning');
  assert.ok(bolts.length >= 1);
  assert.equal(bolts[0]!.gateId, sturdy.id);
  assert.equal(sturdy.durability, full - LIGHTNING_DAMAGE * bolts.filter((b) => b.gateId === sturdy.id).length);
  assert.equal(ofType(ev, 'gale').length, 0, 'the gale stops in phase 2');
});

test('The Tempest, Squall: calls Boggarts', () => {
  const { s, boss } = tempest('squall');
  boss.hp = 300; // phase 3
  beatsWith(s, 8);
  assert.equal(s.boss!.phase, 3);
  assert.ok(s.enemies.some((e) => e.kind === 'boggart'));
});

test('Tour: The Tempest takes act 2 from Heat 4; the other acts keep their bosses', () => {
  assert.equal(tourBoss(1, 10), 'hush');
  assert.equal(tourBoss(2, 3), 'critic');
  assert.equal(tourBoss(2, 4), 'tempest');
  assert.equal(tourBoss(3, 10), 'dead-air');
  void createState;
  void step;
});
