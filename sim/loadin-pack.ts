/**
 * Make Load-In level candidates (SPEC S4.1): npm run loadin -- <min> <max> <count> <seed-prefix>
 * Prints one JSON line per level: { seed, par, text }. The pack in src/content/loadin-levels.ts
 * was picked from these by hand, and tests/loadin-pack.test.ts re-solves every level.
 */
import { generate } from '../src/meta/loadin';

const [min, max, count, prefix] = process.argv.slice(2);
let made = 0;
for (let i = 0; made < Number(count); i++) {
  const seed = `${prefix}-${i}`;
  const g = generate(seed, Number(min), Number(max), 40);
  if (!g) continue;
  made += 1;
  console.log(JSON.stringify({ seed, par: g.par, text: g.text }));
}
