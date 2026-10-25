import {
  BEAT_UNITS,
  frontEnemy,
  getCard,
  nextFloat,
  nextInt,
  TICK_RATE,
  UNIT_SLOTS,
  type CardDef,
  type CardInstance,
  type EngineState,
  type Input,
  type RngState,
} from '../src/engine';

/**
 * Bot players for the depth simulator (SPEC §9). Bots only see what a player
 * sees and only send normal inputs. Each bot plans its next play once per
 * beat and commits it at a time drawn from its timing skill, so timing is
 * graded exactly as it would be for a person.
 */

export interface BotConfig {
  name: string;
  kind: 'random' | 'greedy' | 'archetype';
  /** 0–1: how often the bot lands its play right on the beat. */
  timingSkill: number;
}

export interface Bot {
  config: BotConfig;
  /** Inputs for this tick. Called once per tick. */
  act(s: EngineState): Input[];
  /** Distinct affordable cards in hand at each decision, for D7. */
  choiceSamples: number[];
}

interface Plan {
  tick: number;
  iid: number;
  lane: number;
}

const MS_PER_TICK = 1000 / TICK_RATE;

export function createBot(config: BotConfig, rng: RngState): Bot {
  let plan: Plan | null = null;
  let lastPlannedBeat = -1;
  const choiceSamples: number[] = [];

  /** Offset from the beat (ms, negative = early) for one play, from the timing skill. */
  const drawOffsetMs = (): number => {
    if (config.kind === 'random') return nextInt(rng, -280, 281);
    const u = nextFloat(rng);
    if (u < config.timingSkill) return -nextInt(rng, 0, 45); // Tight
    if (u < config.timingSkill + (1 - config.timingSkill) / 2) return -nextInt(rng, 70, 115); // Good
    return -nextInt(rng, 150, 260); // Off
  };

  const act = (s: EngineState): Input[] => {
    if (s.phase === 'picking') return [{ type: 'pick', index: choosePick(config, s, rng) }];
    if (s.phase !== 'playing') return [];
    const inputs: Input[] = [];

    // Execute a planned play.
    if (plan && s.tick >= plan.tick) {
      const p = plan;
      plan = null;
      if (s.hand.some((c) => c.iid === p.iid)) {
        const permille = nextInt(rng, 0, 1000);
        inputs.push({ type: 'commit', iid: p.iid, lane: p.lane, permille });
      }
    }

    // Plan once per beat, right after it lands, for the next beat.
    if (s.clock.beat !== lastPlannedBeat && s.clock.phase < s.clock.bpm) {
      lastPlannedBeat = s.clock.beat;
      const affordable = s.hand.filter((c) => getCard(c.cardId).cost <= s.energy);
      choiceSamples.push(new Set(affordable.map((c) => c.cardId)).size);
      const choice = choosePlay(config, s, rng);
      if (choice) {
        const ticksPerBeat = BEAT_UNITS / s.clock.bpm;
        const target = s.tick + ticksPerBeat + drawOffsetMs() / MS_PER_TICK;
        plan = { tick: Math.max(s.tick + 1, Math.floor(target)), iid: choice.card.iid, lane: choice.lane };
      }
      if (wantsFill(config, s, rng)) inputs.push({ type: 'activate', permille: 0 });
    }
    return inputs;
  };

  return { config, act, choiceSamples };
}

// ---------------------------------------------------------------- decisions

/** Remaining enemy health per lane, weighted toward enemies near the stage. */
function laneThreat(s: EngineState): number[] {
  const t = [0, 0, 0];
  for (const e of s.enemies) {
    if (e.depth < 0) continue;
    t[e.lane]! += e.hp * (0.5 + e.depth / 100_000);
  }
  return t;
}

function argmax(xs: number[]): number {
  let best = 0;
  for (let i = 1; i < xs.length; i++) if (xs[i]! > xs[best]!) best = i;
  return best;
}

interface Choice {
  card: CardInstance;
  lane: number;
  value: number;
}

