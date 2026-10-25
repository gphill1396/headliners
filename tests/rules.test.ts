import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, ENEMIES, GATE_DEPTHS, HAND_SIZE, STAGE_LINE, step, START_CROWD, type EngineState } from '../src/engine';
import { STARTER_DECK } from '../src/content/cards';
import { addEnemy, countShots, giveCard, nextBeat, noWaves, ofType, playOnBeat, runTicks, testState, toBeatEdge } from './helpers';

const placeUnit = (s: EngineState, cardId: string, lane: number) => playOnBeat(s, cardId, lane);

// ---------------------------------------------------------------- deck & hand

test('a run starts with 5 cards in hand from a shuffled 12-card deck', () => {
  const s = createState({ seed: 'deal' });
  assert.equal(s.hand.length, HAND_SIZE);
  assert.equal(s.hand.length + s.draw.length, STARTER_DECK.length);
  const again = createState({ seed: 'deal' });
  assert.deepEqual(s.hand, again.hand);
  const order = (st: EngineState) => [...st.hand, ...st.draw].map((c) => c.cardId).join();
  assert.notEqual(order(createState({ seed: 'other' })), order(s));
});

test('the hand refills to 5 on each downbeat', () => {
  const s = testState();
  noWaves(s);
  s.discard.push(...s.hand.splice(0, 3));
  let refilled = false;
  for (let i = 0; i < 4 && !refilled; i++) refilled = ofType(nextBeat(s), 'beat').some((b) => b.downbeat);
  assert.equal(s.hand.length, HAND_SIZE);
});

// ---------------------------------------------------------------- playing cards

test('invalid plays are rejected with a reason and cost nothing', () => {
  const s = testState();
  const iid = giveCard(s, 'bassline');
  s.energy = 1;
  const events = step(s, [
    { type: 'commit', iid: 99_999, lane: 0, permille: 0 },
    { type: 'commit', iid, lane: 5, permille: 0 },
    { type: 'commit', iid, lane: 0, permille: 0 },
  ]);
  assert.deepEqual(ofType(events, 'rejected').map((e) => e.reason), ['not-in-hand', 'lane', 'energy']);
  assert.equal(s.energy, 1);
  assert.ok(s.hand.some((c) => c.iid === iid));
});

test('a played card pays energy now and resolves on the beat', () => {
  const s = testState();
  noWaves(s);
  s.energy = 5;
  const iid = giveCard(s, 'stagehand');
  toBeatEdge(s);
  const before = s.energy;
  const events = step(s, [{ type: 'commit', iid, lane: 1, permille: 0 }]);
  assert.equal(ofType(events, 'graded')[0]?.grade, 'tight');
  assert.ok(ofType(events, 'resolved').length === 1);
  assert.ok(!s.hand.some((c) => c.iid === iid));
  // -1 for the card, +1 for the beat, +1 Thrum Tight refund.
  assert.equal(s.energy, before - 1 + 1 + 1);
  assert.equal(s.units.length, 1);
  assert.equal(s.units[0]!.lane, 1);
});

test('timing scales the unit for good: a near-dead-on play is worth ~1.5–1.6× damage', () => {
  const s = testState();
  noWaves(s);
  const events = placeUnit(s, 'stagehand', 0);
  const acc = ofType(events, 'graded')[0]!.accuracyPct;
  assert.ok(acc >= 150 && acc <= 160, `accuracy ${acc}`);
  assert.equal(s.units[0]!.damage, (3 * acc) / 100);
});

test('a full lane replaces its oldest unit, which goes back to the deck', () => {
  const s = testState();
  noWaves(s);
  for (let i = 0; i < 3; i++) placeUnit(s, 'stagehand', 2);
  const oldest = s.units[0]!;
  const events = placeUnit(s, 'bassline', 2);
  const placed = ofType(events, 'unitPlaced')[0]!;
  assert.equal(placed.replacedId, oldest.id);
  assert.equal(s.units.filter((u) => u.lane === 2).length, 3);
  assert.ok(s.discard.some((c) => c.iid === oldest.card.iid));
});

// ---------------------------------------------------------------- firing & projectiles

test('units fire on the eighth-note grid: every beat for fireEvery 2', () => {
  const s = testState();
  noWaves(s);
  placeUnit(s, 'stagehand', 0);
  const shots = countShots(s, 36 * 8);
  assert.equal(shots, 8);
});

