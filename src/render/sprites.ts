/**
 * Original pixel sprites, drawn in code (SPEC §8: no licensed assets).
 * Each sprite is rows of characters; '.' is transparent and other characters
 * map to colors in the sprite's own palette.
 */
export interface Sprite {
  rows: readonly string[];
  colors: Record<string, string>;
}

export const SPRITES = {
  shambler: {
    rows: ['..####..', '.#o##o#.', '.######.', '..#++#..', '.######.', '#.####.#', '..#..#..', '.##..##.'],
    colors: { '#': '#9bbf6a', '+': '#5f7d3f', o: '#211934' },
  },
  brute: {
    rows: [
      '..======..',
      '.=##oo##=.',
      '.########.',
      '==######==',
      '#=##++##=#',
      '#.######.#',
      '#.##==##.#',
      '..######..',
      '..##..##..',
      '.###..###.',
    ],
    colors: { '#': '#7f9a5a', '+': '#4e6636', o: '#e2574c', '=': '#a69cc0' },
  },
  swarmling: {
    rows: ['#.#.#', '.###.', '#o#o#', '.#.#.'],
    colors: { '#': '#c06bd6', o: '#ffc94d' },
  },
  stagehand: {
    rows: ['.aaa.', 'aaaaa', '.ccc.', '.c#c.', 'ccccc', '.c.c.', '.c.c.'],
    colors: { a: '#ffc94d', c: '#f6ecd6', '#': '#211934' },
  },
  'kick-drum': {
    rows: ['.eeeee.', 'eccccce', 'ec#c#ce', 'eccccce', 'eccccce', '.eeeee.', '.e...e.'],
    colors: { e: '#f0773e', c: '#f6ecd6', '#': '#7a5c3e' },
  },
  bassline: {
    rows: ['....t', '...t.', '..t..', '.ttt.', 'tttt.', 'tt#t.', '.tt..'],
    colors: { t: '#4fd1c5', '#': '#211934' },
  },
} satisfies Record<string, Sprite>;

export type SpriteName = keyof typeof SPRITES;

export function spriteSize(s: Sprite): { w: number; h: number } {
  return { w: s.rows[0]?.length ?? 0, h: s.rows.length };
}

export function drawSprite(ctx: CanvasRenderingContext2D, sprite: Sprite, x: number, y: number, scale = 1, tint?: string): void {
  const rows = sprite.rows;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]!;
    for (let c = 0; c < row.length; c++) {
      const ch = row[c]!;
      if (ch === '.') continue;
      ctx.fillStyle = tint ?? sprite.colors[ch] ?? '#ff00ff';
      ctx.fillRect(x + c * scale, y + r * scale, scale, scale);
    }
  }
}
