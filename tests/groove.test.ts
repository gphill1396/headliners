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
    jingle: (t: number) => calls.push({ voice: 'jingle', t }),
    boom: (t: number, level = 1, dest = 'master') => calls.push({ voice: 'boom', t, level, dest }),
    drone: (t: number) => calls.push({ voice: 'drone', t }),
    gurdy: (t: number, note: number, _d: number, level = 1, dest = 'master') => calls.push({ voice: 'gurdy', t, note, level, dest }),
    recorder: (t: number, note: number, _d: number, level = 1, dest = 'master') => calls.push({ voice: 'recorder', t, note, level, dest }),
    tom: (t: number, note: number, level = 1, dest = 'master') => calls.push({ voice: 'tom', t, note, level, dest }),
    bass: (t: number, note: number, _d: number, level = 1, dest = 'master') => calls.push({ voice: 'bass', t, note, level, dest }),
    pad: (t: number) => calls.push({ voice: 'pad', t }),
    lead: (t: number, note: number) => calls.push({ voice: 'lead', t, note }),
    keys: (t: number, note: number, _d: number, level = 1, dest = 'master') => calls.push({ voice: 'keys', t, note, level, dest }),
    clank: (t: number, level = 1, dest = 'master') => calls.push({ voice: 'clank', t, level, dest }),
    shaker: (t: number, level = 1, dest = 'master') => calls.push({ voice: 'shaker', t, level, dest }),
    voice: (t: number, note: number, _d: number, level = 1, dest = 'master') => calls.push({ voice: 'voice', t, note, level, dest }),
    punk: (t: number, note: number, _d: number, level = 1, dest = 'master') => calls.push({ voice: 'punk', t, note, level, dest }),
    crash: (t: number) => calls.push({ voice: 'crash', t }),
    whoosh: (t: number, level = 1, dest = 'master') => calls.push({ voice: 'whoosh', t, level, dest }),
    bell: (t: number, note: number, _d: number, level = 1, dest = 'master') => calls.push({ voice: 'bell', t, note, level, dest }),
    lute: (t: number, note: number, _d: number, level = 1, dest = 'master') => calls.push({ voice: 'lute', t, note, level, dest }),
    pipes: (t: number, note: number, _d: number, level = 1, dest = 'master') => calls.push({ voice: 'pipes', t, note, level, dest }),
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

test("an empty stage is Thrum's war march: tabor on 2 and 4, war drum on 1 and 3", () => {
  const b = bar(emptyMix());
  assert.equal(b.count('jingle'), 0);
  assert.equal(b.count('boom'), 2);
  assert.equal(b.count('snare'), 2);
  // Every other bar ends with a tabor roll into the next.
  assert.equal(bar(emptyMix(), 1).count('snare'), 4);
});

test('Page throws rocks when it fires: a whoosh and a thud, heavier on 2 and 4, from its lane', () => {
  const mix = emptyMix();
  mix.groups = [{ cardId: 'stagehand', lane: 0, count: 1, fireEvery: 2 }];
  const b = bar(mix);
  assert.equal(b.count('whoosh', (c) => c.dest === 'lane0'), 4);
  const thuds = b.calls.filter((c) => c.voice === 'tom');
  assert.deepEqual(thuds.map((c) => c.level), [0.3 * 0.75, 0.7 * 0.75, 0.3 * 0.75, 0.7 * 0.75]);
});

test('War Drum replaces the empty-stage boom on 1 and adds its beat-1 burst', () => {
  const mix = emptyMix();
  mix.groups = [{ cardId: 'kick-drum', lane: 1, count: 1, fireEvery: 4 }];
  const b = bar(mix);
  // Its own booms on 1 and 3, plus the march's on 3; the pickup kicks on beat 1.
  assert.equal(b.count('boom', (c) => c.dest === 'lane1'), 2);
  assert.equal(b.count('boom'), 3);
  assert.equal(b.count('kick'), 2);
});

