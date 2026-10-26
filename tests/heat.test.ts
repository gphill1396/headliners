import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, reachable, step, type EngineState, type HeadlinerId, type TourNodeKind } from '../src/engine';
import { HEAT_RULES, MAX_HEAT, heatRules } from '../src/content/heat';
import { emptyCollection, normalizeCollection, recordRunInCollection, unlockedHeat } from '../src/meta/collection';
import { HEAT_BOSS_HP, HEAT_ELITE_HP, HEAT_HP, HEAT_REST_HEAL, HEAT_SPEED_PCT, TOUR_ELITE_HP, TOUR_PRICES, TOUR_REST_HEAL } from '../src/engine/constants';
import { getCard } from '../src/content/cards';

const TEAM: HeadlinerId[] = ['thrum', 'lyra', 'clatter'];

function tour(heat: number, seed = `heat-${heat}`): EngineState {
  return createState({ seed, mode: 'tour', team: TEAM, heat });
}

function goTo(s: EngineState, kind: TourNodeKind): void {
  const id = reachable(s)[0]!;
  s.tour!.nodes.find((n) => n.id === id)!.kind = kind;
  step(s, [{ type: 'travel', node: id }]);
}

/** Travel to a fight and run until its first monsters are out. */
function firstMonsters(s: EngineState, kind: TourNodeKind = 'fight') {
  goTo(s, kind);
  for (let t = 0; t < 60 * 60 && s.enemies.length === 0; t++) step(s);
  return s.enemies;
}

test('ten Heat rules, one per tier, added in order', () => {
  assert.equal(HEAT_RULES.length, MAX_HEAT);
  assert.deepEqual(heatRules(0), []);
  assert.equal(heatRules(3).length, 3);
  assert.equal(heatRules(99).length, MAX_HEAT);
});

test('Heat 1: start with 25 crowd', () => {
  assert.equal(tour(0).crowd, 30);
  assert.equal(tour(1).crowd, 25);
  assert.equal(tour(1).tour!.heat, 1);
});

test('Heat 2: monsters have 15% more health; Heat 7: they walk 15% faster; Heat 8: leaks cost 1 more', () => {
  const a = firstMonsters(tour(0, 'same'))[0]!;
  const b = firstMonsters(tour(2, 'same'))[0]!;
  const c = firstMonsters(tour(8, 'same'))[0]!;
  assert.equal(a.kind, b.kind);
  assert.ok(Math.abs(b.maxHp - a.maxHp * HEAT_HP) < 1e-9);
  assert.ok(c.speed > a.speed && c.speed <= Math.ceil((a.speed * HEAT_SPEED_PCT) / 100));
  assert.equal(c.crowdDamage, a.crowdDamage + 1);
  assert.equal(b.crowdDamage, a.crowdDamage);
});

test('Heat 4: Market cards cost 25% more', () => {
  const s = tour(4);
  goTo(s, 'shop');
  for (const item of s.tour!.shop!.cards) {
    const def = getCard(item.cardId);
    const base = TOUR_PRICES[def.rarity] + (def.headliner ? 5 : 0);
    assert.equal(item.price, Math.round((base * 5) / 4));
  }
});

test('Heat 5: Inns win back less crowd', () => {
  for (const [heat, heal] of [[0, TOUR_REST_HEAL], [5, HEAT_REST_HEAL]] as const) {
    const s = tour(heat);
    s.crowd = 5;
    goTo(s, 'rest');
    step(s, [{ type: 'rest', choice: 'heal' }]);
    assert.equal(s.crowd, 5 + heal, `heat ${heat}`);
  }
});

test('Heat 9: card picks offer 2 cards', () => {
  for (const [heat, n] of [[0, 3], [9, 2]] as const) {
    const s = tour(heat);
    goTo(s, 'draft');
    assert.equal(s.pick.length, n, `heat ${heat}`);
  }
});

test('Heat 6: bosses have 35% more health; Heat 10: every show is as tough as a Tournament', () => {
  const bossHp = (heat: number) => {
    const s = tour(heat, 'boss');
    s.tour!.at = s.tour!.nodes.find((n) => n.row === 4)!.id;
    step(s, [{ type: 'travel', node: s.tour!.nodes.find((n) => n.kind === 'boss')!.id }]);
    for (let t = 0; t < 60 * 60 * 5 && !s.boss; t++) {
      for (const e of s.enemies) e.hp = 0;
      step(s);
    }
    return s.enemies.find((e) => e.id === s.boss!.enemyId)!;
  };
  assert.ok(Math.abs(bossHp(6).maxHp - bossHp(0).maxHp * HEAT_BOSS_HP * HEAT_HP) < 1e-6); // Heat 2 is in force too
  const showHp = (heat: number) => {
    const s = tour(heat, 'show');
    goTo(s, 'fight');
    for (let t = 0; t < 60 * 60 && s.wave.index === 0; t++) step(s);
    return s.wave.hpMult;
  };
  assert.ok(Math.abs(showHp(10) / showHp(9) - TOUR_ELITE_HP * HEAT_ELITE_HP) < 1e-9);
});

test('winning a Tour clears that Heat for every member, and unlocks the next', () => {
  let c = emptyCollection();
  assert.equal(unlockedHeat(c), 0);
  const s = tour(0);
  s.phase = 'won';
  c = recordRunInCollection(c, s).collection;
  for (const h of TEAM) assert.equal(c.headliners[h].heat, 0);
  assert.equal(c.headliners.aria.heat, undefined);
  assert.equal(unlockedHeat(c), 1);
  const t = tour(3);
  t.phase = 'over'; // a loss clears nothing
  c = recordRunInCollection(c, t).collection;
  assert.equal(unlockedHeat(c), 1);
  // Survives a save round-trip.
  assert.equal(normalizeCollection(JSON.parse(JSON.stringify(c))).headliners.thrum.heat, 0);
});