function choosePlay(config: BotConfig, s: EngineState, rng: RngState): Choice | null {
  // Plays are committed just before the next beat, before that beat's energy arrives.
  const hand = s.hand.filter((c) => getCard(c.cardId).cost <= s.energy);
  if (hand.length === 0) return null;

  if (config.kind === 'random') {
    if (nextFloat(rng) > 0.7) return null;
    return { card: hand[nextInt(rng, 0, hand.length)]!, lane: nextInt(rng, 0, 3), value: 0 };
  }

  const threat = laneThreat(s);
  let best: Choice | null = null;
  for (const card of hand) {
    const def = getCard(card.cardId);
    for (let lane = 0; lane < 3; lane++) {
      let value = estimateValue(def, lane, s, threat);
      if (config.kind === 'archetype') {
        if (def.headliner === 'thrum') value *= 1.3;
        // Keeping the chain alive is worth something on its own.
        if (s.chain.links > 0) value += 4 + s.chain.links * 0.5;
      }
      value /= Math.max(1, def.cost);
      value += nextFloat(rng) * 0.5; // break ties, avoid robotic repetition
      if (!best || value > best.value) best = { card, lane, value };
    }
  }
  // Greedy plays whenever anything is worth it; archetype also plays to keep chains going.
  if (!best || best.value <= 0.6) return null;
  return best;
}

function estimateValue(def: CardDef, lane: number, s: EngineState, threat: number[]): number {
  const unitsInLane = s.units.filter((u) => u.lane === lane);
  const laneDps = unitsInLane.reduce((sum, u) => sum + (u.damage * 2) / u.fireEvery, 0);
  const enemiesInLane = s.enemies.filter((e) => e.lane === lane && e.depth >= 0);
  const threatHere = threat[lane]!;
  const armored = enemiesInLane.some((e) => e.armor > 0);
  const swarm = enemiesInLane.filter((e) => e.kind === 'swarmling').length;
  switch (def.type) {
    case 'unit': {
      const u = def.unit!;
      const full = unitsInLane.length >= UNIT_SLOTS;
      const dps = (u.damage * 2) / u.fireEvery + (def.id === 'kick-drum' ? 1.5 : 0);
      return (dps * 3 + threatHere * 0.05) * (full ? 0.3 : 1) * (armored && u.damage <= 4 ? 0.6 : 1);
    }
    case 'gate': {
      if (unitsInLane.length === 0) return 0;
      const g = def.gate!;
      const existing = s.gates.filter((x) => x.lane === lane);
      const dupe = existing.some((x) => x.kind === g.kind) ? 0.5 : 1;
      const full = existing.length >= 2 ? 0.5 : 1;
      if (g.kind === 'copy') return laneDps * 2.2 * dupe * full;
      if (g.kind === 'damage') return (unitsInLane.length * 2 * g.amount + (armored ? 12 : 0)) * dupe * full;
      if (g.kind === 'splash') return (swarm * 3 + laneDps) * dupe * full;
      return laneDps * dupe * full;
    }
    case 'riff': {
      switch (def.id) {
        case 'power-chord':
          return frontEnemy(s, lane) ? 18 + (armored ? 8 : 0) : 0;
        case 'feedback-loop':
          return enemiesInLane.length * 6 - (s.crowd < 8 ? 30 : 4);
        case 'snare-roll':
          return laneDps * 2 + (unitsInLane.length > 0 ? 3 : 0);
        case 'paradiddle':
          return s.energy < 4 ? 8 : 3;
        case 'encore':
          return s.chain.links >= 2 ? 10 + s.enemies.length * 2 : 4;
        default:
          return 3;
      }
    }
    case 'amp':
      return s.amps.length < 2 ? 6 + s.units.length * 2 : 1;
  }
}

function wantsFill(config: BotConfig, s: EngineState, rng: RngState): boolean {
  if (s.clock.beat < s.headliner.readyBeat || s.units.length === 0) return false;
  if (config.kind === 'random') return nextFloat(rng) < 0.05;
  const threat = laneThreat(s);
  return Math.max(...threat) > 40 * s.wave.hpMult;
}

function choosePick(config: BotConfig, s: EngineState, rng: RngState): number | null {
  if (s.pick.length === 0) return null;
  if (config.kind === 'random') return nextFloat(rng) < 0.25 ? null : nextInt(rng, 0, s.pick.length);
  const scores = s.pick.map((id) => {
    const def = getCard(id);
    let v = nextFloat(rng) * 1.5;
    if (config.kind === 'archetype' && def.headliner === 'thrum') v += 1.5;
    if (def.type === 'gate' || def.type === 'unit') v += 1;
    return v;
  });
  return argmax(scores);
}
