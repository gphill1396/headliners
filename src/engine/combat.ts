import {
  GATE_DEPTHS,
  MAX_PROJECTILES,
  PROJECTILE_SPEED,
  SPLASH_PCT,
  SPLASH_RADIUS,
  STAGE_LINE,
} from './constants';
import type { TickCtx } from './context';
import type { EngineState, Enemy, Gate, Projectile, Unit } from './state';

/** Enemies are hit at their leading (stage-side) edge. */
const HIT_OFFSET = 2_000;
const SLOT_X = [200, 500, 800];

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
      gatesPassed: 0,
      sourceCardId: unit.cardId,
    });
  }
}

/** Deal damage to one enemy, after armor. Returns damage actually dealt (overkill not counted). */
export function damageEnemy(state: EngineState, ctx: TickCtx, enemy: Enemy, amount: number, sourceCardId: string): number {
  if (enemy.hp <= 0) return 0;
  const raw = amount - enemy.armor;
  if (raw <= 0) return 0;
  const dealt = raw < enemy.hp ? raw : enemy.hp;
  enemy.hp -= dealt;
  state.score += dealt;
  state.stats.damageBySource[sourceCardId] = (state.stats.damageBySource[sourceCardId] ?? 0) + dealt;
  ctx.laneDamage[enemy.lane] = (ctx.laneDamage[enemy.lane] ?? 0) + dealt;
  ctx.laneDamageDepth[enemy.lane] = enemy.depth;
  return dealt;
}

/** The living enemy closest to the stage in a lane. */
export function frontEnemy(state: EngineState, lane: number): Enemy | null {
  let best: Enemy | null = null;
  for (const e of state.enemies) {
    if (e.lane !== lane || e.hp <= 0 || e.depth < 0) continue;
    if (!best || e.depth > best.depth || (e.depth === best.depth && e.id < best.id)) best = e;
  }
  return best;
}

function splash(state: EngineState, ctx: TickCtx, center: Enemy, damage: number, sourceCardId: string): void {
  const amount = (damage * SPLASH_PCT) / 100;
  for (const e of state.enemies) {
    if (e === center || e.lane !== center.lane || e.hp <= 0) continue;
    const d = e.depth - center.depth;
    if (d <= SPLASH_RADIUS && d >= -SPLASH_RADIUS) damageEnemy(state, ctx, e, amount, sourceCardId);
  }
}

/** Enemies walk toward the stage; any that reach it cost crowd. */
export function moveEnemies(state: EngineState, ctx: TickCtx): void {
  for (const e of state.enemies) {
    if (e.hp <= 0) continue;
    e.depth += e.speed;
    if (e.depth >= STAGE_LINE) {
      e.hp = 0;
      state.crowd -= e.crowdDamage;
      state.stats.leaks += 1;
      ctx.events.push({ type: 'leaked', enemyId: e.id, kind: e.kind, lane: e.lane, crowdDamage: e.crowdDamage });
      e.depth = STAGE_LINE;
      e.leaked = true;
    }
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
  for (let i = 0; i < count; i++) {
    const p = state.projectiles[i]!;
    if (p.pierceLeft < 0) continue;
    const from = p.depth;
    const to = from - PROJECTILE_SPEED;

    const path: PathItem[] = [];
    for (const g of state.gates) {
      if (g.lane !== p.lane || g.durability <= 0 || (p.gatesPassed & (1 << g.slot)) !== 0) continue;
      if (g.depth <= from && g.depth > to) path.push({ pos: g.depth, gate: g, enemy: null });
    }
    for (const e of state.enemies) {
      if (e.lane !== p.lane || e.hp <= 0) continue;
      const pos = e.depth + HIT_OFFSET;
      if (pos > to && pos <= from + e.speed) path.push({ pos, gate: null, enemy: e });
    }
    if (path.length > 1) path.sort((a, b) => b.pos - a.pos || (a.gate ? -1 : 1) - (b.gate ? -1 : 1) || idOf(a) - idOf(b));

    let alive = true;
    for (const item of path) {
      if (item.gate) {
        applyGate(state, p, item.gate);
        if (item.gate.durability <= 0) brokenGates.push(item.gate);
        continue;
      }
      const e = item.enemy!;
      if (e.hp <= 0) continue;
      damageEnemy(state, ctx, e, p.damage, p.sourceCardId);
      if (p.splash) splash(state, ctx, e, p.damage, p.sourceCardId);
      if (p.pierceLeft > 0) {
        p.pierceLeft -= 1;
      } else {
        alive = false;
        break;
      }
    }
    if (!alive || to < 0) p.pierceLeft = -1;
    else p.depth = to;
  }
  state.projectiles = state.projectiles.filter((p) => p.pierceLeft >= 0);

  for (const g of brokenGates) {
    const idx = state.gates.indexOf(g);
    if (idx === -1) continue;
    state.gates.splice(idx, 1);
    state.discard.push(g.card);
    ctx.events.push({ type: 'gateBroken', gateId: g.id, lane: g.lane, slot: g.slot });
  }
}

function idOf(item: PathItem): number {
  return item.gate ? item.gate.id : item.enemy ? item.enemy.id : 0;
}

function applyGate(state: EngineState, p: Projectile, g: Gate): void {
  p.gatesPassed |= 1 << g.slot;
  g.durability -= 1;
  switch (g.kind) {
    case 'copy': {
      const extra = g.amount - 1;
      if (state.projectiles.length + extra > MAX_PROJECTILES) {
        // At the cap, fold the copies into this shot: same total damage, bounded cost.
        p.damage *= g.amount;
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
      p.damage += g.amount;
      break;
    case 'splash':
      p.splash = true;
      break;
    case 'pierce':
      p.pierceLeft += g.amount;
      break;
  }
}

function clampX(x: number): number {
  return x < 40 ? 40 : x > 960 ? 960 : x;
}

/** Remove dead and leaked enemies; count kills. */
export function sweepDead(state: EngineState, ctx: TickCtx): void {
  if (!state.enemies.some((e) => e.hp <= 0)) return;
  const kept: Enemy[] = [];
  for (const e of state.enemies) {
    if (e.hp > 0) {
      kept.push(e);
      continue;
    }
    if (!e.leaked) {
      state.stats.kills += 1;
      ctx.events.push({ type: 'killed', enemyId: e.id, kind: e.kind, lane: e.lane, depth: e.depth });
    }
  }
  state.enemies = kept;
}

/** Depth of each gate slot, nearest the stage first. */
export function gateDepth(slot: number): number {
  return GATE_DEPTHS[slot] ?? GATE_DEPTHS[0]!;
}
