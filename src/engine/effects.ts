import { gradeMultiplierPct, type Grade } from './clock';
import { damageEnemy, fireUnit, frontEnemy, gateDepth } from './combat';
import {
  BIG_CHAIN,
  CHAIN_BASE_PCT,
  CHAIN_CAP,
  CHAIN_GRACE_BEATS,
  CHAIN_STEP_PCT,
  CHAIN_TIGHT_START_PCT,
  GATE_DEPTHS,
  MAX_ENERGY,
  UNIT_SLOTS,
} from './constants';
import type { TickCtx } from './context';
import { drawCards } from './deck';
import { emptyChain, type EngineState, type QueuedPlay, type Unit } from './state';
import type { Effect } from './types';
import { getCard } from '../content/cards';

// ---------------------------------------------------------------- chains

/** Bonus multiplier from the active chain, as a percent (100 = no bonus). */
export function chainMultPct(state: EngineState): number {
  return state.chain.links > 0 ? state.chain.multPct : 100;
}

/**
 * Add a link to the chain (SPEC §4.6). Fires 'chainGrow' triggers, and
 * converts the chain into a Showstopper when it hits the cap.
 */
export function addLink(state: EngineState, ctx: TickCtx, cardId: string, label: string, lane: number, starter: Grade | null): void {
  const chain = state.chain;
  if (chain.links === 0) chain.tightStart = starter === 'tight';
  chain.links += 1;
  chain.lastLinkBeat = state.clock.beat;
  chain.multPct = CHAIN_BASE_PCT + CHAIN_STEP_PCT * (chain.links - 1) + (chain.tightStart ? CHAIN_TIGHT_START_PCT : 0);
  if (chain.links > state.stats.bestChain) state.stats.bestChain = chain.links;
  ctx.events.push({ type: 'link', links: chain.links, multPct: chain.multPct, cardId, label, lane });

  if (chain.links >= CHAIN_CAP) {
    showstopper(state, ctx);
    return;
  }

  // chainGrow triggers never add links themselves, so this can't recurse.
  for (const amp of state.amps) runTriggers(state, ctx, amp.cardId, 'chainGrow', null, 0);
  for (const unit of state.units) runTriggers(state, ctx, unit.cardId, 'chainGrow', unit, unit.lane);
}

/** End the chain if a full beat has passed without a link. Call once per beat, before new links. */
export function checkChainEnd(state: EngineState, ctx: TickCtx): void {
  const chain = state.chain;
  if (chain.links === 0) return;
  if (state.clock.beat - chain.lastLinkBeat > CHAIN_GRACE_BEATS) {
    ctx.events.push({ type: 'chainEnd', links: chain.links, dropped: false });
    state.chain = emptyChain();
  }
}

/** The 50-link cap resolves as a big hit to everything, then the chain resets (SPEC §4.6 loop guard). */
function showstopper(state: EngineState, ctx: TickCtx): void {
  const links = state.chain.links;
  const damage = 40 * state.wave.hpMult * (links / 10);
  for (const e of state.enemies) damageEnemy(state, ctx, e, damage, 'showstopper');
  state.stats.showstoppers += 1;
  ctx.events.push({ type: 'showstopper', links, damage });
  state.chain = emptyChain();
}

export function isBigChain(links: number): boolean {
  return links >= BIG_CHAIN;
}

// ---------------------------------------------------------------- effects

interface EffectSource {
  cardId: string;
  lane: number;
  /** Combined grade × chain multiplier for this effect, in percent. */
  multPct: number;
  /** Unit that owns the trigger, for selfFire. */
  unit: Unit | null;
}

export function runEffects(state: EngineState, ctx: TickCtx, effects: readonly Effect[], src: EffectSource): void {
  for (const effect of effects) {
    if (state.phase === 'over') return;
    runEffect(state, ctx, effect, src);
  }
}

