import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BotConfig } from './bots';
import { evaluate, formatReport } from './report';
import { runOne, runTour, TEAMS, type RunResult } from './run';
import { median } from './report';

/**
 * npm run sim -- [--runs 100] [--mode encore|tour] [--heat 0-10] [--bots random,thrum] [--ci]
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
if (mode !== 'encore' && mode !== 'tour') {
  console.error(`--mode must be encore or tour (got ${mode}).`);
  process.exit(1);
}

const BOTS: BotConfig[] = [
  { name: 'random', kind: 'random', headliner: 'rotate', timingSkill: 0 },
  { name: 'greedy', kind: 'greedy', headliner: 'rotate', timingSkill: 0.6 },
  { name: 'thrum', kind: 'archetype', headliner: 'thrum', timingSkill: 0.7 },
  { name: 'lyra', kind: 'archetype', headliner: 'lyra', timingSkill: 0.7 },
  { name: 'clatter', kind: 'archetype', headliner: 'clatter', timingSkill: 0.7 },
  { name: 'aria', kind: 'archetype', headliner: 'aria', timingSkill: 0.7 },
  { name: 'riot', kind: 'archetype', headliner: 'riot', timingSkill: 0.7 },
  { name: 'thrum-sharp', kind: 'archetype', headliner: 'thrum', timingSkill: 0.9 },
  { name: 'thrum-sloppy', kind: 'archetype', headliner: 'thrum', timingSkill: 0.2 },
];

const only = arg('bots', '');
if (only) {
  const keep = new Set(only.split(','));
  BOTS.splice(0, BOTS.length, ...BOTS.filter((b) => keep.has(b.name)));
}

const heat = Number(arg('heat', '0')) || 0;

if (mode === 'tour') {
  // Tour: no D1–D8 (those are defined on Encore); report win rates and how far runs get.
  const tourBots = BOTS.filter((b) => ['random', 'thrum', 'lyra', 'clatter', 'aria', 'riot'].includes(b.name));
  console.log(`Headliners Tour report — ${runs} runs per bot, Heat ${heat}\n`);
  console.log('Bot        runs  won    act reached (1/2/3)   stops cleared  minutes  deck');
  for (const bot of tourBots) {
    const rs = Array.from({ length: runs }, (_, i) => runTour(bot, `tour-${i}`, undefined, undefined, heat));
    const won = rs.filter((r) => r.won).length / rs.length;
    const acts = [1, 2, 3].map((a) => rs.filter((r) => r.act === a).length);
    console.log(
      `${bot.name.padEnd(10)} ${String(runs).padStart(4)}  ${(won * 100).toFixed(0).padStart(3)}%   ${acts.join(' / ').padEnd(20)}  ${median(rs.map((r) => r.cleared)).toString().padStart(13)}  ${median(rs.map((r) => r.minutes)).toFixed(1).padStart(7)}  ${median(rs.map((r) => r.deckSize)).toString().padStart(4)}`,
    );
    const lost: Record<string, number> = {};
    for (const r of rs) if (r.lostAt) lost[r.lostAt] = (lost[r.lostAt] ?? 0) + 1;
    console.log(`           lost at: ${Object.entries(lost).sort((a, b) => b[1] - a[1]).map(([k, v]) => `act ${k} ${v}`).join(', ')}`);
  }
  // Team Tour (S2.4): every team of 3, played by the skilled bot and by random play.
  const teamBots: BotConfig[] = [
    { name: 'team', kind: 'archetype', headliner: 'rotate', timingSkill: 0.7 },
    { name: 'team-random', kind: 'random', headliner: 'rotate', timingSkill: 0 },
  ];
  const perTeam = Math.max(4, Math.round(runs / 4));
  console.log(`\nTeams of 3 — ${perTeam} runs per team (${TEAMS.length} teams)\n`);
  for (const bot of teamBots) {
    const rs = TEAMS.flatMap((team) => Array.from({ length: perTeam }, (_, i) => runTour(bot, `team-${team.join('+')}-${i}`, undefined, team, heat)));
    const won = rs.filter((r) => r.won).length / rs.length;
    const acts = [1, 2, 3].map((a) => rs.filter((r) => r.act === a).length);
    console.log(`${bot.name.padEnd(12)} ${String(rs.length).padStart(4)}  ${(won * 100).toFixed(0).padStart(3)}%   acts ${acts.join(' / ')}  minutes ${median(rs.map((r) => r.minutes)).toFixed(1)}`);
    if (bot.kind !== 'random') {
      const rows = TEAMS.map((team) => {
        const mine = rs.filter((r) => r.team === team.join('+'));
        return [team.join('+'), mine.filter((r) => r.won).length / mine.length] as const;
      }).sort((a, b) => b[1] - a[1]);
      for (const [t, w] of rows) console.log(`             ${t.padEnd(22)} ${(w * 100).toFixed(0).padStart(3)}%`);
    }
  }
  process.exit(0);
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
