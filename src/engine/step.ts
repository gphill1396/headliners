import { advanceClock, beatInBar, gradeInput, isDownbeat, setTempo, type Grade } from './clock';
import { BEAT_UNITS, FIELD_DEPTH, LANES, SUBTICK } from './constants';
import { chance, nextInt } from './rng';
import type { EngineState } from './state';

/**
 * Player inputs for one tick. `permille` is when, within the tick, the input
 * happened (0–999). The runner records it from the real tap time; tests and
 * the simulator set it directly.
 */
export type Input =
  | { type: 'commit'; lane: number; slot: number; permille: number }
  | { type: 'setRelaxedTiming'; value: boolean }
  | { type: 'setTempo'; bpm: number };

/** What happened this tick, for rendering, audio and haptics. Never fed back into the engine. */
export type EngineEvent =
  | { type: 'beat'; beat: number; beatInBar: number; downbeat: boolean }
  | { type: 'graded'; id: number; lane: number; grade: Grade; offsetMilli: number; resolveBeat: number }
  | { type: 'resolved'; id: number; lane: number; grade: Grade; beat: number; clearedMarkerId: number | null }
  | { type: 'markerSpawned'; id: number; lane: number }
  | { type: 'markerReachedStage'; id: number; lane: number };

/**
 * Advance the game by exactly one tick.
 *
 * Mutates `state` in place (cheap at 60 Hz with hundreds of entities) and
 * returns the events that happened. Same state + same inputs → same result.
 */
export function step(state: EngineState, inputs: readonly Input[] = []): EngineEvent[] {
  const events: EngineEvent[] = [];

  // 1. Inputs, in the order they happened within the tick (stable for ties).
  const ordered = inputs
    .map((input, index) => ({ input, index }))
    .sort((x, y) => permilleOf(x.input) - permilleOf(y.input) || x.index - y.index);
  for (const { input } of ordered) applyInput(state, input, events);

  // 2. Clock.
  const beatLanded = advanceClock(state.clock);
  if (beatLanded) {
    const beat = state.clock.beat;
    events.push({ type: 'beat', beat, beatInBar: beatInBar(beat), downbeat: isDownbeat(beat) });
    onBeat(state, events);
  }

  // 3. Resolve plays whose beat has arrived (includes late-but-Good plays).
  resolveDuePlays(state, events);

  // 4. Field (Phase 0 placeholder).
  advanceMarkers(state, events);

  state.tick += 1;
  return events;
}

function permilleOf(input: Input): number {
  return input.type === 'commit' ? input.permille : 0;
}

function applyInput(state: EngineState, input: Input, events: EngineEvent[]): void {
  switch (input.type) {
    case 'commit': {
      if (!Number.isInteger(input.lane) || input.lane < 0 || input.lane >= LANES) return;
      const permille = clampPermille(input.permille);
      const timing = gradeInput(state.clock, permille, state.settings.relaxedTiming);
      const id = state.nextId++;
      state.queue.push({
        id,
        lane: input.lane,
        slot: input.slot,
        grade: timing.grade,
        offsetMilli: timing.offsetMilli,
        resolveBeat: timing.resolveBeat,
      });
      state.stats[timing.grade] += 1;
      events.push({
        type: 'graded',
        id,
        lane: input.lane,
        grade: timing.grade,
        offsetMilli: timing.offsetMilli,
        resolveBeat: timing.resolveBeat,
      });
      return;
    }
    case 'setRelaxedTiming':
      state.settings.relaxedTiming = input.value;
      return;
    case 'setTempo':
      setTempo(state.clock, input.bpm);
      return;
  }
}

function clampPermille(p: number): number {
  if (!Number.isFinite(p)) return 0;
  return Math.min(SUBTICK - 1, Math.max(0, Math.floor(p)));
}

function resolveDuePlays(state: EngineState, events: EngineEvent[]): void {
  if (state.queue.length === 0) return;
  const beat = state.clock.beat;
  const remaining = [];
  for (const play of state.queue) {
    if (play.resolveBeat > beat) {
      remaining.push(play);
      continue;
    }
    // Phase 0 sandbox effect: a resolved play clears the marker closest to the stage in its lane.
    let target = -1;
    for (let i = 0; i < state.markers.length; i++) {
      const m = state.markers[i]!;
      if (m.lane !== play.lane) continue;
      if (target === -1 || m.depth > state.markers[target]!.depth) target = i;
    }
    let clearedMarkerId: number | null = null;
    if (target !== -1) {
      clearedMarkerId = state.markers[target]!.id;
      state.markers.splice(target, 1);
      state.stats.cleared += 1;
    }
    events.push({ type: 'resolved', id: play.id, lane: play.lane, grade: play.grade, beat, clearedMarkerId });
  }
  state.queue = remaining;
}

/** Phase 0 placeholder spawns: every beat, maybe drop a marker in a random lane. */
function onBeat(state: EngineState, events: EngineEvent[]): void {
  // Always on the downbeat, 50% on other beats.
  if (!isDownbeat(state.clock.beat) && !chance(state.rng, 1, 2)) return;
  const lane = nextInt(state.rng, 0, LANES);
  const id = state.nextId++;
  // Travel time of 7–9 beats at the current tempo.
  const ticksToStage = Math.floor((BEAT_UNITS * nextInt(state.rng, 7, 10)) / state.clock.bpm);
  const speed = Math.max(1, Math.floor(FIELD_DEPTH / ticksToStage));
  state.markers.push({ id, lane, depth: 0, speed });
  events.push({ type: 'markerSpawned', id, lane });
}

function advanceMarkers(state: EngineState, events: EngineEvent[]): void {
  if (state.markers.length === 0) return;
  const kept = [];
  for (const m of state.markers) {
    m.depth += m.speed;
    if (m.depth >= FIELD_DEPTH) {
      state.stats.missed += 1;
      events.push({ type: 'markerReachedStage', id: m.id, lane: m.lane });
    } else {
      kept.push(m);
    }
  }
  state.markers = kept;
}
