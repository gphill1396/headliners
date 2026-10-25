import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BotConfig } from './bots';
import { evaluate, formatReport } from './report';
import { runOne, type RunResult } from './run';

/**
 * npm run sim -- [--runs 100] [--mode encore] [--bots random,thrum] [--ci]
 *
 * Plays the real engine with bot players and checks the depth thresholds
 * (SPEC §9). In --ci mode, failures print as GitHub warnings and never fail
 * the build: a failing threshold is a balance bug to look at, not a broken build.
 */
const args = process.argv.slice(2);
const arg = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1]! : fallback;
};
const runs = Number(arg('runs', '100'));
const mode = arg('mode', 'encore');
const ci = args.includes('--ci');
if (mode !== 'encore') {
  console.error(`Only --mode encore exists in Phase 1 (got ${mode}).`);
  process.exit(1);
}

const BOTS: BotConfig[] = [
  { name: 'random', kind: 'random', headliner: 'rotate', timingSkill: 0 },
  { name: 'greedy', kind: 'greedy', headliner: 'rotate', timingSkill: 0.6 },
  { name: 'thrum', kind: 'archetype', headliner: 'thrum', timingSkill: 0.7 },
  { name: 'lyra', kind: 'archetype', headliner: 'lyra', timingSkill: 0.7 },
  { name: 'clatter', kind: 'archetype', headliner: 'clatter', timingSkill: 0.7 },
  { name: 'thrum-sharp', kind: 'archetype', headliner: 'thrum', timingSkill: 0.9 },
  { name: 'thrum-sloppy', kind: 'archetype', headliner: 'thrum', timingSkill: 0.2 },
];

const only = arg('bots', '');
if (only) {
  const keep = new Set(only.split(','));
  BOTS.splice(0, BOTS.length, ...BOTS.filter((b) => keep.has(b.name)));
}

const started = Date.now();
const byBot: Record<string, RunResult[]> = {};
for (const bot of BOTS) {
  byBot[bot.name] = [];
  for (let i = 0; i < runs; i++) byBot[bot.name]!.push(runOne(bot, `sim-${i}`));
  process.stderr.write(`  ${bot.name}: ${runs} runs done (${((Date.now() - started) / 1000).toFixed(0)} s)\n`);
}

const report = evaluate(byBot, runs);
const outDir = join(import.meta.dirname, 'out');
mkdirSync(outDir, { recursive: true });
const file = join(outDir, `report-${report.generatedAt.replace(/[:.]/g, '-')}.json`);
writeFileSync(file, JSON.stringify({ report, runs: byBot }, null, 1));
writeFileSync(join(outDir, 'latest.json'), JSON.stringify(report, null, 2));

console.log(formatReport(report));
console.log(`\nFull results: ${file}`);
if (ci) {
  for (const c of report.checks) {
    if (c.pass === false) console.log(`::warning title=Depth ${c.id} failing::${c.name}: ${c.value} (target ${c.target})`);
  }
}
