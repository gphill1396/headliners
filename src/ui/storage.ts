import { fromSnapshot, toSnapshot, type EngineState } from '../engine';

/**
 * On-device storage (SPEC §7). Run state is kept separate from settings and
 * personal bests, so a broken or outdated run save never costs anything else.
 */
const RUN_KEY = 'headliners.run.v2';
const SETTINGS_KEY = 'headliners.settings.v1';
const BESTS_KEY = 'headliners.bests.v1';

export interface Settings {
  relaxedTiming: boolean;
  scientific: boolean;
  reduceFlash: boolean;
}

export interface Bests {
  wave: number;
  score: number;
  chain: number;
  runs: number;
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage full or blocked: the game still plays, it just won't remember */
  }
}

export function loadSettings(): Settings {
  const s = read<Partial<Settings>>(SETTINGS_KEY) ?? {};
  return { relaxedTiming: s.relaxedTiming === true, scientific: s.scientific === true, reduceFlash: s.reduceFlash === true };
}

export function saveSettings(settings: Settings): void {
  write(SETTINGS_KEY, JSON.stringify(settings));
}

export function loadBests(): Bests {
  return { wave: 0, score: 0, chain: 0, runs: 0, ...(read<Partial<Bests>>(BESTS_KEY) ?? {}) };
}

/** Record a finished run; returns the updated bests and which records it broke. */
export function recordRun(state: EngineState): { bests: Bests; newBest: { wave: boolean; score: boolean; chain: boolean } } {
  const old = loadBests();
  const newBest = {
    wave: state.wave.index > old.wave,
    score: state.score > old.score,
    chain: state.stats.bestChain > old.chain,
  };
  const bests: Bests = {
    wave: Math.max(old.wave, state.wave.index),
    score: Math.max(old.score, state.score),
    chain: Math.max(old.chain, state.stats.bestChain),
    runs: old.runs + 1,
  };
  write(BESTS_KEY, JSON.stringify(bests));
  return { bests, newBest };
}

export function saveRun(state: EngineState): void {
  if (state.phase === 'over') {
    clearRun();
    return;
  }
  write(RUN_KEY, toSnapshot(state));
}

/** The saved run, if there is one that can be resumed. */
export function loadRun(): EngineState | null {
  try {
    const raw = localStorage.getItem(RUN_KEY);
    if (!raw) return null;
    const state = fromSnapshot(raw);
    return state.phase === 'over' ? null : state;
  } catch {
    clearRun();
    return null;
  }
}

export function clearRun(): void {
  try {
    localStorage.removeItem(RUN_KEY);
  } catch {
    /* ignore */
  }
}
