import { FIELD_DEPTH, LANES, type EngineState } from '../engine';
import { PALETTE } from './palette';

/** Internal pixel width of the field. The canvas is scaled up with nearest-neighbour for a crisp pixel look. */
export const FIELD_PX_WIDTH = 144;
const LANE_PX = FIELD_PX_WIDTH / LANES;
const STAGE_PX = 14;

// 8×8 shambler, Phase 0 stand-in for enemies. '#' body, '+' shade, 'o' eye.
const SHAMBLER = [
  '..####..',
  '.#o##o#.',
  '.######.',
  '..#++#..',
  '.######.',
  '#.####.#',
  '..#..#..',
  '.##..##.',
];

export interface FieldFx {
  /** Per-lane flash 0–1 when a play resolves. */
  laneFlash: number[];
  /** Per-lane red pulse 0–1 when a marker reaches the stage. */
  laneMiss: number[];
  /** Tint for the lane flash, per lane. */
  flashColor: string[];
}

export function createFx(): FieldFx {
  return { laneFlash: [0, 0, 0], laneMiss: [0, 0, 0], flashColor: [PALETTE.footlight, PALETTE.footlight, PALETTE.footlight] };
}

/** Resize the backing store to the element's aspect ratio. Returns the internal pixel height. */
export function fitCanvas(canvas: HTMLCanvasElement): number {
  const rect = canvas.getBoundingClientRect();
  const height = Math.max(96, Math.round((FIELD_PX_WIDTH * rect.height) / Math.max(1, rect.width)));
  if (canvas.width !== FIELD_PX_WIDTH || canvas.height !== height) {
    canvas.width = FIELD_PX_WIDTH;
    canvas.height = height;
  }
  return height;
}

export function drawField(ctx: CanvasRenderingContext2D, state: EngineState, alpha: number, fx: FieldFx, beatPhase: number): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const travel = h - STAGE_PX - 8;

  ctx.fillStyle = PALETTE.night;
  ctx.fillRect(0, 0, w, h);

  for (let lane = 0; lane < LANES; lane++) {
    const x = lane * LANE_PX;
    ctx.fillStyle = PALETTE.floor;
    ctx.fillRect(x + 2, 0, LANE_PX - 4, h - STAGE_PX);
    // Floor boards scroll with the beat so the field breathes in time.
    ctx.fillStyle = PALETTE.floorLine;
    const spacing = 12;
    const offset = Math.floor(beatPhase * spacing);
    for (let y = offset - spacing; y < h - STAGE_PX; y += spacing) {
      if (y >= 0) ctx.fillRect(x + 2, y, LANE_PX - 4, 1);
    }
    const flash = fx.laneFlash[lane] ?? 0;
    if (flash > 0.01) {
      ctx.globalAlpha = flash * 0.55;
      ctx.fillStyle = fx.flashColor[lane] ?? PALETTE.footlight;
      ctx.fillRect(x + 2, 0, LANE_PX - 4, h - STAGE_PX);
      ctx.globalAlpha = 1;
    }
    const miss = fx.laneMiss[lane] ?? 0;
    if (miss > 0.01) {
      ctx.globalAlpha = miss * 0.6;
      ctx.fillStyle = PALETTE.miss;
      ctx.fillRect(x + 2, h - STAGE_PX - 10, LANE_PX - 4, 10);
      ctx.globalAlpha = 1;
    }
  }

  // Markers (interpolated between ticks for smooth motion).
  for (const m of state.markers) {
    const depth = Math.min(FIELD_DEPTH, m.depth + m.speed * alpha);
    const y = Math.round((depth / FIELD_DEPTH) * travel);
    const x = Math.round(m.lane * LANE_PX + LANE_PX / 2 - 8);
    drawSprite(ctx, SHAMBLER, x, y, 2);
  }

  // Stage lip and footlights.
  ctx.fillStyle = PALETTE.stage;
  ctx.fillRect(0, h - STAGE_PX, w, STAGE_PX);
  ctx.fillStyle = PALETTE.stageLip;
  ctx.fillRect(0, h - STAGE_PX, w, 2);
  const glow = 1 - beatPhase;
  for (let i = 0; i < 9; i++) {
    const fx0 = 6 + i * 16;
    ctx.fillStyle = PALETTE.footlight;
    ctx.globalAlpha = 0.35 + glow * 0.65;
    ctx.fillRect(fx0, h - STAGE_PX + 5, 4, 3);
    ctx.globalAlpha = 1;
  }
}

function drawSprite(ctx: CanvasRenderingContext2D, rows: readonly string[], x: number, y: number, scale: number): void {
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]!;
    for (let c = 0; c < row.length; c++) {
      const ch = row[c];
      if (ch === '.') continue;
      ctx.fillStyle = ch === '+' ? PALETTE.shamblerShade : ch === 'o' ? PALETTE.eye : PALETTE.shambler;
      ctx.fillRect(x + c * scale, y + r * scale, scale, scale);
    }
  }
}

/** Fade effects toward zero. Call once per frame with elapsed ms. */
export function decayFx(fx: FieldFx, dtMs: number): void {
  const k = Math.exp(-dtMs / 140);
  for (let i = 0; i < LANES; i++) {
    fx.laneFlash[i] = (fx.laneFlash[i] ?? 0) * k;
    fx.laneMiss[i] = (fx.laneMiss[i] ?? 0) * k;
  }
}