test('shots hit enemies and armor reduces every hit', () => {
  const s = testState();
  noWaves(s);
  const plain = addEnemy(s, { lane: 0, depth: 40_000 });
  const brute = addEnemy(s, { lane: 1, depth: 40_000, armor: 3 });
  s.projectiles.push(
    { id: s.nextId++, lane: 0, x: 500, depth: 60_000, damage: 5, pierceLeft: 0, splash: false, gatesPassed: 0, sourceCardId: 'test' },
    { id: s.nextId++, lane: 1, x: 500, depth: 60_000, damage: 5, pierceLeft: 0, splash: false, gatesPassed: 0, sourceCardId: 'test' },
  );
  runTicks(s, 20);
  assert.equal(plain.hp, 95);
  assert.equal(brute.hp, 98);
  assert.equal(s.stats.damageBySource['test'], 7);
});

test('chip damage does nothing to armor', () => {
  const s = testState();
  noWaves(s);
  const brute = addEnemy(s, { lane: 0, depth: 40_000, armor: 3 });
  s.projectiles.push({ id: s.nextId++, lane: 0, x: 500, depth: 60_000, damage: 3, pierceLeft: 0, splash: false, gatesPassed: 0, sourceCardId: 'test' });
  runTicks(s, 20);
  assert.equal(brute.hp, 100);
});

test('fast enemies cannot slip past a shot between ticks', () => {
  const s = testState();
  noWaves(s);
  for (let offset = 0; offset < 3_000; offset += 250) {
    s.enemies = [];
    s.projectiles = [];
    const e = addEnemy(s, { lane: 0, depth: 20_000 + offset, speed: 2_900 });
    s.projectiles.push({ id: s.nextId++, lane: 0, x: 500, depth: 60_000, damage: 1, pierceLeft: 0, splash: false, gatesPassed: 0, sourceCardId: 't' });
    runTicks(s, 20);
    assert.equal(e.hp, 99, `missed at offset ${offset}`);
  }
});

test('pierce passes through to a second enemy; splash hits neighbours for half', () => {
  const s = testState();
  noWaves(s);
  const a = addEnemy(s, { lane: 0, depth: 40_000 });
  const b = addEnemy(s, { lane: 0, depth: 30_000 });
  s.projectiles.push({ id: s.nextId++, lane: 0, x: 500, depth: 60_000, damage: 10, pierceLeft: 1, splash: false, gatesPassed: 0, sourceCardId: 't' });
  runTicks(s, 30);
  assert.equal(a.hp, 90);
  assert.equal(b.hp, 90);

  const t = testState('splash');
  noWaves(t);
  const front = addEnemy(t, { lane: 2, depth: 40_000 });
  const near = addEnemy(t, { lane: 2, depth: 35_000 });
  const far = addEnemy(t, { lane: 2, depth: 10_000 });
  t.projectiles.push({ id: t.nextId++, lane: 2, x: 500, depth: 60_000, damage: 10, pierceLeft: 0, splash: true, gatesPassed: 0, sourceCardId: 't' });
  runTicks(t, 30);
  assert.equal(front.hp, 90);
  assert.equal(near.hp, 95);
  assert.equal(far.hp, 100);
});

// ---------------------------------------------------------------- gates

test('a copy gate doubles shots and wears down, then breaks back into the deck', () => {
  const s = testState();
  noWaves(s);
  playOnBeat(s, 'double-stop', 0);
  const gate = s.gates[0]!;
  assert.equal(gate.depth, GATE_DEPTHS[0]);
  assert.ok(gate.durability >= 60 && gate.durability <= 64, `durability ${gate.durability}`); // 40 × accuracy
  const startDurability = gate.durability;
  for (let i = 0; i < 5; i++) {
    s.projectiles.push({ id: s.nextId++, lane: 0, x: 500, depth: STAGE_LINE - i * 3_000, damage: 1, pierceLeft: 0, splash: false, gatesPassed: 0, sourceCardId: 't' });
  }
  runTicks(s, 12);
  assert.equal(gate.durability, startDurability - 5);
  // Five originals plus five copies, some may have left the top already: count copies spawned via ids.
  gate.durability = 1;
  s.projectiles.push({ id: s.nextId++, lane: 0, x: 500, depth: STAGE_LINE, damage: 1, pierceLeft: 0, splash: false, gatesPassed: 0, sourceCardId: 't' });
  const events = runTicks(s, 12);
  assert.equal(ofType(events, 'gateBroken').length, 1);
  assert.equal(s.gates.length, 0);
  assert.ok(s.discard.some((c) => c.iid === gate.card.iid));
});