function runEffect(state: EngineState, ctx: TickCtx, effect: Effect, src: EffectSource): void {
  const scale = (n: number) => (n * src.multPct) / 100;
  switch (effect.do) {
    case 'damageFront': {
      const target = frontEnemy(state, src.lane);
      if (target) damageEnemy(state, ctx, target, scale(effect.amount), src.cardId);
      return;
    }
    case 'damageLane':
      for (const e of state.enemies) if (e.lane === src.lane && e.depth >= 0) damageEnemy(state, ctx, e, scale(effect.amount), src.cardId);
      return;
    case 'damageAll':
      for (const e of state.enemies) if (e.depth >= 0) damageEnemy(state, ctx, e, scale(effect.amount), src.cardId);
      return;
    case 'volley':
      for (const u of state.units) {
        if (effect.scope === 'lane' && u.lane !== src.lane) continue;
        fireUnit(state, u, effect.shots, src.multPct);
      }
      return;
    case 'selfFire':
      if (src.unit) fireUnit(state, src.unit, effect.shots, src.multPct);
      return;
    case 'gainEnergy': {
      const before = state.energy;
      state.energy = Math.min(MAX_ENERGY, state.energy + effect.amount);
      if (state.energy > before) ctx.events.push({ type: 'energy', amount: state.energy - before, reason: 'card' });
      return;
    }
    case 'draw':
      drawCards(state, effect.count, ctx.events);
      return;
    case 'loseCrowd':
      state.crowd -= effect.amount;
      checkGameOver(state, ctx);
      return;
    case 'ifChain':
      runEffects(state, ctx, state.chain.links >= effect.min ? effect.then : (effect.else ?? []), src);
      return;
  }
}

function runTriggers(
  state: EngineState,
  ctx: TickCtx,
  cardId: string,
  when: 'downbeat' | 'chainGrow',
  unit: Unit | null,
  lane: number,
  linked?: Set<string>,
): void {
  const def = getCard(cardId);
  if (!def.triggers) return;
  for (const t of def.triggers) {
    if (t.when !== when) continue;
    // Copies of the same card play as one section: only the first adds a link each time.
    if (t.link && when !== 'chainGrow' && !linked?.has(cardId)) {
      linked?.add(cardId);
      addLink(state, ctx, cardId, `${def.name} triggers`, lane, null);
    }
    runEffects(state, ctx, t.effects, { cardId, lane, multPct: chainMultPct(state), unit });
  }
}

/** Beat 1 of each bar: Downbeat triggers on units already on the field, oldest first. */
export function runDownbeatTriggers(state: EngineState, ctx: TickCtx): void {
  const units = [...state.units];
  const linked = new Set<string>();
  for (const u of units) {
    if (state.phase === 'over') return;
    runTriggers(state, ctx, u.cardId, 'downbeat', u, u.lane, linked);
  }
}

export function checkGameOver(state: EngineState, ctx: TickCtx): void {
  if (state.phase === 'over' || state.crowd > 0) return;
  state.crowd = 0;
  state.phase = 'over';
  ctx.events.push({ type: 'gameOver', wave: state.wave.index, score: state.score });
}

// ---------------------------------------------------------------- resolving plays

/** A played card takes effect on its beat. Every resolution is a chain link. */
export function resolvePlay(state: EngineState, ctx: TickCtx, play: QueuedPlay): void {
  const def = getCard(play.card.cardId);
  const beat = state.clock.beat;
  const gradePct = gradeMultiplierPct(play.grade);
  ctx.events.push({ type: 'resolved', id: play.id, cardId: def.id, lane: play.lane, grade: play.grade, beat, isEcho: play.isEcho });
  if (!play.isEcho) state.stats.cardsPlayed += 1;

  // Off-beat plays drop the chain, like breaking a combo in a rhythm game. Echoes keep it.
  if (play.grade === 'off' && !play.isEcho && state.chain.links > 0) {
    ctx.events.push({ type: 'chainEnd', links: state.chain.links, dropped: true });
    state.chain = emptyChain();
  }

  addLink(state, ctx, def.id, play.isEcho ? `${def.name} echoes` : def.name, play.lane, play.grade);
  const multPct = (gradePct * chainMultPct(state)) / 100;

  switch (def.type) {
    case 'unit':
      placeUnit(state, ctx, play, gradePct);
      break;
    case 'gate':
      placeGate(state, ctx, play, gradePct);
      break;
    case 'amp':
      state.amps.push({ id: state.nextId++, card: play.card, cardId: def.id, placedBeat: beat });
      if (state.amps.length > 2) {
        // Amp limit (SPEC §4.4): the oldest one goes back to the deck.
        const old = state.amps.shift()!;
        state.discard.push(old.card);
      }
      break;
    case 'riff':
      if (!play.isEcho) state.discard.push(play.card);
      break;
  }

  if (def.onPlay) runEffects(state, ctx, def.onPlay, { cardId: def.id, lane: play.lane, multPct, unit: null });

  if (def.echo && !play.isEcho && state.phase !== 'over') {
    state.queue.push({ ...play, id: state.nextId++, resolveBeat: beat + 1, isEcho: true });
  }
}

