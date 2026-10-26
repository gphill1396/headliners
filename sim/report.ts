import { CARDS } from '../src/engine';
import { ENEMIES } from '../src/content/enemies';
import type { RunResult } from './run';

/** SPEC §9 depth thresholds. */
export const THRESHOLDS = {
  D1_skillVsRandom: 3,
  D2_timing: 1.5,
  D3_headlinerSpread: 1.4,
  D4_mustPick: 0.4,
  D5_damageShare: 0.35,
  D6_enemyLossShare: 0.05,
  D7_choices: 2,
  D8_capRate: 0.01,
} as const;

export interface Check {
  id: string;
  name: string;
  pass: boolean | null;
  value: string;
  target: string;
  note?: string;
}

export const median = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m]! : (a[m - 1]! + a[m]!) / 2;
};

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

/** Top 25% of runs by wave reached (ties broken by score). */
function topQuarter(runs: RunResult[]): RunResult[] {
  const sorted = [...runs].sort((a, b) => b.wave - a.wave || b.score - a.score);
  return sorted.slice(0, Math.max(1, Math.ceil(sorted.length / 4)));
}

export interface BotSummary {
  bot: string;
  runs: number;
  medianWave: number;
  medianScore: number;
  medianMinutes: number;
  medianBestChain: number;
  tightRate: number;
  capped: number;
}

export function summarize(runs: RunResult[]): BotSummary {
  const t = runs.reduce((a, r) => ({ tight: a.tight + r.timing.tight, all: a.all + r.timing.tight + r.timing.good + r.timing.off }), { tight: 0, all: 0 });
  return {
    bot: runs[0]?.bot ?? '?',
    runs: runs.length,
    medianWave: median(runs.map((r) => r.wave)),
    medianScore: median(runs.map((r) => r.score)),
    medianMinutes: median(runs.map((r) => r.ticks / 3600)),
    medianBestChain: median(runs.map((r) => r.bestChain)),
    tightRate: t.all ? t.tight / t.all : 0,
    capped: runs.filter((r) => r.capped).length,
  };
}

export interface Report {
  generatedAt: string;
  runsPerBot: number;
  bots: BotSummary[];
  checks: Check[];
  pickRates: Record<string, number>;
  /** Median wave per evolution (archetype bots that evolved). */
  evolutions: Record<string, { runs: number; medianWave: number }>;
  damageShare: Record<string, number>;
  lossCauses: Record<string, number>;
}

/**
 * Evaluate D1–D8. `byBot` holds runs for: random, greedy, one archetype bot
 * per headliner (thrum, lyra, clatter), thrum-sharp (timing 0.9) and
 * thrum-sloppy (timing 0.2).
 */
