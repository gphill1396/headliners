/**
 * Number formatting (SPEC §4.9): plain below 1,000, then K, M, B, T, then
 * aa, ab, … az, ba, … for the truly huge. Scientific notation as an option.
 */
const NAMED = ['', 'K', 'M', 'B', 'T'];

function suffixFor(group: number): string {
  if (group < NAMED.length) return NAMED[group]!;
  // group 5 → aa, 6 → ab, … 30 → az, 31 → ba …
  const n = group - NAMED.length;
  const first = String.fromCharCode(97 + Math.floor(n / 26) % 26);
  const second = String.fromCharCode(97 + (n % 26));
  return first + second;
}

export function formatNumber(value: number, scientific = false): string {
  if (!Number.isFinite(value)) return value > 0 ? '∞' : '0';
  const sign = value < 0 ? '-' : '';
  const n = Math.abs(value);
  if (n < 1000) {
    if (n < 10 && n % 1 !== 0) return sign + (Math.floor(n * 10) / 10).toString();
    return sign + Math.floor(n).toString();
  }
  if (scientific) return sign + n.toExponential(2).replace('e+', 'e');
  let group = 0;
  let scaled = n;
  while (scaled >= 1000) {
    scaled /= 1000;
    group++;
  }
  // 3 significant digits, truncated (never rounds up to "1000K").
  const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
  const factor = digits === 0 ? 1 : digits === 1 ? 10 : 100;
  const text = (Math.floor(scaled * factor) / factor).toFixed(digits).replace(/\.?0+$/, '');
  return sign + text + suffixFor(group);
}
