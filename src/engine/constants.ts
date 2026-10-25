/** Fixed simulation rate (SPEC §2). Every engine duration is measured in ticks. */
export const TICK_RATE = 60;

/** Milliseconds per tick. For runners and display only — never used inside engine math. */
export const TICK_MS = 1000 / TICK_RATE;

/**
 * Beat clock units.
 *
 * Each tick the clock phase advances by `bpm` units. One beat is
 * TICK_RATE * 60 = 3600 units, so at 100 BPM a beat takes exactly 36 ticks,
 * and at any integer BPM the clock stays in exact integer math.
 */
export const BEAT_UNITS = TICK_RATE * 60;

/**
 * Inputs carry a sub-tick position in thousandths of a tick ("permille"),
 * so timing grades are finer than the 16.7 ms tick. Grading works in
 * milli-units: BEAT_UNITS * 1000 per beat.
 */
export const SUBTICK = 1000;
export const BEAT_MILLI = BEAT_UNITS * SUBTICK;

export const BEATS_PER_BAR = 4;

/** Timing windows in ms either side of the beat (SPEC §4.2). */
export const TIGHT_WINDOW_MS = 60;
export const GOOD_WINDOW_MS = 120;

/** Effect multipliers for timing grades, as integer percentages (SPEC §4.2). */
export const TIGHT_MULT_PCT = 150;
export const GOOD_MULT_PCT = 120;
export const OFF_MULT_PCT = 100;

export const START_BPM = 100;
export const MIN_BPM = 40;
export const MAX_BPM = 240;

/** Field geometry in engine units. Display scales these to pixels. */
export const LANES = 3;
export const FIELD_DEPTH = 100_000;
