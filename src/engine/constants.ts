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
export const WAVE_TEMPO_STEP = 3;
export const WAVE_MAX_BPM = 160;
/** Card pick every N waves (Phase 1a addition, SPEC §10). */
export const PICK_EVERY_WAVES = 3;
/** A unit can gain at most this many Volume counters. */
export const VOLUME_MAX = 20;
/** Discard-cycle a card in hand: costs this much energy (SPEC §4.3). */
export const CYCLE_COST = 1;
/** Shift (S4.3): swap two lanes' units. Costs this much energy, once per bar (2, not 1: at 1 it made Thrum and Lyra Tours too easy). */
export const SHIFT_COST = 2;
/** Shifted units skip firing for this many beats while they walk over. */
export const SHIFT_PAUSE_BEATS = 1;

// ---------------------------------------------------------------- Aria and Riot (Phase 2c)
/** Aria's passive: riffs slow the enemies in their lane to this % speed for this many beats. */
export const ARIA_RIFF_SLOW_PCT = 50;
export const ARIA_RIFF_SLOW_BEATS = 2;
/** Banshee: slowed enemies take this % damage. */
export const BANSHEE_PCT = 150;
/** Vibrato gate: what a slowing shot does. */
export const SLOW_SHOT_PCT = 50;
export const SLOW_SHOT_BEATS = 2;
/** Riot's passive: this many kills win back 1 crowd. */
/** Clatter's Tight-hit Squire also brings 1 energy, on every Nth bar (1 = every bar it comes). */
export const CLATTER_SUPPLY_BARS = 1;
export const RIOT_KILLS_PER_CROWD = 5;
/** Riot's passive wins back at most this much crowd a wave (a band with Thrum won back 40 a Tour without it). */
export const RIOT_CROWD_PER_WAVE = 2;
/** Riot's passive needs a chain at least this long. */
export const RIOT_CHAIN = 3;
/** Riot's ability: all damage ×this % while it's on. */
export const RIOT_DAMAGE_PCT = 200;
/** Comeback: +this % damage per point of crowd you're missing, up to the cap. */
export const COMEBACK_PCT_PER_CROWD = 3;
export const COMEBACK_MAX_PCT = 60;
/** Anarchy: Feedback costs no crowd while the chain is at least this long. */
export const ANARCHY_CHAIN = 5;
/** An ability tapped Off the beat fizzles; you can try again after this many beats. */
export const ABILITY_RETRY_BEATS = 4;

// ---------------------------------------------------------------- Tour (SPEC S2.1)
export const TOUR_ACTS = 3;
/** Stops per act before the boss. */
export const TOUR_ROWS = 4;
export const TOUR_COLS = 3;
/** Wave level of each act's first stop; a fight at row r plays levels base+r-1 onward. */
export const TOUR_ACT_LEVEL = [1, 5, 9] as const;
/** Waves in a fight. */
export const TOUR_FIGHT_WAVES = 3;
/** Elites hit harder: enemy health ×this. */
export const TOUR_ELITE_HP = 1.25;
/** Two bars to set up before the first wave of a fight. */
export const TOUR_COUNT_IN_BEATS = 8;
export const TOUR_MERCH = { fight: 20, elite: 40, boss: 60 } as const;
export const TOUR_REST_HEAL = 10;
export const TOUR_SHOP_HEAL = 8;
export const TOUR_SHOP_HEAL_PRICE = 25;
export const TOUR_SHOP_REMOVE_PRICE = 45;
export const TOUR_PRICES = { starter: 30, common: 40, rare: 65, token: 999 } as const;
/** After this wave, your headliner evolves (SPEC §4.7, S1.5). */
export const EVOLVE_AFTER_WAVE = 5;
/** Metronome: timing windows this much wider, in percent. */
export const METRONOME_WIDEN_PCT = 130;
/** Load Out: hand size cap for returned Riffs. */
export const LOAD_OUT_HAND_MAX = 7;
/** Mosh Pit: Roadies on stage needed for their shots to Splash. */
export const MOSH_PIT_TOKENS = 5;
/** The Hush, the Phase 1 boss, plays every 10th wave (SPEC §4.8). */
export const BOSS_EVERY_WAVES = 10;
/** Phase 3: The Hush calls in a Brute this often. */
export const BOSS_BRUTE_EVERY_BEATS = 6;
/** Phase 1: other enemies take this much of normal damage while The Hush shields them. */
export const BOSS_SHIELD_PCT = 50;
/** Beating The Hush wins back this much crowd. */
export const BOSS_CROWD_REWARD = 5;
export const PICK_OPTIONS = 3;

// ---- Winning crowd back ----
/** Every this many links in one chain, the crowd sings along... */
export const SINGALONG_LINKS = 15;
/** ...and this much crowd comes back. */
export const SINGALONG_CROWD = 1;
/** A wave (or Tour fight wave) with nothing getting through wins back this much. */
export const CLEAN_SET_CROWD = 1;

// ---- Heat (S3.2) ----
/** Heat 1: the crowd a Tour starts with. */
export const HEAT_START_CROWD = 25;
/** Heat 2: monster health. Heat 3: Tournaments on top. Heat 6: bosses. */
export const HEAT_HP = 1.15;
export const HEAT_ELITE_HP = 1.6;
export const HEAT_BOSS_HP = 1.35;
/** Heat 5: what an Inn wins back. */
export const HEAT_REST_HEAL = 5;
/** Heat 7: monsters walk this much faster (percent). */
export const HEAT_SPEED_PCT = 115;
