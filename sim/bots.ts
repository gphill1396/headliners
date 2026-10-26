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
  deckCards,
  reachable,
} from '../src/engine';
import { ENEMIES } from '../src/content/enemies';
import { hasMember, teamOf } from '../src/engine/evolution';

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
  let abilityAt: number | null = null;
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
    // Evolutions are a coin flip, so the report can compare the two branches.
    if (s.phase === 'evolving') return [{ type: 'evolve', index: nextFloat(rng) < 0.5 ? 0 : 1 }];
    const tourMove = tourAct(config, s, rng);
    if (tourMove) return tourMove;
    if (s.phase !== 'playing') return [];
    const inputs: Input[] = [];

    if (abilityAt !== null && s.tick >= abilityAt) {
      abilityAt = null;
      inputs.push({ type: 'activate', permille: nextInt(rng, 0, 1000) });
    }

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
      // A team picks the member whose ability fits the moment, then fires it.
      const lead = s.headliner.team && config.kind !== 'random' ? bestLead(config, s, rng) : null;
      if (lead && lead !== s.headliner.id && s.clock.beat >= s.headliner.activeUntilBeat) inputs.push({ type: 'lead', headliner: lead });
      if (lead || wantsFill(config, s, rng)) {
        // Abilities are graded on the beat too: aim at the next beat with the bot's timing skill.
        const ticksPerBeat = BEAT_UNITS / s.clock.bpm;
        const target = s.tick + ticksPerBeat + drawOffsetMs() / MS_PER_TICK;
        abilityAt = Math.max(s.tick + 1, Math.floor(target));
      }
    }
    return inputs;
  };

  return { config, act, choiceSamples };
}

// ---------------------------------------------------------------- decisions