export function evaluate(byBot: Record<string, RunResult[]>, runsPerBot: number): Report {
  const T = THRESHOLDS;
  const random = byBot['random'] ?? [];
  const thrum = byBot['thrum'] ?? [];
  const archetypes = (['thrum', 'lyra', 'clatter'] as const).filter((h) => (byBot[h] ?? []).length > 0);
  const sharp = byBot['thrum-sharp'] ?? [];
  const sloppy = byBot['thrum-sloppy'] ?? [];
  const skilled = [...(byBot['greedy'] ?? []), ...archetypes.flatMap((h) => byBot[h]!), ...sharp, ...sloppy];
  const checks: Check[] = [];

  // D1 — skill matters. Checked for every headliner; the weakest one has to clear the bar.
  const randomWave = Math.max(1, median(random.map((r) => r.wave)));
  const d1s = archetypes.map((h) => ({ h, x: median(byBot[h]!.map((r) => r.wave)) / randomWave })).sort((a, b) => a.x - b.x);
  const d1 = d1s[0]?.x ?? 0;
  checks.push({ id: 'D1', name: 'Skill matters (each archetype vs random, median wave)', pass: d1 >= T.D1_skillVsRandom, value: `${d1.toFixed(2)}× (${d1s[0]?.h ?? '-'})`, target: `≥ ${T.D1_skillVsRandom}×`, note: d1s.map((d) => `${d.h} ${d.x.toFixed(2)}×`).join(', ') });

  // D2 — timing matters.
  const d2 = median(sharp.map((r) => r.score)) / Math.max(1, median(sloppy.map((r) => r.score)));
  checks.push({ id: 'D2', name: 'Timing matters (timing 0.9 vs 0.2, median score)', pass: d2 >= T.D2_timing, value: `${d2.toFixed(2)}×`, target: `≥ ${T.D2_timing}×` });

  // D3 — no solved headliner: best and worst headliner's median wave within 1.4×.
  if (archetypes.length < 2) {
    checks.push({ id: 'D3', name: 'No solved headliner', pass: null, value: 'n/a', target: `≤ ${T.D3_headlinerSpread}×`, note: 'Needs at least two headliner bots.' });
  } else {
    const waves = archetypes.map((h) => ({ h, w: median(byBot[h]!.map((r) => r.wave)) })).sort((a, b) => b.w - a.w);
    const best = waves[0]!;
    const worst = waves[waves.length - 1]!;
    const d3 = best.w / Math.max(1, worst.w);
    checks.push({ id: 'D3', name: 'No solved headliner (best vs worst median wave)', pass: d3 <= T.D3_headlinerSpread, value: `${d3.toFixed(2)}× (${best.h} ${best.w} / ${worst.h} ${worst.w})`, target: `≤ ${T.D3_headlinerSpread}×` });
  }

  // D4 — no must-pick card, across all archetypes: the top 25% of the headliner archetype bots'
  // runs, one bot per headliner so no headliner's signature cards are over-counted.
  // Starter decks are fixed, so this measures cards taken in card picks.
  const top = topQuarter(skilled);
  const topArch = topQuarter(archetypes.flatMap((h) => byBot[h]!));
  const rates = (runs: RunResult[]) => {
    const out: Record<string, number> = {};
    for (const c of CARDS) out[c.id] = runs.filter((r) => r.picks.includes(c.id)).length / Math.max(1, runs.length);
    return out;
  };
  const pickRates = rates(topArch);
  const [topPick, topPickRate] = Object.entries(pickRates).sort((a, b) => b[1] - a[1])[0] ?? ['-', 0];
  const [allPick, allPickRate] = Object.entries(rates(top)).sort((a, b) => b[1] - a[1])[0] ?? ['-', 0];
  checks.push({ id: 'D4', name: 'No must-pick card (top-25% archetype runs)', pass: topPickRate <= T.D4_mustPick, value: `${topPick} in ${pct(topPickRate)}`, target: `≤ ${pct(T.D4_mustPick)}`, note: `Counting every skilled bot (Thrum-heavy): ${allPick} in ${pct(allPickRate)}.` });

  // D5 — no single damage source (top runs stand in for "winning", since Encore is endless).
  const damageShare: Record<string, number> = {};
  for (const r of top) {
    const total = Object.values(r.damageBySource).reduce((a, b) => a + b, 0) || 1;
    for (const [id, d] of Object.entries(r.damageBySource)) damageShare[id] = (damageShare[id] ?? 0) + d / total / top.length;
  }
  const [topDmg, topDmgShare] = Object.entries(damageShare).sort((a, b) => b[1] - a[1])[0] ?? ['-', 0];
  checks.push({ id: 'D5', name: 'No single damage source (top-25% runs)', pass: topDmgShare <= T.D5_damageShare, value: `${topDmg} ${pct(topDmgShare)}`, target: `≤ ${pct(T.D5_damageShare)}` });

  // D6 — every enemy matters.
  const losses = skilled.filter((r) => !r.capped && r.lossCause);
  const lossCauses: Record<string, number> = Object.fromEntries(Object.keys(ENEMIES).map((k) => [k, 0]));
  for (const r of losses) lossCauses[r.lossCause!] = (lossCauses[r.lossCause!] ?? 0) + 1 / losses.length;
  // Bosses are counted in the losses but aren't one of the 8 enemy types D6 is about.
  const [minKind, minShare] = Object.entries(lossCauses).filter(([k]) => !ENEMIES[k as keyof typeof ENEMIES].boss).sort((a, b) => a[1] - b[1])[0] ?? ['-', 0];
  checks.push({ id: 'D6', name: 'Every enemy matters (top cause of losses)', pass: minShare >= T.D6_enemyLossShare, value: `${minKind} ${pct(minShare)}`, target: `each ≥ ${pct(T.D6_enemyLossShare)}` });

  // D7 — real choices.
  const d7 = median(skilled.flatMap((r) => r.choices));
  checks.push({ id: 'D7', name: 'Real choices (distinct affordable cards per decision)', pass: d7 >= T.D7_choices, value: d7.toFixed(1), target: `≥ ${T.D7_choices}`, note: 'Counts cards only; lane choice multiplies this.' });

  // D8 — infinite loops are rare.
  const all = Object.values(byBot).flat();
  const d8 = all.filter((r) => r.showstopper).length / Math.max(1, all.length);
  checks.push({ id: 'D8', name: 'Showstopper cap is rare', pass: d8 < T.D8_capRate, value: pct(d8), target: `< ${pct(T.D8_capRate)}` });

  // Evolutions: neither branch of a headliner should be the obvious pick.
  const evolutions: Record<string, { runs: number; medianWave: number }> = {};
  for (const r of archetypes.flatMap((h) => byBot[h]!)) {
    if (!r.evolution) continue;
    const e = (evolutions[r.evolution] ??= { runs: 0, medianWave: 0 });
    e.runs += 1;
  }
  for (const id of Object.keys(evolutions)) {
    evolutions[id]!.medianWave = median(archetypes.flatMap((h) => byBot[h]!).filter((r) => r.evolution === id).map((r) => r.wave));
  }

  return {
    evolutions,
    generatedAt: new Date().toISOString(),
    runsPerBot,
    bots: Object.values(byBot).map(summarize),
    checks,
    pickRates,
    damageShare,
    lossCauses,
  };
}

export function formatReport(r: Report): string {
  const lines: string[] = [];
  lines.push(`Headliners depth report — ${r.runsPerBot} runs per bot`);
  lines.push('');
  lines.push('Bot             runs  wave  score     minutes  best chain  tight%  capped');
  for (const b of r.bots) {
    lines.push(
      `${b.bot.padEnd(15)} ${String(b.runs).padStart(4)}  ${String(b.medianWave).padStart(4)}  ${String(Math.round(b.medianScore)).padStart(8)}  ${b.medianMinutes.toFixed(1).padStart(7)}  ${String(b.medianBestChain).padStart(10)}  ${(b.tightRate * 100).toFixed(0).padStart(5)}%  ${String(b.capped).padStart(6)}`,
    );
  }
  lines.push('');
  for (const c of r.checks) {
    const mark = c.pass === null ? 'N/A ' : c.pass ? 'PASS' : 'FAIL';
    lines.push(`${mark}  ${c.id}  ${c.name}: ${c.value} (target ${c.target})${c.note ? ` — ${c.note}` : ''}`);
  }
  lines.push('');
  lines.push('Damage share in top runs: ' + Object.entries(r.damageShare).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`).join(', '));
  lines.push('Evolutions (median wave): ' + Object.entries(r.evolutions).map(([k, v]) => `${k} ${v.medianWave} (${v.runs})`).join(', '));
  lines.push('Loss causes: ' + Object.entries(r.lossCauses).map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`).join(', '));
  return lines.join('\n');
}
