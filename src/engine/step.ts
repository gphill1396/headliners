import { accuracyPct, advanceClock, beatInBar, chainStepPct, gradeInput, inPocket, isDownbeat, setTempo, type Grade } from './clock';
import { moveEnemies, moveProjectiles, smashGates, sweepDead } from './combat';
import { BEAT_UNITS, BEATS_PER_BAR, LANES, MAX_ENERGY, POCKET_MAX, SUBTICK } from './constants';
import { createCtx, flushDamage, type TickCtx } from './context';
import { addCardToDeck, refillHand } from './deck';
import { checkChainEnd, checkGameOver, createToken, expireTokens, fireUnitsOnEighth, resolvePlay, runDownbeatTriggers } from './effects';
import type { EngineEvent } from './events';
import type { EngineState } from './state';
import type { EnemyKind } from './types';
import { onBeatWaves, spawnGroup, startWave } from './waves';
import { getCard } from '../content/cards';
import { HEADLINERS } from '../content/headliners';

/**
 * Player inputs for one tick. `permille` is when, within the tick, the input
 * happened (0–999). The runner records it from the real tap time; tests and
 * the simulator set it directly.
 */
export type Input =
  /** Play the hand card with instance id `iid` into `lane`. */
  | { type: 'commit'; iid: number; lane: number; permille: number }
  /** Use the headliner's active ability. */
  | { type: 'activate'; permille: number }
  /** Choose a card pick option by index, or null to skip. */
  | { type: 'pick'; index: number | null }
  /** Practice tap on a lane with no card: graded for timing, no other effect. */
  | { type: 'tap'; lane: number; permille: number }
  /** Tutorial only: put cards in hand and/or set energy. Ignored in Encore. */
  | { type: 'grant'; cardIds?: string[]; energy?: number }
  /** Tutorial only: place an enemy. Ignored in Encore. */
  | { type: 'spawn'; kind: EnemyKind; lane: number; travelBeats?: number }
  | { type: 'setRelaxedTiming'; value: boolean }
  | { type: 'setTempo'; bpm: number };

export type { EngineEvent } from './events';

/**
 * Advance the game by exactly one tick.
 *
 * Mutates `state` in place and returns what happened. Same state + same
 * inputs → same result, on every device.
 */
export function step(state: EngineState, inputs: readonly Input[] = []): EngineEvent[] {
  const ctx = createCtx();
  if (state.phase === 'over') {
    state.tick += 1;
    return ctx.events;
  }

  const ordered = inputs
    .map((input, index) => ({ input, index }))
    .sort((x, y) => permilleOf(x.input) - permilleOf(y.input) || x.index - y.index);
  for (const { input } of ordered) applyInput(state, ctx, input);

  // While a card pick is on screen, the music stops: no clock, no movement.
  if (state.phase !== 'playing') {
    state.tick += 1;
    return ctx.events;
  }

  const prevEighth = state.eighth;
  if (advanceClock(state.clock)) onBeat(state, ctx);
  if (state.phase === 'playing') {
    const eighth = state.clock.beat * 2 + (state.clock.phase * 2 >= BEAT_UNITS ? 1 : 0);
    if (eighth !== prevEighth) {
      state.eighth = eighth;
      fireUnitsOnEighth(state, eighth);
    }
    resolveDuePlays(state, ctx);
    moveEnemies(state, ctx);
    checkGameOver(state, ctx);
    moveProjectiles(state, ctx);
    sweepDead(state, ctx);
  }
  flushDamage(ctx);
  state.tick += 1;
  return ctx.events;
}

function permilleOf(input: Input): number {
  return input.type === 'commit' || input.type === 'activate' || input.type === 'tap' ? input.permille : 0;
}

