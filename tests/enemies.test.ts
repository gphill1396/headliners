import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, STAGE_LINE, step, SWOOP_DEPTH, type EngineState } from '../src/engine';
import { ENEMIES } from '../src/content/enemies';
import { DEBUT_WAVE, waveKinds } from '../src/engine/waves';
import { addEnemy, nextBeat, noWaves, ofType, playOnBeat, runTicks, testState } from './helpers';

function field(seed = 'enemies'): EngineState {
  const s = testState(seed);
  noWaves(s);
  return s;
}

/** A shot in `lane` just in front of the stage. */
function shot(s: EngineState, lane: number, extra: Partial<EngineState['projectiles'][number]> = {}) {
  const p = { id: s.nextId++, lane, x: 500, depth: STAGE_LINE, damage: 5, pierceLeft: 0, splash: false, gatesPassed: 0, sourceCardId: 't', ...extra };
  s.projectiles.push(p);
  return p;
}

test('every enemy has a trait, a short tip, and a debut wave', () => {
  for (const [kind, def] of Object.entries(ENEMIES)) {
    assert.ok(def.trait.length > 10 && def.tip.length > 5, kind);
    assert.ok(DEBUT_WAVE[kind as keyof typeof DEBUT_WAVE] >= 1, kind);
  }
});

test('Bats: normal shots pass under them until they swoop; Anti-Air hits them anywhere', () => {
  const s = field();
  const bat = addEnemy(s, { kind: 'bat', lane: 0, depth: 30_000, hp: 50, maxHp: 50 });
  shot(s, 0);
  runTicks(s, 40);
  assert.equal(bat.hp, 50);
  shot(s, 0, { antiAir: true });
  runTicks(s, 40);
  assert.equal(bat.hp, 45);
  bat.depth = SWOOP_DEPTH + 1_000;
  shot(s, 0);
  runTicks(s, 10);
  assert.equal(bat.hp, 40);
});

test('Splitter: bursts into 3 weaker pieces, but not when overkill blows it apart', () => {
  const s = field();
  addEnemy(s, { kind: 'splitter', lane: 1, depth: 40_000, hp: 5, maxHp: 30 });
  shot(s, 1, { damage: 5 });
  const ev = runTicks(s, 30);
  assert.equal(ofType(ev, 'split').length, 1);
  const pieces = s.enemies.filter((e) => e.kind === 'splitter');
  assert.equal(pieces.length, 3);
  assert.ok(pieces.every((p) => p.child && p.maxHp === 9));
  // Pieces never split again.
  for (const p of pieces) p.hp = 1;
  shot(s, 1, { damage: 50, pierceLeft: 5 });
  runTicks(s, 30);
  assert.equal(s.enemies.length, 0);

  const t = field('overkill');
  addEnemy(t, { kind: 'splitter', lane: 1, depth: 40_000, hp: 5, maxHp: 30 });
  shot(t, 1, { damage: 25 }); // 20 overkill ≥ half its max health
  assert.equal(ofType(runTicks(t, 30), 'split').length, 0);
  assert.equal(t.enemies.length, 0);
});

test('Shieldbearer: blocks straight shots and shields whoever is behind it; pierce and side shots get through', () => {
  const s = field();
  const sb = addEnemy(s, { kind: 'shieldbearer', lane: 2, depth: 50_000, hp: 100, maxHp: 100, shieldLeft: 3 });
  const behind = addEnemy(s, { lane: 2, depth: 40_000, hp: 100, maxHp: 100 });
  shot(s, 2);
  const ev = runTicks(s, 30);
  assert.equal(ofType(ev, 'blocked').length, 1);
  assert.equal(sb.hp, 100);
  assert.equal(behind.hp, 100);
  assert.equal(sb.shieldLeft, 2);
  // Pierce punches through.
  shot(s, 2, { pierceLeft: 1 });
  runTicks(s, 30);
  assert.equal(sb.hp, 95);
  assert.equal(behind.hp, 95);
  // From the side, through a speaker.
  shot(s, 2, { side: true });
  runTicks(s, 30);
  assert.equal(sb.hp, 90);
  // Enough blocks break the shield.
  shot(s, 2);
  shot(s, 2, { depth: STAGE_LINE - 8_000 });
  const broke = ofType(runTicks(s, 40), 'blocked');
  assert.ok(broke.some((b) => b.broke));
  shot(s, 2);
  runTicks(s, 30);
  assert.equal(sb.hp, 85);
});

