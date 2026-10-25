import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceClock,
  beatInBar,
  createClock,
  gradeInput,
  gradeMultiplierPct,
  setTempo,
  type ClockState,
} from '../src/engine/clock';
import { BEAT_MILLI, BEAT_UNITS } from '../src/engine/constants';

function runTicks(clock: ClockState, ticks: number): number[] {
  const beatTicks: number[] = [];
  for (let t = 1; t <= ticks; t++) if (advanceClock(clock)) beatTicks.push(t);
  return beatTicks;
}

test('100 BPM lands a beat every 36 ticks exactly', () => {
  const clock = createClock(100);
  const beats = runTicks(clock, 36 * 50);
  assert.equal(beats.length, 50);
  beats.forEach((t, i) => assert.equal(t, 36 * (i + 1)));
});

test('no drift at awkward tempos over a long session', () => {
  for (const bpm of [97, 110, 133, 171]) {
    const clock = createClock(bpm);
    const ticks = 60 * 60 * 60; // one hour
    runTicks(clock, ticks);
    assert.equal(clock.beat, Math.floor((ticks * bpm) / BEAT_UNITS), `bpm ${bpm}`);
    assert.equal(clock.phase, (ticks * bpm) % BEAT_UNITS, `bpm ${bpm}`);
  }
});

test('tempo changes wait for the next beat', () => {
  const clock = createClock(100);
  runTicks(clock, 10);
  setTempo(clock, 120);
  assert.equal(clock.bpm, 100);
  runTicks(clock, 26); // beat 1 lands on tick 36
  assert.equal(clock.beat, 1);
  assert.equal(clock.bpm, 120);
  assert.equal(clock.pendingBpm, null);
});

test('rejects invalid tempos', () => {
  assert.throws(() => createClock(0));
  assert.throws(() => createClock(500));
  assert.throws(() => createClock(100.5));
});

test('beat 1 of the bar is index 0', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(beatInBar), [0, 1, 2, 3, 0, 1]);
});

/**
 * Build a clock positioned so an input with permille 0 lands `offsetMs` from
 * beat 10 at 100 BPM (negative = early, i.e. before beat 10).
 * At 100 BPM one ms is 6000 milli-units, so whole ms always map to whole units.
 */
function clockAt(offsetMs: number): ClockState {
  const bpm = 100;
  const milliPerMs = (BEAT_MILLI * bpm) / 60_000;
  const offsetMilli = offsetMs * milliPerMs;
  const beat = offsetMs < 0 ? 9 : 10;
  const phaseMilli = offsetMs < 0 ? BEAT_MILLI + offsetMilli : offsetMilli;
  assert.equal(phaseMilli % 1000, 0);
  return { bpm, beat, phase: phaseMilli / 1000, pendingBpm: null };
}

const grade = (offsetMs: number, relaxed = false) => gradeInput(clockAt(offsetMs), 0, relaxed);

test('early inputs resolve on the upcoming beat', () => {
  assert.deepEqual(
    [grade(-5), grade(-60), grade(-61), grade(-120), grade(-121), grade(-250)].map((t) => [t.grade, t.resolveBeat, t.immediate]),
    [
      ['tight', 10, false],
      ['tight', 10, false],
      ['good', 10, false],
      ['good', 10, false],
      ['off', 10, false],
      ['off', 10, false],
    ],
  );
});

test('late inputs inside the Good window count for the beat just passed', () => {
  assert.deepEqual(
    [grade(0), grade(40), grade(60), grade(100), grade(120)].map((t) => [t.grade, t.resolveBeat, t.immediate]),
    [
      ['tight', 10, true],
      ['tight', 10, true],
      ['tight', 10, true],
      ['good', 10, true],
      ['good', 10, true],
    ],
  );
});

test('late inputs outside the window are Off and wait for the next beat', () => {
  const t = grade(200);
  assert.equal(t.grade, 'off');
  assert.equal(t.resolveBeat, 11);
  assert.equal(t.immediate, false);
});

test('offset sign: negative early, positive late', () => {
  assert.ok(grade(-30).offsetMilli < 0);
  assert.ok(grade(30).offsetMilli > 0);
});

test('relaxed timing doubles the windows', () => {
  assert.equal(grade(-100).grade, 'good');
  assert.equal(grade(-100, true).grade, 'tight');
  assert.equal(grade(-200, true).grade, 'good');
  assert.equal(grade(-250, true).grade, 'off');
  assert.equal(grade(200, true).grade, 'good');
});

test('sub-tick input that crosses the beat inside the tick is graded as late', () => {
  // Phase is 30 units (~1 tick at 100 BPM) short of beat 10; permille 999 lands just past it.
  const clock: ClockState = { bpm: 100, beat: 9, phase: BEAT_UNITS - 30, pendingBpm: null };
  const t = gradeInput(clock, 999, false);
  assert.equal(t.resolveBeat, 10);
  assert.equal(t.immediate, true);
  assert.equal(t.grade, 'tight');
});

test('grade multipliers match the spec', () => {
  assert.equal(gradeMultiplierPct('tight'), 150);
  assert.equal(gradeMultiplierPct('good'), 120);
  assert.equal(gradeMultiplierPct('off'), 100);
});
