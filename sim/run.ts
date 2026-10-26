import { createRng, createState, evolution, step, type EnemyKind, type EngineState, type HeadlinerId } from '../src/engine';
import { createBot, type BotConfig } from './bots';

export interface RunResult {
  bot: string;
  headliner: HeadlinerId;
  /** The evolution taken, if the run got that far. */
  evolution: string | null;
  seed: string;
  wave: number;
  score: number;
  ticks: number;
  /** Hit the time cap instead of losing. */
  capped: boolean;
  bestChain: number;
  showstopper: boolean;
  showstopperWaves: number[];
  timing: { tight: number; good: number; off: number };
  picks: string[];
  damageBySource: Record<string, number>;
  /** Enemy kind that cost the most crowd (the "cause of loss"). */
  lossCause: EnemyKind | null;
  choices: number[];
}

const ROTATION: HeadlinerId[] = ['thrum', 'lyra', 'clatter', 'aria', 'riot'];
const seedIndex = (seed: string): number => {
  const m = /(\d+)$/.exec(seed);
  return m ? Number(m[1]) : 0;
};

/** 30 minutes of play: far beyond a normal run, so only a degenerate strategy hits it. */
export const DEFAULT_MAX_TICKS = 60 * 60 * 30;

export function runOne(config: BotConfig, seed: string, maxTicks = DEFAULT_MAX_TICKS): RunResult {
  const headliner = config.headliner === 'rotate' ? ROTATION[seedIndex(seed) % ROTATION.length]! : config.headliner;
  const s: EngineState = createState({ seed, headliner });
  const bot = createBot(config, createRng(`bot:${config.name}:${seed}`));
  const crowdLost: Partial<Record<EnemyKind, number>> = {};
  const picks: string[] = [];
  /** Waves where the 50-link cap went off (negative: during a boss). */
  const showstopperWaves: number[] = [];
  while (s.phase !== 'over' && s.tick < maxTicks) {
    const events = step(s, bot.act(s));
    for (const e of events) {
      // A Nest's hatchlings are the Nest's doing.
      if (e.type === 'leaked') crowdLost[e.hatchedBy ?? e.kind] = (crowdLost[e.hatchedBy ?? e.kind] ?? 0) + e.crowdDamage;
      else if (e.type === 'picked' && e.cardId) picks.push(e.cardId);
      else if (e.type === 'showstopper') showstopperWaves.push(s.boss ? -s.wave.index : s.wave.index);
    }
  }
  let lossCause: EnemyKind | null = null;
  for (const [kind, n] of Object.entries(crowdLost) as [EnemyKind, number][]) {
    if (lossCause === null || n > (crowdLost[lossCause] ?? 0)) lossCause = kind;
  }
  return {
    bot: config.name,
    headliner,
    evolution: evolution(s),
    seed,
    wave: s.wave.index,
    score: s.score,
    ticks: s.tick,
    capped: s.phase !== 'over',
    bestChain: s.stats.bestChain,
    showstopper: s.stats.showstoppers > 0,
    showstopperWaves,
    timing: { tight: s.stats.tight, good: s.stats.good, off: s.stats.off },
    picks,
    damageBySource: { ...s.stats.damageBySource },
    lossCause,
    choices: bot.choiceSamples,
  };
}

export interface TourResult {
  bot: string;
  headliner: HeadlinerId;
  /** Team Tour: the team, e.g. "thrum+lyra+clatter". */
  team?: string;
  seed: string;
  won: boolean;
  act: number;
  cleared: number;
  minutes: number;
  deckSize: number;
  /** Where a lost run ended: act and stop kind. */
  lostAt: string | null;
}

/** One whole Tour run (SPEC S2.1). */
/** Every team of 3 from the five headliners (10 of them), in a fixed order. */
export const TEAMS: HeadlinerId[][] = (() => {
  const out: HeadlinerId[][] = [];
  for (let a = 0; a < ROTATION.length; a++) for (let b = a + 1; b < ROTATION.length; b++) for (let c = b + 1; c < ROTATION.length; c++) out.push([ROTATION[a]!, ROTATION[b]!, ROTATION[c]!]);
  return out;
})();

export function runTour(config: BotConfig, seed: string, maxTicks = DEFAULT_MAX_TICKS, team?: HeadlinerId[]): TourResult {
  const headliner = team ? team[0]! : config.headliner === 'rotate' ? ROTATION[seedIndex(seed) % ROTATION.length]! : config.headliner;
  const s: EngineState = createState({ seed, headliner, mode: 'tour', ...(team ? { team } : {}) });
  const bot = createBot(config, createRng(`bot:${config.name}:${seed}`));
  while (s.phase !== 'over' && s.phase !== 'won' && s.tick < maxTicks) step(s, bot.act(s));
  return {
    bot: config.name,
    headliner,
    ...(team ? { team: team.join('+') } : {}),
    seed,
    won: s.phase === 'won',
    act: s.tour?.act ?? 1,
    cleared: s.tour?.cleared ?? 0,
    minutes: s.tick / 3600,
    deckSize: s.draw.length + s.hand.length + s.discard.length,
    lostAt: s.phase === 'over' ? `${s.tour?.act}:${s.tour?.nodes.find((n) => n.id === s.tour?.at)?.kind ?? '?'}` : null,
  };
}
