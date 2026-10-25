import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, getCard, step, STAGE_LINE, type EngineState } from '../src/engine';
import { pickPool, STARTER_DECKS } from '../src/content/cards';
import { countShots, nextBeat, noWaves, ofType, playOnBeat } from './helpers';

function as(headliner: 'thrum' | 'lyra' | 'clatter', seed = 'h'): EngineState {
  const s = createState({ seed, headliner });
  s.energy = 10;
  noWaves(s);
  return s;
}

test('each headliner starts with their own 12-card deck', () => {
  for (const h of ['thrum', 'lyra', 'clatter'] as const) {
    const s = createState({ seed: 'deck', headliner: h });
    assert.equal(s.headliner.id, h);
    const ids = [...s.hand, ...s.draw].map((c) => c.cardId).sort();
    assert.deepEqual(ids, [...STARTER_DECKS[h]].sort());
    // Signature cards in the deck belong to this headliner.
    for (const id of ids) {
      const owner = getCard(id).headliner;
      assert.ok(!owner || owner === h, `${id} in ${h}'s deck`);
    }
  }
});

test("card picks offer neutral cards plus only your headliner's signatures, never tokens", () => {
  const pool = pickPool('lyra');
  assert.ok(pool.includes('harmonizer'));
  assert.ok(!pool.includes('kick-drum'));
  assert.ok(!pool.includes('load-in'));
  assert.ok(!pool.includes('roadie'));
  assert.ok(pool.includes('fuzz'));
});

// ---------------------------------------------------------------- Clatter

test('Load-In: a Roadie now and one on the echo; they leave after 8 beats and never enter the deck', () => {
  const s = as('clatter');
  const before = (id: string) => s.units.filter((u) => u.cardId === id).length;
  playOnBeat(s, 'load-in', 1);
  nextBeat(s);
  nextBeat(s);
  const roadies = s.units.filter((u) => u.cardId === 'roadie');
  assert.equal(before('roadie'), 3); // Load-In, its echo, and the Tight-hit Roadie
  assert.ok(roadies.every((r) => r.token && r.lane === 1));
  assert.equal(roadies[0]!.damage, 3);
  const deckSize = s.draw.length + s.discard.length + s.hand.length;
  const expired: string[] = [];
  for (let b = 0; b < 10; b++) for (const e of nextBeat(s)) if (e.type === 'unitExpired') expired.push(e.cardId);
  assert.deepEqual(expired, ['roadie', 'roadie', 'roadie']);
  assert.equal(s.units.filter((u) => u.token).length, 0);
  assert.equal(s.draw.length + s.discard.length + s.hand.length, deckSize);
});

test('Roadies never push a real card off a full lane', () => {
  const s = as('clatter');
  for (let i = 0; i < 3; i++) playOnBeat(s, 'stagehand', 0);
  playOnBeat(s, 'load-in', 0);
  assert.equal(s.units.filter((u) => u.lane === 0 && u.cardId === 'stagehand').length, 3);
  assert.equal(s.units.filter((u) => u.cardId === 'roadie').length, 0);
});

test('Crew Chief makes a Roadie on each downbeat and adds a link', () => {
  const s = as('clatter');
  playOnBeat(s, 'crew-chief', 2);
  let downbeat = false;
  for (let i = 0; i < 5 && !downbeat; i++) {
    const ev = nextBeat(s);
    if (ofType(ev, 'beat').some((b) => b.downbeat)) {
      downbeat = true;
      assert.ok(ofType(ev, 'link').some((l) => l.cardId === 'crew-chief'));
    }
  }
  assert.equal(s.units.filter((u) => u.cardId === 'roadie' && u.lane === 2).length, 2); // downbeat + Tight hit
});

test('Mosh Pit: every Roadie fires 2 extra shots on beat 1', () => {
  const s = as('clatter');
  playOnBeat(s, 'mosh-pit', 0);
  playOnBeat(s, 'load-in', 0);
  // Count shots across one bar with and without the burst: the downbeat adds 2 per Roadie.
  while (!(s.clock.beat % 4 === 3 && s.clock.phase + s.clock.bpm >= 3600)) step(s);
  const shots = countShots(s, 2);
  assert.ok(shots >= 4, `shots on the downbeat ${shots}`);
});

