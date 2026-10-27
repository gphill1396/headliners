import { airborne, BOSS_EVERY_WAVES, BOSS_ORDER, bossForWave, ENEMIES, faded, LANES, PROJECTILE_SPEED, STAGE_LINE, SWOOP_DEPTH, type EnemyKind, type EngineState, type GateKind } from '../engine';
import type { AnimSprite } from './portraits';
import { PALETTE } from './palette';
import { drawSprite, SPRITES, spriteSize, type Sprite } from './sprites';
import { ART } from './art';
import { drawAnim } from './portraits';

/**
 * Internal pixel width of the field (the GBA's screen width, for the S4.2 art).
 * The canvas is scaled up with nearest-neighbour for a crisp pixel look.
 */
export const FIELD_PX_WIDTH = 240;
/** Old placeholder sprites were drawn for a 144 px field; they scale up by this much until they're redrawn. */
const OLD_SCALE = 2;
export const LANE_PX = FIELD_PX_WIDTH / LANES;
/** Fraction of the canvas height where the stage starts. */
export const STAGE_FRACTION = 0.88;

export const GATE_COLORS: Record<GateKind, string> = {
  copy: PALETTE.lyra,
  damage: PALETTE.thrum,
  splash: PALETTE.clatter,
  pierce: PALETTE.cream,
  shred: '#a69cc0',
  aim: '#8fd3ff',
  lift: '#f6d38a',
  slow: '#f29cc3',
};
const HEX_COLOR = '#c06bd6';

interface Burst {
  x: number;
  y: number;
  born: number;
  color: string;
}

export interface FieldFx {
  laneFlash: number[];
  laneMiss: number[];
  flashColor: string[];
  bursts: Burst[];
  /** 0–1 brightness of the big-chain flash. */
  bigFlash: number;
}

export function createFx(): FieldFx {
  return {
    laneFlash: [0, 0, 0],
    laneMiss: [0, 0, 0],
    flashColor: [PALETTE.footlight, PALETTE.footlight, PALETTE.footlight],
    bursts: [],
    bigFlash: 0,
  };
}

/** Resize the backing store to the element's aspect ratio. Returns the internal pixel height. */
export function fitCanvas(canvas: HTMLCanvasElement): number {
  const rect = canvas.getBoundingClientRect();
  const height = Math.max(120, Math.round((FIELD_PX_WIDTH * rect.height) / Math.max(1, rect.width)));
  if (canvas.width !== FIELD_PX_WIDTH || canvas.height !== height) {
    canvas.width = FIELD_PX_WIDTH;
    canvas.height = height;
  }
  return height;
}

/**
 * The field in perspective (S4.9): the roads are tilted back, so they run from the
 * cave mouth near the top of the field down to the stage, narrowing with distance.
 * Monsters far up the road are smaller and closer together; distances compress.
 */
/** Fraction of the canvas height where the roads leave the cave. */
export const CAVE_FRACTION = 0.2;
/** How much further the cave end of the road is than the stage end (the tilt). */
const Z_FAR = 2.4;

/** 0 at the cave, 1 at the stage: how far down the screen a road position is drawn. */
function perspective(depth: number): number {
  const f = Math.max(0, Math.min(1, depth / STAGE_LINE));
  const z = 1 + (1 - f) * (Z_FAR - 1);
  return (1 / z - 1 / Z_FAR) / (1 - 1 / Z_FAR);
}

/** Size of things at this depth, relative to the stage end (1). */
export function scaleAt(depth: number): number {
  const f = Math.max(0, Math.min(1, depth / STAGE_LINE));
  return 1 / (1 + (1 - f) * (Z_FAR - 1));
}

/** Map engine depth to canvas y fraction. Shared with the DOM overlay so labels line up. */
export function depthToFraction(depth: number): number {
  return CAVE_FRACTION + (STAGE_FRACTION - CAVE_FRACTION) * perspective(depth);
}

