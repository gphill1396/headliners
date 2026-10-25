import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chordAt, mixFrom, scheduleGroove, type BoardMix } from '../src/audio/groove';
import type { Synth } from '../src/audio/synth';
import { noWaves, playOnBeat, testState } from './helpers';

type Call = { voice: string; t: number; level?: number; dest?: unknown; note?: number };

/** Records every voice the groove asks for, instead of making sound. */
function fakeSynth(): { synth: Synth; calls: Call[]; fx: Map<number, { drive: number; fuzz: boolean }> } {
  const calls: Call[] = [];
  const fx = new Map<number, { drive: number; fuzz: boolean }>();
  const fake = {
    lane: (l: number) => `lane${l}`,
    setLaneFx: (lane: number, f: { drive: number; fuzz: boolean }) => fx.set(lane, f),
    kick: (t: number, level = 1, dest = 'master') => calls.push({ voice: 'kick', t, level, dest }),
    snare: (t: number, level = 1, dest = 'master') => calls.push({ voice: 'snare', t, level, dest }),
    hat: (t: number) => calls.push({ voice: 'hat', t }),
    tom: (t: number, note: number, level = 1, dest = 'master') => calls.push({ voice: 'tom', t, note, level, dest }),
    bass: (t: number, note: number, _d: number, level = 1, dest = 'master') => calls.push({ voice: 'bass', t, note, level, dest }),
    pad: (t: number) => calls.push({ voice: 'pad', t }),
    lead: (t: number, note: number) => calls.push({ voice: 'lead', t, note }),
  };
  return { synth: fake as unknown as Synth, calls, fx };
}

const EIGHTH = 0.3;
const emptyMix = (): BoardMix => ({
  groups: [],
  lanes: [0, 1, 2].map(() => ({ copy: false, drive: false, fuzz: false })),
  blast: false,
  chain: 0,
  fillUntil: -1,
});

/** Schedule one bar (8 eighths) starting at bar `bar`. */
function bar(mix: BoardMix, barIndex = 0) {
  const f = fakeSynth();
  for (let e = barIndex * 8; e < barIndex * 8 + 8; e++) scheduleGroove(f.synth, mix, e, e * EIGHTH, EIGHTH);
  const count = (voice: string, pred: (c: Call) => boolean = () => true) => f.calls.filter((c) => c.voice === voice && pred(c)).length;
  return { ...f, count };
}

test('an empty stage is a quarter-note hat and a kick on 1', () => {
  const b = bar(emptyMix());
  assert.equal(b.count('hat'), 4);
  assert.equal(b.count('kick'), 1);
  assert.equal(b.count('snare'), 0);
});

test('Stagehand plays snare when it fires: backbeat on 2 and 4, ghost notes on 1 and 3, from its lane', () => {
  const mix = emptyMix();
  mix.groups = [{ cardId: 'stagehand', lane: 0, count: 1, fireEvery: 2 }];
  const b = bar(mix);
  const snares = b.calls.filter((c) => c.voice === 'snare');
  assert.equal(snares.length, 4);
  assert.deepEqual(snares.map((c) => c.level), [0.3 * 0.75, 0.75, 0.3 * 0.75, 0.75]);
  assert.ok(snares.every((c) => c.dest === 'lane0'));
  // The band filling in makes the hat play eighths.
  assert.equal(b.count('hat'), 8);
});

test('Kick Drum replaces the empty-stage kick and adds its beat-1 burst', () => {
  const mix = emptyMix();
  mix.groups = [{ cardId: 'kick-drum', lane: 1, count: 1, fireEvery: 4 }];
  const b = bar(mix);
  // Beat 1: kick + 2 pickup kicks; beat 3: kick.
  assert.equal(b.count('kick'), 4);
  assert.ok(b.calls.filter((c) => c.voice === 'kick').every((c) => c.dest === 'lane1'));
});

test('Bassline follows the chord progression, one root per bar', () => {
  const mix = emptyMix();
  mix.groups = [{ cardId: 'bassline', lane: 2, count: 1, fireEvery: 4 }];
  const roots = [0, 1, 2, 3].map((i) => bar(mix, i).calls.find((c) => c.voice === 'bass')?.note);
  assert.deepEqual(roots, [0, 1, 2, 3].map((i) => chordAt(i * 4).root));
  assert.equal(new Set(roots).size, 4);
});

test('gates color their lane: Double Stop doubles parts, Overdrive and Fuzz set lane effects', () => {
  const mix = emptyMix();
  mix.groups = [
    { cardId: 'bassline', lane: 0, count: 1, fireEvery: 4 },
    { cardId: 'stagehand', lane: 2, count: 1, fireEvery: 2 },
  ];
  mix.lanes[0] = { copy: true, drive: true, fuzz: false };
  mix.lanes[2] = { copy: true, drive: false, fuzz: true };
  const b = bar(mix);
  assert.equal(b.count('bass'), 4); // 2 notes × (root + octave double)
  assert.equal(b.count('snare'), 8); // 4 hits × flam
  assert.ok(b.fx.get(0)!.drive > 0);
  assert.equal(b.fx.get(1)!.drive, 0);
  assert.equal(b.fx.get(2)!.fuzz, true);
});

test('chain layers: pad from 4 links, lead arpeggio from 8, nothing below', () => {
  const mix = emptyMix();
  mix.chain = 3;
  assert.equal(bar(mix).count('pad'), 0);
  mix.chain = 4;
  assert.equal(bar(mix).count('pad'), 4);
  assert.equal(bar(mix).count('lead'), 0);
  mix.chain = 8;
  assert.equal(bar(mix).count('lead'), 16);
});

test('Fill makes every unit play on every eighth', () => {
  const mix = emptyMix();
  mix.groups = [{ cardId: 'bassline', lane: 1, count: 1, fireEvery: 4 }];
  mix.fillUntil = 2; // beats 0–1
  const b = bar(mix);
  const early = b.calls.filter((c) => c.voice === 'bass' && c.t < 4 * EIGHTH).length;
  assert.equal(early, 4);
});

test('mixFrom reads the board: units grouped by lane, gates by lane, chain', () => {
  const s = testState('mix');
  noWaves(s);
  playOnBeat(s, 'stagehand', 0);
  playOnBeat(s, 'stagehand', 0);
  playOnBeat(s, 'double-stop', 0);
  playOnBeat(s, 'bassline', 2);
  const mix = mixFrom(s);
  assert.deepEqual(mix.groups.map((g) => [g.cardId, g.lane, g.count]), [
    ['stagehand', 0, 2],
    ['bassline', 2, 1],
  ]);
  assert.equal(mix.lanes[0]!.copy, true);
  assert.equal(mix.chain, s.chain.links);
});