test('copied shots each deal full damage', () => {
  const s = testState();
  noWaves(s);
  playOnBeat(s, 'double-stop', 1);
  const e = addEnemy(s, { lane: 1, depth: 20_000 });
  s.projectiles.push({ id: s.nextId++, lane: 1, x: 500, depth: STAGE_LINE, damage: 7, pierceLeft: 0, splash: false, gatesPassed: 0, sourceCardId: 't' });
  runTicks(s, 40);
  assert.equal(e.hp, 100 - 14);
});

test('a damage gate gets shots through armor', () => {
  const s = testState();
  noWaves(s);
  playOnBeat(s, 'distortion', 0);
  const brute = addEnemy(s, { lane: 0, depth: 20_000, armor: 3 });
  s.projectiles.push({ id: s.nextId++, lane: 0, x: 500, depth: STAGE_LINE, damage: 3, pierceLeft: 0, splash: false, gatesPassed: 0, sourceCardId: 't' });
  runTicks(s, 40);
  assert.equal(brute.hp, 100 - 5); // 3 + 5 - 3 armor
});

// ---------------------------------------------------------------- chains

test('plays on consecutive beats build a chain; each link raises it by how on-beat it was', () => {
  const s = testState();
  noWaves(s);
  const first = ofType(playOnBeat(s, 'power-chord', 0), 'link');
  const second = ofType(playOnBeat(s, 'power-chord', 1), 'link');
  assert.deepEqual([first[0]!.links, second[0]!.links], [1, 2]);
  const step1 = first[0]!.multPct - 100;
  const step2 = second[0]!.multPct - first[0]!.multPct;
  // Within a tick of the beat: dead-on (+30) or Tight (+20).
  for (const step of [step1, step2]) assert.ok(step === 30 || step === 20, `step ${step}`);
});

test('a chain survives one empty beat and ends after two', () => {
  const s = testState();
  noWaves(s);
  playOnBeat(s, 'power-chord', 0);
  assert.equal(ofType(nextBeat(s), 'chainEnd').length, 0);
  assert.equal(ofType(nextBeat(s), 'chainEnd').length, 1);
  assert.equal(s.chain.links, 0);
});

test('chain multiplier scales riff damage', () => {
  const s = testState();
  noWaves(s);
  const e = addEnemy(s, { lane: 0, depth: 50_000, hp: 1_000, maxHp: 1_000 });
  const events = playOnBeat(s, 'power-chord', 0);
  const acc = ofType(events, 'graded')[0]!.accuracyPct;
  const chain = ofType(events, 'link')[0]!.multPct;
  const pocket = 100 + 4 * s.pocket.depth;
  // 30 × accuracy × chain × pocket
  assert.ok(Math.abs(e.hp - (1_000 - (30 * acc * chain * pocket) / 1e6)) < 1e-6);
});

test('Echo repeats on the next beat as a second link, and the card is discarded once', () => {
  const s = testState();
  noWaves(s);
  placeUnit(s, 'stagehand', 0);
  const events = playOnBeat(s, 'snare-roll', 0);
  assert.ok(ofType(events, 'resolved').some((r) => r.cardId === 'snare-roll' && !r.isEcho));
  const next = nextBeat(s);
  assert.ok(ofType(next, 'resolved').some((r) => r.cardId === 'snare-roll' && r.isEcho));
  assert.ok(ofType(next, 'link').some((l) => l.label === 'Snare Roll echoes'));
  assert.equal(s.discard.filter((c) => c.cardId === 'snare-roll').length, 1);
});

test('Kick Drum: Downbeat adds a link and fires 3 extra shots', () => {
  const s = testState();
  noWaves(s);
  placeUnit(s, 'kick-drum', 1);
  let found = false;
  for (let i = 0; i < 5 && !found; i++) {
    const before = s.projectiles.length;
    const ev = nextBeat(s);
    if (ofType(ev, 'beat').some((b) => b.downbeat)) {
      found = true;
      assert.ok(ofType(ev, 'link').some((l) => l.cardId === 'kick-drum'));
      assert.ok(s.projectiles.length - before >= 3);
    }
  }
  assert.ok(found);
});

test('Encore!: deals damage to everything only when the chain is 3+', () => {
  const s = testState();
  noWaves(s);
  const e = addEnemy(s, { lane: 2, depth: 30_000, hp: 1_000, maxHp: 1_000 });
  playOnBeat(s, 'encore', 0); // chain 1 → just draws
  assert.equal(e.hp, 1_000);
  playOnBeat(s, 'paradiddle', 0); // chain 2 (+ echo next beat = 3)
  playOnBeat(s, 'encore', 1); // echo link + this = chain 4
  assert.ok(e.hp < 1_000);
});

