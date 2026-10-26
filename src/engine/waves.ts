import { setTempo } from './clock';
import {
  BEAT_UNITS,
  BOSS_BRUTE_EVERY_BEATS,
  BOSS_EVERY_WAVES,
  EVOLVE_AFTER_WAVE,
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

/** The wave each enemy first shows up in. One new enemy per wave through wave 8, so each gets introduced on its own. */
export const DEBUT_WAVE: Record<EnemyKind, number> = {
  shambler: 1,
  swarmling: 2,
  brute: 3,
  bat: 4,
  splitter: 5,
  hexer: 6,
  shieldbearer: 7,
  breaker: 8,
  hush: BOSS_EVERY_WAVES,
};
/** Kinds that turn up in normal waves (bosses have their own rule). */
const ALL_KINDS = (Object.keys(DEBUT_WAVE) as EnemyKind[]).filter((k) => !ENEMIES[k].boss);
/** Two bars to get a first card down before wave 1. */
const FIRST_WAVE_BEAT = 8;

/** Encore wave logic, run once per beat (SPEC §4.9, S1.7). */
export function onBeatWaves(state: EngineState, ctx: TickCtx): void {
  const beat = state.clock.beat;
  const wave = state.wave;
  if (wave.index === 0) {
    if (beat >= FIRST_WAVE_BEAT) startWave(state, ctx, 1);
  } else if (beat >= wave.startBeat + WAVE_BEATS && !state.boss) {
    // A boss wave lasts until The Hush is beaten or reaches the stage.
    if (wave.index === EVOLVE_AFTER_WAVE && (state.headliner.evolution ?? null) === null) {
      state.phase = 'evolving';
      ctx.events.push({ type: 'evolveOffered' });
    } else if (wave.index % PICK_EVERY_WAVES === 0) offerPick(state, ctx);
    else startWave(state, ctx, wave.index + 1);
  }
  if (state.phase !== 'playing') return;
  spawnDue(state);
  // The Hush, phase 3: a Brute every few beats.
  if (state.boss?.phase === 3 && beat >= state.boss.nextBruteBeat) {
    spawnGroup(state, 'brute');
    state.boss.nextBruteBeat = beat + BOSS_BRUTE_EVERY_BEATS;
  }
}

/** Keep The Hush's phase in step with its health. Call every tick. */
export function updateBoss(state: EngineState, ctx: TickCtx): void {
  const boss = state.boss;
  if (!boss) return;
  const hush = state.enemies.find((e) => e.id === boss.enemyId);
  if (!hush || hush.hp <= 0) return;
  const phase: 1 | 2 | 3 = hush.hp * 3 > hush.maxHp * 2 ? 1 : hush.hp * 3 > hush.maxHp ? 2 : 3;
  if (phase <= boss.phase) return;
  boss.phase = phase;
  if (phase === 3) boss.nextBruteBeat = state.clock.beat + 1;
  ctx.events.push({ type: 'bossPhase', phase });
}

/** The Hush, phase 2: the beat is muted and timing bonuses are off. */
export function beatMuted(state: EngineState): boolean {
  return state.boss?.phase === 2;
}

/**
 * Kinds for a wave (SPEC §4.9): from wave 3 on, always at least 2 different traits.
 * Shamblers are the horde and walk in every wave (Swarmlings join them from wave 9).
 * Waves 3–8 each debut one new enemy, alongside one special you've met from wave 4.
 * From wave 9, 2 random specials join the horde (3 from wave 15).
 */
export function waveKinds(state: EngineState, index: number): EnemyKind[] {
  if (index === 1) return ['shambler'];
  if (index === 2) return ['shambler', 'swarmling'];
  const debut = ALL_KINDS.filter((k) => DEBUT_WAVE[k] === index);
  const known = ALL_KINDS.filter((k) => DEBUT_WAVE[k] < index);
  // The horde: Shamblers walk in every wave (and Swarmlings from wave 9), with specials mixed in.
  const horde: EnemyKind[] = index >= 9 ? ['shambler', 'swarmling'] : ['shambler'];
  const specials = known.filter((k) => !horde.includes(k));
  const count = index <= 3 ? 0 : index <= 8 ? 1 : index < 15 ? 2 : 3;
  const others = shuffleInPlace(state.rng, specials).slice(0, count);
  return [...horde, ...debut, ...others].sort((a, b) => DEBUT_WAVE[a] - DEBUT_WAVE[b]);
}

/** Enemy kinds appearing for the first time in this wave. */
export function debutKinds(index: number): EnemyKind[] {
  return (Object.keys(DEBUT_WAVE) as EnemyKind[]).filter((k) => DEBUT_WAVE[k] === index);
}

export function startWave(state: EngineState, ctx: TickCtx, index: number): void {
  let hpMult = state.wave.hpMult;
  for (let i = Math.max(1, state.wave.index); i < index; i++) hpMult *= WAVE_HP_GROWTH;
  const kinds = waveKinds(state, index);
  const bossWave = index % BOSS_EVERY_WAVES === 0;
  // Waves 1–2 are a gentle start. A boss wave brings half the usual crowd with it.
  const full = index === 1 ? 3 : index === 2 ? 4 : Math.min(22, 4 + Math.floor((index * 2) / 3));
  const groups = bossWave ? Math.ceil(full / 2) : full;
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
  const debut = debutKinds(index);
  if (bossWave) spawnBoss(state);
  ctx.events.push({ type: 'waveStart', index, kinds, ...(debut.length > 0 ? { debut } : {}), ...(bossWave ? { boss: true } : {}) });
  if (bossWave) ctx.events.push({ type: 'bossPhase', phase: 1 });
}

function spawnBoss(state: EngineState): void {
  spawnGroup(state, 'hush', 1);
  const hush = state.enemies[state.enemies.length - 1]!;
  hush.depth = 0;
  state.boss = { enemyId: hush.id, phase: 1, nextBruteBeat: 0 };
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
      // Shields get a little sturdier as the show goes on.
      ...(def.shieldHits ? { shieldLeft: def.shieldHits + Math.floor(state.wave.index / 2) } : {}),
    });
  }
}

/**
 * Offer a card pick. If an enemy is coming in the next few waves and nothing in
 * your deck answers it, one of the options is an answer (the game teaches what
 * each enemy needs, and a run is never stuck without one).
 */
function offerPick(state: EngineState, ctx: TickCtx): void {
  const pool = shuffleInPlace(state.rng, pickPool(state.headliner.id));
  const owned = new Set([...state.hand, ...state.draw, ...state.discard, ...state.units.map((u) => u.card), ...state.gates.map((g) => g.card), ...state.amps.map((a) => a.card)].map((c) => c.cardId));
  const upcoming = ALL_KINDS.filter((k) => DEBUT_WAVE[k] > state.wave.index && DEBUT_WAVE[k] <= state.wave.index + PICK_EVERY_WAVES)
    .concat(ALL_KINDS.filter((k) => DEBUT_WAVE[k] <= state.wave.index));
  for (const kind of upcoming) {
    const answers = (ENEMIES[kind].answers ?? []).filter((id) => pool.includes(id));
    if (answers.length === 0 || answers.some((id) => owned.has(id))) continue;
    const answer = answers[nextInt(state.rng, 0, answers.length)]!;
    pool.splice(pool.indexOf(answer), 1);
    pool.splice(nextInt(state.rng, 0, PICK_OPTIONS), 0, answer);
    break;
  }
  state.pick = pool.slice(0, PICK_OPTIONS);
  state.phase = 'picking';
  ctx.events.push({ type: 'pickOffered', options: [...state.pick] });
}
