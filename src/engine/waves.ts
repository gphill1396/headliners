import { setTempo } from './clock';
import {
  BEAT_UNITS,
  BOSS_BRUTE_EVERY_BEATS,
  BOSS_EVERY_WAVES,
  CLEAN_SET_CROWD,
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
  TOUR_ELITE_HP,
} from './constants';
import type { TickCtx } from './context';
import { gainCrowd } from './effects';
import { nextInt, shuffleInPlace } from './rng';
import { emptyChain, type EngineState } from './state';
import type { EnemyKind } from './types';
import { pickPool } from '../content/cards';
import { ENEMIES } from '../content/enemies';
import { HEADLINERS } from '../content/headliners';

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
  charger: 9,
  medic: 11,
  ghost: 12,
  nest: 13,
  hush: BOSS_EVERY_WAVES,
  critic: BOSS_EVERY_WAVES * 2,
  'dead-air': BOSS_EVERY_WAVES * 3,
};

/** The bosses, in the order they turn up: Encore cycles through them every 10th wave; Tour acts 1–3 get one each. */
export const BOSS_ORDER: EnemyKind[] = ['hush', 'critic', 'dead-air'];

export function bossForWave(index: number): EnemyKind {
  return BOSS_ORDER[(Math.max(1, Math.floor(index / BOSS_EVERY_WAVES)) - 1) % BOSS_ORDER.length]!;
}

/** Which boss is on the field (older saves only had The Hush). */
export function bossKind(state: EngineState): EnemyKind | null {
  return state.boss ? (state.boss.kind ?? 'hush') : null;
}
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
    cleanSet(state, ctx);
    const preset = state.headliner.presetEvolution;
    if (wave.index === EVOLVE_AFTER_WAVE && (state.headliner.evolution ?? null) === null && (preset === 0 || preset === 1)) {
      // The Collection's permanent evolution: no need to ask.
      state.headliner.evolution = preset;
      ctx.events.push({ type: 'evolved', headliner: state.headliner.id, evolution: HEADLINERS[state.headliner.id].evolutions[preset].id });
      startWave(state, ctx, wave.index + 1);
    } else if (wave.index === EVOLVE_AFTER_WAVE && (state.headliner.evolution ?? null) === null) {
      state.phase = 'evolving';
      ctx.events.push({ type: 'evolveOffered' });
    } else if (wave.index % PICK_EVERY_WAVES === 0) offerPick(state, ctx);
    else startWave(state, ctx, wave.index + 1);
  }
  if (state.phase !== 'playing') return;
  spawnDue(state);
  bossCalls(state, ctx);
}

/**
 * A clean set wins back a little crowd: nothing got through this wave and the band
 * ended it in the pocket. Call once, as the wave ends.
 */
export function cleanSet(state: EngineState, ctx: TickCtx): void {
  const start = state.wave.leaksAtStart;
  if (start === undefined || state.wave.index < 1 || state.stats.leaks > start || state.pocket.depth < 1) return;
  gainCrowd(state, ctx, CLEAN_SET_CROWD, 'clean');
  delete state.wave.leaksAtStart; // never twice for one wave
}

/**
 * Bosses call in help: The Hush brings Brutes in phase 3, The Critic brings
 * Medics in phase 3, Dead Air brings Ghosts from phase 2. Once per beat.
 */
export function bossCalls(state: EngineState, ctx?: TickCtx): void {
  if (ctx) bossVerse(state, ctx);
  const boss = state.boss;
  if (!boss || state.clock.beat < boss.nextBruteBeat) return;
  const kind = bossKind(state);
  const call: EnemyKind | null =
    kind === 'hush' && boss.phase === 3 ? 'brute' : kind === 'critic' && boss.phase === 3 ? 'medic' : kind === 'dead-air' && boss.phase >= 2 ? 'ghost' : null;
  if (!call) return;
  spawnGroup(state, call);
  boss.nextBruteBeat = state.clock.beat + BOSS_BRUTE_EVERY_BEATS;
}

