import { fromSnapshot, HEADLINERS, toSnapshot, type EngineState, type HeadlinerId } from '../engine';
import { normalizeCollection, type Collection } from '../meta/collection';

/**
 * On-device storage (SPEC §7). Run state is kept separate from settings and
 * personal bests, so a broken or outdated run save never costs anything else.
 */
const RUN_KEY = 'headliners.run.v2';
const SETTINGS_KEY = 'headliners.settings.v1';
const BESTS_KEY = 'headliners.bests.v1';
const TUTORIAL_KEY = 'headliners.soundcheck.v1';
const HEADLINER_KEY = 'headliners.headliner.v1';

export interface Settings {
  sound: boolean;
  /** Sparser arrangement: same band, less going on. */
  chillMusic: boolean;
  relaxedTiming: boolean;
  scientific: boolean;
  reduceFlash: boolean;
}

export interface Bests {
  wave: number;
  score: number;
  chain: number;
  runs: number;
  /** Tour runs started and won. */
  tours?: number;
  toursWon?: number;
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
  return { sound: s.sound !== false, chillMusic: s.chillMusic === true, relaxedTiming: s.relaxedTiming === true, scientific: s.scientific === true, reduceFlash: s.reduceFlash === true };
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
  if (state.mode === 'tour') {
    // Tours keep their own record; wave and score bests are Encore's.
    const bests: Bests = { ...old, tours: (old.tours ?? 0) + 1, toursWon: (old.toursWon ?? 0) + (state.phase === 'won' ? 1 : 0) };
    write(BESTS_KEY, JSON.stringify(bests));
    return { bests, newBest: { wave: false, score: false, chain: false } };
  }
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

export function tutorialDone(): boolean {
  return read<boolean>(TUTORIAL_KEY) === true;
}

export function markTutorialDone(): void {
  write(TUTORIAL_KEY, 'true');
}

export function saveRun(state: EngineState): void {
  if (state.mode === 'tutorial') return;
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

/** The headliner picked last time, so the title screen remembers your main. */
export function loadHeadliner(): HeadlinerId {
  const id = read<string>(HEADLINER_KEY);
  return id && id in HEADLINERS ? (id as HeadlinerId) : 'thrum';
}

export function saveHeadliner(id: HeadlinerId): void {
  write(HEADLINER_KEY, JSON.stringify(id));
}

const TEAM_KEY = 'headliners.team.v1';

/** The Tour team picked last time (in pick order; the first leads). */
export function loadTeam(): HeadlinerId[] {
  const ids = read<string[]>(TEAM_KEY);
  const valid = Array.isArray(ids) ? ids.filter((id): id is HeadlinerId => typeof id === 'string' && id in HEADLINERS) : [];
  return [...new Set(valid)].slice(0, 3);
}

export function saveTeam(team: HeadlinerId[]): void {
  write(TEAM_KEY, JSON.stringify(team));
}

export type GameMode = 'encore' | 'tour';
const MODE_KEY = 'headliners.mode.v1';

/** The mode picked last time on the title screen. */
export function loadMode(): GameMode {
  return read<string>(MODE_KEY) === 'tour' ? 'tour' : 'encore';
}

export function saveMode(mode: GameMode): void {
  write(MODE_KEY, JSON.stringify(mode));
}

// ---------------------------------------------------------------- Collection (SPEC S2.2)

const COLLECTION_KEY = 'headliners.collection.v1';
const DECK_CHOICE_KEY = 'headliners.deckchoice.v1';

export function loadCollection(): Collection {
  return normalizeCollection(read<Partial<Collection>>(COLLECTION_KEY));
}

export function saveCollection(collection: Collection): void {
  write(COLLECTION_KEY, JSON.stringify(collection));
}

/** Which saved deck Encore uses, per headliner (missing = the starter deck). */
export function loadDeckChoice(): Partial<Record<HeadlinerId, string>> {
  return read<Partial<Record<HeadlinerId, string>>>(DECK_CHOICE_KEY) ?? {};
}

export function saveDeckChoice(choice: Partial<Record<HeadlinerId, string>>): void {
  write(DECK_CHOICE_KEY, JSON.stringify(choice));
}

// ---------------------------------------------------------------- backup (SPEC §7)

const SAVE_PREFIX = 'headliners.';

/** Everything the game keeps on this device, as one JSON file. */
export function exportSave(): string {
  const data: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(SAVE_PREFIX)) data[key] = localStorage.getItem(key) ?? '';
    }
  } catch {
    /* storage blocked: export what we could */
  }
  return JSON.stringify({ game: 'headliners', exported: new Date().toISOString(), data }, null, 1);
}

/** Check a backup file before using it. Returns the keys it would restore, or an error message. */
export function parseSave(text: string): { data: Record<string, string> } | { error: string } {
  try {
    const parsed = JSON.parse(text) as { game?: string; data?: Record<string, unknown> };
    if (parsed.game !== 'headliners' || !parsed.data || typeof parsed.data !== 'object') return { error: "That file isn't a Headliners backup." };
    const data: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed.data)) if (k.startsWith(SAVE_PREFIX) && typeof v === 'string') data[k] = v;
    if (Object.keys(data).length === 0) return { error: 'That backup is empty.' };
    return { data };
  } catch {
    return { error: "That file couldn't be read." };
  }
}

/** Replace this device's save with a backup. */
export function restoreSave(data: Record<string, string>): void {
  try {
    const old: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(SAVE_PREFIX)) old.push(key);
    }
    for (const key of old) localStorage.removeItem(key);
    for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v);
  } catch {
    /* storage full or blocked */
  }
}
