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
  type HeadlinerId,
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
  /** Who the bot plays as. Random rotates through every headliner by seed. */
  headliner: HeadlinerId | 'rotate';
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
        if (def.headliner && def.headliner === s.headliner.id) value *= 1.15;
        // Keep a running chain alive, but only when it's about to drop and only with cheap cards.
        const aboutToDrop = s.chain.links > 0 && s.chain.lastLinkBeat < s.clock.beat;
        if (aboutToDrop && def.cost <= 1) value += 2 + Math.min(8, s.chain.links * 0.4);
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
  const lyraBonus = s.headliner.id === 'lyra' ? unitsInLane.length * 2 : 0; // +1 damage per gate pass
  const swarm = enemiesInLane.filter((e) => e.kind === 'swarmling').length;
  switch (def.type) {
    case 'unit': {
      const u = def.unit!;
      const full = unitsInLane.length >= UNIT_SLOTS;
      const roadieMaker = def.id === 'crew-chief' ? roadieValue(s, lane) * 0.5 : 0;
      const dps = (u.damage * 2) / u.fireEvery + (def.id === 'kick-drum' ? 1.5 : 0) + roadieMaker;
      return (dps * 3 + threatHere * 0.05) * (full ? 0.3 : 1) * (armored && u.damage <= 4 ? 0.6 : 1);
    }
    case 'gate': {
      if (unitsInLane.length === 0) return 0;
      const g = def.gate!;
      const existing = s.gates.filter((x) => x.lane === lane);
      const dupe = existing.some((x) => x.kind === g.kind) ? 0.5 : 1;
      const full = existing.length >= 2 ? 0.5 : 1;
      if (g.kind === 'copy') return (laneDps * 2.2 * (g.amount - 1) + lyraBonus) * dupe * full;
      if (g.kind === 'damage') return (unitsInLane.length * 2 * g.amount + lyraBonus + (armored ? 12 : 0)) * dupe * full;
      if (g.kind === 'splash') return (swarm * 3 + laneDps) * dupe * full;
      if (g.kind === 'shred') return (armored ? laneDps * 3 + 10 : laneDps * 0.5) * dupe * full;
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
        case 'load-in': {
          const free = Math.max(0, UNIT_SLOTS - unitsInLane.length);
          return Math.min(2, free) * roadieValue(s, lane) + (enemiesInLane.length > 0 ? 2 : 0);
        }
        case 'sustain-pedal': {
          const worn = s.gates.filter((g) => g.lane === lane).reduce((sum, g) => sum + (g.maxDurability - g.durability), 0);
          return (s.energy < 4 ? 8 : 3) + Math.min(worn, 20) * 0.3;
        }
        default:
          return 3;
      }
    }
    case 'amp': {
      if (s.amps.length >= 2) return 1;
      if (def.id === 'mosh-pit') return 4 + s.units.filter((u) => u.token).length * 4;
      if (def.id === 'resonance') return 4 + s.gates.length * 3;
      return 6 + s.units.length * 2;
    }
  }
}

/** How much a fresh Roadie in this lane is worth: its damage over its short stay. */
function roadieValue(s: EngineState, lane: number): number {
  const gates = s.gates.filter((g) => g.lane === lane);
  let dmg = 3 + gates.filter((g) => g.kind === 'damage').reduce((sum, g) => sum + g.amount, 0);
  const copies = gates.filter((g) => g.kind === 'copy').reduce((m, g) => m * g.amount, 1);
  const shred = gates.some((g) => g.kind === 'shred');
  const enemies = s.enemies.filter((e) => e.lane === lane && e.depth >= 0);
  const armor = shred ? 0 : enemies.reduce((m, e) => Math.max(m, e.armor), 0);
  dmg = Math.max(0.5, dmg - armor) * copies;
  const busy = enemies.length > 0 ? 1 : 0.4;
  return dmg * 2 * busy;
}

/** When to use the headliner's ability (Fill, Swell or All Hands). */
function wantsFill(config: BotConfig, s: EngineState, rng: RngState): boolean {
  if (s.clock.beat < s.headliner.readyBeat) return false;
  if (config.kind === 'random') return s.units.length > 0 && nextFloat(rng) < 0.05;
  const threat = laneThreat(s);
  const pressed = Math.max(...threat) > 40 * s.wave.hpMult;
  switch (s.headliner.id) {
    case 'lyra':
      return pressed && s.gates.length > 0 && s.units.length > 0;
    case 'clatter':
      return pressed || threat.filter((t) => t > 0).length >= 2;
    default:
      return pressed && s.units.length > 0;
  }
}

function choosePick(config: BotConfig, s: EngineState, rng: RngState): number | null {
  if (s.pick.length === 0) return null;
  if (config.kind === 'random') return nextFloat(rng) < 0.25 ? null : nextInt(rng, 0, s.pick.length);
  // Pick what the deck is short on: every copy already owned makes a card less attractive.
  const owned = (id: string) => [...s.hand, ...s.draw, ...s.discard].filter((c) => c.cardId === id).length +
    s.units.filter((u) => u.cardId === id).length + s.gates.filter((g) => g.cardId === id).length + s.amps.filter((a) => a.cardId === id).length;
  const base: Record<string, number> = { unit: 2, gate: 2, riff: 1.6, amp: 1.6 };
  const scores = s.pick.map((id) => {
    const def = getCard(id);
    let v = (base[def.type] ?? 1.5) - 0.6 * owned(id) + nextFloat(rng);
    if (config.kind === 'archetype' && def.headliner === s.headliner.id) v += 0.3;
    return v;
  });
  return argmax(scores);
}