/**
 * A boss fight is several songs: every wave-length of beats the chain is banked
 * and a new one starts, as between waves (so a long fight can't run one chain to the cap).
 */
function bossVerse(state: EngineState, ctx: TickCtx): void {
  const into = state.clock.beat - state.wave.startBeat;
  if (!state.boss || into <= 0 || into % WAVE_BEATS !== 0 || state.chain.links === 0) return;
  ctx.events.push({ type: 'chainEnd', links: state.chain.links, dropped: false, songEnd: true });
  state.chain = emptyChain();
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
  boss.nextBruteBeat = state.clock.beat + 1;
  // The Critic drops its armor after phase 1.
  if (bossKind(state) === 'critic' && phase >= 2) hush.armor = 0;
  ctx.events.push({ type: 'bossPhase', phase, boss: bossKind(state)! });
}

/** The Hush, phase 2: the beat is muted and timing bonuses are off. */
export function beatMuted(state: EngineState): boolean {
  return state.boss?.phase === 2 && bossKind(state) === 'hush';
}

/** The Critic, phase 2: unimpressed, so the chain multiplier stops growing. */
export function chainFrozen(state: EngineState): boolean {
  return state.boss?.phase === 2 && bossKind(state) === 'critic';
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
  const count = index <= 3 ? 0 : index <= 8 ? 1 : index < 13 ? 2 : 3;
  const others = shuffleInPlace(state.rng, specials).slice(0, count);
  return [...horde, ...debut, ...others].sort((a, b) => DEBUT_WAVE[a] - DEBUT_WAVE[b]);
}

/** Enemy kinds appearing for the first time in this wave. */
export function debutKinds(index: number): EnemyKind[] {
  return (Object.keys(DEBUT_WAVE) as EnemyKind[]).filter((k) => DEBUT_WAVE[k] === index);
}

/** Enemy health multiplier for a wave level: ×WAVE_HP_GROWTH per level. */
export function hpMultFor(index: number): number {
  let m = 1;
  for (let i = 1; i < index; i++) m *= WAVE_HP_GROWTH;
  return m;
}

export interface WaveOptions {
  /** Spawn a boss with this wave (default: every 10th wave in Encore). */
  boss?: boolean;
  /** Which boss (default: by wave number). */
  bossKind?: EnemyKind;
  /** Tour elites: tougher enemies and one more special. */
  elite?: boolean;
}

export function startWave(state: EngineState, ctx: TickCtx, index: number, opts: WaveOptions = {}): void {
  let hpMult = state.wave.hpMult;
  if (state.mode === 'tour') hpMult = hpMultFor(index) * (opts.elite ? TOUR_ELITE_HP : 1);
  else for (let i = Math.max(1, state.wave.index); i < index; i++) hpMult *= WAVE_HP_GROWTH;
  const kinds = waveKinds(state, index);
  if (opts.elite) {
    const extra = ALL_KINDS.filter((k) => DEBUT_WAVE[k] <= index + 1 && !kinds.includes(k));
    if (extra.length > 0) kinds.push(extra[nextInt(state.rng, 0, extra.length)]!);
  }
  const bossWave = opts.boss ?? (state.mode === 'encore' && index % BOSS_EVERY_WAVES === 0);
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
  state.wave = { index, startBeat: state.clock.beat, hpMult, spawns, nextSpawn: 0, kinds, leaksAtStart: state.stats.leaks };
  setTempo(state.clock, Math.min(WAVE_MAX_BPM, START_BPM + WAVE_TEMPO_STEP * (index - 1)));
  // "New:" banners for enemies you haven't met this run.
  const seen = state.seenKinds ?? [];
  const boss = opts.bossKind ?? bossForWave(index);
  const debut = [...kinds, ...(bossWave ? [boss] : [])].filter((k) => !seen.includes(k));
  state.seenKinds = [...seen, ...debut];
  if (bossWave) spawnBoss(state, boss);
  ctx.events.push({ type: 'waveStart', index, kinds, ...(debut.length > 0 ? { debut } : {}), ...(bossWave ? { boss: true, bossKind: boss } : {}) });
  if (bossWave) ctx.events.push({ type: 'bossPhase', phase: 1, boss });
}

