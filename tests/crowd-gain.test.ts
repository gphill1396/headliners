import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, SINGALONG_LINKS, step, type EngineState } from '../src/engine';
import { cardText } from '../src/content/text';
import { getCard } from '../src/content/cards';
import { giveCard, nextBeat, ofType, playOnBeat, testState } from './helpers';
import { addLink } from '../src/engine/effects';
import { createCtx } from '../src/engine/context';

/** Run Encore until wave `n` has just started. */
function toWave(s: EngineState, n: number) {
  const events = [];
  for (let t = 0; t < 60 * 60 * 3 && s.wave.index < n; t++) events.push(...step(s, s.phase === 'picking' ? [{ type: 'pick', index: null }] : s.phase === 'evolving' ? [{ type: 'evolve', index: 0 }] : []));
  return events;
}

test('a clean set (nothing got through, band in the pocket) wins back 1 crowd as the wave ends', () => {
  const s = createState({ seed: 'clean' });
  toWave(s, 1);
  s.crowd = 20;
  s.pocket.depth = 3;
  // Every enemy dies the moment it appears: nothing leaks.
  const events = [];
  for (let t = 0; t < 60 * 60 * 3 && s.wave.index < 2; t++) {
    for (const e of s.enemies) e.hp = 0;
    events.push(...step(s));
  }
  const gains = ofType(events, 'crowdGain');
  assert.deepEqual(gains.map((g) => [g.reason, g.amount]), [['clean', 1]]);
  assert.equal(s.crowd, 21);
});

test('no clean set out of the pocket, or when something got through', () => {
  const off = createState({ seed: 'off' });
  toWave(off, 1);
  off.crowd = 20;
  off.pocket.depth = 0;
  const quiet = [];
  for (let t = 0; t < 60 * 60 * 3 && off.wave.index < 2; t++) {
    for (const e of off.enemies) e.hp = 0;
    off.pocket.depth = 0;
    quiet.push(...step(off));
  }
  assert.equal(ofType(quiet, 'crowdGain').length, 0);

  const s = createState({ seed: 'leaky' });
  toWave(s, 1);
  s.pocket.depth = 3;
  s.stats.leaks += 1;
  const events = toWave(s, 2);
  assert.equal(ofType(events, 'crowdGain').filter((g) => g.reason === 'clean').length, 0);
});

test('sing-along: every 10 links in one chain wins back 1 crowd', () => {
  const s = testState('sing');
  s.crowd = 10;
  const ctx = createCtx();
  const events = ctx.events;
  for (let i = 0; i < SINGALONG_LINKS * 2; i++) addLink(s, ctx, 'power-chord', 'x', 0, 10);
  assert.equal(ofType(events, 'crowdGain').filter((g) => g.reason === 'singalong').length, 2);
  assert.equal(s.crowd, 12);
});

test('crowd never goes above the max', () => {
  const s = testState('max');
  s.crowd = s.maxCrowd;
  const ctx = createCtx();
  const events = ctx.events;
  for (let i = 0; i < SINGALONG_LINKS; i++) addLink(s, ctx, 'power-chord', 'x', 0, 10);
  assert.equal(s.crowd, s.maxCrowd);
  assert.equal(ofType(events, 'crowdGain').length, 0);
});

test('Tavern Chorus: on beat 1 with a 5+ chain, win back 1 crowd', () => {
  const s = testState('chorus');
  s.energy = 10;
  s.crowd = 10;
  giveCard(s, 'tavern-chorus');
  playOnBeat(s, 'tavern-chorus', 0);
  assert.equal(s.amps.length, 1);
  assert.match(cardText(getCard('tavern-chorus')), /crowd/i);
  s.chain.links = 6;
  s.chain.lastLinkBeat = s.clock.beat;
  s.chain.holdUntilBeat = s.clock.beat + 100;
  let gained = 0;
  for (let b = 0; b < 4; b++) gained += ofType(nextBeat(s), 'crowdGain').length;
  assert.equal(gained, 1);
  assert.equal(s.crowd, 11);
});