/** Remaining enemy health per lane, weighted toward enemies near the stage. */
function laneThreat(s: EngineState): number[] {
  // Every enemy counts, including ones normal shots can't touch: that's what makes answers worth buying.
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
        if (def.headliner && teamOf(s).includes(def.headliner)) value *= 1.15;
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
  const flyers = enemiesInLane.filter((e) => ENEMIES[e.kind].flying).length + s.enemies.filter((e) => ENEMIES[e.kind].flying && e.depth >= 0).length * 0.3;
  const priority = enemiesInLane.filter((e) => ENEMIES[e.kind].priority).length;
  const shielded = s.enemies.filter((e) => (e.shieldLeft ?? 0) > 0 && e.depth >= 0);
  const lyraBonus = hasMember(s, 'lyra') ? unitsInLane.length * 2 : 0; // +1 damage per gate pass
  const swarm = enemiesInLane.filter((e) => e.kind === 'swarmling').length;
  switch (def.type) {
    case 'unit': {
      const u = def.unit!;
      const full = unitsInLane.length >= UNIT_SLOTS;
      const roadieMaker = def.id === 'crew-chief' ? roadieValue(s, lane) * 0.5 : 0;
      const answers = (u.antiAir ? flyers * 6 : 0) + (u.priority ? priority * 10 : 0) + (def.id === 'hype-man' ? 2 : 0);
      const dps = (u.damage * 2) / u.fireEvery + (def.id === 'kick-drum' ? 1.5 : 0) + roadieMaker;
      return (dps * 3 + threatHere * 0.05 + answers) * (full ? 0.3 : 1) * (armored && u.damage <= 4 ? 0.6 : 1);
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
      if (g.kind === 'shred') {
        const shieldHere = shielded.some((e) => e.lane === lane);
        return (armored || shieldHere ? laneDps * 3 + 10 : laneDps * 0.5) * dupe * full;
      }
      if (g.kind === 'slow') return (enemiesInLane.length * 2 + laneDps * 0.8) * dupe * full;
      if (g.kind === 'lift') return (flyers * 8 + (flyers > 0 ? laneDps : 0)) * dupe * full;
      if (g.kind === 'aim') {
        // A speaker is worth it when a neighbor lane has a Shieldbearer and this lane is quiet.
        const next = lane === 0 ? [1] : lane === 2 ? [1] : [0, 2];
        const target = shielded.filter((e) => next.includes(e.lane)).length;
        return (target * 12 + (threat[lane]! < 5 ? laneDps * 0.8 : 0)) * dupe * full;
      }
      return laneDps * dupe * full;
    }
    case 'riff': {
      switch (def.id) {
        case 'power-chord':
          return frontEnemy(s, lane) ? 18 + (armored ? 8 : 0) : 0;
        case 'feedback-loop': {
          // Costs 1 crowd: only worth it when it stops more than 1 crowd from leaking.
          const hit = 12 * 1.3;
          const saved = enemiesInLane.filter((e) => e.depth > 40_000 && e.hp <= hit).reduce((sum, e) => sum + e.crowdDamage, 0);
          const chip = enemiesInLane.reduce((sum, e) => sum + Math.min(e.hp, hit), 0);
          return (saved - 2) * 8 + chip * 0.1 - (s.crowd < 10 ? 20 : 0);
        }
        case 'snare-roll':
          return laneDps * 2 + (unitsInLane.length > 0 ? 3 : 0);
        case 'paradiddle':
          return s.energy < 4 ? 8 : 3;
        case 'encore':
          return s.chain.links >= 2 ? 8 + s.enemies.length * 1.6 : 0;
        case 'lullaby':
        case 'siren-call': {
          const targets = def.id === 'siren-call' ? s.enemies.filter((e) => e.depth >= 0).length : enemiesInLane.length;
          const close = (def.id === 'siren-call' ? s.enemies : enemiesInLane).filter((e) => e.depth > 50_000).length;
          return targets * 2.5 + close * 4;
        }
        case 'high-note': {
          const f = frontEnemy(s, lane);
          return f ? ((f.slowUntilBeat ?? -1) > s.clock.beat ? 30 : 14) + (armored ? 5 : 0) : 0;
        }
        case 'ballad':
        case 'crowd-surf': {
          const missing = s.maxCrowd - s.crowd;
          return def.id === 'ballad' ? Math.min(missing, 4) * 3 : 4 + Math.min(missing, 3) * 2;
        }
        case 'shatter': {
          const allFlyers = s.enemies.filter((e) => ENEMIES[e.kind].flying && e.depth >= 0).length;
          return allFlyers * 7;
        }
        case 'power-slide': {
          const hit = 20 * 1.3;
          const saved = enemiesInLane.filter((e) => e.depth > 40_000 && e.hp <= hit).reduce((sum, e) => sum + e.crowdDamage, 0);
          return (saved - 1) * 8 + enemiesInLane.reduce((sum, e) => sum + Math.min(e.hp, hit), 0) * 0.15 - (s.crowd < 10 ? 20 : 0);
        }
        case 'smash-the-guitar': {
          const all = s.enemies.filter((e) => e.depth >= 0);
          return all.length * 3.5 - 8 - (s.crowd < 12 ? 30 : 0);
        }
        case 'anthem':
          return s.units.length * 2.4 - 4 - (s.crowd < 10 ? 20 : 0);
        case 'heckle': {
          const pr = enemiesInLane.some((e) => ENEMIES[e.kind].priority);
          return pr ? 20 : frontEnemy(s, lane) ? 10 : 0;
        }
        case 'mic-drop':
          return frontEnemy(s, lane) ? (s.clock.beat % 4 === 3 ? 34 : 16) + (armored ? 6 : 0) : 0;
        case 'rimshot': {
          const pr = enemiesInLane.some((e) => ENEMIES[e.kind].priority);
          return frontEnemy(s, lane) ? (s.clock.beat % 4 === 3 ? 10 : 2) + (pr ? 6 : 0) : 0;
        }
        case 'cymbal-crash': {
          const allFlyers = s.enemies.filter((e) => ENEMIES[e.kind].flying && e.depth >= 0).length;
          return allFlyers * 7;
        }
        case 'drum-solo':
          return s.units.length * (s.chain.links >= 2 ? 4 : 2.2);
        case 'glissando': {
          const worn = s.gates.reduce((sum, g) => sum + Math.min(8, g.maxDurability - g.durability), 0);
          return worn * 0.4 + (s.chain.links >= 2 ? 4 : 0);
        }
        case 'cadenza':
          return laneDps * 4 * (1 + s.gates.filter((g) => g.lane === lane).length) * (enemiesInLane.length > 0 ? 1 : 0.2);
        case 'stage-dive': {
          const roadies = s.units.filter((u) => u.token).length;
          return roadies * 5;
        }
        case 'crew-call':
          return [0, 1, 2].reduce((sum, l) => sum + (s.units.filter((u) => u.lane === l).length < UNIT_SLOTS ? roadieValue(s, l) : 0), 0);
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
      if (def.id === 'soundboard') return 8;
      if (def.id === 'tavern-chorus') return 3 + Math.min(s.maxCrowd - s.crowd, 10) * 0.8;
      if (def.id === 'chorus-line') return 4 + s.enemies.filter((e) => e.depth >= 0).length * 1.5;
      if (def.id === 'wall-of-death') return 4 + s.enemies.length * 0.8;
      if (def.id === 'four-on-the-floor') return 4 + s.units.length * 2.5;
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

/** Team Tour: the member whose ability the moment calls for (Hold first, when something is about to get through), or null. */
function bestLead(config: BotConfig, s: EngineState, rng: RngState): HeadlinerId | null {
  const order: HeadlinerId[] = ['aria', 'clatter', 'riot', 'lyra', 'thrum'];
  for (const id of order) if (s.headliner.team!.includes(id) && wantsFill(config, s, rng, id)) return id;
  return null;
}

/** When to use the headliner's ability (Fill, Swell or All Hands). */
function wantsFill(config: BotConfig, s: EngineState, rng: RngState, who: HeadlinerId = s.headliner.id): boolean {
  if (s.clock.beat < s.headliner.readyBeat) return false;
  if (config.kind === 'random') return s.units.length > 0 && nextFloat(rng) < 0.05;
  const threat = laneThreat(s);
  const pressed = Math.max(...threat) > 40 * s.wave.hpMult;
  switch (who) {
    case 'lyra':
      return pressed && s.gates.length > 0 && s.units.length > 0;
    case 'clatter':
      return pressed || threat.filter((t) => t > 0).length >= 2;
    case 'aria':
      // Hold everything still when something is about to reach the stage.
      return s.enemies.some((e) => e.depth > 70_000 && e.hp > 0);
    case 'riot':
      return pressed && s.units.length > 0;
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
  // Build toward a rough deck shape: about 40% units, 25% gates, 30% riffs, a few amps.
  const deck = [...s.hand, ...s.draw, ...s.discard, ...s.units.filter((u) => !u.token).map((u) => u.card), ...s.gates.map((g) => g.card), ...s.amps.map((a) => a.card)];
  const share = (type: string) => deck.filter((c) => getCard(c.cardId).type === type).length / Math.max(1, deck.length);
  const target: Record<string, number> = { unit: 0.4, gate: 0.25, riff: 0.3, amp: 0.08 };
  const scores = s.pick.map((id) => {
    const def = getCard(id);
    let v = 2 + 3 * ((target[def.type] ?? 0.2) - share(def.type)) - 0.6 * owned(id) + nextFloat(rng);
    // A sensible player buys an answer to an enemy if nothing in the deck answers it yet.
    const unanswered = Object.values(ENEMIES).some((e) => e.answers?.includes(id) && !e.answers.some((a) => owned(a) > 0));
    if (unanswered) v += 1.2;
    if (config.kind === 'archetype' && def.headliner !== undefined && teamOf(s).includes(def.headliner)) v += 0.3;
    return v;
  });
  // Keep the deck lean: the bigger it gets, the better a card has to be to earn a place.
  const best = argmax(scores);
  const bar = 2 + Math.max(0, deck.length - 14) * 0.25;
  return scores[best]! >= bar ? best : null;
}

// ---------------------------------------------------------------- Tour (map, rest, shop, events)

/** What a bot does between fights on a Tour. Null when it's not on a Tour menu. */
function tourAct(config: BotConfig, s: EngineState, rng: RngState): Input[] | null {
  const tour = s.tour;
  if (!tour) return null;
  const random = config.kind === 'random';
  switch (s.phase) {
    case 'map': {
      const options = reachable(s).map((id) => tour.nodes.find((n) => n.id === id)!);
      if (options.length === 0) return [];
      const low = s.crowd < 18;
      const score = (k: string) =>
        random
          ? nextFloat(rng)
          : ({ fight: 2, elite: low ? 0.3 : 2.4, draft: 1.8, rest: low ? 3.5 : 0.7, shop: tour.merch >= 40 ? 2.2 : 0.4, event: 1.3, boss: 9 } as Record<string, number>)[k]! + nextFloat(rng) * 0.6;
      const best = options.reduce((a, b) => (score(b.kind) > score(a.kind) ? b : a));
      return [{ type: 'travel', node: best.id }];
    }
    case 'rest': {
      const deck = deckCards(s);
      // Trim weak starters only once the deck has grown.
      const cut = deck.length > 13 ? deck.find((c) => c.cardId === 'stagehand' || c.cardId === 'feedback-loop') : undefined;
      if (random) return [{ type: 'rest', choice: nextFloat(rng) < 0.5 || !cut ? 'heal' : 'cut', iid: cut?.iid }];
      return s.crowd < s.maxCrowd - 8 || !cut ? [{ type: 'rest', choice: 'heal' }] : [{ type: 'rest', choice: 'cut', iid: cut.iid }];
    }
    case 'shop': {
      const shop = tour.shop!;
      if (!random && !shop.healed && s.crowd < 18 && tour.merch >= 25) return [{ type: 'shop', action: 'heal' }];
      const affordable = shop.cards.map((c, i) => ({ c, i })).filter(({ c }) => !c.sold && c.price <= tour.merch);
      if (affordable.length > 0 && (random ? nextFloat(rng) < 0.5 : nextFloat(rng) < 0.8)) {
        const pick = affordable[nextInt(rng, 0, affordable.length)]!;
        return [{ type: 'shop', action: 'buy', index: pick.i }];
      }
      return [{ type: 'shop', action: 'leave' }];
    }
    case 'event':
      return [{ type: 'event', option: random ? (nextFloat(rng) < 0.5 ? 0 : 1) : s.crowd < 12 ? 1 : nextFloat(rng) < 0.6 ? 0 : 1 }];
    default:
      return null;
  }
}
