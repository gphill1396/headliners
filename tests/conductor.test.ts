import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Conductor } from '../src/audio/conductor';
import type { BoardMix } from '../src/audio/groove';
import type { Synth } from '../src/audio/synth';

const mix = (): BoardMix => ({ groups: [], lanes: [0, 1, 2].map(() => ({ copy: false, drive: false, fuzz: false })), blast: false, chain: 0, fillUntil: -1 });

/** A fake synth whose audio clock equals performance time in seconds. */
function fake() {
  const calls: { k: string; t: number; accent?: boolean }[] = [];
  const synth = {
    audioTimeAt: (ms: number) => ms / 1000,
    metronome: (t: number, accent: boolean) => calls.push({ k: 'metronome', t, accent }),
    hat: (t: number) => calls.push({ k: 'hat', t }),
    kick: (t: number) => calls.push({ k: 'kick', t }),
    snare: () => {},
    setLaneFx: () => {},
    setMuffle: () => calls.push({ k: 'muffle', t: 0 }),
    fadeBand: (t: number) => calls.push({ k: 'fade', t }),
    resetBand: (t: number) => calls.push({ k: 'reset', t }),
    lane: () => null,
  } as unknown as Synth;
  return { synth, calls };
}

/** Drive the conductor frame by frame (16 ms) from `from` to `to` ms. */
function run(c: Conductor, synth: Synth, from: number, to: number) {
  let handoff = null;
  for (let now = from; now <= to; now += 16) handoff = c.tick(now, synth, 'full', mix) ?? handoff;
  return handoff;
}

test('metronome ticks every beat with an accent on beat 1', () => {
  const { synth, calls } = fake();
  const c = new Conductor();
  c.startMetronome(0, 100); // 600 ms beats
  run(c, synth, 0, 2_500);
  const ticks = calls.filter((x) => x.k === 'metronome');
  assert.deepEqual(ticks.map((x) => Math.round(x.t * 1000)), [0, 600, 1200, 1800, 2400]);
  assert.deepEqual(ticks.map((x) => x.accent), [true, false, false, false, true]);
});

test('nextBeatAt finds the next matching bar position with enough lead', () => {
  const c = new Conductor();
  c.startMetronome(0, 100);
  assert.equal(c.nextBeatAt(100, 0, 2), 2_400); // next beat 1 at least 2 beats away
  assert.equal(c.nextBeatAt(100, 2, 1), 1_200); // next beat 3
});

test('game over: the band fades for two bars, then only the metronome', () => {
  const { synth, calls } = fake();
  const c = new Conductor();
  // Engine beat 40 happened at t=0, 100 BPM.
  c.takeOver('fade', 0, 0, 40, 100, 81, synth);
  run(c, synth, 0, 7_000);
  assert.equal(c.mode, 'metronome');
  assert.ok(calls.some((x) => x.k === 'fade'));
  const lastHat = Math.max(...calls.filter((x) => x.k === 'hat').map((x) => x.t));
  assert.ok(lastHat < 4.8, 'band stops after two bars');
  const metronomes = calls.filter((x) => x.k === 'metronome').map((x) => x.t);
  assert.ok(metronomes.some((t) => t > 6));
});

test('handing back to the engine happens exactly at the chosen beat', () => {
  const { synth } = fake();
  const c = new Conductor();
  c.takeOver('muffled', 0, 0, 80, 100, 161, synth);
  const at = c.nextBeatAt(1_000, 0, 1);
  c.handBackAt(at, 80);
  const handoff = run(c, synth, 1_000, 4_000);
  assert.deepEqual(handoff, { eighth: 160, at });
  assert.equal(c.mode, 'engine');
});

test('after a long gap (app in background) it skips ahead instead of replaying', () => {
  const { synth, calls } = fake();
  const c = new Conductor();
  c.startMetronome(0, 100);
  c.tick(0, synth, 'full', mix);
  c.tick(600_000, synth, 'full', mix); // ten minutes later
  assert.ok(calls.filter((x) => x.k === 'metronome').length < 5);
});
