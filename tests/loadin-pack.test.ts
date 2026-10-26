import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOADIN_LEVELS } from '../src/content/loadin-levels';
import { dailyLoadIn, parse, solve } from '../src/meta/loadin';

test('the pack: 30 levels, every one solvable, par is the fewest moves, easy to hard', () => {
  assert.equal(LOADIN_LEVELS.length, 30);
  let last = 0;
  for (const [i, level] of LOADIN_LEVELS.entries()) {
    const s = solve(parse(level.text));
    assert.ok(s, `level ${i + 1} can't be solved`);
    assert.equal(s.moves, level.par, `level ${i + 1}`);
    assert.ok(level.par >= last, `level ${i + 1} is easier than the one before`);
    last = level.par;
  }
  assert.equal(new Set(LOADIN_LEVELS.map((l) => l.text)).size, 30);
});

test('the daily Load-In is the same for everyone on a date, solvable at its par', () => {
  const a = dailyLoadIn('2026-10-26');
  assert.deepEqual(a, dailyLoadIn('2026-10-26'));
  assert.equal(solve(parse(a.text))!.moves, a.par);
  assert.notEqual(dailyLoadIn('2026-10-27').text, a.text);
});