test("Clatter's All Hands: a Roadie in every lane", () => {
  const s = as('clatter');
  const ev = step(s, [{ type: 'activate', permille: 0 }]);
  assert.equal(ofType(ev, 'fill')[0]?.headliner, 'clatter');
  assert.deepEqual(s.units.filter((u) => u.cardId === 'roadie').map((u) => u.lane).sort(), [0, 1, 2]);
});

// ---------------------------------------------------------------- Lyra

test("Lyra's passive: each gate a shot passes adds +1 damage", () => {
  const through = (h: 'lyra' | 'thrum') => {
    const s = as(h, `pass-${h}`);
    playOnBeat(s, 'distortion', 1);
    s.projectiles = [];
    s.projectiles.push({ id: s.nextId++, lane: 1, x: 500, depth: STAGE_LINE, damage: 1, pierceLeft: 0, splash: false, gatesPassed: 0, sourceCardId: 't' });
    for (let i = 0; i < 12; i++) step(s);
    return s.projectiles.find((p) => p.sourceCardId === 't')!.damage;
  };
  assert.equal(through('lyra') - through('thrum'), 1);
});

test("Clatter's passive: a Tight hit calls a Roadie, once per bar", () => {
  const s = as('clatter');
  const bars = new Set<number>();
  for (let i = 0; i < 4; i++) {
    playOnBeat(s, 'power-chord', 2);
    bars.add(Math.floor(s.clock.beat / 4));
  }
  const roadies = s.units.filter((u) => u.cardId === 'roadie');
  assert.ok(roadies.length >= 1 && roadies.length <= bars.size, `${roadies.length} roadies over ${bars.size} bars`);
  assert.ok(roadies.every((r) => r.lane === 2));
  // Thrum gets energy instead, never Roadies.
  const t = as('thrum');
  playOnBeat(t, 'power-chord', 2);
  assert.equal(t.units.length, 0);
});

test('Toolbox: shots through it ignore armor', () => {
  const s = as('clatter');
  playOnBeat(s, 'toolbox', 1);
  s.projectiles = [];
  s.projectiles.push({ id: s.nextId++, lane: 1, x: 500, depth: STAGE_LINE, damage: 3, pierceLeft: 0, splash: false, gatesPassed: 0, sourceCardId: 't' });
  for (let i = 0; i < 12; i++) step(s);
  assert.equal(s.projectiles.find((p) => p.sourceCardId === 't')?.shred, true);
});

test('Harmonizer makes 3 shots; Swell makes it 4 and doubles damage gates', () => {
  const shotsThrough = (swell: boolean, cardId: string) => {
    const s = as('lyra', `swell-${swell}-${cardId}`);
    playOnBeat(s, cardId, 1);
    if (swell) step(s, [{ type: 'activate', permille: 0 }]);
    s.projectiles = [];
    s.projectiles.push({ id: s.nextId++, lane: 1, x: 500, depth: STAGE_LINE, damage: 1, pierceLeft: 0, splash: false, gatesPassed: 0, sourceCardId: 't' });
    for (let i = 0; i < 12; i++) step(s);
    return s.projectiles.filter((p) => p.sourceCardId === 't');
  };
  assert.equal(shotsThrough(false, 'harmonizer').length, 3);
  assert.equal(shotsThrough(true, 'harmonizer').length, 4);
  assert.equal(shotsThrough(false, 'distortion')[0]!.damage, 7);
  assert.equal(shotsThrough(true, 'distortion')[0]!.damage, 12);
});

test('Sustain Pedal repairs gates in its lane, then again next beat', () => {
  const s = as('lyra');
  playOnBeat(s, 'double-stop', 0);
  const g = s.gates[0]!;
  g.durability = 5;
  playOnBeat(s, 'sustain-pedal', 0);
  const afterFirst = g.durability;
  assert.ok(afterFirst > 5);
  nextBeat(s);
  assert.ok(g.durability > afterFirst || g.durability === g.maxDurability);
});

test('Resonance: every chain link repairs every gate a little', () => {
  const s = as('lyra');
  playOnBeat(s, 'double-stop', 0);
  playOnBeat(s, 'resonance', 1);
  s.gates[0]!.durability = 10;
  playOnBeat(s, 'paradiddle', 2);
  assert.ok(s.gates[0]!.durability >= 13);
});

test("Thrum's Fill only works for Thrum", () => {
  const s = as('lyra');
  playOnBeat(s, 'bassline', 0);
  const normal = countShots(s, 72);
  step(s, [{ type: 'activate', permille: 0 }]);
  assert.equal(countShots(s, 72), normal);
});
