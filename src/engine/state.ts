import { createClock, type ClockState, type Grade } from './clock';
import { HAND_SIZE, START_BPM, START_CROWD, START_ENERGY } from './constants';
import { createRng, shuffleInPlace, type RngState } from './rng';
import type { EnemyKind, GateKind, HeadlinerId } from './types';
import { STARTER_DECKS } from '../content/cards';

export const ENGINE_STATE_VERSION = 4;

/** A specific copy of a card. `iid` is unique for the run so inputs can name it exactly. */
export interface CardInstance {
  iid: number;
  cardId: string;
}

/** A committed play waiting for its beat. */
export interface QueuedPlay {
  id: number;
  card: CardInstance;
  lane: number;
  grade: Grade;
  offsetMilli: number;
  /** Multiplier for this play's own effect, from how on-beat it was. */
  accuracyPct: number;
  /** How much this play raises the chain multiplier. */
  chainStepPct: number;
  resolveBeat: number;
  /** True for the repeat queued by Echo. Echoes don't echo again. */
  isEcho: boolean;
}

export interface Unit {
  id: number;
  card: CardInstance;
  cardId: string;
  lane: number;
  slot: number;
  /** Damage per shot, including the timing grade it was played with. */
  damage: number;
  fireEvery: number;
  pierce: number;
  splash: boolean;
  placedBeat: number;
  /** Tokens (Roadies) leave on this beat; -1 for normal units. Missing in pre-1b saves = never. */
  expiresBeat?: number;
  /** Created by another card, not drawn from the deck: never returns to the discard pile. */
  token?: boolean;
  /** Shots can hit flying enemies. */
  antiAir?: boolean;
  /** Shots go for priority targets first. */
  priority?: boolean;
  /** Volume counters gained (each already added to damage). */
  volume?: number;
}

export interface Gate {
  id: number;
  card: CardInstance;
  cardId: string;
  lane: number;
  slot: number;
  depth: number;
  kind: GateKind;
  amount: number;
  durability: number;
  maxDurability: number;
  placedBeat: number;
  /** Crescendo: shots that have passed through it. */
  passes?: number;
  /** Disabled by a Hexer this tick: shots pass through unchanged. */
  hexed?: boolean;
}

export interface Amp {
  id: number;
  card: CardInstance;
  cardId: string;
  placedBeat: number;
}

export interface Enemy {
  id: number;
  kind: EnemyKind;
  lane: number;
  depth: number;
  speed: number;
  hp: number;
  maxHp: number;
  armor: number;
  crowdDamage: number;
  /** Reached the stage (removed without counting as a kill). */
  leaked: boolean;
  /** A piece of a Splitter: doesn't split again. */
  child?: boolean;
  /** Damage beyond its remaining health on the killing hit. */
  overkill?: number;
  /** Last beat a Shieldbearer reported a block (throttles the 'blocked' event). */
  lastBlockBeat?: number;
  /** Shots a Shieldbearer's shield can still block. */
  shieldLeft?: number;
}

export interface Projectile {
  id: number;
  lane: number;
  /** Horizontal position within the lane, 0–999, for drawing only. */
  x: number;
  depth: number;
  damage: number;
  pierceLeft: number;
  splash: boolean;
  /** Ignores armor (passed through a Toolbox). Missing in older saves = false. */
  shred?: boolean;
  /** Can hit flying enemies. */
  antiAir?: boolean;
  /** Flies past other enemies to hit priority targets. */
  priority?: boolean;
  /** Came in from the side through a speaker: gets past Shieldbearers. */
  side?: boolean;
  /** Bitmask of gate slots this shot has already passed. */
  gatesPassed: number;
  /** Card that fired it, for the damage breakdown. */
  sourceCardId: string;
}

export interface ChainState {
  links: number;
  multPct: number;
  /** Beat of the most recent link; -1 when no chain is running. */
  lastLinkBeat: number;
  /** Metronome: the chain can't lapse before this beat. */
  holdUntilBeat?: number;
}

/** The pocket: how consistently you've been landing your plays (0–POCKET_MAX). */
export interface PocketState {
  depth: number;
  /** Running average of your timing offsets, in milli-units (where *your* pocket sits). */
  avgOffsetMilli: number;
}

export interface WaveState {
  index: number;
  startBeat: number;
  /** Enemy health multiplier for this wave. */
  hpMult: number;
  spawns: { beatOffset: number; kind: EnemyKind }[];
  nextSpawn: number;
  kinds: EnemyKind[];
}

