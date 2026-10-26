import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CARDS, getCard, STAGE_LINE, step } from '../src/engine';
import { pickPool, STARTER_DECKS } from '../src/content/cards';
import { ENEMIES } from '../src/content/enemies';
import { addEnemy, nextBeat, noWaves, playOnBeat, runTicks, testState, toBeatEdge, giveCard } from './helpers';

const HEADLINERS = ['thrum', 'lyra', 'clatter'] as const;

test('the full Phase 1 set: about 40 cards, 9 signature cards per headliner, 12-card starter decks', () => {
  const real = CARDS.filter((c) => c.rarity !== 'token');
  assert.ok(real.length >= 40, `${real.length} cards`);
  for (const h of HEADLINERS) {
    assert.equal(real.filter((c) => c.headliner === h).length, 9, h);
    assert.equal(STARTER_DECKS[h].length, 12, h);
    for (const id of STARTER_DECKS[h]) assert.ok(getCard(id), id);
  }
  // Every card has the text a player needs.
  for (const c of real) assert.ok(c.text.length > 10 && c.short.length > 2 && c.flavor.length > 2, c.id);
});

test('every enemy has at least two answers available to every headliner', () => {
  for (const h of HEADLINERS) {
    const reachable = new Set([...pickPool(h), ...STARTER_DECKS[h]]);
    for (const [kind, def] of Object.entries(ENEMIES)) {
      if (!def.answers) continue;
      const n = def.answers.filter((id) => reachable.has(id)).length;
      assert.ok(n >= 2, `${h} has ${n} answers to ${kind}`);
    }
  }
});

test('Volume: Hype Man gains +1 damage for good on every beat 1, up to 20', () => {
  const s = testState('volume');
  noWaves(s);
  playOnBeat(s, 'hype-man', 0);
  const unit = s.units[0]!;
  const base = unit.damage;
  for (let b = 0; b < 8; b++) nextBeat(s);
  assert.equal(unit.damage, base + 2);
  assert.equal(unit.volume, 2);
  for (let b = 0; b < 200; b++) nextBeat(s);
  assert.equal(unit.volume, 20);
});

test('Downbeat bonus: Mic Drop hits much harder when it lands on beat 1', () => {
  const hitOn = (downbeat: boolean) => {
    const s = testState(`mic-${downbeat}`);
    noWaves(s);
    const e = addEnemy(s, { lane: 1, depth: 30_000, hp: 1_000, maxHp: 1_000 });
    // Walk to the edge of a beat that is (or isn't) beat 1.
    for (;;) {
      toBeatEdge(s);
      if (((s.clock.beat + 1) % 4 === 0) === downbeat) break;
      step(s);
    }
    const iid = giveCard(s, 'mic-drop');
    step(s, [{ type: 'commit', iid, lane: 1, permille: 0 }]);
    return 1_000 - e.hp;
  };
  const on = hitOn(true);
  const off = hitOn(false);
  assert.ok(on > off * 2, `on ${on}, off ${off}`);
});

test('Heckle and Rimshot go for a Breaker or Hexer before the front enemy', () => {
  const s = testState('heckle');
  noWaves(s);
  const front = addEnemy(s, { lane: 2, depth: 70_000, hp: 500, maxHp: 500 });
  const br = addEnemy(s, { kind: 'breaker', lane: 2, depth: 20_000, hp: 500, maxHp: 500, armor: 0 });
  playOnBeat(s, 'heckle', 2);
  assert.equal(front.hp, 500);
  assert.ok(br.hp < 500);
});

test('Cymbal Crash hits only flyers, wherever they are', () => {
  const s = testState('cymbal');
  noWaves(s);
  const bat = addEnemy(s, { kind: 'bat', lane: 0, depth: 10_000, hp: 100, maxHp: 100 });
  const walker = addEnemy(s, { lane: 2, depth: 10_000, hp: 100, maxHp: 100 });
  playOnBeat(s, 'cymbal-crash', 1);
  assert.ok(bat.hp < 100);
  assert.equal(walker.hp, 100);
});

test('Crew Call puts a Roadie in every lane; Riser and Falsetto give shots Anti-Air', () => {
  const s = testState('crew-call', 100);
  s.headliner.id = 'clatter';
  noWaves(s);
  playOnBeat(s, 'crew-call', 0);
  // (plus the Tight-hit Roadie from Clatter's passive in the lane it was played in)
  assert.deepEqual([...new Set(s.units.filter((u) => u.cardId === 'roadie').map((u) => u.lane))].sort(), [0, 1, 2]);

  for (const gate of ['riser', 'falsetto']) {
    const t = testState(gate);
    noWaves(t);
    playOnBeat(t, gate, 1);
    const bat = addEnemy(t, { kind: 'bat', lane: 1, depth: 20_000, hp: 100, maxHp: 100 });
    t.projectiles = [{ id: t.nextId++, lane: 1, x: 500, depth: STAGE_LINE, damage: 5, pierceLeft: 0, splash: false, gatesPassed: 0, sourceCardId: 't' }];
    runTicks(t, 40);
    assert.ok(bat.hp < 100, gate);
  }
});
