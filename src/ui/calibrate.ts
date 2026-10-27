import { clampLatency } from './storage';

/** Timing calibration (S4.10): the sums, kept apart from the screen so they can be tested. */

/** Taps per try. */
export const CALIBRATE_TAPS = 8;
/** A tap further than this from the others' median is a slip, not latency, and is dropped. */
const OUTLIER_MS = 80;
/** At least this many taps must agree, or the try doesn't count. */
const MIN_KEPT = 5;

/**
 * Work out a calibration from tap offsets (ms from the nearest beat, positive = late) measured while
 * the music already played `currentMs` early. Returns null when the taps are too scattered to trust.
 */
export function calibrationFrom(offsets: number[], currentMs: number): number | null {
  if (offsets.length === 0) return null;
  const sorted = [...offsets].sort((a, b) => a - b);
  const mid = sorted.length / 2;
  const median = sorted.length % 2 ? sorted[Math.floor(mid)]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  const kept = offsets.filter((o) => Math.abs(o - median) <= OUTLIER_MS);
  if (kept.length < MIN_KEPT) return null;
  const mean = kept.reduce((a, b) => a + b, 0) / kept.length;
  // The beat was heard `currentMs` before the clock's beat, so the player's true lag is the offset plus that.
  return clampLatency(mean + currentMs);
}

/** "42 ms late", "15 ms early", "right on". */
export function describeLatency(ms: number): string {
  if (Math.abs(ms) < 5) return 'right on the beat';
  return `${Math.abs(ms)} ms ${ms > 0 ? 'late' : 'early'}`;
}
