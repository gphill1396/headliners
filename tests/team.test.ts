import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, deckCards, hashState, fromSnapshot, STAGE_LINE, step, toSnapshot, type EngineState, type HeadlinerId } from '../src/engine';
import { pickPool, TEAM_CARDS, TEAM_CORE, teamStarterDeck, getCard } from '../src/content/cards';
import { evolvedInto, hasMember, teamOf } from '../src/engine/evolution';
import { emptyCollection, recordRunInCollection } from '../src/meta/collection';
import { addEnemy, noWaves, ofType, playOnBeat, runTicks, toBeatEdge } from './helpers';

const TEAM: HeadlinerId[] = ['thrum', 'lyra', 'clatter'];

function teamTour(team: HeadlinerId[] = TEAM, seed = 'team'): EngineState {
  return createState({ seed, mode: 'tour', team });
}

/** A team on an empty field, playing (no Tour map in the way). */
function teamField(team: HeadlinerId[] = TEAM, seed = 'team-field'): EngineState {
  const s = createState({ seed, team });
  s.energy = 10;
  noWaves(s);
  return s;
}

test('a team Tour: three members, the first leads, and a 12-card starter deck from all three', () => {
  const s = teamTour();
  assert.deepEqual(teamOf(s), TEAM);
  assert.equal(s.headliner.id, 'thrum');
  const deck = deckCards(s).map((c) => c.cardId).sort();
  assert.deepEqual(deck, teamStarterDeck(TEAM).sort());
  assert.equal(deck.length, 12);
  for (const h of TEAM) for (const id of TEAM_CARDS[h]) assert.equal(getCard(id).headliner, h, id);
  for (const id of TEAM_CORE) assert.equal(getCard(id).headliner, undefined, id);
});

test('every headliner brings an answer to flyers and to priority targets', () => {
  for (const [h, [, flyer, priority]] of Object.entries(TEAM_CARDS)) {
    const f = getCard(flyer);
    const p = getCard(priority);
    const hitsFlyers = f.unit?.antiAir || f.gate?.kind === 'lift' || JSON.stringify(f.onPlay ?? []).includes('flying');
    const seeks = p.unit?.priority || JSON.stringify(p.onPlay ?? []).includes('priority');
    assert.ok(hitsFlyers, `${h}: ${flyer}`);
    assert.ok(seeks, `${h}: ${priority}`);
  }
});

test("picks draw from every member's signature cards, and no one else's", () => {
  const pool = pickPool(TEAM);
  for (const h of TEAM) assert.ok(pool.some((id) => getCard(id).headliner === h), h);
  assert.ok(!pool.some((id) => getCard(id).headliner === 'aria' || getCard(id).headliner === 'riot'));
});

test('all three passives are on, whoever leads', () => {
  const s = teamField();
  assert.ok(hasMember(s, 'lyra') && hasMember(s, 'clatter') && !hasMember(s, 'aria'));
  // Lyra's passive (+1 per gate) with Thrum leading.
  playOnBeat(s, 'distortion', 0);
  const e = addEnemy(s, { lane: 0, depth: 30_000, hp: 1_000, maxHp: 1_000 });
  s.projectiles.push({ id: s.nextId++, lane: 0, x: 500, depth: STAGE_LINE, damage: 10, pierceLeft: 0, splash: false, gatesPassed: 0, sourceCardId: 't' });
  runTicks(s, 60);
  // (Count only this shot: Clatter's passive also called a Squire on that Tight play.)
  assert.ok(e.hp < 1_000);
  assert.equal(s.stats.damageBySource.t, 10 + 5 + 1);
  // Thrum's and Clatter's Tight passives both pay out on the same Tight hit.
  const t = teamField(TEAM, 'tight');
  t.energy = 5;
  t.headliner.lastTightBonusBar = -1;
  const ev = playOnBeat(t, 'stagehand', 2);
  assert.equal(ofType(ev, 'energy').filter((x) => x.reason === 'tight').length, 1);
  assert.ok(t.units.some((u) => u.token && u.lane === 2));
});

