import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromSnapshot, hashState, step, toSnapshot } from '../src/engine';
import { BEATS_PER_BAR, SHIFT_COST } from '../src/engine/constants';
import { nextBeat, noWaves, ofType, playOnBeat, runTicks, testState } from './helpers';

function field() {
  const s = testState('shift');
  noWaves(s);
  playOnBeat(s, 'stagehand', 0);
  playOnBeat(s, 'kick-drum', 2);
  nextBeat(s);
  s.energy = 10;
  return s;
}

/** Step to the start of a fresh bar, so the once-per-bar rule starts clean. */
function toBarStart(s: ReturnType<typeof field>) {
  while (s.clock.beat % BEATS_PER_BAR !== 0) nextBeat(s);
}

test('Shift swaps two lanes’ units, keeps their slots, and leaves gates alone', () => {
  const s = field();
  playOnBeat(s, 'distortion', 0);
  nextBeat(s);
  toBarStart(s);
  const before = s.units.map((u) => ({ id: u.id, lane: u.lane, slot: u.slot }));
  const gateLane = s.gates[0]!.lane;
  const energy = s.energy;
  const ev = step(s, [{ type: 'shift', from: 0, to: 2 }]);
  assert.equal(ofType(ev, 'shifted').length, 1);
  for (const b of before) {
    const u = s.units.find((x) => x.id === b.id)!;
    assert.equal(u.lane, b.lane === 0 ? 2 : 0);
    assert.equal(u.slot, b.slot);
  }
  assert.equal(s.gates[0]!.lane, gateLane);
  assert.equal(s.energy, energy - SHIFT_COST);
});

test('Shift into an empty lane just moves the units', () => {
  const s = field();
  toBarStart(s);
  step(s, [{ type: 'shift', from: 0, to: 1 }]);
  assert.deepEqual(s.units.map((u) => u.lane).sort(), [1, 2]);
});

test('once per bar, costs energy, needs units, and only while playing', () => {
  const s = field();
  toBarStart(s);
  step(s, [{ type: 'shift', from: 0, to: 1 }]);
  assert.equal(ofType(step(s, [{ type: 'shift', from: 1, to: 0 }]), 'rejected')[0]?.reason, 'shifted');
  toBarStart(s);
  nextBeat(s);
  toBarStart(s);
  s.energy = 0;
  assert.equal(ofType(step(s, [{ type: 'shift', from: 1, to: 0 }]), 'rejected')[0]?.reason, 'energy');
  s.energy = 5;
  const empty = testState('empty');
  noWaves(empty);
  assert.equal(ofType(step(empty, [{ type: 'shift', from: 0, to: 1 }]), 'rejected')[0]?.reason, 'lane');
  assert.equal(ofType(step(s, [{ type: 'shift', from: 1, to: 1 }]), 'rejected')[0]?.reason, 'lane');
  s.phase = 'picking';
  assert.equal(ofType(step(s, [{ type: 'shift', from: 1, to: 0 }]), 'rejected')[0]?.reason, 'not-playing');
});

test('shifted units skip a beat of firing while they walk over', () => {
  const s = field();
  toBarStart(s);
  s.projectiles = [];
  step(s, [{ type: 'shift', from: 0, to: 1 }]);
  const moved = s.units.find((u) => u.lane === 1)!;
  const shotsFrom = (id: string) => s.projectiles.filter((p) => p.sourceCardId === id).length;
  // The rest of this beat and the next: the moved unit is quiet, the other keeps playing.
  for (;;) {
    step(s);
    if (s.clock.beat >= moved.movedUntilBeat!) break;
    assert.equal(shotsFrom(moved.cardId), 0);
  }
  runTicks(s, 120);
  assert.ok(shotsFrom(moved.cardId) > 0);
  assert.ok(s.projectiles.some((p) => p.lane === 1 && p.sourceCardId === moved.cardId));
});

test('a run with a Shift saves and restores exactly', () => {
  const s = field();
  toBarStart(s);
  step(s, [{ type: 'shift', from: 2, to: 1 }]);
  const back = fromSnapshot(toSnapshot(s));
  assert.equal(hashState(back), hashState(s));
});

test('soundcheck: the Shift step finishes once the band moves over and the ghoul goes down', async () => {
  const { TUTORIAL, createTutorialState, freshProgress } = await import('../src/ui/tutorial');
  const stepDef = TUTORIAL.find((t) => t.id === 'shift')!;
  const s = createTutorialState(false);
  step(s, [{ type: 'grant', cardIds: ['stagehand'], energy: 10 }]);
  const iid = s.hand[0]!.iid;
  nextBeat(s);
  step(s, [{ type: 'commit', iid, lane: 1, permille: 0 }]);
  runTicks(s, 120);
  assert.equal(s.units[0]?.lane, 1);
  for (const input of stepDef.setup ?? []) step(s, [input]);
  const p = freshProgress();
  const advance = (inputs: Parameters<typeof step>[1] = []) => {
    const ev = step(s, inputs);
    p.kills += ev.filter((e) => e.type === 'killed').length;
    return stepDef.done!(ev, s, p);
  };
  // Waiting without moving never finishes it (the ghoul walks past an empty lane, and another comes).
  let done = false;
  for (let t = 0; t < 60 * 20 && !done; t++) {
    done = advance();
    const again = stepDef.retry!([], s, p);
    if (again) for (const input of again) step(s, [input]);
  }
  assert.equal(done, false);
  advance([{ type: 'shift', from: 1, to: 0 }]);
  for (let t = 0; t < 60 * 30 && !done; t++) done = advance();
  assert.ok(done);
});