/** x in field pixels of a point `across` (0–1) of the way over `lane`, at `depth`: lanes converge toward the cave. */
export function laneX(lane: number, depth: number, across = 0.5): number {
  const flat = (lane + across) * LANE_PX;
  return FIELD_PX_WIDTH / 2 + (flat - FIELD_PX_WIDTH / 2) * scaleAt(depth);
}

/** A road position as fractions of the field, for DOM labels. */
export function fieldPoint(lane: number, depth: number): { x: number; y: number } {
  return { x: laneX(lane, depth) / FIELD_PX_WIDTH, y: depthToFraction(depth) };
}

export function addBurst(fx: FieldFx, lane: number, depth: number, color: string, now: number, height: number): void {
  if (fx.bursts.length > 40) fx.bursts.shift();
  fx.bursts.push({ x: laneX(lane, depth), y: depthToFraction(depth) * height, born: now, color });
}

// ---------------------------------------------------------------- scaled sprites

/** Sprites pre-drawn once at 1×, then scaled with nearest-neighbour (pixels drop, like GBA sprite scaling). */
const spriteCache = new Map<string, HTMLCanvasElement>();
function spriteCanvas(key: string, art: AnimSprite, frame: number): HTMLCanvasElement {
  const id = `${key}:${frame % art.frames.length}`;
  let c = spriteCache.get(id);
  if (!c) {
    const rows = art.frames[frame % art.frames.length]!;
    c = document.createElement('canvas');
    c.width = rows[0]!.length;
    c.height = rows.length;
    drawAnim(c.getContext('2d')!, art, frame, 0, 0, 1);
    spriteCache.set(id, c);
  }
  return c;
}

/** Draw art scaled by `s` (snapped to eighths) with its feet at (cx, footY). Returns the drawn box. */
function drawScaled(ctx: CanvasRenderingContext2D, key: string, art: AnimSprite, frame: number, cx: number, footY: number, s: number) {
  const c = spriteCanvas(key, art, frame);
  const k = Math.max(0.25, Math.round(s * 8) / 8);
  const w = Math.max(1, Math.round(c.width * k));
  const h = Math.max(1, Math.round(c.height * k));
  const x = Math.round(cx - w / 2);
  const y = Math.round(footY - h);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(c, x, y, w, h);
  return { x, y, w, h };
}

// ---------------------------------------------------------------- the land: cave, grass, roads

/** Which boss waits at the cave: the one this act or this stretch of waves ends with. */
export function nextBoss(state: EngineState): EnemyKind | null {
  if (state.mode === 'tutorial') return null;
  if (state.tour) return BOSS_ORDER[(state.tour.act - 1) % BOSS_ORDER.length]!;
  if (state.mode !== 'encore') return null;
  const next = Math.max(1, Math.ceil(Math.max(1, state.wave.index) / BOSS_EVERY_WAVES)) * BOSS_EVERY_WAVES;
  return bossForWave(next);
}

function hash(x: number, y: number): number {
  let v = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) >>> 0;
  v = Math.imul(v ^ (v >>> 13), 1274126177) >>> 0;
  return ((v ^ (v >>> 16)) >>> 0) / 4294967296;
}

const LAND = {
  sky: '#16101f',
  rock: '#3a2e3a',
  rockLit: '#54445a',
  rockDark: '#241a26',
  mouth: '#0b0710',
  grass: '#2f4a2a',
  grassLit: '#3f6234',
  grassDark: '#24381f',
  road: '#7a5c3e',
  roadDark: '#5e4430',
  roadLit: '#97754e',
  stone: '#a8947a',
};

let landCache: { w: number; h: number; canvas: HTMLCanvasElement } | null = null;

