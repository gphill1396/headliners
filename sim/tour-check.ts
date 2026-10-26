/**
 * Tour targets (SPEC §9, Tour balance): npm run sim:tour [-- --runs 80 --per-team 30]
 *
 * T1 No solved Tour headliner: solo win rates at Heat 0, best ÷ worst ≤ 1.5×.
 * T2 Heat climbs: a skilled band of 3 wins 60–85% at Heat 0, 35–60% at Heat 5, 10–30% at Heat 10.
 * T3 Skill matters: random play never wins a Tour at Heat 0.
 * T4 No solved band: at Heat 5, the best band of 3 wins at most 2.5× as often as the worst.
 *
 * The four parts (solo, and teams at Heat 0, 5 and 10) run in parallel child processes.
 */
import { fork } from 'node:child_process';
import type { BotConfig } from './bots';
import { runTour, TEAMS } from './run';
import type { HeadlinerId } from '../src/engine';

const args = process.argv.slice(2);
const arg = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1]! : fallback;
};
const runs = Number(arg('runs', '80'));
// 30 per team: at 10, Heat win rates swung by ±5 points between near-identical builds (SPEC S4.3).
const perTeam = Number(arg('per-team', '30'));
const part = arg('part', '');

const SOLO: HeadlinerId[] = ['thrum', 'lyra', 'clatter', 'aria', 'riot'];
const skilled = (headliner: HeadlinerId | 'rotate'): BotConfig => ({ name: String(headliner), kind: 'archetype', headliner, timingSkill: 0.7 });
const random: BotConfig = { name: 'random', kind: 'random', headliner: 'rotate', timingSkill: 0 };

type PartResult = Record<string, number>;

function runPart(name: string): PartResult {
  if (name === 'solo') {
    const out: PartResult = {};
    for (const h of SOLO) {
      const rs = Array.from({ length: runs }, (_, i) => runTour(skilled(h), `tc-${h}-${i}`));
      out[h] = rs.filter((r) => r.won).length / rs.length;
    }
    const rr = Array.from({ length: runs }, (_, i) => runTour(random, `tc-random-${i}`));
    out.random = rr.filter((r) => r.won).length / rr.length;
    return out;
  }
  const heat = Number(name.replace('team-', ''));
  const out: PartResult = {};
  let won = 0;
  for (const team of TEAMS) {
    const rs = Array.from({ length: perTeam }, (_, i) => runTour(skilled('rotate'), `tc-${team.join('+')}-${i}`, undefined, team, heat));
    const w = rs.filter((r) => r.won).length;
    out[team.join('+')] = w / perTeam;
    won += w;
  }
  out.team = won / (TEAMS.length * perTeam);
  return out;
}

if (part) {
  process.send!(runPart(part));
} else {
  const parts = ['solo', 'team-0', 'team-5', 'team-10'];
  const results = await Promise.all(
    parts.map(
      (p) =>
        new Promise<PartResult>((resolve, reject) => {
          const child = fork(import.meta.filename, [...args, '--part', p]);
          child.on('message', (m) => resolve(m as PartResult));
          child.on('error', reject);
        }),
    ),
  );
  const [solo, t0, t5, t10] = results as [PartResult, PartResult, PartResult, PartResult];
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const rates = SOLO.map((h) => [h, solo[h]!] as const).sort((a, b) => b[1] - a[1]);
  const best = rates[0]!;
  const worst = rates[rates.length - 1]!;
  const spread = best[1] / Math.max(0.01, worst[1]);
  const band = (x: number, lo: number, hi: number) => x >= lo && x <= hi;
  const checks = [
    { id: 'T1', name: 'No solved Tour headliner (solo, Heat 0)', pass: spread <= 1.5, value: `${spread.toFixed(2)}× (${best[0]} ${pct(best[1])} / ${worst[0]} ${pct(worst[1])})`, target: '≤ 1.5×' },
    {
      id: 'T2',
      name: 'Heat climbs (band of 3)',
      pass: band(t0.team!, 0.6, 0.85) && band(t5.team!, 0.35, 0.6) && band(t10.team!, 0.1, 0.3),
      value: `Heat 0 ${pct(t0.team!)}, Heat 5 ${pct(t5.team!)}, Heat 10 ${pct(t10.team!)}`,
      target: '60–85% / 35–60% / 10–30%',
    },
    { id: 'T3', name: 'Random play never wins (Heat 0)', pass: solo.random === 0, value: pct(solo.random!), target: '0%' },
    (() => {
      const bands = TEAMS.map((t) => [t.join('+'), t5[t.join('+')]!] as const).sort((a, b) => b[1] - a[1]);
      const [hi, lo] = [bands[0]!, bands[bands.length - 1]!];
      const ratio = hi[1] / Math.max(0.01, lo[1]);
      return { id: 'T4', name: 'No solved band (Heat 5)', pass: ratio <= 2.5, value: `${ratio.toFixed(2)}× (${hi[0]} ${pct(hi[1])} / ${lo[0]} ${pct(lo[1])})`, target: '≤ 2.5×' };
    })(),
  ];
  console.log(`Headliners Tour targets — ${runs} solo Tours per headliner, ${perTeam} per team of 3 per Heat\n`);
  console.log(`Solo, Heat 0: ${rates.map(([h, w]) => `${h} ${pct(w)}`).join(', ')}`);
  console.log('Bands (Heat 0 / 5 / 10):');
  for (const team of TEAMS) {
    const k = team.join('+');
    console.log(`  ${k.padEnd(22)} ${[t0, t5, t10].map((t) => pct(t[k]!).padStart(4)).join(' ')}`);
  }
  for (const c of checks) console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.id}  ${c.name}: ${c.value} (target ${c.target})`);
}
