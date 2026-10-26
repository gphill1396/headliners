import { airborne, ENEMIES, faded, LANES, PROJECTILE_SPEED, STAGE_LINE, SWOOP_DEPTH, type EngineState, type GateKind } from '../engine';
import { PALETTE } from './palette';
import { drawSprite, SPRITES, spriteSize, type Sprite } from './sprites';

/** Internal pixel width of the field. The canvas is scaled up with nearest-neighbour for a crisp pixel look. */
export const FIELD_PX_WIDTH = 144;
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

/** Map engine depth to canvas y. Shared with the DOM overlay so labels line up. */
export function depthToFraction(depth: number): number {
  return (depth / STAGE_LINE) * STAGE_FRACTION;
}

export function addBurst(fx: FieldFx, lane: number, depth: number, color: string, now: number, height: number): void {
  if (fx.bursts.length > 40) fx.bursts.shift();
  fx.bursts.push({ x: lane * LANE_PX + LANE_PX / 2, y: depthToFraction(depth) * height, born: now, color });
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

  ctx.fillStyle = PALETTE.night;
  ctx.fillRect(0, 0, w, h);

  // Lanes, scrolling floorboards, flashes.
  for (let lane = 0; lane < LANES; lane++) {
    const x = lane * LANE_PX;
    ctx.fillStyle = PALETTE.floor;
    ctx.fillRect(x + 2, 0, LANE_PX - 4, stageY);
    ctx.fillStyle = PALETTE.floorLine;
    const spacing = 12;
    const offset = Math.floor(beatPhase * spacing);
    for (let y = offset - spacing; y < stageY; y += spacing) if (y >= 0) ctx.fillRect(x + 2, y, LANE_PX - 4, 1);
    const flash = fx.laneFlash[lane] ?? 0;
    if (flash > 0.01) {
      ctx.globalAlpha = flash * 0.45;
      ctx.fillStyle = fx.flashColor[lane] ?? PALETTE.footlight;
      ctx.fillRect(x + 2, 0, LANE_PX - 4, stageY);
      ctx.globalAlpha = 1;
    }
    const miss = fx.laneMiss[lane] ?? 0;
    if (miss > 0.01) {
      ctx.globalAlpha = miss * 0.7;
      ctx.fillStyle = PALETTE.miss;
      ctx.fillRect(x + 2, stageY - 12, LANE_PX - 4, 12);
      ctx.globalAlpha = 1;
    }
  }

  // Gates: a bar across the lane plus a durability strip. Lyra's Swell makes them pulse wide.
  const active = state.clock.beat < state.headliner.activeUntilBeat;
  const swelling = active && state.headliner.id === 'lyra';
  for (const g of state.gates) {
    const x = g.lane * LANE_PX + 4;
    const y = yOf(g.depth);
    const width = LANE_PX - 8;
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
    const sprite: Sprite = e.kind === 'shieldbearer' && !e.shieldLeft ? SPRITES['shieldbearer-bare'] : SPRITES[e.kind];
    const { w: sw, h: sh } = spriteSize(sprite);
    const wide = ENEMIES[e.kind].wide === true;
    const up = airborne(state, e);
    const scale = e.child ? 1 : wide ? 3 : 2;
    const jitter = e.kind === 'swarmling' || e.child || e.kind === 'bat' ? ((e.id * 37) % 25) - 12 : 0;
    // Bats bob while they're up high.
    const bob = e.kind === 'bat' && e.depth < SWOOP_DEPTH ? (Math.floor(now / 120 + e.id) % 2) * 2 - 4 : 0;
    const x = wide ? Math.round(w / 2 - (sw * scale) / 2) : Math.round(e.lane * LANE_PX + LANE_PX / 2 - (sw * scale) / 2 + jitter);
    const rawY = yOf(Math.min(STAGE_LINE, e.depth + e.speed * alpha)) - sh * scale + bob;
    // The Hush looms in from the top: keep all of it on screen, under its health bar.
    const y = wide ? Math.max(8, rawY) : rawY;
    if (up) {
      // A shadow on the floor: it's up in the air.
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = PALETTE.night;
      ctx.fillRect(x + 2, y + sh * scale + 6, sw * scale - 4, 2);
      ctx.globalAlpha = 1;
    }
    // A Ghost on beats 2 and 4 is barely there (and can't be hit).
    if (faded(state, e)) ctx.globalAlpha = 0.25;
    drawSprite(ctx, sprite, x, y, scale);
    ctx.globalAlpha = 1;
    // Slowed (Aria): a pink band at the feet; held still: pink all round.
    const held = state.headliner.id === 'aria' && state.clock.beat < state.headliner.activeUntilBeat;
    if (held || (e.slowUntilBeat ?? -1) > state.clock.beat) {
      ctx.fillStyle = PALETTE.aria;
      ctx.globalAlpha = held ? 0.8 : 0.6;
      ctx.fillRect(x, y + sh * scale - 1, sw * scale, 2);
      if (held) ctx.fillRect(x, y - 2, sw * scale, 1);
      ctx.globalAlpha = 1;
    }
    // The Hush, phase 1: everyone else wears a pale shield.
    if (state.boss?.phase === 1 && (state.boss.kind ?? 'hush') === 'hush' && !wide) {
      ctx.fillStyle = '#d6caef';
      ctx.fillRect(x - 1, y - 5, sw * scale + 2, 1);
    }
    if (wide) continue; // its health is the bar across the top
    if (e.hp < e.maxHp) {
      const bw = sw * scale;
      ctx.fillStyle = PALETTE.night;
      ctx.fillRect(x, y - 3, bw, 2);
      ctx.fillStyle = e.armor > 0 ? '#a69cc0' : PALETTE.miss;
      ctx.fillRect(x, y - 3, Math.max(1, Math.round((bw * e.hp) / e.maxHp)), 2);
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
    const x = Math.round(p.lane * LANE_PX + 3 + (p.x / 1000) * (LANE_PX - 6));
    const y = yOf(p.depth - PROJECTILE_SPEED * alpha);
    ctx.fillStyle = p.splash ? PALETTE.clatter : p.gatesPassed ? PALETTE.footlight : PALETTE.cream;
    ctx.fillRect(x, y, 1, 3);
  }

  // Kill bursts.
  fx.bursts = fx.bursts.filter((b) => now - b.born < 260);
  for (const b of fx.bursts) {
    const r = Math.floor((now - b.born) / 50) + 1;
    ctx.fillStyle = b.color;
    for (const [dx, dy] of [[-r, 0], [r, 0], [0, -r], [0, r], [-r, -r], [r, r], [-r, r], [r, -r]] as const) {
      ctx.fillRect(Math.round(b.x + dx * 1.5), Math.round(b.y + dy * 1.5), 1, 1);
    }
  }

  // Stage and footlights.
  ctx.fillStyle = PALETTE.stage;
  ctx.fillRect(0, stageY, w, h - stageY);
  ctx.fillStyle = PALETTE.stageLip;
  ctx.fillRect(0, stageY, w, 2);
  const glow = 1 - beatPhase;
  for (let i = 0; i < 9; i++) {
    ctx.fillStyle = PALETTE.footlight;
    ctx.globalAlpha = 0.3 + glow * 0.7;
    ctx.fillRect(6 + i * 16, h - 4, 4, 2);
    ctx.globalAlpha = 1;
  }

  // Units stand on the stage lip.
  const filling = active && state.headliner.id === 'thrum';
  for (const u of state.units) {
    // Tokens blink through their last two beats so you can see them about to leave.
    if (u.token && u.expiresBeat !== undefined && u.expiresBeat - state.clock.beat <= 2 && Math.floor(beatPhase * 4) % 2 === 1) continue;
    const sprite: Sprite = (SPRITES as Record<string, Sprite>)[u.cardId] ?? SPRITES.stagehand;
    const { w: sw, h: sh } = spriteSize(sprite);
    const cx = u.lane * LANE_PX + 8 + u.slot * 16;
    const x = Math.round(cx - sw / 2);
    const y = stageY - sh + 3;
    if (filling && beatPhase < 0.5) {
      ctx.fillStyle = PALETTE.footlight;
      ctx.fillRect(x - 1, y - 1, sw + 2, sh + 2);
    }
    drawSprite(ctx, sprite, x, y, 1);
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