test('Blast Beat: every unit fires when the chain grows', () => {
  const s = testState();
  noWaves(s);
  placeUnit(s, 'stagehand', 0);
  placeUnit(s, 'stagehand', 2);
  playOnBeat(s, 'blast-beat', 1);
  s.projectiles = [];
  const before = s.projectiles.length;
  playOnBeat(s, 'paradiddle', 1);
  // 2 units × 1 volley shot, plus their regular beat shots.
  assert.ok(s.projectiles.length - before >= 4);
});

test('the 50-link cap resolves as a Showstopper and resets the chain', () => {
  const s = testState();
  noWaves(s);
  addEnemy(s, { lane: 0, depth: 30_000, hp: 1e9, maxHp: 1e9 });
  s.chain = { links: 49, multPct: 300, lastLinkBeat: s.clock.beat, tightStart: false };
  const events = playOnBeat(s, 'paradiddle', 0);
  assert.equal(ofType(events, 'showstopper').length, 1);
  assert.equal(s.chain.links, 0);
  assert.ok(s.stats.damageBySource['showstopper']! > 0);
});

// ---------------------------------------------------------------- Thrum

test('Thrum passive: a Tight hit refunds 1 energy, once per bar', () => {
  const s = testState();
  noWaves(s);
  s.energy = 5;
  const a = playOnBeat(s, 'power-chord', 0);
  const b = playOnBeat(s, 'power-chord', 0);
  const refunds = [...a, ...b].filter((e) => e.type === 'energy' && e.reason === 'tight').length;
  assert.ok(refunds >= 1 && refunds <= 2);
  // Two Tight hits in the same bar never refund twice.
  const s2 = testState('bar');
  noWaves(s2);
  while (s2.clock.beat % 4 !== 0 || s2.clock.phase !== 0) step(s2);
  const r1 = playOnBeat(s2, 'power-chord', 0);
  const r2 = playOnBeat(s2, 'power-chord', 0);
  assert.equal([...r1, ...r2].filter((e) => e.type === 'energy' && e.reason === 'tight').length, 1);
});

test('Fill: units fire on every eighth for 2 beats, then cooldown', () => {
  const s = testState();
  noWaves(s);
  placeUnit(s, 'bassline', 0); // normally every 2 beats
  const normal = countShots(s, 72);
  const ev = step(s, [{ type: 'activate', permille: 0 }]);
  assert.equal(ofType(ev, 'fill').length, 1);
  const filled = countShots(s, 72); // 2 beats at 100 BPM
  assert.equal(normal, 1);
  assert.ok(filled >= 3, `fired ${filled}`);
  const again = step(s, [{ type: 'activate', permille: 0 }]);
  assert.deepEqual(ofType(again, 'rejected').map((r) => r.reason), ['cooldown']);
});

// ---------------------------------------------------------------- waves, crowd, picks

test('Encore waves: wave 1 on beat 4, 2+ traits from wave 3, health grows each wave', () => {
  const s = createState({ seed: 'waves' });
  const waves: { index: number; kinds: string[] }[] = [];
  let hp = 0;
  for (let t = 0; t < 36 * 24 * 7 && waves.length < 6; t++) {
    if (s.phase === 'picking') step(s, [{ type: 'pick', index: null }]);
    for (const e of step(s)) if (e.type === 'waveStart') waves.push({ index: e.index, kinds: e.kinds });
    s.crowd = START_CROWD; // keep the run alive
    if (s.wave.index === 2 && hp === 0) hp = s.wave.hpMult;
  }
  assert.equal(waves[0]?.index, 1);
  for (const w of waves.filter((w) => w.index >= 3)) assert.ok(new Set(w.kinds).size >= 2, `wave ${w.index}: ${w.kinds}`);
  assert.ok(hp > 1);
  assert.ok(s.wave.hpMult > hp);
});

test('leaks cost crowd; at 0 crowd the run is over and stops', () => {
  const s = testState();
  noWaves(s);
  s.crowd = 3;
  addEnemy(s, { lane: 0, depth: STAGE_LINE - 10, speed: 100, crowdDamage: 5 });
  const events = runTicks(s, 2);
  assert.equal(ofType(events, 'leaked').length, 1);
  assert.equal(ofType(events, 'gameOver').length, 1);
  assert.equal(s.phase, 'over');
  const beat = s.clock.beat;
  runTicks(s, 100);
  assert.equal(s.clock.beat, beat);
});