test('the lead fires the ability; switching is free, shares the cooldown, and waits for a running ability', () => {
  const s = teamField();
  toBeatEdge(s);
  const fill = ofType(step(s, [{ type: 'activate', permille: 0 }]), 'fill')[0]!;
  assert.equal(fill.headliner, 'thrum');
  // Fill is still running: no switching.
  const busy = ofType(step(s, [{ type: 'lead', headliner: 'clatter' }]), 'rejected');
  assert.equal(busy[0]?.reason, 'busy');
  assert.equal(s.headliner.id, 'thrum');
  runTicks(s, 300);
  const switched = ofType(step(s, [{ type: 'lead', headliner: 'clatter' }]), 'lead');
  assert.equal(switched[0]?.headliner, 'clatter');
  // Shared cooldown: Clatter's All Hands isn't ready just because the lead changed.
  assert.ok(s.clock.beat < s.headliner.readyBeat);
  assert.equal(ofType(step(s, [{ type: 'activate', permille: 0 }]), 'rejected')[0]?.reason, 'cooldown');
  // Can't lead with someone who isn't on the team.
  step(s, [{ type: 'lead', headliner: 'aria' }]);
  assert.equal(s.headliner.id, 'clatter');
});

test('team Tour: after the act 1 and act 2 bosses, you choose which member evolves', () => {
  const s = teamTour();
  for (const act of [1, 2]) {
    s.tour!.at = s.tour!.nodes.find((n) => n.row === 4)!.id;
    step(s, [{ type: 'travel', node: s.tour!.nodes.find((n) => n.kind === 'boss')!.id }]);
    for (let t = 0; t < 60 * 60 * 5 && s.phase === 'playing'; t++) {
      for (const e of s.enemies) e.hp = 0;
      step(s);
    }
    assert.equal(s.phase, 'picking', `act ${act}`);
    step(s, [{ type: 'pick', index: null }]);
    assert.equal(s.phase, 'evolving', `act ${act}`);
    // Someone not on the team, or already evolved, can't be chosen.
    step(s, [{ type: 'evolve', index: 0, headliner: 'aria' }]);
    assert.equal(s.phase, 'evolving');
    const who: HeadlinerId = act === 1 ? 'clatter' : 'thrum';
    step(s, [{ type: 'evolve', index: act === 1 ? 1 : 0, headliner: who }]);
    assert.equal(s.phase, 'map');
    assert.equal(s.tour!.act, act + 1);
  }
  assert.ok(evolvedInto(s, 'mosh-pit'));
  assert.ok(evolvedInto(s, 'metronome'));
  assert.ok(!evolvedInto(s, 'crescendo') && !evolvedInto(s, 'harmony'));
});

test('a team run saves and restores exactly', () => {
  const s = teamField();
  playOnBeat(s, 'stagehand', 1);
  step(s, [{ type: 'lead', headliner: 'lyra' }]);
  const back = fromSnapshot(toSnapshot(s));
  assert.equal(hashState(back), hashState(s));
  assert.deepEqual(back.headliner.team, TEAM);
});

test('Collection: every member of a team gets the Tour XP', () => {
  const s = teamTour();
  s.tour!.cleared = 4;
  s.phase = 'over';
  const rec = recordRunInCollection(emptyCollection(), s);
  for (const h of TEAM) assert.equal(rec.collection.headliners[h].xp, rec.xp, h);
  assert.equal(rec.collection.headliners.aria.xp, 0);
});

test('solo runs are unchanged: one headliner, its own starter deck', () => {
  const s = createState({ seed: 'solo', mode: 'tour', headliner: 'aria' });
  assert.equal(s.headliner.team, undefined);
  assert.deepEqual(teamOf(s), ['aria']);
});
