/**
 * Load-In (SPEC S4.1): a sliding-chest puzzle. Gear chests block the loading
 * yard; slide them (each only along its own length) until the lute case can
 * slide out to the wagon at the right edge of its row. One slide, however far,
 * is one move.
 *
 * Pure TS (no DOM, no clock): the solver checks every level and the generator
 * makes the daily puzzle from the date, so everyone gets the same one.
 */
import { createRng, nextInt, type RngState } from '../engine';

export const SIZE = 6;
/** The row the lute case is on; the wagon waits at its right end. */
export const EXIT_ROW = 2;
/** The lute case's letter. */
export const TARGET = 'A';
/** A fixed barrel: never moves. */
export const WALL = 'x';

export interface Piece {
  id: string;
  /** 'h' slides left and right; 'v' up and down. Barrels don't slide. */
  dir: 'h' | 'v' | 'fixed';
  len: number;
  /** The row (for 'h') or column (for 'v') it slides along. */
  lane: number;
}

/** A puzzle: its pieces (fixed for the whole puzzle) and where each one starts along its lane. */
export interface Puzzle {
  pieces: Piece[];
  /** Position along the lane (column for 'h', row for 'v'; for barrels, the cell index). */
  start: number[];
}

/** A level written as 6 rows of 6: '.' empty, 'A' the lute case, other letters chests, 'x' barrels. */
export type LevelText = string;

export function parse(text: LevelText): Puzzle {
  const rows = text.trim().split(/\s+/);
  if (rows.length !== SIZE || rows.some((r) => r.length !== SIZE)) throw new Error('A level is 6 rows of 6.');
  const cells = rows.join('');
  const pieces: Piece[] = [];
  const start: number[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < cells.length; i++) {
    const ch = cells[i]!;
    if (ch === '.') continue;
    if (ch === WALL) {
      pieces.push({ id: `${WALL}${i}`, dir: 'fixed', len: 1, lane: -1 });
      start.push(i);
      continue;
    }
    if (seen.has(ch)) continue;
    seen.add(ch);
    const x = i % SIZE;
    const y = Math.floor(i / SIZE);
    const horizontal = x + 1 < SIZE && cells[i + 1] === ch;
    let len = 1;
    while (horizontal ? x + len < SIZE && cells[i + len] === ch : y + len < SIZE && cells[i + len * SIZE] === ch) len += 1;
    if (len < 2) throw new Error(`Piece ${ch} is too short.`);
    pieces.push(horizontal ? { id: ch, dir: 'h', len, lane: y } : { id: ch, dir: 'v', len, lane: x });
    start.push(horizontal ? x : y);
  }
  const target = pieces.find((p) => p.id === TARGET);
  if (!target || target.dir !== 'h' || target.lane !== EXIT_ROW) throw new Error('The lute case (A) lies across row 3.');
  return { pieces, start };
}

export function format(puzzle: Puzzle, positions: readonly number[] = puzzle.start): LevelText {
  const grid = occupancy(puzzle, positions).map((owner) => (owner < 0 ? '.' : puzzle.pieces[owner]!.dir === 'fixed' ? WALL : puzzle.pieces[owner]!.id));
  const rows: string[] = [];
  for (let y = 0; y < SIZE; y++) rows.push(grid.slice(y * SIZE, y * SIZE + SIZE).join(''));
  return rows.join('\n');
}

/** The cells each piece covers. */
export function cellsOf(piece: Piece, pos: number): number[] {
  if (piece.dir === 'fixed') return [pos];
  const out: number[] = [];
  for (let k = 0; k < piece.len; k++) out.push(piece.dir === 'h' ? piece.lane * SIZE + pos + k : (pos + k) * SIZE + piece.lane);
  return out;
}

/** Which piece is on each cell (-1 for none). */
export function occupancy(puzzle: Puzzle, positions: readonly number[]): number[] {
  const grid = new Array<number>(SIZE * SIZE).fill(-1);
  puzzle.pieces.forEach((p, i) => {
    for (const c of cellsOf(p, positions[i]!)) grid[c] = i;
  });
  return grid;
}

/** How far a piece can slide: [furthest back (≤ 0), furthest forward (≥ 0)]. */
export function slideRange(puzzle: Puzzle, positions: readonly number[], index: number, grid = occupancy(puzzle, positions)): [number, number] {
  const p = puzzle.pieces[index]!;
  if (p.dir === 'fixed') return [0, 0];
  const pos = positions[index]!;
  const at = (k: number) => (p.dir === 'h' ? p.lane * SIZE + k : k * SIZE + p.lane);
  let back = 0;
  while (pos + back - 1 >= 0 && grid[at(pos + back - 1)] === -1) back -= 1;
  let fwd = 0;
  while (pos + p.len + fwd < SIZE && grid[at(pos + p.len + fwd)] === -1) fwd += 1;
  return [back, fwd];
}

/** Slide a piece by `delta` cells if the way is clear. Returns the new positions, or null. */
export function slide(puzzle: Puzzle, positions: readonly number[], index: number, delta: number): number[] | null {
  if (delta === 0) return null;
  const [back, fwd] = slideRange(puzzle, positions, index);
  if (delta < back || delta > fwd) return null;
  const next = [...positions];
  next[index] = positions[index]! + delta;
  return next;
}

/** Solved when the lute case reaches the right edge of its row (the wagon). */
export function isSolved(puzzle: Puzzle, positions: readonly number[]): boolean {
  const i = puzzle.pieces.findIndex((p) => p.id === TARGET);
  return positions[i]! + puzzle.pieces[i]!.len === SIZE;
}