test('Feedback costs crowd', () => {
  const s = testState();
  noWaves(s);
  playOnBeat(s, 'feedback-loop', 0);
  assert.equal(s.crowd, START_CROWD - 1);
});

test('every 3 waves a card pick freezes the music until chosen, then the next wave starts', () => {
  const s = createState({ seed: 'pick' });
  let offered: string[] = [];
  for (let t = 0; t < 36 * 24 * 4 && offered.length === 0; t++) {
    for (const e of step(s)) if (e.type === 'pickOffered') offered = e.options;
    s.crowd = START_CROWD;
  }
  assert.equal(offered.length, 3);
  assert.equal(s.phase, 'picking');
  assert.equal(s.wave.index, 3);
  const beat = s.clock.beat;
  runTicks(s, 50);
  assert.equal(s.clock.beat, beat);
  const deckSize = s.draw.length + s.discard.length + s.hand.length;
  const events = step(s, [{ type: 'pick', index: 1 }]);
  assert.equal(ofType(events, 'picked')[0]?.cardId, offered[1]);
  assert.equal(s.phase, 'playing');
  assert.equal(s.wave.index, 4);
  assert.equal(s.draw.length + s.discard.length + s.hand.length, deckSize + 1);
});

test('an Off-beat play drops the chain before starting a new one', () => {
  const s = testState();
  noWaves(s);
  playOnBeat(s, 'power-chord', 0);
  assert.equal(s.chain.links, 1);
  // Commit half a beat away from any beat: graded Off, resolves next beat.
  while (s.clock.phase < 1_700 || s.clock.phase > 1_900) step(s);
  const iid = giveCard(s, 'power-chord');
  const graded = step(s, [{ type: 'commit', iid, lane: 0, permille: 0 }]);
  assert.equal(ofType(graded, 'graded')[0]?.grade, 'off');
  const resolved = nextBeat(s);
  assert.deepEqual(ofType(resolved, 'chainEnd').map((e) => e.dropped), [true]);
  assert.equal(s.chain.links, 1);
});

// ---------------------------------------------------------------- tutorial mode & practice taps

test('tutorial mode: no waves, leaks cost nothing, no hand refills', () => {
  const s = createState({ seed: 'tut', mode: 'tutorial', deck: [] });
  assert.equal(s.hand.length, 0);
  const events = runTicks(s, 36 * 40);
  assert.equal(ofType(events, 'waveStart').length, 0);
  assert.equal(s.hand.length, 0);
  step(s, [{ type: 'spawn', kind: 'shambler', lane: 1, travelBeats: 2 }]);
  const later = runTicks(s, 36 * 4);
  assert.equal(ofType(later, 'leaked').length, ENEMIES.shambler.packSize);
  assert.equal(s.crowd, START_CROWD);
});

test('tutorial grant/spawn put cards and enemies exactly where the script needs them', () => {
  const s = createState({ seed: 'tut', mode: 'tutorial', deck: [] });
  step(s, [
    { type: 'grant', cardIds: ['stagehand', 'double-stop'], energy: 7 },
    { type: 'spawn', kind: 'brute', lane: 2 },
  ]);
  assert.deepEqual(s.hand.map((c) => c.cardId), ['stagehand', 'double-stop']);
  assert.equal(s.energy, 7);
  assert.deepEqual(s.enemies.map((e) => [e.kind, e.lane]), [['brute', 2]]);
});

test('grant and spawn are ignored in a real run', () => {
  const s = createState({ seed: 'real' });
  const hand = s.hand.length;
  step(s, [
    { type: 'grant', cardIds: ['blast-beat'], energy: 10 },
    { type: 'spawn', kind: 'brute', lane: 0 },
  ]);
  assert.equal(s.hand.length, hand);
  assert.equal(s.enemies.length, 0);
});

test('a practice tap is graded and changes nothing else', () => {
  const s = testState();
  noWaves(s);
  s.energy = 5;
  toBeatEdge(s);
  const before = JSON.stringify({ hand: s.hand, energy: s.energy, chain: s.chain, queue: s.queue });
  const events = step(s, [{ type: 'tap', lane: 0, permille: 0 }]);
  assert.equal(ofType(events, 'tapped')[0]?.grade, 'tight');
  assert.equal(JSON.stringify({ hand: s.hand, energy: s.energy - 1, chain: s.chain, queue: s.queue }), before);
});
