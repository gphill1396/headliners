/**
 * The Tour log (S4.13): every finished Tour, for playtesting Tour balance against real play.
 * Pure helpers; the UI keeps the list in storage and passes the date in.
 */
import { HEADLINERS, type EngineState, type HeadlinerId, type TourNodeKind } from '../engine';

export interface TourLogEntry {
  /** YYYY-MM-DD, local. */
  date: string;
  /** The band in order; the first led. */
  team: HeadlinerId[];
  heat: number;
  won: boolean;
  /** The act reached (1–3). */
  act: number;
  /** Where a lost Tour ended. */
  lostAt?: TourNodeKind;
  /** Stops cleared. */
  cleared: number;
  /** Crowd left at the end. */
  crowd: number;
  /** Share of graded plays that were Tight / Good / Off, in percent. */
  tight: number;
  good: number;
  off: number;
}

/** Keep the most recent this many Tours. */
export const TOUR_LOG_MAX = 50;

const STOP: Record<TourNodeKind, string> = {
  fight: 'Show',
  elite: 'Tournament',
  draft: 'Draft',
  rest: 'Inn',
  shop: 'Market',
  event: 'Event',
  boss: 'Boss',
};

/** The log entry for a finished Tour, or null for anything else (Encore, the Daily Setlist, a Tour still going). */
export function tourLogEntry(state: EngineState, date: string): TourLogEntry | null {
  const tour = state.tour;
  if (state.mode !== 'tour' || !tour || state.daily) return null;
  if (state.phase !== 'won' && state.phase !== 'over') return null;
  const at = tour.at === null ? null : tour.nodes.find((n) => n.id === tour.at);
  const plays = state.stats.tight + state.stats.good + state.stats.off;
  const pct = (n: number) => (plays ? Math.round((100 * n) / plays) : 0);
  const won = state.phase === 'won';
  return {
    date,
    team: [...(state.headliner.team ?? [state.headliner.id])],
    heat: tour.heat ?? 0,
    won,
    act: tour.act,
    ...(!won && at ? { lostAt: at.kind } : {}),
    cleared: tour.cleared,
    crowd: Math.max(0, state.crowd),
    tight: pct(state.stats.tight),
    good: pct(state.stats.good),
    off: pct(state.stats.off),
  };
}

/** Add an entry, newest first, keeping at most TOUR_LOG_MAX. */
export function addToLog(log: TourLogEntry[], entry: TourLogEntry): TourLogEntry[] {
  return [entry, ...log].slice(0, TOUR_LOG_MAX);
}

/** "Thrum, Lyra, Riot". */
export function bandName(team: HeadlinerId[]): string {
  return team.map((id) => HEADLINERS[id].name).join(', ');
}

/** "Won" or "Lost: act 3, Tournament". */
export function outcome(e: TourLogEntry): string {
  return e.won ? 'Won' : `Lost: act ${e.act}${e.lostAt ? `, ${STOP[e.lostAt]}` : ''}`;
}

/** The whole log as plain text, one Tour a line, to paste into a message. */
export function logText(log: TourLogEntry[]): string {
  const wins = log.filter((e) => e.won).length;
  const lines = log.map(
    (e) => `${e.date} | ${bandName(e.team)} | Heat ${e.heat} | ${outcome(e)} | ${e.cleared} stops | crowd ${e.crowd} | Tight ${e.tight}% Good ${e.good}% Off ${e.off}%`,
  );
  return [`Headliners Tour log: ${log.length} Tours, ${wins} won`, ...lines].join('\n');
}
