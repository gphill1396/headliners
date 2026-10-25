import { LANES, PROJECTILE_SPEED, STAGE_LINE, type EngineState, type GateKind } from '../engine';
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
};

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

  // Gates: a bar across the lane plus a durability strip.
  for (const g of state.gates) {
    const x = g.lane * LANE_PX + 4;
    const y = yOf(g.depth);
    const width = LANE_PX - 8;
    ctx.fillStyle = GATE_COLORS[g.kind];
    ctx.globalAlpha = 0.25;
    ctx.fillRect(x, y - 4, width, 8);
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
    const sprite: Sprite = SPRITES[e.kind];
    const { w: sw, h: sh } = spriteSize(sprite);
    const scale = e.kind === 'swarmling' ? 2 : 2;
    const jitter = e.kind === 'swarmling' ? ((e.id * 37) % 25) - 12 : 0;
    const x = Math.round(e.lane * LANE_PX + LANE_PX / 2 - (sw * scale) / 2 + jitter);
    const y = yOf(Math.min(STAGE_LINE, e.depth + e.speed * alpha)) - sh * scale;
    drawSprite(ctx, sprite, x, y, scale);
    if (e.hp < e.maxHp) {
      const bw = sw * scale;
      ctx.fillStyle = PALETTE.night;
      ctx.fillRect(x, y - 3, bw, 2);
      ctx.fillStyle = e.armor > 0 ? '#a69cc0' : PALETTE.miss;
      ctx.fillRect(x, y - 3, Math.max(1, Math.round((bw * e.hp) / e.maxHp)), 2);
    }
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
  const filling = state.clock.beat < state.headliner.activeUntilBeat;
  for (const u of state.units) {
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
