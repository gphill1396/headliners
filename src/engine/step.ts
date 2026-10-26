import { accuracyPct, advanceClock, beatInBar, chainStepPct, gradeInput, inPocket, isDownbeat, setTempo, type Grade } from './clock';
import { moveEnemies, moveProjectiles, smashGates, sweepDead } from './combat';
import { ABILITY_RETRY_BEATS, BEAT_UNITS, BEATS_PER_BAR, CHAIN_STEP_GOOD_PCT, CYCLE_COST, LANES, MAX_ENERGY, METRONOME_WIDEN_PCT, POCKET_MAX, SUBTICK } from './constants';
import { evolvedInto } from './evolution';
import { createCtx, flushDamage, type TickCtx } from './context';
import { addCardToDeck, drawCards, refillHand } from './deck';
import { checkChainEnd, checkGameOver, createToken, expireTokens, fireUnitsOnEighth, resolvePlay, runDownbeatTriggers } from './effects';
import type { EngineEvent } from './events';
import type { EngineState } from './state';
import type { EnemyKind } from './types';
import { beatMuted, onBeatWaves, spawnGroup, startWave, updateBoss } from './waves';
import { afterTourChoice, eventChoice, onBeatTour, rest, shop, travel, type ShopAction } from './tour';
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
  /** Discard-cycle: pay 1 energy to swap a card in hand for the next one (once per card per bar). */
  | { type: 'cycle'; iid: number }
  /** Tour: go to a stop on the map. */
  | { type: 'travel'; node: number }
  /** Tour: buy, remove a card, heal, or leave the shop. */
  | ({ type: 'shop' } & ShopAction)
  /** Tour: at a rest stop, heal or cut a card from your deck. */
  | { type: 'rest'; choice: 'heal' | 'cut'; iid?: number }
  /** Tour: choose an option at an event. */
  | { type: 'event'; option: 0 | 1 }
  /** Choose one of the headliner's two evolutions while phase === 'evolving'. */
  | { type: 'evolve'; index: 0 | 1 }
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
    updateBoss(state, ctx);
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
  if (downbeat && state.mode !== 'tutorial') refillHand(state, ctx.events);
  expireTokens(state, ctx);
  smashGates(state, ctx);

  checkChainEnd(state, ctx);
  resolveDuePlays(state, ctx);
  if (downbeat) runDownbeatTriggers(state, ctx);
  if (state.phase === 'playing' && state.mode === 'encore') onBeatWaves(state, ctx);
  if (state.phase === 'playing' && state.mode === 'tour') onBeatTour(state, ctx);
}