function onBeat(state: EngineState, ctx: TickCtx): void {
  const beat = state.clock.beat;
  const downbeat = isDownbeat(beat);
  ctx.events.push({ type: 'beat', beat, beatInBar: beatInBar(beat), downbeat });

  state.energy = Math.min(MAX_ENERGY, state.energy + 1);
  // The tutorial script hands out exactly the cards each step needs.
  if (downbeat && state.mode === 'encore') refillHand(state, ctx.events);
  expireTokens(state, ctx);
  smashGates(state, ctx);

  checkChainEnd(state, ctx);
  resolveDuePlays(state, ctx);
  if (downbeat) runDownbeatTriggers(state, ctx);
  if (state.phase === 'playing' && state.mode === 'encore') onBeatWaves(state, ctx);
}

function applyInput(state: EngineState, ctx: TickCtx, input: Input): void {
  switch (input.type) {
    case 'commit':
      commit(state, ctx, input);
      return;
    case 'activate':
      activate(state, ctx);
      return;
    case 'pick':
      pick(state, ctx, input.index);
      return;
    case 'tap': {
      if (state.phase !== 'playing' || !Number.isInteger(input.lane) || input.lane < 0 || input.lane >= LANES) return;
      const timing = gradeInput(state.clock, clampPermille(input.permille), state.settings.relaxedTiming);
      ctx.events.push({ type: 'tapped', lane: input.lane, grade: timing.grade, offsetMilli: timing.offsetMilli });
      return;
    }
    case 'grant':
      if (state.mode !== 'tutorial') return;
      for (const cardId of input.cardIds ?? []) {
        getCard(cardId); // throws on unknown ids
        state.hand.push({ iid: state.nextId++, cardId });
      }
      if (input.energy !== undefined) state.energy = Math.max(0, Math.min(MAX_ENERGY, Math.floor(input.energy)));
      return;
    case 'spawn':
      if (state.mode !== 'tutorial' || !Number.isInteger(input.lane) || input.lane < 0 || input.lane >= LANES) return;
      spawnGroup(state, input.kind, input.lane, input.travelBeats);
      return;
    case 'setRelaxedTiming':
      state.settings.relaxedTiming = input.value;
      return;
    case 'setTempo':
      setTempo(state.clock, input.bpm);
      return;
  }
}

function commit(state: EngineState, ctx: TickCtx, input: { iid: number; lane: number; permille: number }): void {
  if (state.phase !== 'playing') {
    ctx.events.push({ type: 'rejected', iid: input.iid, reason: 'not-playing' });
    return;
  }
  const handIndex = state.hand.findIndex((c) => c.iid === input.iid);
  if (handIndex === -1) {
    ctx.events.push({ type: 'rejected', iid: input.iid, reason: 'not-in-hand' });
    return;
  }
  if (!Number.isInteger(input.lane) || input.lane < 0 || input.lane >= LANES) {
    ctx.events.push({ type: 'rejected', iid: input.iid, reason: 'lane' });
    return;
  }
  const card = state.hand[handIndex]!;
  const def = getCard(card.cardId);
  if (state.energy < def.cost) {
    ctx.events.push({ type: 'rejected', iid: input.iid, reason: 'energy' });
    return;
  }

  state.energy -= def.cost;
  state.hand.splice(handIndex, 1);
  const relaxed = state.settings.relaxedTiming;
  const timing = gradeInput(state.clock, clampPermille(input.permille), relaxed);
  const accuracy = accuracyPct(timing.offsetMilli, state.clock.bpm, relaxed);
  state.stats[timing.grade] += 1;
  const id = state.nextId++;
  state.queue.push({
    id,
    card,
    lane: input.lane,
    grade: timing.grade,
    offsetMilli: timing.offsetMilli,
    accuracyPct: accuracy,
    chainStepPct: chainStepPct(timing.offsetMilli, state.clock.bpm, relaxed),
    resolveBeat: timing.resolveBeat,
    isEcho: false,
  });
  ctx.events.push({
    type: 'graded',
    id,
    iid: card.iid,
    cardId: card.cardId,
    lane: input.lane,
    grade: timing.grade,
    offsetMilli: timing.offsetMilli,
    accuracyPct: accuracy,
    resolveBeat: timing.resolveBeat,
  });
  updatePocket(state, ctx, timing.grade, timing.offsetMilli);

  // Passives that reward a Tight hit, once per bar.
  // Thrum: refund 1 energy. Clatter: call a Roadie to that lane.
  if (timing.grade === 'tight' && state.headliner.id !== 'lyra') {
    const bar = Math.floor(timing.resolveBeat / BEATS_PER_BAR);
    if (state.headliner.lastTightBonusBar !== bar) {
      if (state.headliner.id === 'thrum' && state.energy < MAX_ENERGY) {
        state.headliner.lastTightBonusBar = bar;
        state.energy += 1;
        ctx.events.push({ type: 'energy', amount: 1, reason: 'tight' });
      } else if (state.headliner.id === 'clatter') {
        state.headliner.lastTightBonusBar = bar;
        createToken(state, ctx, 'roadie', input.lane);
      }
    }
  }
}