/** The still parts of the land, drawn once per canvas size. */
function land(w: number, h: number): HTMLCanvasElement {
  if (landCache && landCache.w === w && landCache.h === h) return landCache.canvas;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const caveY = Math.round(h * CAVE_FRACTION);
  const stageY = Math.round(h * STAGE_FRACTION);
  // Grass: flat, with tufts, a few faire flowers, and a dithered band of shade near the cave.
  g.fillStyle = LAND.grass;
  g.fillRect(0, caveY, w, stageY - caveY);
  for (let y = caveY; y < stageY; y++) {
    const t = (y - caveY) / (stageY - caveY);
    for (let x = 0; x < w; x++) {
      if (t < 0.22 && (x + y) % 2 === 0) {
        g.fillStyle = LAND.grassDark;
        g.fillRect(x, y, 1, 1);
      }
    }
  }
  for (let i = 0; i < 160; i++) {
    const x = Math.floor(hash(i, 1) * w);
    const y = caveY + 2 + Math.floor(hash(i, 2) * (stageY - caveY - 4));
    const flower = hash(i, 3) < 0.15;
    g.fillStyle = flower ? ['#e8d36a', '#f29cc3', '#f6ecd6'][i % 3]! : LAND.grassLit;
    g.fillRect(x, y, 1, 1);
    if (!flower) g.fillRect(x + 1, y - 1, 1, 1);
  }
  // Three dirt roads, narrowing toward the cave, with ruts and the odd stone.
  for (let lane = 0; lane < LANES; lane++) {
    for (let y = caveY; y < stageY; y++) {
      const depth = depthAtY(y, h);
      const x0 = Math.round(laneX(lane, depth, 0.1));
      const x1 = Math.round(laneX(lane, depth, 0.9));
      for (let x = x0; x <= x1; x++) {
        const edge = x === x0 || x === x1;
        const across = (x - x0) / Math.max(1, x1 - x0);
        const rut = Math.abs(across - 0.3) < 0.04 || Math.abs(across - 0.7) < 0.04;
        const r = hash(x + lane * 997, y);
        g.fillStyle = edge ? LAND.roadDark : rut ? LAND.roadDark : r < 0.008 ? LAND.stone : r > 0.985 ? LAND.roadLit : LAND.road;
        g.fillRect(x, y, 1, 1);
      }
    }
  }
  // The hillside and the cave mouth.
  // Boulders: 6×4 blocks, lit on top, a dark seam below, so the hillside reads as stone, not noise.
  for (let y = 0; y < caveY + 2; y++) {
    for (let x = 0; x < w; x++) {
      // Boulders of uneven width: each row of rock has its own size and offset.
      const row = Math.floor(y / 4);
      const bw = 5 + Math.floor(hash(row, 13) * 5);
      const off = Math.floor(hash(row, 14) * bw);
      const bx = Math.floor((x + off) / bw);
      const inY = y % 4;
      const inX = (x + off) % bw;
      const tone = hash(bx, row);
      g.fillStyle = inY === 3 || inX === bw - 1 ? LAND.rockDark : inY === 0 ? LAND.rockLit : tone < 0.3 ? LAND.rockDark : LAND.rock;
      if (y < 3 && hash(x, 7) < 0.6) g.fillStyle = LAND.sky;
      g.fillRect(x, y, 1, 1);
    }
  }
  const mouthHalf = Math.round((laneX(2, 0, 1) - laneX(0, 0, 0)) / 2) + 4;
  const mouthTop = Math.round(caveY * 0.35);
  // A ragged mouth: the rim wanders a pixel or two, and rock teeth hang from the top.
  for (let y = mouthTop; y <= caveY + 1; y++) {
    const t = (y - mouthTop) / Math.max(1, caveY + 1 - mouthTop);
    const half = Math.round(mouthHalf * Math.sqrt(Math.min(1, t * 1.6)) + (hash(y, 11) < 0.4 ? 1 : 0));
    for (let x = w / 2 - half; x < w / 2 + half; x++) {
      const inner = Math.abs(x - w / 2) < half - 2 && y > mouthTop + 1;
      g.fillStyle = inner ? LAND.mouth : LAND.rockDark;
      g.fillRect(x, y, 1, 1);
    }
  }
  for (let i = 0; i < 9; i++) {
    const x = Math.round(w / 2 - mouthHalf * 0.7 + (i / 8) * mouthHalf * 1.4);
    const len = 2 + Math.floor(hash(i, 12) * 5);
    const top = mouthTop + 2 + Math.round(Math.abs(x - w / 2) / mouthHalf * 6);
    g.fillStyle = LAND.rockDark;
    for (let k = 0; k < len; k++) g.fillRect(x - (k < len / 2 ? 1 : 0), top + k, k < len / 2 ? 3 : 1, 1);
  }
  // Pennant poles along the roads, smaller with distance.
  for (const f of [0.18, 0.42, 0.7]) {
    const depth = f * STAGE_LINE;
    const sc = scaleAt(depth);
    const footY = Math.round(depthToFraction(depth) * h);
    for (const [k, across] of [[0, 0], [0, 1], [1, 1], [2, 1]] as const) {
      const x = Math.round(laneX(k, depth, across === 0 ? 0.02 : 0.98));
      const tall = Math.max(6, Math.round(16 * sc));
      g.fillStyle = LAND.roadDark;
      g.fillRect(x, footY - tall, 1, tall);
      const flag = ['#8c2420', '#e0b04a', '#3a64a8', '#4f8a3a'][(k + Math.round(f * 10)) % 4]!;
      g.fillStyle = flag;
      const fw = Math.max(2, Math.round(5 * sc));
      for (let i = 0; i < fw; i++) g.fillRect(x + 1, footY - tall + i, fw - i, 1);
    }
  }
  landCache = { w, h, canvas: c };
  return c;
}

