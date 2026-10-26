import { ENEMIES } from '../content/enemies';
import {
  BOSS_CROWD_REWARD,
  BOSS_SHIELD_PCT,
  GATE_DEPTHS,
  LANES,
  MAX_PROJECTILES,
  PROJECTILE_SPEED,
  SPLASH_PCT,
  SPLASH_RADIUS,
  STAGE_LINE,
  SWOOP_DEPTH,
} from './constants';
import type { TickCtx } from './context';
import type { EngineState, Enemy, Gate, Projectile, Unit } from './state';

/** Enemies are hit at their leading (stage-side) edge. */
const HIT_OFFSET = 2_000;
const SLOT_X = [200, 500, 800];
const LYRA_GATE_BONUS = 1;

/** Spawn `shots` projectiles from a unit. `multPct` scales damage (chain multiplier). */
export function fireUnit(state: EngineState, unit: Unit, shots: number, multPct: number): void {
  for (let s = 0; s < shots; s++) {
    if (state.projectiles.length >= MAX_PROJECTILES) return;
    state.projectiles.push({
      id: state.nextId++,
      lane: unit.lane,
      x: (SLOT_X[unit.slot] ?? 500) + ((s % 3) - 1) * 60,
      // Multiple shots leave in a short burst, not stacked on one pixel.
      depth: STAGE_LINE - s * 1_400,
      damage: (unit.damage * multPct) / 100,
      pierceLeft: unit.pierce,
      splash: unit.splash,
      ...(unit.antiAir ? { antiAir: true } : {}),
      ...(unit.priority ? { priority: true } : {}),
      gatesPassed: 0,
      sourceCardId: unit.cardId,
    });
  }
}

/** Deal damage to one enemy, after armor. Returns damage actually dealt (overkill not counted). */
export function damageEnemy(state: EngineState, ctx: TickCtx, enemy: Enemy, amount: number, sourceCardId: string, ignoreArmor = false): number {
  if (enemy.hp <= 0) return 0;
  // The Hush, phase 1: it shields everyone else.
  if (state.boss?.phase === 1 && enemy.id !== state.boss.enemyId) amount = (amount * BOSS_SHIELD_PCT) / 100;
  const raw = ignoreArmor ? amount : amount - enemy.armor;
  if (raw <= 0) return 0;
  if (raw >= enemy.hp) enemy.overkill = raw - enemy.hp;
  const dealt = raw < enemy.hp ? raw : enemy.hp;
  enemy.hp -= dealt;
  state.score += dealt;
  state.stats.damageBySource[sourceCardId] = (state.stats.damageBySource[sourceCardId] ?? 0) + dealt;
  ctx.laneDamage[enemy.lane] = (ctx.laneDamage[enemy.lane] ?? 0) + dealt;
  ctx.laneDamageDepth[enemy.lane] = enemy.depth;
  return dealt;
}

/** Is this enemy in this lane? Wide enemies (The Hush) are in all of them. */
export function inLane(e: Enemy, lane: number): boolean {
  return e.lane === lane || ENEMIES[e.kind].wide === true;
}

/** The living enemy closest to the stage in a lane. */
export function frontEnemy(state: EngineState, lane: number): Enemy | null {
  let best: Enemy | null = null;
  for (const e of state.enemies) {
    if (!inLane(e, lane) || e.hp <= 0 || e.depth < 0) continue;
    if (!best || e.depth > best.depth || (e.depth === best.depth && e.id < best.id)) best = e;
  }
  return best;
}

function splash(state: EngineState, ctx: TickCtx, center: Enemy, damage: number, sourceCardId: string, antiAir: boolean, lane: number): void {
  const amount = (damage * SPLASH_PCT) / 100;
  for (const e of state.enemies) {
    if (e === center || !inLane(e, lane) || e.hp <= 0) continue;
    if (ENEMIES[e.kind].flying && !antiAir && e.depth < SWOOP_DEPTH) continue;
    const d = e.depth - center.depth;
    if (d <= SPLASH_RADIUS && d >= -SPLASH_RADIUS) damageEnemy(state, ctx, e, amount, sourceCardId);
  }
}

/** Enemies walk toward the stage; any that reach it cost crowd. Breakers stop at gates; Hexers switch gates off. */
export function moveEnemies(state: EngineState, ctx: TickCtx): void {
  for (const e of state.enemies) {
    if (e.hp <= 0) continue;
    const def = ENEMIES[e.kind];
    if (def.smashPerBeat) {
      const gate = gateInTheWay(state, e);
      if (gate) {
        e.depth = gate.depth - HIT_OFFSET;
        continue;
      }
    }
    e.depth += e.speed;
    if (e.depth >= STAGE_LINE) {
      e.hp = 0;
      // In the tutorial a leak is shown but costs nothing.
      if (state.mode === 'encore') state.crowd -= e.crowdDamage;
      state.stats.leaks += 1;
      ctx.events.push({ type: 'leaked', enemyId: e.id, kind: e.kind, lane: e.lane, crowdDamage: e.crowdDamage });
      e.depth = STAGE_LINE;
      e.leaked = true;
    }
  }
  hexGates(state);
}