export interface HeadlinerState {
  id: HeadlinerId;
  readyBeat: number;
  activeUntilBeat: number;
  /** Bar index when the Tight-energy passive last paid out. */
  lastTightBonusBar: number;
  /** Chosen evolution (index into the headliner's two), once it has evolved. Missing in older saves = not yet. */
  evolution?: 0 | 1 | null;
  /** Polyrhythm: the last non-echo play's beat and lane. */
  lastPlay?: { beat: number; lane: number };
  /** Load Out: the last beat a Riff came back. */
  lastLoadOutBeat?: number;
}

export interface EngineSettings {
  relaxedTiming: boolean;
}

export interface EngineStats {
  tight: number;
  good: number;
  off: number;
  kills: number;
  leaks: number;
  cardsPlayed: number;
  bestChain: number;
  showstoppers: number;
  /** Total damage dealt per card id. */
  damageBySource: Record<string, number>;
}

export type Phase = 'playing' | 'picking' | 'evolving' | 'over';

/**
 * 'encore': the real game.
 * 'tutorial': the guided soundcheck — no waves, leaks cost nothing, and the
 * script can hand out cards and place enemies with 'grant' and 'spawn' inputs.
 */
export type Mode = 'encore' | 'tutorial';

/**
 * Entire game state. Must stay plain JSON-safe data so it snapshots, hashes
 * and restores exactly (SPEC §2, §7).
 */
/** The Hush while it's on the field (SPEC §4.8). Phase follows its health: 1 above 2/3, 2 above 1/3, then 3. */
export interface BossState {
  enemyId: number;
  phase: 1 | 2 | 3;
  /** Phase 3: next beat a Brute is called in. */
  nextBruteBeat: number;
}

export interface EngineState {
  version: number;
  mode: Mode;
  seed: string;
  tick: number;
  rng: RngState;
  clock: ClockState;
  /** Index of the last eighth note processed (beat * 2 + half). */
  eighth: number;
  settings: EngineSettings;
  nextId: number;
  phase: Phase;
  energy: number;
  crowd: number;
  maxCrowd: number;
  /** The boss on the field, if any. Missing in older saves = none. */
  boss?: BossState | null;
  score: number;
  draw: CardInstance[];
  hand: CardInstance[];
  discard: CardInstance[];
  queue: QueuedPlay[];
  units: Unit[];
  gates: Gate[];
  amps: Amp[];
  enemies: Enemy[];
  projectiles: Projectile[];
  chain: ChainState;
  pocket: PocketState;
  wave: WaveState;
  /** Card ids on offer while phase === 'picking'. */
  pick: string[];
  headliner: HeadlinerState;
  stats: EngineStats;
}

export interface CreateOptions {
  seed: string;
  bpm?: number;
  relaxedTiming?: boolean;
  deck?: readonly string[];
  mode?: Mode;
  headliner?: HeadlinerId;
}

export function emptyChain(): ChainState {
  return { links: 0, multPct: 100, lastLinkBeat: -1 };
}

export function createState(opts: CreateOptions): EngineState {
  const rng = createRng(opts.seed);
  let nextId = 1;
  const headliner = opts.headliner ?? 'thrum';
  const deck = (opts.deck ?? STARTER_DECKS[headliner]).map((cardId) => ({ iid: nextId++, cardId }));
  shuffleInPlace(rng, deck);
  const hand = deck.splice(0, HAND_SIZE);
  return {
    version: ENGINE_STATE_VERSION,
    mode: opts.mode ?? 'encore',
    seed: opts.seed,
    tick: 0,
    rng,
    clock: createClock(opts.bpm ?? START_BPM),
    eighth: 0,
    settings: { relaxedTiming: opts.relaxedTiming ?? false },
    nextId,
    phase: 'playing',
    energy: START_ENERGY,
    crowd: START_CROWD,
    maxCrowd: START_CROWD,
    boss: null,
    score: 0,
    draw: deck,
    hand,
    discard: [],
    queue: [],
    units: [],
    gates: [],
    amps: [],
    enemies: [],
    projectiles: [],
    chain: emptyChain(),
    pocket: { depth: 0, avgOffsetMilli: 0 },
    // Wave 0 is a short count-in; wave 1 starts on beat 4.
    wave: { index: 0, startBeat: 0, hpMult: 1, spawns: [], nextSpawn: 0, kinds: [] },
    pick: [],
    headliner: { id: headliner, readyBeat: 0, activeUntilBeat: -1, lastTightBonusBar: -1 },
    stats: {
      tight: 0,
      good: 0,
      off: 0,
      kills: 0,
      leaks: 0,
      cardsPlayed: 0,
      bestChain: 0,
      showstoppers: 0,
      damageBySource: {},
    },
  };
}