function spawnBoss(state: EngineState, kind: EnemyKind): void {
  spawnGroup(state, kind, 1);
  const boss = state.enemies[state.enemies.length - 1]!;
  boss.depth = 0;
  state.boss = { enemyId: boss.id, kind, phase: 1, nextBruteBeat: 0 };
}

export function spawnDue(state: EngineState): void {
  const wave = state.wave;
  const elapsed = state.clock.beat - wave.startBeat;
  while (wave.nextSpawn < wave.spawns.length && wave.spawns[wave.nextSpawn]!.beatOffset <= elapsed) {
    spawnGroup(state, wave.spawns[wave.nextSpawn]!.kind);
    wave.nextSpawn += 1;
  }
}

export function spawnGroup(state: EngineState, kind: EnemyKind, lane = nextInt(state.rng, 0, LANES), travelBeats?: number, atDepth?: number, count?: number): void {
  const def = ENEMIES[kind];
  const hp = def.hp * state.wave.hpMult;
  // Walk to the stage in `travelBeats` beats at the current tempo. The first waves walk slower.
  const beats = travelBeats ?? (state.wave.index <= 2 ? def.travelBeats + 4 : def.travelBeats);
  const speed = Math.max(1, Math.floor((STAGE_LINE * state.clock.bpm) / (beats * BEAT_UNITS)));
  for (let i = 0; i < (count ?? def.packSize + hordeGrowth(kind, state.wave.index)); i++) {
    state.enemies.push({
      id: state.nextId++,
      kind,
      lane,
      depth: (atDepth ?? 0) - i * 2_600,
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

/** Medics heal at most this much per beat (keeps them from out-healing a boss's health bar). */
export const MEDIC_HEAL_MAX = 12;

/**
 * Once a beat, on the field: Medics patch up everyone else in their lane;
 * Nests hatch Swarmlings where they stand. Neither does anything off-screen.
 */
export function enemyAbilities(state: EngineState, ctx: TickCtx): void {
  const beat = state.clock.beat;
  const field = state.enemies.filter((e) => e.hp > 0 && e.depth >= 0);
  for (const m of field) {
    const def = ENEMIES[m.kind];
    if (def.healsPct) {
      let healed = 0;
      for (const e of field) {
        if (e === m || e.hp >= e.maxHp || !(e.lane === m.lane || ENEMIES[e.kind].wide)) continue;
        const amount = Math.min(MEDIC_HEAL_MAX, (e.maxHp * def.healsPct) / 100, e.maxHp - e.hp);
        e.hp += amount;
        healed += amount;
      }
      if (healed > 0) ctx.events.push({ type: 'healed', lane: m.lane, depth: m.depth, amount: healed });
    }
    if (def.hatches && (beat + m.id) % def.hatches.everyBeats === 0) {
      const first = state.enemies.length;
      spawnGroup(state, def.hatches.kind, m.lane, undefined, m.depth, def.hatches.count);
      for (let i = first; i < state.enemies.length; i++) state.enemies[i]!.hatchedBy = m.kind;
      ctx.events.push({ type: 'hatched', lane: m.lane, depth: m.depth, count: def.hatches.count });
    }
  }
}

/** The horde grows as the show goes on: one more Shambler per pack every 6 waves after wave 6, two more Swarmlings every 6 after wave 9. */
export function hordeGrowth(kind: EnemyKind, wave: number): number {
  if (kind === 'shambler') return Math.max(0, Math.floor((wave - 6) / 6));
  if (kind === 'swarmling') return Math.max(0, Math.floor((wave - 9) / 6)) * 2;
  return 0;
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