test('Bassline follows the chord progression, one root per bar', () => {
  const mix = emptyMix();
  mix.groups = [{ cardId: 'bassline', lane: 2, count: 1, fireEvery: 4 }];
  const roots = [0, 1, 2, 3].map((i) => bar(mix, i).calls.find((c) => c.voice === 'bass')?.note);
  assert.deepEqual(roots, [0, 1, 2, 3].map((i) => chordAt(i * 4).root));
  assert.ok(new Set(roots).size >= 3);
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
  assert.equal(b.count('tom'), 8); // 4 thuds, each with a second stone
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

test('Chill music: same band, sparser — no bursts, doubles or lead; backbeat only', () => {
  const mix = emptyMix();
  mix.groups = [
    { cardId: 'stagehand', lane: 0, count: 1, fireEvery: 2 },
    { cardId: 'kick-drum', lane: 1, count: 1, fireEvery: 4 },
  ];
  mix.lanes[0] = { copy: true, drive: true, fuzz: false };
  mix.chain = 9;
  const f = fakeSynth();
  for (let e = 0; e < 8; e++) scheduleGroove(f.synth, mix, e, e * EIGHTH, EIGHTH, 'chill');
  const count = (v: string) => f.calls.filter((c) => c.voice === v).length;
  assert.equal(count('whoosh'), 2); // the Page only on the backbeat
  assert.equal(count('tom'), 2); // no second stones
  assert.equal(count('boom'), 2); // War Drum on 1 and 3, no burst
  assert.equal(count('kick'), 0);
  assert.equal(count('lead'), 0);
  assert.equal(count('pad'), 4); // chain pad stays, softer
  assert.ok(f.fx.get(0)!.drive < 0.55);
});

test("each headliner's units have their own instrument family, and each band its own song", () => {
  const lyra = emptyMix();
  lyra.headliner = 'lyra';
  lyra.groups = [{ cardId: 'arpeggiator', lane: 2, count: 1, fireEvery: 1 }];
  const l = bar(lyra);
  // 8 arpeggio notes, plus the ballad's low chord tone on 1 and its ripple on 3.
  assert.equal(l.count('keys', (c) => c.dest === 'lane2'), 8);
  assert.equal(l.count('keys'), 12);

  const clatter = emptyMix();
  clatter.headliner = 'clatter';
  clatter.groups = [
    { cardId: 'crew-chief', lane: 0, count: 1, fireEvery: 2 },
    { cardId: 'roadie', lane: 1, count: 2, fireEvery: 2 },
  ];
  const c = bar(clatter);
  assert.equal(c.count('gurdy'), 4); // the Quartermaster's hurdy-gurdy, every beat
  assert.equal(c.count('drone'), 1); // the jig's drone under the bar
  assert.equal(c.count('clank'), 5); // Squires every beat, and a spanner at the end of the bar
  // Clatter's jig keeps time on a shaker, every eighth, and swings: off-beats lean late.
  assert.equal(c.count('jingle'), 0);
  assert.equal(c.count('shaker'), 8);
  const offbeat = c.calls.find((x) => x.voice === 'shaker' && x.t > EIGHTH * 0.5 && x.t < EIGHTH * 2)!;
  assert.ok(Math.abs(offbeat.t - EIGHTH * 1.33) < 1e-9);
});

test("shots never swing: in Clatter's jig the band's backing leans late, but every unit sound lands on the straight eighth", () => {
  const mix = emptyMix();
  mix.headliner = 'clatter';
  mix.groups = [
    { cardId: 'roadie', lane: 1, count: 1, fireEvery: 1 },
    { cardId: 'rigger', lane: 0, count: 1, fireEvery: 1 },
    { cardId: 'backup-singer', lane: 2, count: 1, fireEvery: 1 },
  ];
  const b = bar(mix);
  const onGrid = (t: number) => Math.abs(t / EIGHTH - Math.round(t / EIGHTH)) < 1e-9;
  const shots = b.calls.filter((c) => c.dest === 'lane0' || c.dest === 'lane1' || c.dest === 'lane2');
  assert.ok(shots.length >= 16);
  for (const c of shots) assert.ok(onGrid(c.t), `${c.voice} at ${c.t} is off the grid`);
  // The jig's shaker still swings.
  assert.ok(b.calls.some((c) => c.voice === 'shaker' && !onGrid(c.t)));
});

test('a unit sliding to a new lane (Shift) is silent until it lands, as it does not fire', () => {
  const s = testState('shift-quiet');
  noWaves(s);
  playOnBeat(s, 'stagehand', 0);
  assert.equal(mixFrom(s).groups.length, 1);
  s.units[0]!.movedUntilBeat = s.clock.beat + 1;
  assert.equal(mixFrom(s).groups.length, 0);
});

test('only Thrum\'s Fill makes the band fire on every eighth', () => {
  const s = testState('fill-lyra');
  s.headliner.id = 'lyra';
  s.headliner.activeUntilBeat = s.clock.beat + 2;
  const mix = mixFrom(s);
  assert.equal(mix.fillUntil, -1);
  assert.equal(mix.swellUntil, s.clock.beat + 2);
});

test('The Hush mutes the beat: no drums or band while hushed, just a held chord each bar', () => {
  const mix = emptyMix();
  mix.groups = [{ cardId: 'kick-drum', lane: 0, count: 1, fireEvery: 4 }, { cardId: 'stagehand', lane: 1, count: 1, fireEvery: 2 }];
  mix.hushed = true;
  const b = bar(mix);
  assert.equal(b.count('kick') + b.count('boom') + b.count('snare') + b.count('jingle'), 0);
  assert.equal(b.count('pad'), 1);
});

test('Aria sings and Riot plays the bagpipes', () => {
  const aria = emptyMix();
  aria.headliner = 'aria';
  aria.groups = [{ cardId: 'backup-singer', lane: 0, count: 1, fireEvery: 2 }];
  assert.ok(bar(aria).count('voice') >= 3);
  const riot = emptyMix();
  riot.headliner = 'riot';
  riot.groups = [{ cardId: 'skater', lane: 1, count: 1, fireEvery: 2 }];
  const r = bar(riot);
  assert.equal(r.count('pipes'), 4); // the Jester's pipe squeak each beat
  assert.equal(r.count('drone'), 1); // over the reel's drone
});

test("a Tour band blends its styles: the lead's time-keeping, every member's signature", () => {
  const band = emptyMix();
  band.headliner = 'thrum';
  band.team = ['thrum', 'lyra', 'riot'];
  const b = bar(band);
  assert.equal(b.count('snare'), 2); // Thrum's march keeps time
  assert.equal(b.count('jingle'), 0);
  assert.ok(b.count('keys') >= 1); // Lyra's lute
  assert.equal(b.count('drone'), 1); // Riot's pipes
  assert.equal(b.count('crash'), 0); // only a lead's crash
  // Riot takes the lead: the reel's driving eighths take over the time-keeping.
  band.headliner = 'riot';
  const r = bar(band);
  assert.equal(r.count('jingle'), 8);
  assert.equal(r.count('crash'), 1);
});