/** The gate a Breaker is standing at, or about to reach this tick. */
function gateInTheWay(state: EngineState, e: Enemy): Gate | null {
  const front = e.depth + HIT_OFFSET;
  let best: Gate | null = null;
  for (const g of state.gates) {
    if (g.lane !== e.lane || g.durability <= 0) continue;
    if (g.depth >= front && g.depth <= front + e.speed && (!best || g.depth < best.depth)) best = g;
  }
  return best;
}

/** Each Hexer switches off every gate ahead of it in its lane, within range. */
function hexGates(state: EngineState): void {
  for (const g of state.gates) if (g.hexed) g.hexed = false;
  for (const e of state.enemies) {
    const range = ENEMIES[e.kind].hexRange;
    if (!range || e.hp <= 0 || e.depth < 0) continue;
    for (const g of state.gates) if (g.lane === e.lane && g.depth >= e.depth && g.depth - e.depth <= range) g.hexed = true;
  }
}

/** Once per beat: every Breaker standing at a gate smashes it. */
export function smashGates(state: EngineState, ctx: TickCtx): void {
  const broken: Gate[] = [];
  for (const e of state.enemies) {
    const smash = ENEMIES[e.kind].smashPerBeat;
    if (!smash || e.hp <= 0) continue;
    const front = e.depth + HIT_OFFSET;
    const gate = state.gates.find((g) => g.lane === e.lane && g.durability > 0 && g.depth === front);
    if (!gate) continue;
    gate.durability -= smash;
    ctx.events.push({ type: 'gateSmashed', gateId: gate.id, lane: gate.lane, slot: gate.slot, amount: smash });
    if (gate.durability <= 0) broken.push(gate);
  }
  removeBrokenGates(state, ctx, broken);
}

function removeBrokenGates(state: EngineState, ctx: TickCtx, broken: Gate[]): void {
  for (const g of broken) {
    const idx = state.gates.indexOf(g);
    if (idx === -1) continue;
    state.gates.splice(idx, 1);
    state.discard.push(g.card);
    ctx.events.push({ type: 'gateBroken', gateId: g.id, lane: g.lane, slot: g.slot });
  }
}

type PathItem = { pos: number; gate: Gate | null; enemy: Enemy | null };

/**
 * Move every shot up its lane, applying gates and hitting enemies in the
 * order they're met. Must run after moveEnemies: the hit window includes each
 * enemy's own movement this tick, so fast enemies can't slip past a shot.
 */
export function moveProjectiles(state: EngineState, ctx: TickCtx): void {
  const count = state.projectiles.length;
  const brokenGates: Gate[] = [];
  // Lanes with a living priority target (Breaker, Hexer) on the field.
  const priorityLane: boolean[] = [];
  for (let l = 0; l < LANES; l++) priorityLane.push(false);
  for (const e of state.enemies) {
    if (e.hp <= 0 || e.depth < 0 || !ENEMIES[e.kind].priority) continue;
    for (let l = 0; l < LANES; l++) if (inLane(e, l)) priorityLane[l] = true;
  }

  for (let i = 0; i < count; i++) {
    const p = state.projectiles[i]!;
    if (p.pierceLeft < 0) continue;
    const from = p.depth;
    const to = from - PROJECTILE_SPEED;
    const seeking = p.priority === true && priorityLane[p.lane] === true;

    const path: PathItem[] = [];
    for (const g of state.gates) {
      if (g.lane !== p.lane || g.durability <= 0 || g.hexed || (p.gatesPassed & (1 << g.slot)) !== 0) continue;
      if (g.depth <= from && g.depth > to) path.push({ pos: g.depth, gate: g, enemy: null });
    }
    for (const e of state.enemies) {
      if (!inLane(e, p.lane) || e.hp <= 0) continue;
      const def = ENEMIES[e.kind];
      if (def.flying && !p.antiAir && e.depth < SWOOP_DEPTH) continue; // shots pass under flyers until they swoop
      if (seeking && !def.priority) continue; // Priority shots fly past everything else
      const pos = e.depth + HIT_OFFSET;
      if (pos > to && pos <= from + e.speed) path.push({ pos, gate: null, enemy: e });
    }
    if (path.length > 1) path.sort((a, b) => b.pos - a.pos || (a.gate ? -1 : 1) - (b.gate ? -1 : 1) || idOf(a) - idOf(b));

    let alive = true;
    let turned = false;
    for (const item of path) {
      if (item.gate) {
        turned = applyGate(state, p, item.gate);
        if (item.gate.durability <= 0) brokenGates.push(item.gate);
        if (turned) break; // the shot is in another lane now; it carries on from here next tick
        continue;
      }
      const e = item.enemy!;
      if (e.hp <= 0) continue;
      // A Shieldbearer stops shots fired straight at it, and so shields whoever is behind it, until its shield gives out.
      if ((e.shieldLeft ?? 0) > 0 && !p.side && !p.shred && p.pierceLeft <= 0) {
        e.shieldLeft! -= 1;
        if (e.lastBlockBeat !== state.clock.beat || e.shieldLeft === 0) {
          e.lastBlockBeat = state.clock.beat;
          ctx.events.push({ type: 'blocked', enemyId: e.id, lane: e.lane, depth: e.depth, broke: e.shieldLeft === 0 });
        }
        alive = false;
        break;
      }
      damageEnemy(state, ctx, e, p.damage, p.sourceCardId, p.shred === true);
      if (p.splash) splash(state, ctx, e, p.damage, p.sourceCardId, p.antiAir === true, p.lane);
      if (p.pierceLeft > 0) {
        p.pierceLeft -= 1;
      } else {
        alive = false;
        break;
      }
    }
    if (!alive || to < 0) p.pierceLeft = -1;
    else if (!turned) p.depth = to;
  }
  state.projectiles = state.projectiles.filter((p) => p.pierceLeft >= 0);
  removeBrokenGates(state, ctx, brokenGates);
}

