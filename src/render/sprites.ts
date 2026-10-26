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
  hush: {
    rows: [
      '.......vvvvvvvvvv.......',
      '....vvvvvvvvvvvvvvvv....',
      '..vvvvvvvvvvvvvvvvvvvv..',
      '.vvvvvovvvvvvvvvvovvvvv.',
      'vvvvvvvvvvvvvvvvvvvvvvvv',
      'vvvvvvvvvvv##vvvvvvvvvvv',
      'vvvvvvvvvvv##vvvvvvvvvvv',
      'vvvvvvvvvmm##mmvvvvvvvvv',
      '.vv.vvv.vvvvvvvv.vvv.vv.',
      '..v..v...vv..vv...v..v..',
    ],
    colors: { v: '#d6caef', o: '#211934', '#': '#f6ecd6', m: '#8f82a8' },
  },
  bat: {
    rows: ['#.....#', '##...##', '###o###', '.#####.', '..#.#..'],
    colors: { '#': '#7d6aa8', o: '#ffc94d' },
  },
  splitter: {
    rows: ['..####..', '.#++++#.', '#+o++o+#', '#++##++#', '#+#++#+#', '#++++++#', '.#+##+#.', '#..##..#'],
    colors: { '#': '#d0864b', '+': '#e8a96b', o: '#211934' },
  },
  shieldbearer: {
    rows: ['...##...', '..#oo#..', '..####..', '.######.', '.##..##.', '========', '=+====+=', '========'],
    colors: { '#': '#8aa0b8', o: '#211934', '=': '#c9b26b', '+': '#7a5c3e' },
  },
  'shieldbearer-bare': {
    rows: ['...##...', '..#oo#..', '..####..', '.######.', '.##..##.', '.##..##.', '.#....#.', '##....##'],
    colors: { '#': '#8aa0b8', o: '#211934' },
  },
  hexer: {
    rows: ['...#...', '..###..', '.##*##.', '.#*#*#.', '#######', '.#####.', '.#.#.#.', '#..#..#'],
    colors: { '#': '#5a3f86', '*': '#c06bd6' },
  },
  breaker: {
    rows: ['==......', '==.####.', '.=#o##o#', '.=######', '.#######', '..######', '..##..##', '.###..##'],
    colors: { '#': '#9a6b4f', o: '#ffc94d', '=': '#a69cc0' },
  },
  stagehand: {
    rows: ['.aaa.', 'aaaaa', '.ccc.', '.c#c.', 'ccccc', '.c.c.', '.c.c.'],
    colors: { a: '#ffc94d', c: '#f6ecd6', '#': '#211934' },
  },
  'kick-drum': {
    rows: ['.eeeee.', 'eccccce', 'ec#c#ce', 'eccccce', 'eccccce', '.eeeee.', '.e...e.'],
    colors: { e: '#f0773e', c: '#f6ecd6', '#': '#7a5c3e' },
  },
  'hype-man': {
    rows: ['.aaa.', 'a#a#a', '.aaa.', 'cc.cc', '.ccc.', '.c.c.', 'c...c'],
    colors: { a: '#e2574c', c: '#f6ecd6', '#': '#211934' },
  },
  'double-kick': {
    rows: ['eeeeeee', 'ec#e#ce', 'eccecce', 'ec#e#ce', 'eeeeeee', '.e...e.', 'ee...ee'],
    colors: { e: '#f0773e', c: '#f6ecd6', '#': '#7a5c3e' },
  },
  'tuning-fork': {
    rows: ['t...t', 't...t', 't...t', '.ttt.', '..t..', '..t..', '.ttt.'],
    colors: { t: '#4fd1c5' },
  },
  'guitar-tech': {
    rows: ['.yyy...', 'yoyoy..', '.yyy..g', 'bbbbb.g', '.bbb.gg', '.b.b...', '.b.b...'],
    colors: { y: '#e8d36a', o: '#211934', b: '#4a3a2e', g: '#a69cc0' },
  },
  security: {
    rows: ['.###.', '#o#o#', '.###.', 'kkkkk', 'kkYkk', '.k.k.', 'kk.kk'],
    colors: { '#': '#e8d36a', o: '#211934', k: '#6b6b84', Y: '#ffc94d' },
  },
  rigger: {
    rows: ['|.yy.', '|yoyo', '|.yy.', '|gggg', '|.gg.', '|g..g', '|....'],
    colors: { '|': '#a69cc0', y: '#e8d36a', o: '#211934', g: '#7a5c3e' },
  },
  'backup-singer': {
    rows: ['.ppp.', 'p#p#p', '.ppp.', '..c..', '.ccc.', 'c.c.c', '.c.c.'],
    colors: { p: '#f29cc3', c: '#f6ecd6', '#': '#211934' },
  },
  soprano: {
    rows: ['.ppp.', 'pp#pp', '.ppp.', 'ccccc', '.ccc.', '.ccc.', 'ccccc'],
    colors: { p: '#f29cc3', c: '#d6caef', '#': '#211934' },
  },
  skater: {
    rows: ['.ggg.', 'g#g#g', '.ggg.', '.ccc.', 'c.c.c', '.c.c.', 'kkkkk'],
    colors: { g: '#9fe061', c: '#f6ecd6', '#': '#211934', k: '#7a5c3e' },
  },
  'bottle-rocket': {
    rows: ['..r..', '.rrr.', '.rgr.', '.rgr.', '.rrr.', '..f..', '.f.f.'],
    colors: { r: '#9fe061', g: '#f6ecd6', f: '#ffc94d' },
  },
  bouncer: {
    rows: ['.ggg.', 'g#g#g', 'ggggg', 'kkkkk', 'kkkkk', 'kk.kk', 'kk.kk'],
    colors: { g: '#9fe061', '#': '#211934', k: '#6b6b84' },
  },
  pyro: {
    rows: ['..f..', '.fyf.', '..f..', '.ccc.', 'cc#cc', '.c.c.', '.c.c.'],
    colors: { f: '#f0773e', y: '#ffc94d', c: '#f6ecd6', '#': '#211934' },
  },
  spotlight: {
    rows: ['y...y', '.y.y.', '..y..', '.###.', '#####', '..#..', '.###.'],
    colors: { y: '#ffc94d', '#': '#a69cc0' },
  },
  arpeggiator: {
    rows: ['..ll...', '.lol...', '.lll.k.', '..ll.k.', '.lll.k.', 'kkkkkkk', 'k#k#k#k'],
    colors: { l: '#4fd1c5', o: '#211934', k: '#f6ecd6', '#': '#211934' },
  },
  'crew-chief': {
    rows: ['.yyy...', 'yoyoy..', '.yyy.ww', 'ggggg.w', '.ggg.ww', '.g.g...', '.g.g...'],
    colors: { y: '#e8d36a', o: '#211934', g: '#7a5c3e', w: '#f6ecd6' },
  },
  roadie: {
    rows: ['.yy.', 'yoyo', '.yy.', 'gggg', '.gg.', 'g..g'],
    colors: { y: '#e8d36a', o: '#211934', g: '#a69cc0' },
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
