import { setTempo } from './clock';
import {
  BEAT_UNITS,
  LANES,
  PICK_EVERY_WAVES,
  PICK_OPTIONS,
  START_BPM,
  STAGE_LINE,
  WAVE_BEATS,
  WAVE_HP_GROWTH,
  WAVE_MAX_BPM,
  WAVE_SPAWN_BEATS,
  WAVE_TEMPO_STEP,
} from './constants';
import type { TickCtx } from './context';
import { nextInt, shuffleInPlace } from './rng';
import { emptyChain, type EngineState } from './state';
import type { EnemyKind } from './types';
import { pickPool } from '../content/cards';
import { ENEMIES } from '../content/enemies';

const ALL_KINDS: EnemyKind[] = ['shambler', 'brute', 'swarmling'];
/** Two bars to get a first card down before wave 1. */
const FIRST_WAVE_BEAT = 8;

/** Encore wave logic, run once per beat (SPEC §4.9, S1.7). */
export function onBeatWaves(state: EngineState, ctx: TickCtx): void {
  const beat = state.clock.beat;
  const wave = state.wave;
  if (wave.index === 0) {
    if (beat >= FIRST_WAVE_BEAT) startWave(state, ctx, 1);
  } else if (beat >= wave.startBeat + WAVE_BEATS) {
    if (wave.index % PICK_EVERY_WAVES === 0) offerPick(state, ctx);
    else startWave(state, ctx, wave.index + 1);
  }
  if (state.phase !== 'playing') return;
  spawnDue(state);
}

/** Kinds for a wave: from wave 3 on, always at least 2 different traits (SPEC §4.9). */
export function waveKinds(state: EngineState, index: number): EnemyKind[] {
  if (index === 1) return ['shambler'];
  if (index === 2) return ['shambler', 'swarmling'];
  if (index >= 6) return [...ALL_KINDS];
  return shuffleInPlace(state.rng, [...ALL_KINDS]).slice(0, 2).sort();
}

export function startWave(state: EngineState, ctx: TickCtx, index: number): void {
  let hpMult = state.wave.hpMult;
  for (let i = Math.max(1, state.wave.index); i < index; i++) hpMult *= WAVE_HP_GROWTH;
  const kinds = waveKinds(state, index);
  // Waves 1–2 are a gentle start.
  const groups = index === 1 ? 3 : index === 2 ? 4 : Math.min(22, 4 + Math.floor((index * 2) / 3));
  // Every kind appears at least once; the rest are random from the wave's kinds.
  const order: EnemyKind[] = [...kinds];
  while (order.length < groups) order.push(kinds[nextInt(state.rng, 0, kinds.length)]!);
  shuffleInPlace(state.rng, order);
  const spawns = order.map((kind, i) => ({ beatOffset: Math.floor((i * WAVE_SPAWN_BEATS) / groups), kind }));

  // Each wave is a song: the chain from the last one is banked and a new one starts.
  if (state.chain.links > 0) {
    ctx.events.push({ type: 'chainEnd', links: state.chain.links, dropped: false, songEnd: true });
    state.chain = emptyChain();
  }
  state.wave = { index, startBeat: state.clock.beat, hpMult, spawns, nextSpawn: 0, kinds };
  setTempo(state.clock, Math.min(WAVE_MAX_BPM, START_BPM + WAVE_TEMPO_STEP * (index - 1)));
  ctx.events.push({ type: 'waveStart', index, kinds });
}

function spawnDue(state: EngineState): void {
  const wave = state.wave;
  const elapsed = state.clock.beat - wave.startBeat;
  while (wave.nextSpawn < wave.spawns.length && wave.spawns[wave.nextSpawn]!.beatOffset <= elapsed) {
    spawnGroup(state, wave.spawns[wave.nextSpawn]!.kind);
    wave.nextSpawn += 1;
  }
}

export function spawnGroup(state: EngineState, kind: EnemyKind, lane = nextInt(state.rng, 0, LANES), travelBeats?: number): void {
  const def = ENEMIES[kind];
  const hp = def.hp * state.wave.hpMult;
  // Walk to the stage in `travelBeats` beats at the current tempo. The first waves walk slower.
  const beats = travelBeats ?? (state.wave.index <= 2 ? def.travelBeats + 4 : def.travelBeats);
  const speed = Math.max(1, Math.floor((STAGE_LINE * state.clock.bpm) / (beats * BEAT_UNITS)));
  for (let i = 0; i < def.packSize; i++) {
    state.enemies.push({
      id: state.nextId++,
      kind,
      lane,
      depth: -i * 2_600,
      speed,
      hp,
      maxHp: hp,
      armor: def.armor,
      crowdDamage: def.crowdDamage,
      leaked: false,
    });
  }
}

function offerPick(state: EngineState, ctx: TickCtx): void {
  const pool = shuffleInPlace(state.rng, pickPool(state.headliner.id));
  state.pick = pool.slice(0, PICK_OPTIONS);
  state.phase = 'picking';
  ctx.events.push({ type: 'pickOffered', options: [...state.pick] });
}
