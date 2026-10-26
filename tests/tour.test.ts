import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, deckCards, fromSnapshot, hashState, reachable, step, toSnapshot, type EngineState, type TourNodeKind } from '../src/engine';
import { TOUR_EVENTS } from '../src/content/events';

function tour(seed = 'tour'): EngineState {
  return createState({ seed, mode: 'tour' });
}

/** Win the fight in progress by clearing every enemy as it appears. */
function winFight(s: EngineState): void {
  for (let t = 0; t < 60 * 60 * 5 && s.phase === 'playing'; t++) {
    for (const e of s.enemies) e.hp = 0;
    step(s);
  }
}

/** Put a stop of the wanted kind where you can go next, then go there. */
function goTo(s: EngineState, kind: TourNodeKind): void {
  const id = reachable(s)[0]!;
  s.tour!.nodes.find((n) => n.id === id)!.kind = kind;
  step(s, [{ type: 'travel', node: id }]);
}

test('a Tour starts on the act 1 map: 4 rows of stops then a boss, with an elite, a shop and a rest', () => {
  for (let i = 0; i < 20; i++) {
    const s = tour(`map-${i}`);
    assert.equal(s.phase, 'map');
    const nodes = s.tour!.nodes;
    assert.equal(nodes.filter((n) => n.kind === 'boss').length, 1);
    assert.ok(nodes.filter((n) => n.row === 1).every((n) => n.kind === 'fight'));
    assert.ok(nodes.some((n) => n.kind === 'elite' && n.row >= 3));
    assert.ok(nodes.some((n) => n.kind === 'shop' && n.row <= 3));
    assert.ok(nodes.some((n) => n.kind === 'rest' && n.row === 4));
    // Every stop leads somewhere, and every path reaches the boss.
    for (const n of nodes) if (n.kind !== 'boss') assert.ok(n.next.length > 0);
    assert.deepEqual(reachable(s).sort(), nodes.filter((n) => n.row === 1).map((n) => n.id).sort());
  }
});

test('you can only travel to a connected stop', () => {
  const s = tour();
  const far = s.tour!.nodes.find((n) => n.row === 3)!;
  step(s, [{ type: 'travel', node: far.id }]);
  assert.equal(s.phase, 'map');
  assert.equal(s.tour!.at, null);
});

test('a fight: count-in, three waves, then merch and a card pick, then back to the map', () => {
  const s = tour();
  goTo(s, 'fight');
  assert.equal(s.phase, 'playing');
  assert.equal(s.hand.length, 5);
  const waves: number[] = [];
  for (let t = 0; t < 60 * 60 * 5 && s.phase === 'playing'; t++) {
    for (const e of s.enemies) e.hp = 0;
    for (const ev of step(s)) if (ev.type === 'waveStart') waves.push(ev.index);
  }
  assert.deepEqual(waves, [1, 2, 3]);
  assert.equal(s.phase, 'picking');
  assert.equal(s.tour!.merch, 20);
  step(s, [{ type: 'pick', index: 0 }]);
  assert.equal(s.phase, 'map');
});

test('crowd carries over, and gear stays set up between fights in an act', () => {
  const s = tour('carry');
  goTo(s, 'fight');
  // Put a unit down, lose some crowd.
  const iid = s.hand.find((c) => c.cardId === 'stagehand')?.iid ?? s.hand[0]!.iid;
  s.energy = 10;
  for (let t = 0; t < 40; t++) step(s, t === 0 ? [{ type: 'commit', iid, lane: 0, permille: 0 }] : []);
  s.crowd = 21;
  winFight(s);
  step(s, [{ type: 'pick', index: null }]);
  assert.equal(s.crowd, 21);
  const onStage = s.units.length + s.gates.length;
  goTo(s, 'fight');
  assert.equal(s.units.length + s.gates.length, onStage);
});

test('beating the act 1 boss: a pick, then evolve, then a fresh act 2 map with the stage struck', () => {
  const s = tour('boss');
  s.tour!.at = s.tour!.nodes.find((n) => n.row === 4)!.id;
  step(s, [{ type: 'travel', node: s.tour!.nodes.find((n) => n.kind === 'boss')!.id }]);
  assert.equal(s.phase, 'playing');
  let sawBoss = false;
  for (let t = 0; t < 60 * 60 * 5 && s.phase === 'playing'; t++) {
    if (s.boss) sawBoss = true;
    for (const e of s.enemies) e.hp = 0;
    step(s);
  }
  assert.ok(sawBoss);
  assert.equal(s.phase, 'picking');
  step(s, [{ type: 'pick', index: null }]);
  assert.equal(s.phase, 'evolving');
  step(s, [{ type: 'evolve', index: 0 }]);
  assert.equal(s.phase, 'map');
  assert.equal(s.tour!.act, 2);
  assert.equal(s.tour!.at, null);
  assert.equal(s.units.length + s.gates.length + s.amps.length, 0);
});

test('rest heals or cuts a card; shop buys, removes and heals with merch', () => {
  const s = tour('stops');
  s.crowd = 10;
  goTo(s, 'rest');
  step(s, [{ type: 'rest', choice: 'heal' }]);
  assert.equal(s.crowd, 20);
  assert.equal(s.phase, 'map');

  const t = tour('shop');
  t.tour!.merch = 200;
  t.crowd = 10;
  goTo(t, 'shop');
  assert.equal(t.phase, 'shop');
  const size = deckCards(t).length;
  const price = t.tour!.shop!.cards[0]!.price;
  step(t, [{ type: 'shop', action: 'buy', index: 0 }]);
  assert.equal(deckCards(t).length, size + 1);
  assert.equal(t.tour!.merch, 200 - price);
  step(t, [{ type: 'shop', action: 'remove', iid: deckCards(t)[0]!.iid }]);
  assert.equal(deckCards(t).length, size);
  step(t, [{ type: 'shop', action: 'remove', iid: deckCards(t)[0]!.iid }]); // only once per shop
  assert.equal(deckCards(t).length, size);
  step(t, [{ type: 'shop', action: 'heal' }]);
  assert.equal(t.crowd, 18);
  step(t, [{ type: 'shop', action: 'leave' }]);
  assert.equal(t.phase, 'map');
});

test('events apply their trade-offs', () => {
  const s = tour('event');
  goTo(s, 'event');
  assert.equal(s.phase, 'event');
  s.tour!.event = 'promoter';
  s.crowd = 20;
  step(s, [{ type: 'event', option: 0 }]);
  assert.equal(s.tour!.merch, 45);
  assert.equal(s.crowd, 16);
  assert.equal(s.phase, 'map');
  assert.ok(TOUR_EVENTS.length >= 6);
});

test('a Tour saves and restores exactly, on the map and mid-fight', () => {
  const s = tour('save');
  const a = fromSnapshot(toSnapshot(s));
  assert.equal(hashState(a), hashState(s));
  goTo(s, 'fight');
  for (let t = 0; t < 500; t++) step(s);
  const b = fromSnapshot(toSnapshot(s));
  for (let t = 0; t < 300; t++) {
    step(s);
    step(b);
  }
  assert.equal(hashState(b), hashState(s));
});