function placeUnit(state: EngineState, ctx: TickCtx, play: QueuedPlay, gradePct: number): void {
  const def = getCard(play.card.cardId);
  const stats = def.unit!;
  const inLane = state.units.filter((u) => u.lane === play.lane);
  let slot = -1;
  for (let s = 0; s < UNIT_SLOTS; s++) if (!inLane.some((u) => u.slot === s)) { slot = s; break; }
  let replacedId: number | null = null;
  if (slot === -1) {
    // Lane full: the oldest unit leaves the stage.
    const oldest = inLane.reduce((a, b) => (b.placedBeat < a.placedBeat || (b.placedBeat === a.placedBeat && b.id < a.id) ? b : a));
    slot = oldest.slot;
    replacedId = oldest.id;
    state.units.splice(state.units.indexOf(oldest), 1);
    state.discard.push(oldest.card);
  }
  const unit: Unit = {
    id: state.nextId++,
    card: play.card,
    cardId: def.id,
    lane: play.lane,
    slot,
    damage: (stats.damage * gradePct) / 100,
    fireEvery: stats.fireEvery,
    pierce: stats.pierce ?? 0,
    splash: stats.splash ?? false,
    placedBeat: state.clock.beat,
  };
  state.units.push(unit);
  ctx.events.push({ type: 'unitPlaced', unitId: unit.id, cardId: def.id, lane: play.lane, slot, replacedId });
}

function placeGate(state: EngineState, ctx: TickCtx, play: QueuedPlay, gradePct: number): void {
  const def = getCard(play.card.cardId);
  const stats = def.gate!;
  const inLane = state.gates.filter((g) => g.lane === play.lane);
  let slot = -1;
  for (let s = 0; s < GATE_DEPTHS.length; s++) if (!inLane.some((g) => g.slot === s)) { slot = s; break; }
  let replacedId: number | null = null;
  if (slot === -1) {
    const oldest = inLane.reduce((a, b) => (b.placedBeat < a.placedBeat || (b.placedBeat === a.placedBeat && b.id < a.id) ? b : a));
    slot = oldest.slot;
    replacedId = oldest.id;
    state.gates.splice(state.gates.indexOf(oldest), 1);
    state.discard.push(oldest.card);
  }
  const durability = Math.round((stats.durability * gradePct) / 100);
  state.gates.push({
    id: state.nextId++,
    card: play.card,
    cardId: def.id,
    lane: play.lane,
    slot,
    depth: gateDepth(slot),
    kind: stats.kind,
    amount: stats.amount,
    durability,
    maxDurability: durability,
    placedBeat: state.clock.beat,
  });
  ctx.events.push({ type: 'gatePlaced', gateId: state.nextId - 1, cardId: def.id, lane: play.lane, slot, replacedId });
}

/** Units fire on the eighth-note grid. Thrum's Fill makes every unit fire on every eighth. */
export function fireUnitsOnEighth(state: EngineState, eighth: number): void {
  const fill = state.clock.beat < state.headliner.activeUntilBeat;
  const mult = chainMultPct(state);
  for (const u of state.units) {
    if (fill || eighth % u.fireEvery === 0) fireUnit(state, u, 1, mult);
  }
}