function applyInput(state: EngineState, ctx: TickCtx, input: Input): void {
  switch (input.type) {
    case 'commit':
      commit(state, ctx, input);
      return;
    case 'activate':
      activate(state, ctx, input.permille);
      return;
    case 'evolve':
      evolve(state, ctx, input.index);
      return;
    case 'cycle':
      cycle(state, ctx, input.iid);
      return;
    case 'travel':
      travel(state, ctx, input.node);
      return;
    case 'shop':
      shop(state, ctx, input);
      return;
    case 'rest':
      rest(state, ctx, input.choice, input.iid);
      return;
    case 'event':
      eventChoice(state, ctx, input.option);
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
  // Thrum's Metronome evolution widens the timing windows.
  const widen = evolvedInto(state, 'metronome') ? METRONOME_WIDEN_PCT : 100;
  const timing = gradeInput(state.clock, clampPermille(input.permille), relaxed, widen);
  // The Hush, phase 2, mutes the beat: no timing bonuses (penalties for Off plays still apply).
  const muted = beatMuted(state);
  const fullAccuracy = accuracyPct(timing.offsetMilli, state.clock.bpm, relaxed, widen);
  const accuracy = muted ? Math.min(100, fullAccuracy) : fullAccuracy;
  const fullStep = chainStepPct(timing.offsetMilli, state.clock.bpm, relaxed, widen);
  const chainStep = muted ? Math.min(CHAIN_STEP_GOOD_PCT, fullStep) : fullStep;
  state.stats[timing.grade] += 1;
  const id = state.nextId++;
  state.queue.push({
    id,
    card,
    lane: input.lane,
    grade: timing.grade,
    offsetMilli: timing.offsetMilli,
    accuracyPct: accuracy,
    chainStepPct: chainStep,
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
  if (!muted || timing.grade !== 'tight') updatePocket(state, ctx, timing.grade, timing.offsetMilli, widen);

  // Passives that reward a Tight hit, once per bar (not while the beat is muted).
  // Thrum: refund 1 energy. Clatter: call a Roadie to that lane.
  if (timing.grade === 'tight' && !muted && state.headliner.id !== 'lyra') {
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
function updatePocket(state: EngineState, ctx: TickCtx, grade: Grade, offsetMilli: number, widenPct = 100): void {
  const p = state.pocket;
  const before = p.depth;
  if (grade === 'off') p.depth = 0;
  else if (grade === 'good') p.depth = Math.max(0, p.depth - 2);
  else if (inPocket(offsetMilli, p.avgOffsetMilli, state.clock.bpm, state.settings.relaxedTiming, widenPct)) p.depth = Math.min(POCKET_MAX, p.depth + 1);
  else p.depth = Math.max(0, p.depth - 1);
  // Where your pocket sits: a running average, so a consistent laid-back feel counts.
  p.avgOffsetMilli = Math.trunc((p.avgOffsetMilli * 3 + offsetMilli) / 4);
  if (p.depth !== before) ctx.events.push({ type: 'pocket', depth: p.depth, delta: p.depth - before });
}

/**
 * A headliner's ability lands on the beat like a card (Phase 2c): Tight gets
 * the full effect, Good a beat less (Clatter: Roadies in the two outer lanes),
 * and Off fizzles, with a short wait before you can try again.
 */
function activate(state: EngineState, ctx: TickCtx, permille: number): void {
  const def = HEADLINERS[state.headliner.id];
  if (!def || state.phase !== 'playing') return;
  const beat = state.clock.beat;
  if (beat < state.headliner.readyBeat) {
    ctx.events.push({ type: 'rejected', iid: -1, reason: 'cooldown' });
    return;
  }
  const widen = evolvedInto(state, 'metronome') ? METRONOME_WIDEN_PCT : 100;
  const timing = gradeInput(state.clock, clampPermille(permille), state.settings.relaxedTiming, widen);
  if (timing.grade === 'off') {
    state.headliner.readyBeat = beat + ABILITY_RETRY_BEATS;
    ctx.events.push({ type: 'fill', untilBeat: beat, headliner: state.headliner.id, grade: 'off' });
    return;
  }
  // Aria's Long Note: Hold lasts twice as long.
  const full = def.active.durationBeats * (evolvedInto(state, 'long-note') ? 2 : 1);
  const duration = timing.grade === 'tight' || full === 0 ? full : Math.max(1, full - 1);
  state.headliner.activeUntilBeat = timing.resolveBeat + duration;
  state.headliner.readyBeat = beat + def.active.cooldownBeats;
  // Clatter's All Hands: a Roadie in every lane (Good: the two outer lanes).
  if (state.headliner.id === 'clatter') {
    for (let lane = 0; lane < LANES; lane++) if (timing.grade === 'tight' || lane !== 1) createToken(state, ctx, 'roadie', lane);
  }
  ctx.events.push({ type: 'fill', untilBeat: state.headliner.activeUntilBeat, headliner: state.headliner.id, grade: timing.grade });
}

/** Discard-cycle (SPEC §4.3): pay 1 energy, discard a card from hand, draw a fresh one. The fresh one can't be cycled again this bar. */
function cycle(state: EngineState, ctx: TickCtx, iid: number): void {
  if (state.phase !== 'playing') {
    ctx.events.push({ type: 'rejected', iid, reason: 'not-playing' });
    return;
  }
  const index = state.hand.findIndex((c) => c.iid === iid);
  if (index === -1) {
    ctx.events.push({ type: 'rejected', iid, reason: 'not-in-hand' });
    return;
  }
  const bar = Math.floor(state.clock.beat / BEATS_PER_BAR);
  if (!state.cycle || state.cycle.bar !== bar) state.cycle = { bar, locked: [] };
  if (state.cycle.locked.includes(iid)) {
    ctx.events.push({ type: 'rejected', iid, reason: 'cycled' });
    return;
  }
  if (state.energy < CYCLE_COST) {
    ctx.events.push({ type: 'rejected', iid, reason: 'energy' });
    return;
  }
  state.energy -= CYCLE_COST;
  const [card] = state.hand.splice(index, 1);
  state.discard.push(card!);
  const before = state.hand.length;
  drawCards(state, 1, ctx.events);
  for (const fresh of state.hand.slice(before)) state.cycle.locked.push(fresh.iid);
  ctx.events.push({ type: 'cycled', iid, cardId: card!.cardId });
}

/** Choose the headliner's evolution (SPEC §4.7): 0 or 1. */
function evolve(state: EngineState, ctx: TickCtx, index: number): void {
  if (state.phase !== 'evolving' || (index !== 0 && index !== 1)) return;
  state.headliner.evolution = index;
  const evo = HEADLINERS[state.headliner.id].evolutions[index];
  ctx.events.push({ type: 'evolved', headliner: state.headliner.id, evolution: evo.id });
  state.phase = 'playing';
  if (state.mode === 'tour') return afterTourChoice(state, ctx);
  startWave(state, ctx, state.wave.index + 1);
}

function pick(state: EngineState, ctx: TickCtx, index: number | null): void {
  if (state.phase !== 'picking') return;
  const cardId = index === null ? null : (state.pick[index] ?? null);
  if (cardId) addCardToDeck(state, cardId);
  ctx.events.push({ type: 'picked', cardId });
  state.pick = [];
  if (state.mode === 'tour') return afterTourChoice(state, ctx);
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
