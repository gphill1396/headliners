import { createClock, type ClockState, type Grade } from './clock';
import { START_BPM } from './constants';
import { createRng, type RngState } from './rng';

export const ENGINE_STATE_VERSION = 1;

/** A committed play waiting for its beat. */
export interface QueuedPlay {
  id: number;
  lane: number;
  /** Hand slot the card came from; -1 for the Phase 0 sandbox (no cards yet). */
  slot: number;
  grade: Grade;
  offsetMilli: number;
  resolveBeat: number;
}

/**
 * Phase 0 placeholder for enemies: markers that march down a lane.
 * Phase 1 replaces this with real enemies, traits and waves (SPEC §4.8–4.9).
 */
export interface Marker {
  id: number;
  lane: number;
  /** 0 = top of the field, FIELD_DEPTH = stage edge. */
  depth: number;
  /** Depth units per tick. */
  speed: number;
}

export interface EngineSettings {
  relaxedTiming: boolean;
}

export interface EngineStats {
  tight: number;
  good: number;
  off: number;
  cleared: number;
  missed: number;
}

/**
 * Entire game state. Must stay plain JSON-safe data (numbers, strings,
 * booleans, arrays, objects) so it snapshots, hashes and restores exactly.
 */
export interface EngineState {
  version: number;
  seed: string;
  tick: number;
  rng: RngState;
  clock: ClockState;
  settings: EngineSettings;
  nextId: number;
  queue: QueuedPlay[];
  markers: Marker[];
  stats: EngineStats;
}

export interface CreateOptions {
  seed: string;
  bpm?: number;
  relaxedTiming?: boolean;
}

export function createState(opts: CreateOptions): EngineState {
  return {
    version: ENGINE_STATE_VERSION,
    seed: opts.seed,
    tick: 0,
    rng: createRng(opts.seed),
    clock: createClock(opts.bpm ?? START_BPM),
    settings: { relaxedTiming: opts.relaxedTiming ?? false },
    nextId: 1,
    queue: [],
    markers: [],
    stats: { tight: 0, good: 0, off: 0, cleared: 0, missed: 0 },
  };
}