function idOf(item: PathItem): number {
  return item.gate ? item.gate.id : item.enemy ? item.enemy.id : 0;
}

/** Apply a gate to a shot. Returns true if a speaker turned the shot into another lane. */
function applyGate(state: EngineState, p: Projectile, g: Gate): boolean {
  p.gatesPassed |= 1 << g.slot;
  g.durability -= 1;
  // Lyra's passive: every gate a shot passes through adds 1 damage.
  if (state.headliner.id === 'lyra') p.damage += LYRA_GATE_BONUS;
  // Lyra's Swell: for a couple of beats every gate works twice as hard.
  const swell = state.headliner.id === 'lyra' && state.clock.beat < state.headliner.activeUntilBeat;
  switch (g.kind) {
    case 'copy': {
      const amount = g.amount + (swell ? 1 : 0);
      const extra = amount - 1;
      if (state.projectiles.length + extra > MAX_PROJECTILES) {
        // At the cap, fold the copies into this shot: same total damage, bounded cost.
        p.damage *= amount;
        break;
      }
      for (let c = 1; c <= extra; c++) {
        state.projectiles.push({
          ...p,
          id: state.nextId++,
          x: clampX(p.x + (c % 2 === 1 ? 90 : -90) * Math.ceil(c / 2)),
          depth: g.depth,
        });
      }
      break;
    }
    case 'damage':
      p.damage += g.amount * (swell ? 2 : 1);
      break;
    case 'splash':
      p.splash = true;
      break;
    case 'pierce':
      p.pierceLeft += g.amount + (swell ? 1 : 0);
      break;
    case 'shred':
      p.shred = true;
      break;
    case 'aim': {
      // Edge lanes aim at the middle; the middle alternates left and right, shot by shot.
      const target = g.lane === 0 ? 1 : g.lane === LANES - 1 ? LANES - 2 : p.id % 2 === 0 ? g.lane - 1 : g.lane + 1;
      p.x = target < g.lane ? 880 : 120; // enters from the side it came from
      p.lane = target;
      p.depth = g.depth;
      p.side = true;
      return true;
    }
  }
  return false;
}

function clampX(x: number): number {
  return x < 40 ? 40 : x > 960 ? 960 : x;
}

/** Remove dead and leaked enemies; count kills. Splitters burst into pieces unless overkill blew them apart. */
export function sweepDead(state: EngineState, ctx: TickCtx): void {
  if (!state.enemies.some((e) => e.hp <= 0)) return;
  const kept: Enemy[] = [];
  for (const e of state.enemies) {
    if (e.hp > 0) {
      kept.push(e);
      continue;
    }
    if (e.id === state.boss?.enemyId) {
      // The Hush is gone: beaten, or it reached the stage.
      if (!e.leaked) state.crowd = Math.min(state.maxCrowd, state.crowd + BOSS_CROWD_REWARD);
      ctx.events.push({ type: 'bossEnd', defeated: !e.leaked, crowd: e.leaked ? -e.crowdDamage : BOSS_CROWD_REWARD });
      state.boss = null;
    }
    if (e.leaked) continue;
    state.stats.kills += 1;
    ctx.events.push({ type: 'killed', enemyId: e.id, kind: e.kind, lane: e.lane, depth: e.depth });
    const splits = ENEMIES[e.kind].splits;
    if (splits && !e.child && (e.overkill ?? 0) * 100 < e.maxHp * splits.overkillPct) {
      const hp = (e.maxHp * splits.hpPct) / 100;
      for (let k = 0; k < splits.count; k++) {
        const depth = e.depth + (k - (splits.count >> 1)) * 2_200;
        kept.push({
          id: state.nextId++,
          kind: e.kind,
          lane: e.lane,
          depth: depth < STAGE_LINE - 1_000 ? depth : STAGE_LINE - 1_000,
          speed: e.speed,
          hp,
          maxHp: hp,
          armor: 0,
          crowdDamage: 1,
          leaked: false,
          child: true,
        });
      }
      ctx.events.push({ type: 'split', lane: e.lane, depth: e.depth, count: splits.count });
    }
  }
  state.enemies = kept;
}

/** Depth of each gate slot, nearest the stage first. */
export function gateDepth(slot: number): number {
  return GATE_DEPTHS[slot] ?? GATE_DEPTHS[0]!;
}
