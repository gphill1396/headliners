import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, type EngineState } from '../src/engine';
import { DAILY_TEAMS, dailyDate, dailySeed, dailyTeam, dayNumber, resultFrom, shareText, streak, timingRow, type DailyHistory } from '../src/meta/daily';

function daily(date = '2026-10-26'): EngineState {
  const s = createState({ seed: dailySeed(date), team: dailyTeam(date), daily: { date, scored: true } });
  s.crowd = 10_000;
  s.maxCrowd = 10_000;
  return s;
}

/** Play to the start of wave `n`, recording each wave's spawn list. `busy` plays cards and swaps whenever it can. */
function waves(s: EngineState, n: number, busy: boolean): string[] {
  const seen: string[] = [];
  for (let t = 0; t < 60 * 60 * 10 && s.wave.index < n; t++) {
    const inputs = [];
    if (s.phase === 'picking') inputs.push({ type: 'pick' as const, index: busy ? 0 : null });
    else if (s.phase === 'evolving') inputs.push({ type: 'evolve' as const, index: (busy ? 1 : 0) as 0 | 1 });
    else if (busy && t % 17 === 0 && s.hand.length > 0) inputs.push({ type: 'commit' as const, iid: s.hand[0]!.iid, lane: t % 3, permille: 500 });
    else if (busy && t % 41 === 0 && s.hand.length > 0) inputs.push({ type: 'cycle' as const, iid: s.hand[s.hand.length - 1]!.iid });
    const before = s.wave.index;
    step(s, inputs);
    if (s.wave.index !== before) seen.push(`${s.wave.index}:${s.wave.spawns.map((x) => x.kind).join(',')}`);
  }
  return seen;
}

test('Daily Setlist: everyone meets the same waves, however they play', () => {
  const a = waves(daily(), 8, true);
  const b = waves(daily(), 8, false);
  assert.equal(a.length, 8); // waves 1–8
  assert.deepEqual(a, b);
});

test('a different day brings different waves', () => {
  assert.notDeepEqual(waves(daily('2026-10-26'), 6, false), waves(daily('2026-10-27'), 6, false));
});

test('the same band and starting deck for everyone on a day, and every team comes round in 10 days', () => {
  const s = daily();
  assert.deepEqual(s.headliner.team, dailyTeam('2026-10-26'));
  const seen = new Set<string>();
  for (let d = 0; d < 10; d++) seen.add([...dailyTeam(`2026-11-${String(d + 1).padStart(2, '0')}`)].sort().join('+'));
  assert.equal(seen.size, DAILY_TEAMS.length);
});

test('the day turns over at midnight UTC', () => {
  assert.equal(dailyDate(new Date('2026-10-26T23:59:59Z')), '2026-10-26');
  assert.equal(dailyDate(new Date('2026-10-27T00:00:00Z')), '2026-10-27');
  assert.equal(dayNumber('2026-01-02') - dayNumber('2026-01-01'), 1);
});

test('the share text: wave, chain, a 10-square timing row and relaxed timing', () => {
  const s = daily();
  s.wave.index = 17;
  s.score = 31_204.6;
  s.stats.bestChain = 24;
  s.stats.tight = 70;
  s.stats.good = 20;
  s.stats.off = 10;
  const text = shareText(resultFrom(s, '2026-10-26'), 3);
  assert.match(text, /Headliners Daily 2026-10-26/);
  assert.match(text, /Wave 17 · 24-link chain · 31,204/);
  assert.match(text, /🟩{7}🟨{2}🟥/u);
  assert.match(text, /Relaxed timing: off · 3-day streak/);
  assert.equal([...timingRow(1, 1, 1)].length, 10);
  assert.equal(timingRow(0, 0, 0), '⬛'.repeat(10));
});

test('streak: consecutive finished days, ending today or yesterday', () => {
  const r = (date: string) => ({ started: true, result: { date, team: [], wave: 1, score: 0, chain: 0, tight: 0, good: 0, off: 0, relaxed: false } });
  const h: DailyHistory = { '2026-10-24': r('2026-10-24'), '2026-10-25': r('2026-10-25') };
  assert.equal(streak(h, '2026-10-26'), 2); // today not played yet: still counts to yesterday
  h['2026-10-26'] = r('2026-10-26');
  assert.equal(streak(h, '2026-10-26'), 3);
  assert.equal(streak(h, '2026-10-28'), 0);
});

test('a daily team evolves once after wave 5, choosing who', () => {
  const s = daily();
  for (let t = 0; t < 60 * 60 * 10 && s.phase !== 'evolving'; t++) step(s, s.phase === 'picking' ? [{ type: 'pick', index: null }] : []);
  assert.equal(s.phase, 'evolving');
  const who = s.headliner.team![2]!;
  step(s, [{ type: 'evolve', index: 0, headliner: who }]);
  assert.equal(s.phase, 'playing');
  assert.equal(s.headliner.evolutions?.[who], 0);
});
