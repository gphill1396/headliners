import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BEATS_PER_BAR, SHIFT_COST, STAGE_LINE, step, type EngineState } from '../src/engine';
import { HEADLINERS } from '../src/content/headliners';
import { TEAM_CARDS } from '../src/content/cards';
import { addEnemy, nextBeat, noWaves, ofType, playOnBeat, runTicks, testState } from './helpers';

/** Content pass 2d: Fanfare, the griffin herald (SPEC S2.5). */

function as(h: 'fanfare' | 'thrum', evolution: 0 | 1 | null = null, seed = `${h}-${evolution}`): EngineState {
  const s = testState(seed);
  s.headliner.id = h;
  s.headliner.evolution = evolution;
  noWaves(s);
  return s;
}

/** Fire one 10-damage shot up `lane` from the stage and return the enemy it should meet one lane over. */
function throughHorn(s: EngineState) {
  playOnBeat(s, 'side-fill', 0); // a Horn in the left lane turns shots into the middle
  s.projectiles = [];
  const target = addEnemy(s, { lane: 1, depth: 20_000, hp: 1_000, maxHp: 1_000 });
  const behind = addEnemy(s, { lane: 1, depth: 10_000, hp: 1_000, maxHp: 1_000 });
  s.projectiles.push({ id: s.nextId++, lane: 0, x: 500, depth: STAGE_LINE, damage: 10, pierceLeft: 0, splash: false, gatesPassed: 0, sourceCardId: 't' });
  runTicks(s, 60);
  return { target, behind };
}

test('her passive: a shot that turns lanes gains +3 damage and Pierce 1', () => {
  const plain = throughHorn(as('thrum'));
  assert.equal(1_000 - plain.target.hp, 10);
  assert.equal(plain.behind.hp, 1_000);
  const herald = throughHorn(as('fanfare'));
  assert.equal(1_000 - herald.target.hp, 13);
  assert.ok(herald.behind.hp < 1_000, 'it pierces through to the next one');
});

test('Crossfire: turned shots also hit flyers and ignore armor', () => {
  const s = as('fanfare', 0);
  playOnBeat(s, 'side-fill', 0);
  s.projectiles = [];
  const ogre = addEnemy(s, { lane: 1, depth: 20_000, hp: 1_000, maxHp: 1_000, armor: 5 });
  s.projectiles.push({ id: s.nextId++, lane: 0, x: 500, depth: STAGE_LINE, damage: 10, pierceLeft: 0, splash: false, gatesPassed: 0, sourceCardId: 't' });
  runTicks(s, 60);
  assert.equal(1_000 - ogre.hp, 13, 'no armor taken off');
  assert.equal(HEADLINERS.fanfare.evolutions[0].id, 'crossfire');
});

test('her ability: for 2 beats every shot fans out, one up each lane', () => {
  const s = as('fanfare');
  playOnBeat(s, 'stagehand', 1);
  s.projectiles = [];
  const lanes = [0, 1, 2].map((lane) => addEnemy(s, { lane, depth: 30_000, hp: 1_000, maxHp: 1_000 }));
  s.headliner.activeUntilBeat = s.clock.beat + 2;
  nextBeat(s);
  runTicks(s, 60);
  for (const e of lanes) assert.ok(e.hp < 1_000, `lane ${e.lane}`);
});

test('without her ability, a plain unit only fires up its own lane', () => {
  const s = as('fanfare', null, 'no-fan');
  playOnBeat(s, 'stagehand', 1);
  s.projectiles = [];
  const side = addEnemy(s, { lane: 0, depth: 30_000, hp: 1_000, maxHp: 1_000 });
  for (let i = 0; i < 4; i++) nextBeat(s);
  assert.equal(side.hp, 1_000);
});

test('Royal Decree: a Shift costs nothing and the band keeps playing as it moves', () => {
  const s = as('fanfare', 1);
  playOnBeat(s, 'stagehand', 0);
  while (s.clock.beat % BEATS_PER_BAR !== 0) nextBeat(s);
  s.energy = 5;
  const ev = step(s, [{ type: 'shift', from: 0, to: 2 }]);
  assert.equal(ofType(ev, 'shifted').length, 1);
  assert.equal(s.energy >= 5, true, 'no energy spent');
  const unit = s.units[0]!;
  assert.ok(unit.movedUntilBeat! <= s.clock.beat, 'no pause in firing');

  const plain = as('fanfare', 0, 'no-decree');
  playOnBeat(plain, 'stagehand', 0);
  while (plain.clock.beat % BEATS_PER_BAR !== 0) nextBeat(plain);
  plain.energy = 5;
  step(plain, [{ type: 'shift', from: 0, to: 2 }]);
  assert.ok(plain.energy <= 5 - SHIFT_COST + 1);
});

test('Call to Arms: the lane fires, and those shots turn', () => {
  const s = as('thrum', null, 'call');
  playOnBeat(s, 'stagehand', 0);
  s.projectiles = [];
  playOnBeat(s, 'call-to-arms', 0);
  const turned = s.projectiles.filter((p) => p.side);
  assert.ok(turned.length >= 1);
  assert.ok(turned.every((p) => p.lane === 1), 'from the left lane they turn into the middle');
});

test('Processional rallies only units behind a Horn, and turning units', () => {
  const s = as('fanfare', null, 'processional');
  playOnBeat(s, 'stagehand', 0);
  playOnBeat(s, 'side-fill', 0);
  playOnBeat(s, 'stagehand', 2);
  playOnBeat(s, 'herald', 1);
  playOnBeat(s, 'processional', 1);
  while (s.clock.beat % BEATS_PER_BAR !== BEATS_PER_BAR - 1) nextBeat(s);
  s.projectiles = [];
  const ev = nextBeat(s);
  const rallied = new Set(ofType(ev, 'link').map((e) => e.cardId));
  assert.ok(rallied.has('processional'));
  // The lone Page in the right lane, with no Horn, doesn't join in on top of its own beat.
  const fromRight = s.projectiles.filter((p) => p.sourceCardId === 'stagehand' && p.lane === 2).length;
  const fromLeft = s.projectiles.filter((p) => p.sourceCardId === 'stagehand' && p.lane !== 2).length;
  assert.ok(fromLeft > fromRight, `left ${fromLeft}, right ${fromRight}`);
});

test("her team cards are her core, her flyer answer and her priority answer", () => {
  assert.deepEqual([...TEAM_CARDS.fanfare], ['herald', 'hunting-horn', 'summons']);
});
