/**
 * Daily Setlist (SPEC S3.1): one shared run per day, Wordle-style.
 *
 * Pure helpers (no DOM, no clock of their own): the UI passes the date in.
 * The seed and the band come from the UTC date, so everyone gets the same
 * waves, starting deck and headliners. The UI keeps one scored attempt a day.
 */
import { HEADLINERS, type EngineState, type HeadlinerId } from '../engine';

/** The five headliners in a fixed order; teams are every 3 of them (10 teams). */
const ORDER: HeadlinerId[] = ['thrum', 'lyra', 'clatter', 'aria', 'riot'];

export const DAILY_TEAMS: HeadlinerId[][] = (() => {
  const out: HeadlinerId[][] = [];
  for (let a = 0; a < ORDER.length; a++) for (let b = a + 1; b < ORDER.length; b++) for (let c = b + 1; c < ORDER.length; c++) out.push([ORDER[a]!, ORDER[b]!, ORDER[c]!]);
  return out;
})();

/** Today's date in UTC as YYYY-MM-DD (the Daily Setlist's day turns over at midnight UTC). */
export function dailyDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** Days since 2026-01-01 (UTC) for a YYYY-MM-DD date. */
export function dayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(2026, 0, 1)) / 86_400_000);
}

export function dailySeed(date: string): string {
  return `daily-${date}`;
}

/**
 * The day's band. Steps through all 10 teams, then shuffles the lead each cycle,
 * so the same three don't always lead the same way.
 */
export function dailyTeam(date: string): HeadlinerId[] {
  const n = ((dayNumber(date) % 10) + 10) % 10;
  const cycle = Math.floor(dayNumber(date) / 10);
  const team = [...DAILY_TEAMS[n]!];
  const lead = ((cycle % 3) + 3) % 3;
  return [team[lead]!, ...team.filter((_, i) => i !== lead)];
}

/** A finished day, as kept on this device. */
export interface DailyResult {
  date: string;
  team: HeadlinerId[];
  wave: number;
  score: number;
  chain: number;
  tight: number;
  good: number;
  off: number;
  relaxed: boolean;
}

/** One day's entry: started (the attempt is used) and, once over, the result. */
export interface DailyEntry {
  started: boolean;
  result?: DailyResult;
}

export type DailyHistory = Record<string, DailyEntry>;

export function resultFrom(state: EngineState, date: string): DailyResult {
  return {
    date,
    team: [...(state.headliner.team ?? [state.headliner.id])],
    wave: state.wave.index,
    score: Math.floor(state.score),
    chain: state.stats.bestChain,
    tight: state.stats.tight,
    good: state.stats.good,
    off: state.stats.off,
    relaxed: state.settings.relaxedTiming,
  };
}

/** Ten squares for how the plays landed: green Tight, yellow Good, red Off. */
export function timingRow(tight: number, good: number, off: number): string {
  const total = tight + good + off;
  if (total === 0) return '⬛'.repeat(10);
  let g = Math.round((tight * 10) / total);
  let y = Math.round((good * 10) / total);
  let r = 10 - g - y;
  if (r < 0) {
    y += r;
    r = 0;
  }
  if (y < 0) {
    g += y;
    y = 0;
  }
  return '🟩'.repeat(g) + '🟨'.repeat(y) + '🟥'.repeat(r);
}

/** Days in a row, ending today (or yesterday, if today isn't played yet), with a finished scored run. */
export function streak(history: DailyHistory, today: string): number {
  let n = 0;
  let day = dayNumber(today);
  if (!history[today]?.result) day -= 1;
  for (;;) {
    const date = dateOfDay(day);
    if (!history[date]?.result) return n;
    n += 1;
    day -= 1;
  }
}

function dateOfDay(day: number): string {
  return new Date(Date.UTC(2026, 0, 1) + day * 86_400_000).toISOString().slice(0, 10);
}

/** The text the share button copies. */
export function shareText(r: DailyResult, streakDays: number): string {
  const names = r.team.map((id) => HEADLINERS[id].name).join(', ');
  return [
    `Headliners Daily ${r.date}`,
    names,
    `Wave ${r.wave} · ${r.chain}-link chain · ${r.score.toLocaleString('en-US')}`,
    timingRow(r.tight, r.good, r.off),
    `Relaxed timing: ${r.relaxed ? 'on' : 'off'}${streakDays > 1 ? ` · ${streakDays}-day streak` : ''}`,
  ].join('\n');
}