function neighbors(puzzle: Puzzle, positions: readonly number[]): number[][] {
  const grid = occupancy(puzzle, positions);
  const out: number[][] = [];
  for (let i = 0; i < puzzle.pieces.length; i++) {
    const [back, fwd] = slideRange(puzzle, positions, i, grid);
    for (let d = back; d <= fwd; d++) {
      if (d === 0) continue;
      const next = [...positions];
      next[i] = positions[i]! + d;
      out.push(next);
    }
  }
  return out;
}

const key = (positions: readonly number[]) => positions.join(',');

/** Fewest moves to load the wagon, and one shortest solution (as positions after each move); null if it can't be done. */
export function solve(puzzle: Puzzle, from: readonly number[] = puzzle.start, limit = 200_000): { moves: number; path: number[][] } | null {
  const start = [...from];
  if (isSolved(puzzle, start)) return { moves: 0, path: [] };
  const prev = new Map<string, string | null>([[key(start), null]]);
  const states = new Map<string, number[]>([[key(start), start]]);
  let frontier = [start];
  while (frontier.length > 0 && prev.size < limit) {
    const next: number[][] = [];
    for (const s of frontier) {
      for (const n of neighbors(puzzle, s)) {
        const k = key(n);
        if (prev.has(k)) continue;
        prev.set(k, key(s));
        states.set(k, n);
        if (isSolved(puzzle, n)) {
          const path: number[][] = [];
          for (let at: string | null = k; at !== null && at !== key(start); at = prev.get(at) ?? null) path.unshift(states.get(at)!);
          return { moves: path.length, path };
        }
        next.push(n);
      }
    }
    frontier = next;
  }
  return null;
}

/**
 * The hardest start in this puzzle's family: every arrangement reachable from
 * it, measured from the nearest solved one (slides are reversible). Returns
 * that start and its fewest moves, or null if the wagon can't be loaded.
 */
export function hardest(puzzle: Puzzle, limit = 40_000): { start: number[]; moves: number } | null {
  const all = new Map<string, number[]>([[key(puzzle.start), [...puzzle.start]]]);
  let frontier = [puzzle.start];
  while (frontier.length > 0 && all.size < limit) {
    const next: number[][] = [];
    for (const s of frontier) for (const n of neighbors(puzzle, s)) if (!all.has(key(n))) {
      all.set(key(n), n);
      next.push(n);
    }
    frontier = next;
  }
  if (all.size >= limit) return null;
  const dist = new Map<string, number>();
  let wave: number[][] = [];
  for (const [k, s] of all) if (isSolved(puzzle, s)) {
    dist.set(k, 0);
    wave.push(s);
  }
  if (wave.length === 0) return null;
  let best = wave[0]!;
  let bestD = 0;
  for (let d = 1; wave.length > 0; d++) {
    const next: number[][] = [];
    for (const s of wave) for (const n of neighbors(puzzle, s)) {
      const k = key(n);
      if (dist.has(k)) continue;
      dist.set(k, d);
      next.push(n);
      if (d > bestD || (d === bestD && k < key(best))) {
        best = n;
        bestD = d;
      }
    }
    wave = next;
  }
  return { start: best, moves: bestD };
}

/** A random yard: the lute case plus `count` chests (and a barrel or two), all legal, maybe unsolvable. */
function randomYard(rng: RngState, count: number, barrels: number): Puzzle | null {
  const pieces: Piece[] = [{ id: TARGET, dir: 'h', len: 2, lane: EXIT_ROW }];
  const start: number[] = [nextInt(rng, 0, 3)];
  const letters = 'BCDEFGHIJKLMNOPQRSTUVWYZ';
  const free = (cells: number[]) => {
    const grid = occupancy({ pieces, start }, start);
    return cells.every((c) => grid[c] === -1);
  };
  let tries = 0;
  while (pieces.length - 1 < count && tries++ < 400) {
    const len = nextInt(rng, 0, 4) === 0 ? 3 : 2;
    const dir = nextInt(rng, 0, 2) === 0 ? 'h' : 'v';
    const lane = nextInt(rng, 0, SIZE);
    // A sideways chest on the lute case's row could never get out of the way.
    if (dir === 'h' && lane === EXIT_ROW) continue;
    const pos = nextInt(rng, 0, SIZE - len + 1);
    const piece: Piece = { id: letters[pieces.length - 1]!, dir, len, lane };
    if (!free(cellsOf(piece, pos))) continue;
    pieces.push(piece);
    start.push(pos);
  }
  for (let b = 0; b < barrels; b++) {
    const cell = nextInt(rng, 0, SIZE * SIZE);
    if (Math.floor(cell / SIZE) === EXIT_ROW) continue; // never wall off the way to the wagon
    if (!free([cell])) continue;
    pieces.push({ id: `${WALL}${cell}`, dir: 'fixed', len: 1, lane: -1 });
    start.push(cell);
  }
  return pieces.length - 1 >= Math.min(count, 6) ? { pieces, start } : null;
}

/** Make a puzzle from a seed: the hardest start of a random yard, with fewest moves in [min, max]. */
export function generate(seed: string, min: number, max: number, attempts = 400): { text: LevelText; par: number } | null {
  const rng = createRng(seed);
  for (let a = 0; a < attempts; a++) {
    const yard = randomYard(rng, 8 + nextInt(rng, 0, 5), nextInt(rng, 0, 3));
    if (!yard) continue;
    const h = hardest(yard);
    if (!h || h.moves < min || h.moves > max) continue;
    return { text: format(yard, h.start), par: h.moves };
  }
  return null;
}

/** The daily Load-In (same for everyone on a UTC date). */
export function dailyLoadIn(date: string): { text: LevelText; par: number } {
  return generate(`loadin-${date}`, 12, 30) ?? generate(`loadin-${date}-easy`, 6, 40)!;
}
