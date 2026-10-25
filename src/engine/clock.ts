import {
  BEAT_MILLI,
  BEAT_UNITS,
  BEATS_PER_BAR,
  GOOD_MULT_PCT,
  GOOD_WINDOW_MS,
  MAX_BPM,
  MIN_BPM,
  OFF_MULT_PCT,
  SUBTICK,
  TICK_RATE,
  TIGHT_MULT_PCT,
  TIGHT_WINDOW_MS,
} from './constants';

/**
 * Beat clock (SPEC §4.2).
 *
 * `beat` is the index of the most recent beat; beat 0 lands at tick 0.
 * `phase` is how far we are past that beat, in [0, BEAT_UNITS).
 * Each tick, phase advances by `bpm`. Integer math only, so it never drifts.
 */
export interface ClockState {
  bpm: number;
  beat: number;
  phase: number;
  /** Tempo change waiting for the next beat, so tempo only ever changes on a beat. */
  pendingBpm: number | null;
}

export type Grade = 'tight' | 'good' | 'off';

export interface Timing {
  grade: Grade;
  /** Signed offset from the nearest beat in milli-units. Negative = early. */
  offsetMilli: number;
  /** The beat this play resolves on. */
  resolveBeat: number;
  /** True if the play was late but inside the Good window, so it resolves right away. */
  immediate: boolean;
}

export function createClock(bpm: number): ClockState {
  assertBpm(bpm);
  return { bpm, beat: 0, phase: 0, pendingBpm: null };
}

function assertBpm(bpm: number): void {
  if (!Number.isInteger(bpm) || bpm < MIN_BPM || bpm > MAX_BPM) {
    throw new RangeError(`bpm must be an integer in [${MIN_BPM}, ${MAX_BPM}], got ${bpm}`);
  }
}

/** Queue a tempo change; it takes effect on the next beat. */
export function setTempo(clock: ClockState, bpm: number): void {
  assertBpm(bpm);
  clock.pendingBpm = bpm;
}

/**
 * Advance one tick. Returns true if a beat landed during this tick.
 * BPM is capped well below BEAT_UNITS, so at most one beat lands per tick.
 */
export function advanceClock(clock: ClockState): boolean {
  clock.phase += clock.bpm;
  if (clock.phase < BEAT_UNITS) return false;
  clock.phase -= BEAT_UNITS;
  clock.beat += 1;
  if (clock.pendingBpm !== null) {
    clock.bpm = clock.pendingBpm;
    clock.pendingBpm = null;
  }
  return true;
}

/** 0 = downbeat (beat 1 of the bar), 1–3 = beats 2–4. */
export function beatInBar(beat: number): number {
  return ((beat % BEATS_PER_BAR) + BEATS_PER_BAR) % BEATS_PER_BAR;
}

export function isDownbeat(beat: number): boolean {
  return beatInBar(beat) === 0;
}

/** Milli-units per millisecond at this tempo. */
export function milliPerMs(bpm: number): number {
  return (BEAT_MILLI * bpm) / 60_000;
}

/** Convert a milli-unit offset to ms, for display only. */
export function milliToMs(milli: number, bpm: number): number {
  return milli / milliPerMs(bpm);
}

/** Ticks per beat at this tempo, for display only (may be fractional). */
export function ticksPerBeat(bpm: number): number {
  return (TICK_RATE * 60) / bpm;
}

/**
 * Grade an input that happened `permille` thousandths of a tick after the
 * clock's current position (i.e. during the tick about to be simulated).
 *
 * - Nearest beat ahead → resolves on that beat, graded on how early it was.
 * - Nearest beat behind and within the Good window → late but counted:
 *   resolves immediately as part of that beat.
 * - Otherwise Off → resolves on the next beat with no bonus.
 */
export function gradeInput(clock: ClockState, permille: number, relaxed: boolean): Timing {
  if (!Number.isInteger(permille) || permille < 0 || permille >= SUBTICK) {
    throw new RangeError(`permille must be an integer in [0, ${SUBTICK}), got ${permille}`);
  }
  let beat = clock.beat;
  let phaseMilli = clock.phase * SUBTICK + permille * clock.bpm;
  if (phaseMilli >= BEAT_MILLI) {
    // The input lands after the beat that falls inside this tick.
    phaseMilli -= BEAT_MILLI;
    beat += 1;
  }
  const sinceBeat = phaseMilli;
  const untilNext = BEAT_MILLI - phaseMilli;

  // Window comparison in integers: |offset| <= windowMs * milliPerMs(bpm).
  // milliPerMs(bpm) = BEAT_MILLI * bpm / 60000 = 60 * bpm for the current constants.
  const scale = relaxed ? 2 : 1;
  const within = (milli: number, windowMs: number) =>
    milli * 60_000 <= windowMs * scale * BEAT_MILLI * clock.bpm;

  if (untilNext <= sinceBeat) {
    const grade: Grade = within(untilNext, TIGHT_WINDOW_MS) ? 'tight' : within(untilNext, GOOD_WINDOW_MS) ? 'good' : 'off';
    return { grade, offsetMilli: -untilNext, resolveBeat: beat + 1, immediate: false };
  }
  if (within(sinceBeat, GOOD_WINDOW_MS)) {
    const grade: Grade = within(sinceBeat, TIGHT_WINDOW_MS) ? 'tight' : 'good';
    return { grade, offsetMilli: sinceBeat, resolveBeat: beat, immediate: true };
  }
  return { grade: 'off', offsetMilli: sinceBeat, resolveBeat: beat + 1, immediate: false };
}

export function gradeMultiplierPct(grade: Grade): number {
  switch (grade) {
    case 'tight':
      return TIGHT_MULT_PCT;
    case 'good':
      return GOOD_MULT_PCT;
    case 'off':
      return OFF_MULT_PCT;
  }
}
