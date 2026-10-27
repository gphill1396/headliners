import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/engine';
import { addToLog, logText, outcome, tourLogEntry, TOUR_LOG_MAX, type TourLogEntry } from '../src/meta/tourlog';

function finishedTour(won: boolean) {
  const s = createState({ seed: 'log', mode: 'tour', team: ['thrum', 'lyra', 'riot'], heat: 5 });
  const tour = s.tour!;
  tour.act = 3;
  tour.cleared = 11;
  const elite = tour.nodes.find((n) => n.kind === 'elite') ?? tour.nodes[0]!;
  tour.at = elite.id;
  s.phase = won ? 'won' : 'over';
  s.crowd = won ? 21 : 0;
  s.stats.tight = 30;
  s.stats.good = 15;
  s.stats.off = 5;
  return { s, elite };
}

test('a finished Tour becomes a log entry: band, Heat, outcome, timing', () => {
  const { s, elite } = finishedTour(false);
  const e = tourLogEntry(s, '2026-10-27')!;
  assert.deepEqual(e.team, s.headliner.team ?? [s.headliner.id]);
  assert.equal(e.won, false);
  assert.equal(e.act, 3);
  assert.equal(e.lostAt, elite.kind);
  assert.equal(e.cleared, 11);
  assert.deepEqual([e.tight, e.good, e.off], [60, 30, 10]);
  assert.match(outcome(e), /^Lost: act 3/);
});

test('only finished Tours are logged', () => {
  const { s } = finishedTour(true);
  assert.equal(tourLogEntry(s, '2026-10-27')!.won, true);
  s.phase = 'map';
  assert.equal(tourLogEntry(s, '2026-10-27'), null);
  const encore = createState({ seed: 'e' });
  encore.phase = 'over';
  assert.equal(tourLogEntry(encore, '2026-10-27'), null);
});

test('the log keeps the newest Tours and reads as one line each', () => {
  const { s } = finishedTour(true);
  const e = tourLogEntry(s, '2026-10-27') as TourLogEntry;
  let log: TourLogEntry[] = [];
  for (let i = 0; i < TOUR_LOG_MAX + 5; i++) log = addToLog(log, { ...e, cleared: i });
  assert.equal(log.length, TOUR_LOG_MAX);
  assert.equal(log[0]!.cleared, TOUR_LOG_MAX + 4);
  const text = logText(log.slice(0, 2));
  assert.equal(text.split('\n').length, 3);
  assert.match(text, /2 Tours, 2 won/);
  assert.match(text, /Heat \d+ \| Won/);
});
