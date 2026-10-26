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
export const OFF_MULT_PCT = 75;

export const START_BPM = 100;
export const MIN_BPM = 40;
export const MAX_BPM = 240;

/** Field geometry in engine units. Display scales these to pixels. 0 = top of the field. */
export const LANES = 3;
export const FIELD_DEPTH = 100_000;
/** Enemies reaching this depth hit the stage and cost crowd. Units stand here. */
export const STAGE_LINE = 92_000;
/** Gate slots per lane, listed nearest the stage first. */
export const GATE_DEPTHS: readonly number[] = [70_000, 48_000];
export const UNIT_SLOTS = 3;
/** Projectile speed in depth units per tick (crosses the field in ~0.55 s). */
export const PROJECTILE_SPEED = 2_800;
/** Above this, copy gates add damage to the shot instead of spawning more (same total damage, bounded cost). */
export const MAX_PROJECTILES = 1_200;
/** Splash reaches enemies within this depth of the hit, for half damage. */
export const SPLASH_RADIUS = 7_000;
/** Flyers swoop down past this depth, where any shot can hit them. */
export const SWOOP_DEPTH = 76_000;
export const SPLASH_PCT = 50;

export const START_ENERGY = 3;
export const MAX_ENERGY = 10;
export const HAND_SIZE = 5;
export const START_CROWD = 30;

/**
 * Accuracy multiplier for a play's own effect, in percent, sliding continuously
 * across the timing window: dead-on → edge of Tight → edge of Good. Off is OFF_MULT_PCT.
 */
export const ACC_DEAD_ON_PCT = 160;
export const ACC_TIGHT_EDGE_PCT = 130;
export const ACC_GOOD_EDGE_PCT = 105;

/** Chain multiplier (SPEC §4.6): each link raises it by how on-beat that play was. */
export const CHAIN_BASE_PCT = 100;
export const DEAD_ON_WINDOW_MS = 15;
export const CHAIN_STEP_DEAD_ON_PCT = 30;
export const CHAIN_STEP_TIGHT_PCT = 20;
export const CHAIN_STEP_GOOD_PCT = 8;
/** Automatic links (Echo, Downbeat triggers) have no timing of their own. */
export const CHAIN_STEP_AUTO_PCT = 5;

/**
 * The pocket: consistency, not perfection. Tight plays that land close to your
 * own recent timing deepen it; each level adds POCKET_STEP_PCT to all damage.
 */
export const POCKET_MAX = 10;
export const POCKET_STEP_PCT = 4;
export const POCKET_WINDOW_MS = 25;
export const CHAIN_CAP = 50;
/** A chain ends when this many beats pass with no new link. */
export const CHAIN_GRACE_BEATS = 1;
export const BIG_CHAIN = 8;

/** Encore waves. */
export const WAVE_BEATS = 24;
export const WAVE_SPAWN_BEATS = 16;
/** Enemy health multiplier per wave, applied by repeated multiplication (no Math.pow in the engine). */
export const WAVE_HP_GROWTH = 1.08;
export const WAVE_TEMPO_STEP = 2;
export const WAVE_MAX_BPM = 150;
/** Card pick every N waves (Phase 1a addition, SPEC §10). */
export const PICK_EVERY_WAVES = 3;
/** The Hush, the Phase 1 boss, plays every 10th wave (SPEC §4.8). */
export const BOSS_EVERY_WAVES = 10;
/** Phase 3: The Hush calls in a Brute this often. */
export const BOSS_BRUTE_EVERY_BEATS = 6;
/** Phase 1: other enemies take this much of normal damage while The Hush shields them. */
export const BOSS_SHIELD_PCT = 50;
/** Beating The Hush wins back this much crowd. */
export const BOSS_CROWD_REWARD = 5;
export const PICK_OPTIONS = 3;