/**
 * The pocket (consistency, not perfection): a Tight play close to your own
 * running average timing deepens it; drifting, Good plays and Off plays don't.
 */
function updatePocket(state: EngineState, ctx: TickCtx, grade: Grade, offsetMilli: number): void {
  const p = state.pocket;
  const before = p.depth;
  if (grade === 'off') p.depth = 0;
  else if (grade === 'good') p.depth = Math.max(0, p.depth - 2);
  else if (inPocket(offsetMilli, p.avgOffsetMilli, state.clock.bpm, state.settings.relaxedTiming)) p.depth = Math.min(POCKET_MAX, p.depth + 1);
  else p.depth = Math.max(0, p.depth - 1);
  // Where your pocket sits: a running average, so a consistent laid-back feel counts.
  p.avgOffsetMilli = Math.trunc((p.avgOffsetMilli * 3 + offsetMilli) / 4);
  if (p.depth !== before) ctx.events.push({ type: 'pocket', depth: p.depth, delta: p.depth - before });
}

function activate(state: EngineState, ctx: TickCtx): void {
  const def = HEADLINERS[state.headliner.id];
  if (!def || state.phase !== 'playing') return;
  const beat = state.clock.beat;
  if (beat < state.headliner.readyBeat) {
    ctx.events.push({ type: 'rejected', iid: -1, reason: 'cooldown' });
    return;
  }
  state.headliner.activeUntilBeat = beat + def.active.durationBeats;
  state.headliner.readyBeat = beat + def.active.cooldownBeats;
  // Clatter's All Hands: a Roadie in every lane, right now.
  if (state.headliner.id === 'clatter') for (let lane = 0; lane < LANES; lane++) createToken(state, ctx, 'roadie', lane);
  ctx.events.push({ type: 'fill', untilBeat: state.headliner.activeUntilBeat, headliner: state.headliner.id });
}

function pick(state: EngineState, ctx: TickCtx, index: number | null): void {
  if (state.phase !== 'picking') return;
  const cardId = index === null ? null : (state.pick[index] ?? null);
  if (cardId) addCardToDeck(state, cardId);
  ctx.events.push({ type: 'picked', cardId });
  state.pick = [];
  state.phase = 'playing';
  startWave(state, ctx, state.wave.index + 1);
}

function clampPermille(p: number): number {
  if (!Number.isFinite(p)) return 0;
  return Math.min(SUBTICK - 1, Math.max(0, Math.floor(p)));
}

/** Resolve every queued play whose beat has arrived (including late-but-Good plays). */
function resolveDuePlays(state: EngineState, ctx: TickCtx): void {
  if (state.queue.length === 0) return;
  const beat = state.clock.beat;
  const due = state.queue.filter((p) => p.resolveBeat <= beat);
  if (due.length === 0) return;
  state.queue = state.queue.filter((p) => p.resolveBeat > beat);
  due.sort((a, b) => a.resolveBeat - b.resolveBeat || a.id - b.id);
  for (const play of due) {
    if (state.phase === 'over') return;
    resolvePlay(state, ctx, play);
  }
}