/** Inverse of depthToFraction for a canvas row (for drawing the land). */
function depthAtY(y: number, h: number): number {
  let lo = 0;
  let hi = STAGE_LINE;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (depthToFraction(mid) * h < y) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function drawField(
  ctx: CanvasRenderingContext2D,
  state: EngineState,
  alpha: number,
  fx: FieldFx,
  beatPhase: number,
  now: number,
): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const stageY = Math.round(h * STAGE_FRACTION);
  const yOf = (depth: number) => Math.round(depthToFraction(depth) * h);

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(land(w, h), 0, 0);

  // Who waits at the cave: the next boss, looming over the mouth, eyes catching the light on the beat.
  const looming = nextBoss(state);
  const bossOut = state.boss !== null;
  if (looming && !bossOut) {
    const art = ART[looming];
    if (art) {
      const caveY = Math.round(h * CAVE_FRACTION);
      const box = drawScaled(ctx, looming, art, Math.floor(now / 600) % 2, w / 2, Math.round(caveY * 0.62), 0.55);
      // In shadow: darken it, so it reads as a threat in the distance.
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = LAND.mouth;
      ctx.fillRect(box.x, box.y, box.w, box.h);
      ctx.globalAlpha = 1;
    }
  }

  // Wheel ruts and stones scroll toward the stage with the beat (in perspective), and lanes flash.
  for (let lane = 0; lane < LANES; lane++) {
    const marks = 6;
    for (let i = 0; i < marks; i++) {
      const d = ((i + beatPhase) / marks) * STAGE_LINE;
      const y = yOf(d);
      const s = scaleAt(d);
      ctx.fillStyle = LAND.roadDark;
      ctx.fillRect(Math.round(laneX(lane, d, 0.45)), y, Math.max(1, Math.round(3 * s)), 1);
    }
    const flash = fx.laneFlash[lane] ?? 0;
    const miss = fx.laneMiss[lane] ?? 0;
    if (flash > 0.01 || miss > 0.01) {
      for (let y = Math.round(h * CAVE_FRACTION); y < stageY; y += 1) {
        const d = depthAtY(y, h);
        const x0 = Math.round(laneX(lane, d, 0.1));
        const x1 = Math.round(laneX(lane, d, 0.9));
        if (flash > 0.01) {
          ctx.globalAlpha = flash * 0.4;
          ctx.fillStyle = fx.flashColor[lane] ?? PALETTE.footlight;
          ctx.fillRect(x0, y, x1 - x0 + 1, 1);
        }
        if (miss > 0.01 && y > stageY - 16) {
          ctx.globalAlpha = miss * 0.7;
          ctx.fillStyle = PALETTE.miss;
          ctx.fillRect(x0, y, x1 - x0 + 1, 1);
        }
      }
      ctx.globalAlpha = 1;
    }
  }

  // Gates: a bar across the lane plus a durability strip. Lyra's Swell makes them pulse wide.
  const active = state.clock.beat < state.headliner.activeUntilBeat;
  const swelling = active && state.headliner.id === 'lyra';
  for (const g of state.gates) {
    const x = Math.round(laneX(g.lane, g.depth, 0.08));
    const y = yOf(g.depth);
    const width = Math.round(laneX(g.lane, g.depth, 0.92)) - x;
    if (g.hexed) {
      // Switched off by a Hexer: a dim, crossed-out bar.
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = HEX_COLOR;
      ctx.fillRect(x, y - 1, width, 2);
      ctx.globalAlpha = 1;
      for (let k = 0; k < width; k += 6) ctx.fillRect(x + k, y - 2 + (k % 12 === 0 ? 0 : 3), 2, 1);
      continue;
    }
    ctx.fillStyle = GATE_COLORS[g.kind];
    ctx.globalAlpha = swelling ? 0.35 + (1 - beatPhase) * 0.4 : 0.25;
    const glow = swelling ? 8 : 4;
    ctx.fillRect(x, y - glow, width, glow * 2);
    ctx.globalAlpha = 1;
    ctx.fillRect(x, y - 1, width, 2);
    ctx.fillStyle = PALETTE.night;
    ctx.fillRect(x, y + 3, width, 1);
    ctx.fillStyle = GATE_COLORS[g.kind];
    ctx.fillRect(x, y + 3, Math.max(1, Math.round((width * g.durability) / g.maxDurability)), 1);
  }

  // Enemies.
  for (const e of state.enemies) {
    if (e.depth < -1_000) continue;
    const artKey = e.kind === 'shieldbearer' && !e.shieldLeft ? 'shieldbearer-bare' : e.child ? `${e.kind}-child` : e.kind;
    const art = ART[artKey];
    const sprite: Sprite = e.kind === 'shieldbearer' && !e.shieldLeft ? SPRITES['shieldbearer-bare'] : SPRITES[e.kind];
    const wide = ENEMIES[e.kind].wide === true;
    const up = airborne(state, e);
    const jitter = e.kind === 'swarmling' || e.child || e.kind === 'bat' ? ((e.id * 37) % 41) - 20 : 0;
    // Bats bob while they're up high.
    const bob = e.kind === 'bat' && e.depth < SWOOP_DEPTH ? (Math.floor(now / 120 + e.id) % 2) * 3 - 6 : 0;
    // Walk cycle: a step a beat (flyers flap and wisps flicker faster).
    const fast = e.kind === 'bat' || e.kind === 'ghost' || e.kind === 'swarmling';
    const frame = fast ? Math.floor(now / 140 + e.id) % 2 : (state.clock.beat + e.id) % 2;
    const depth = Math.min(STAGE_LINE, Math.max(0, e.depth + e.speed * alpha));
    // Perspective (S4.9): far up the road it's smaller and nearer the middle.
    const s = scaleAt(depth);
    const cx = wide ? w / 2 : laneX(e.lane, depth) + jitter * s;
    // The bosses loom: keep all of one on screen, under its health bar.
    const footY = wide ? Math.max(10 + Math.round((art ? art.frames[0]!.length : 20) * s), yOf(depth)) : yOf(depth) + Math.round(bob * s);
    // A Ghost on beats 2 and 4 is barely there (and can't be hit).
    if (faded(state, e)) ctx.globalAlpha = 0.25;
    let box: { x: number; y: number; w: number; h: number };
    if (art) box = drawScaled(ctx, artKey, art, frame, cx, footY, s);
    else {
      const size = spriteSize(sprite);
      const k = (e.child ? 1 : wide ? 3 : 2) * OLD_SCALE;
      box = { x: Math.round(cx - (size.w * k) / 2), y: footY - size.h * k, w: size.w * k, h: size.h * k };
      drawSprite(ctx, sprite, box.x, box.y, k);
    }
    ctx.globalAlpha = 1;
    if (up) {
      // A shadow on the road: it's up in the air.
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = PALETTE.night;
      ctx.fillRect(box.x + 2, box.y + box.h + Math.round(6 * s), Math.max(1, box.w - 4), 2);
      ctx.globalAlpha = 1;
    }
    // Slowed (Aria): a pink band at the feet; held still: pink all round.
    const held = state.headliner.id === 'aria' && state.clock.beat < state.headliner.activeUntilBeat;
    if (held || (e.slowUntilBeat ?? -1) > state.clock.beat) {
      ctx.fillStyle = PALETTE.aria;
      ctx.globalAlpha = held ? 0.8 : 0.6;
      ctx.fillRect(box.x, box.y + box.h - 1, box.w, 2);
      if (held) ctx.fillRect(box.x, box.y - 2, box.w, 1);
      ctx.globalAlpha = 1;
    }
    // The Hush, phase 1: everyone else wears a pale shield.
    if (state.boss?.phase === 1 && (state.boss.kind ?? 'hush') === 'hush' && !wide) {
      ctx.fillStyle = '#d6caef';
      ctx.fillRect(box.x - 1, box.y - 5, box.w + 2, 1);
    }
    if (wide) continue; // its health is the bar across the top
    if (e.hp < e.maxHp) {
      ctx.fillStyle = PALETTE.night;
      ctx.fillRect(box.x, box.y - 3, box.w, 2);
      ctx.fillStyle = e.armor > 0 ? '#a69cc0' : PALETTE.miss;
      ctx.fillRect(box.x, box.y - 3, Math.max(1, Math.round((box.w * e.hp) / e.maxHp)), 2);
    }
  }

  // The Hush's health: a bar across the top, notched where its phases change.
  const boss = state.boss ? state.enemies.find((e) => e.id === state.boss!.enemyId) : undefined;
  if (boss) {
    ctx.fillStyle = PALETTE.night;
    ctx.fillRect(4, 2, w - 8, 3);
    ctx.fillStyle = '#d6caef';
    ctx.fillRect(4, 2, Math.max(1, Math.round(((w - 8) * boss.hp) / boss.maxHp)), 3);
    ctx.fillStyle = PALETTE.night;
    ctx.fillRect(4 + Math.round((w - 8) / 3), 2, 1, 3);
    ctx.fillRect(4 + Math.round(((w - 8) * 2) / 3), 2, 1, 3);
  }

  // Shots.
  for (const p of state.projectiles) {
    const d = Math.max(0, p.depth - PROJECTILE_SPEED * alpha);
    const x = Math.round(laneX(p.lane, d, 0.1 + (p.x / 1000) * 0.8));
    const y = yOf(d);
    ctx.fillStyle = p.splash ? PALETTE.clatter : p.gatesPassed ? PALETTE.footlight : PALETTE.cream;
    ctx.fillRect(x, y, 1, Math.max(2, Math.round(4 * scaleAt(d))));
  }

  // Kill bursts.
  fx.bursts = fx.bursts.filter((b) => now - b.born < 260);
  for (const b of fx.bursts) {
    const r = Math.floor((now - b.born) / 50) + 1;
    ctx.fillStyle = b.color;
    for (const [dx, dy] of [[-r, 0], [r, 0], [0, -r], [0, r], [-r, -r], [r, r], [-r, r], [r, -r]] as const) {
      ctx.fillRect(Math.round(b.x + dx * 2.5), Math.round(b.y + dy * 2.5), 2, 2);
    }
  }

  // The faire stage: oak boards with seams, a lit front edge, and lanterns along the apron that pulse with the beat.
  ctx.fillStyle = PALETTE.stage;
  ctx.fillRect(0, stageY, w, h - stageY);
  ctx.fillStyle = '#3b2414';
  for (let y = stageY + 5; y < h; y += 5) ctx.fillRect(0, y, w, 1);
  for (let row = 0; stageY + row * 5 < h; row++) {
    for (let x = (row % 2) * 13; x < w; x += 26) ctx.fillRect(x, stageY + row * 5, 1, 5);
  }
  ctx.fillStyle = PALETTE.stageLip;
  ctx.fillRect(0, stageY, w, 2);
  ctx.fillStyle = '#a07040';
  ctx.fillRect(0, stageY, w, 1);
  const glow = 1 - beatPhase;
  for (let i = 0; i < 9; i++) {
    const lx = Math.round(((i + 0.5) * w) / 9);
    ctx.fillStyle = '#1c1418';
    ctx.fillRect(lx - 2, h - 6, 5, 5);
    ctx.fillStyle = PALETTE.footlight;
    ctx.globalAlpha = 0.35 + glow * 0.65;
    ctx.fillRect(lx - 1, h - 5, 3, 3);
    ctx.globalAlpha = (0.15 + glow * 0.25);
    ctx.fillRect(lx - 4, h - 9, 9, 3);
    ctx.globalAlpha = 1;
  }

  // Units stand on the stage lip.
  const filling = active && state.headliner.id === 'thrum';
  for (const u of state.units) {
    // Tokens blink through their last two beats so you can see them about to leave.
    if (u.token && u.expiresBeat !== undefined && u.expiresBeat - state.clock.beat <= 2 && Math.floor(beatPhase * 4) % 2 === 1) continue;
    const art = ART[`unit:${u.cardId}`];
    const sprite: Sprite = (SPRITES as Record<string, Sprite>)[u.cardId] ?? SPRITES.stagehand;
    const old = spriteSize(sprite);
    const sw = art ? art.frames[0]![0]!.length : old.w * OLD_SCALE;
    const sh = art ? art.frames[0]!.length : old.h * OLD_SCALE;
    let cx = u.lane * LANE_PX + ((u.slot + 0.5) * LANE_PX) / 3;
    // Shift: walk across from the old lane over the first beat, stepping quickly.
    const walking = u.movedUntilBeat !== undefined && u.movedFrom !== undefined && state.clock.beat < u.movedUntilBeat;
    if (walking) {
      const t = Math.min(1, Math.max(0, state.clock.beat + beatPhase - (u.movedAt ?? state.clock.beat)));
      const ease = t * t * (3 - 2 * t);
      cx = (u.movedFrom! + (u.lane - u.movedFrom!) * ease) * LANE_PX + ((u.slot + 0.5) * LANE_PX) / 3;
    }
    const x = Math.round(cx - sw / 2);
    const y = stageY - sh + 5;
    if (filling && beatPhase < 0.5) {
      ctx.fillStyle = PALETTE.footlight;
      ctx.fillRect(x - 1, y - 1, sw + 2, sh + 2);
    }
    // The band plays on the beat: the playing pose for the first part of each beat.
    if (art) drawAnim(ctx, art, walking ? Math.floor(beatPhase * 4) % 2 : beatPhase < 0.3 ? 1 : 0, x, walking ? y - (Math.floor(beatPhase * 4) % 2) : y, 1);
    else drawSprite(ctx, sprite, x, y, OLD_SCALE);
  }

  if (fx.bigFlash > 0.01) {
    ctx.globalAlpha = fx.bigFlash * 0.35;
    ctx.fillStyle = PALETTE.footlight;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }
}

/** Fade effects toward zero. Call once per frame with elapsed ms. */
export function decayFx(fx: FieldFx, dtMs: number): void {
  const k = Math.exp(-dtMs / 140);
  for (let i = 0; i < LANES; i++) {
    fx.laneFlash[i] = (fx.laneFlash[i] ?? 0) * k;
    fx.laneMiss[i] = (fx.laneMiss[i] ?? 0) * k;
  }
  fx.bigFlash *= Math.exp(-dtMs / 220);
}