test('Side Fill: a speaker turns shots into the next lane, from the side', () => {
  const s = field();
  playOnBeat(s, 'side-fill', 0); // left lane aims at the middle
  const sb = addEnemy(s, { kind: 'shieldbearer', lane: 1, depth: 20_000, hp: 100, maxHp: 100, shieldLeft: 5 });
  s.projectiles = [];
  shot(s, 0);
  runTicks(s, 60);
  assert.equal(sb.hp, 95);
  assert.equal(sb.shieldLeft, 5);
  // From the middle, shots alternate left and right.
  const m = field('middle');
  playOnBeat(m, 'side-fill', 1);
  m.projectiles = [];
  const a = shot(m, 1);
  const b = shot(m, 1, { id: a.id + 1 });
  m.nextId += 2;
  runTicks(m, 12);
  assert.deepEqual([a.lane, b.lane].sort(), [0, 2]);
  assert.ok(a.side && b.side);
});

test('Hexer: switches off the gates ahead of it in its lane; shots pass through unchanged', () => {
  const s = field();
  playOnBeat(s, 'distortion', 0);
  const hexer = addEnemy(s, { kind: 'hexer', lane: 0, depth: s.gates[0]!.depth - 20_000, hp: 1_000, maxHp: 1_000 });
  step(s);
  assert.ok(s.gates[0]!.hexed);
  const before = s.gates[0]!.durability;
  s.projectiles = [];
  shot(s, 0, { damage: 1 });
  runTicks(s, 40);
  assert.equal(hexer.hp, 999);
  assert.equal(s.gates[0]!.durability, before);
  hexer.hp = 0;
  runTicks(s, 2);
  assert.ok(!s.gates[0]!.hexed);
});

test('Breaker: stops at a gate and smashes it every beat, then walks on', () => {
  const s = field();
  playOnBeat(s, 'double-stop', 1);
  const gate = s.gates[0]!;
  const br = addEnemy(s, { kind: 'breaker', lane: 1, depth: gate.depth - 6_000, speed: 400, hp: 1_000, maxHp: 1_000 });
  let smashes = 0;
  for (let i = 0; i < 12 && s.gates.length > 0; i++) smashes += ofType(nextBeat(s), 'gateSmashed').length;
  assert.equal(s.gates.length, 0);
  assert.ok(smashes >= 3, `${smashes} smashes`);
  const stopped = br.depth;
  runTicks(s, 5);
  assert.ok(br.depth > stopped);
});

test('Spotlight: Priority shots fly past other enemies to hit a Breaker', () => {
  const s = field();
  const front = addEnemy(s, { lane: 0, depth: 60_000, hp: 100, maxHp: 100 });
  const br = addEnemy(s, { kind: 'breaker', lane: 0, depth: 20_000, hp: 100, maxHp: 100, armor: 0 });
  shot(s, 0, { priority: true });
  runTicks(s, 40);
  assert.equal(front.hp, 100);
  assert.equal(br.hp, 95);
  // With no priority target left, Priority shots hit normally.
  br.hp = 0;
  runTicks(s, 1);
  shot(s, 0, { priority: true });
  runTicks(s, 40);
  assert.equal(front.hp, 95);
});

test('waves: one new enemy per wave from 3 to 8, Shamblers in every wave, 2+ traits from wave 3', () => {
  const s = createState({ seed: 'mix' });
  for (let w = 1; w <= 20; w++) {
    const kinds = waveKinds(s, w);
    assert.ok(kinds.includes('shambler'), `wave ${w}`);
    if (w >= 3) assert.ok(new Set(kinds).size >= 2, `wave ${w}: ${kinds}`);
    for (const k of kinds) assert.ok(DEBUT_WAVE[k] <= w, `${k} before its debut in wave ${w}`);
    const debut = Object.entries(DEBUT_WAVE).filter(([, d]) => d === w).map(([k]) => k);
    for (const k of debut) assert.ok(kinds.includes(k as never), `${k} debuts in wave ${w}`);
  }
});

test('a card pick before a new enemy offers an answer to it if the deck has none', () => {
  let offered = 0;
  for (let i = 0; i < 20; i++) {
    const s = createState({ seed: `answers-${i}` });
    s.wave.index = 3; // the next waves bring Bats (4), which need Anti-Air
    s.wave.startBeat = s.clock.beat - 100;
    s.mode = 'encore';
    for (let t = 0; t < 200 && s.pick.length === 0; t++) step(s);
    if (s.pick.includes('pyro')) offered++;
  }
  assert.equal(offered, 20);
});
