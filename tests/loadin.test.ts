import { test } from 'node:test';
import assert from 'node:assert/strict';
import { format, generate, isSolved, parse, slide, slideRange, solve } from '../src/meta/loadin';

const EASY = `
......
......
AA..B.
....B.
......
......`;

test('a level reads and writes back the same', () => {
  const p = parse(EASY);
  assert.equal(format(p), EASY.trim());
  assert.equal(p.pieces.length, 2);
  assert.deepEqual(p.pieces.map((x) => [x.id, x.dir, x.len, x.lane]), [['A', 'h', 2, 2], ['B', 'v', 2, 4]]);
});

test('pieces slide only along their length, and only into free cells', () => {
  const p = parse(EASY);
  const a = 0;
  assert.deepEqual(slideRange(p, p.start, a), [0, 2]); // up to the chest
  assert.equal(slide(p, p.start, a, 3), null); // through the chest: no
  const b = 1;
  assert.deepEqual(slideRange(p, p.start, b), [-2, 2]);
  const moved = slide(p, p.start, b, 2)!;
  assert.equal(slide(p, moved, a, 4)!.join(','), '4,4');
});

test('the solver finds the fewest moves (one slide, however far, is one move)', () => {
  const p = parse(EASY);
  const s = solve(p)!;
  assert.equal(s.moves, 2);
  assert.ok(isSolved(p, s.path[s.path.length - 1]!));
});

test('a blocked yard has no solution', () => {
  const stuck = parse(`
....B.
....B.
AA..B.
....C.
....C.
....C.`);
  assert.equal(solve(stuck), null);
});

test('barrels never move', () => {
  const p = parse(`
......
......
AA....
..x...
......
......`);
  const barrel = p.pieces.findIndex((x) => x.dir === 'fixed');
  assert.deepEqual(slideRange(p, p.start, barrel), [0, 0]);
  assert.equal(solve(p)!.moves, 1);
});

test('the generator is deterministic and its par is the solver\'s answer', () => {
  const a = generate('test-seed', 4, 10)!;
  const b = generate('test-seed', 4, 10)!;
  assert.deepEqual(a, b);
  assert.ok(a.par >= 4 && a.par <= 10);
  assert.equal(solve(parse(a.text))!.moves, a.par);
});
