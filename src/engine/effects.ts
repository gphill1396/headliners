import { damageEnemy, fireUnit, frontEnemy, gateDepth, inLane, isSlowed, priorityEnemy, slowEnemy } from './combat';
import { ENEMIES } from '../content/enemies';
import {
  BIG_CHAIN,
  CHAIN_BASE_PCT,
  CHAIN_CAP,
  CHAIN_GRACE_BEATS,
  CHAIN_STEP_AUTO_PCT,
  ANARCHY_CHAIN,
  ARIA_RIFF_SLOW_BEATS,
  ARIA_RIFF_SLOW_PCT,
  GATE_DEPTHS,
  LANES,
  LOAD_OUT_HAND_MAX,
  POCKET_STEP_PCT,
  MAX_ENERGY,
  UNIT_SLOTS,
  VOLUME_MAX,
  SINGALONG_CROWD,
  SINGALONG_LINKS,
} from './constants';
import { isDownbeat } from './clock';
import { evolvedInto, hasMember } from './evolution';
import { chainFrozen } from './waves';
import type { TickCtx } from './context';
import type { CrowdGainReason } from './events';
import { drawCards } from './deck';
import { emptyChain, type EngineState, type QueuedPlay, type Unit } from './state';
import type { Effect } from './types';
import { getCard } from '../content/cards';

// ---------------------------------------------------------------- chains

/** Bonus multiplier from the active chain, as a percent (100 = no bonus). */
export function chainMultPct(state: EngineState): number {
  return state.chain.links > 0 ? state.chain.multPct : 100;
}

/** Bonus from being in the pocket, as a percent. */
export function pocketPct(state: EngineState): number {
  return 100 + POCKET_STEP_PCT * state.pocket.depth;
}

/** Everything that boosts all damage: chain × pocket. */
export function boostPct(state: EngineState): number {
  return (chainMultPct(state) * pocketPct(state)) / 100;
}

/**
 * Add a link to the chain (SPEC §4.6). Fires 'chainGrow' triggers, and
 * converts the chain into a Showstopper when it hits the cap.
 */
/** Win back crowd (never above the max) and say so. Returns how much came back. */
export function gainCrowd(state: EngineState, ctx: TickCtx, amount: number, reason: CrowdGainReason): number {
  if (state.mode === 'tutorial') return 0;
  const before = state.crowd;
  state.crowd = Math.min(state.maxCrowd, state.crowd + amount);
  const gained = state.crowd - before;
  if (gained > 0) ctx.events.push({ type: 'crowdGain', amount: gained, reason });
  return gained;
}

export function addLink(state: EngineState, ctx: TickCtx, cardId: string, label: string, lane: number, stepPct: number): void {
  const chain = state.chain;
  // The Critic, phase 2: unimpressed. Plays keep your chain alive, but it doesn't grow.
  if (chainFrozen(state) && chain.links > 0) {
    chain.lastLinkBeat = state.clock.beat;
    return;
  }
  if (chain.links === 0) chain.multPct = CHAIN_BASE_PCT;
  chain.links += 1;
  chain.lastLinkBeat = state.clock.beat;
  // The closer to the beat, the more each link raises the multiplier.
  chain.multPct += stepPct;
  if (chain.links > state.stats.bestChain) state.stats.bestChain = chain.links;
  ctx.events.push({ type: 'link', links: chain.links, multPct: chain.multPct, cardId, label, lane });
  // Sing-along: every 10 links, the crowd joins in and some who left come back.
  if (chain.links % SINGALONG_LINKS === 0 && chain.links < CHAIN_CAP) gainCrowd(state, ctx, SINGALONG_CROWD, 'singalong');

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
  if (state.clock.beat - chain.lastLinkBeat > CHAIN_GRACE_BEATS && state.clock.beat > (chain.holdUntilBeat ?? -1)) {
    ctx.events.push({ type: 'chainEnd', links: chain.links, dropped: false });
    state.chain = emptyChain();
    // Stopping playing lets you drift out of the pocket.
    const before = state.pocket.depth;
    state.pocket.depth = Math.floor(before / 2);
    if (state.pocket.depth !== before) ctx.events.push({ type: 'pocket', depth: state.pocket.depth, delta: state.pocket.depth - before });
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
      const target = (effect.prefer === 'priority' ? priorityEnemy(state, src.lane) : null) ?? frontEnemy(state, src.lane);
      if (!target) return;
      const bonus = effect.vsSlowedPct && isSlowed(state, target) ? effect.vsSlowedPct : 100;
      damageEnemy(state, ctx, target, (scale(effect.amount) * bonus) / 100, src.cardId);
      return;
    }
    case 'slow':
      for (const e of state.enemies) if (e.hp > 0 && e.depth >= 0 && (effect.scope === 'all' || inLane(e, src.lane))) slowEnemy(state, e, effect.pct, effect.beats);
      return;
    case 'heal': {
      gainCrowd(state, ctx, effect.amount, 'card');
      return;
    }
    case 'damageLane':
      for (const e of state.enemies) if (inLane(e, src.lane) && e.depth >= 0) damageEnemy(state, ctx, e, scale(effect.amount), src.cardId);
      return;
    case 'damageAll':
      for (const e of state.enemies) {
        if (e.depth < 0 || (effect.only === 'flying' && !ENEMIES[e.kind].flying)) continue;
        damageEnemy(state, ctx, e, scale(effect.amount), src.cardId);
      }
      return;
    case 'volley':
      for (const u of state.units) {
        if (effect.scope === 'lane' && u.lane !== src.lane) continue;
        if (effect.tokensOnly && !u.token) continue;
        fireUnit(state, u, effect.shots, src.multPct);
      }
      return;
    case 'roadie':
      for (let lane = 0; lane < LANES; lane++) {
        if (effect.scope !== 'all' && lane !== src.lane) continue;
        for (let i = 0; i < effect.count; i++) createToken(state, ctx, 'roadie', lane);
      }
      return;
    case 'volume':
      if (src.unit && (src.unit.volume ?? 0) < VOLUME_MAX) {
        src.unit.volume = (src.unit.volume ?? 0) + 1;
        src.unit.damage += effect.amount;
      }
      return;
    case 'ifDownbeat':
      runEffects(state, ctx, isDownbeat(state.clock.beat) ? effect.then : (effect.else ?? []), src);
      return;
    case 'repairGates': {
      const amount = Math.round(scale(effect.amount));
      for (const g of state.gates) {
        if (effect.scope === 'lane' && g.lane !== src.lane) continue;
        g.durability = Math.min(g.maxDurability, g.durability + amount);
        ctx.events.push({ type: 'gatesRepaired', lane: g.lane, amount });
      }
      return;
    }
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
      // Riot's Anarchy: no Feedback cost while the chain is long.
      if (evolvedInto(state, 'anarchy') && state.chain.links >= ANARCHY_CHAIN) return;
      state.crowd -= effect.amount;
      ctx.events.push({ type: 'crowdCost', amount: effect.amount, lane: src.lane, cardId: src.cardId });
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
      addLink(state, ctx, cardId, `${def.name} triggers`, lane, CHAIN_STEP_AUTO_PCT);
    }
    runEffects(state, ctx, t.effects, { cardId, lane, multPct: boostPct(state), unit });
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
  for (const a of [...state.amps]) {
    if (state.phase === 'over') return;
    runTriggers(state, ctx, a.cardId, 'downbeat', null, 1, linked);
  }
}

/**
 * Put a token unit (e.g. a Roadie) on stage. Uses a free slot; if the lane is
 * full it replaces the oldest token there, and never pushes out a real card.
 */
export function createToken(state: EngineState, ctx: TickCtx, cardId: string, lane: number): void {
  const def = getCard(cardId);
  const stats = def.unit!;
  const inLane = state.units.filter((u) => u.lane === lane);
  let slot = -1;
  for (let s = 0; s < UNIT_SLOTS; s++) if (!inLane.some((u) => u.slot === s)) { slot = s; break; }
  let replacedId: number | null = null;
  if (slot === -1) {
    const tokens = inLane.filter((u) => u.token);
    if (tokens.length === 0) return;
    const oldest = tokens.reduce((a, b) => (b.placedBeat < a.placedBeat || (b.placedBeat === a.placedBeat && b.id < a.id) ? b : a));
    slot = oldest.slot;
    replacedId = oldest.id;
    state.units.splice(state.units.indexOf(oldest), 1);
  }
  const unit: Unit = {
    id: state.nextId++,
    card: { iid: -1, cardId },
    cardId,
    lane,
    slot,
    damage: stats.damage,
    fireEvery: stats.fireEvery,
    pierce: stats.pierce ?? 0,
    splash: stats.splash ?? false,
    placedBeat: state.clock.beat,
    expiresBeat: state.clock.beat + (stats.lifespanBeats ?? 8),
    token: true,
  };
  state.units.push(unit);
  ctx.events.push({ type: 'unitPlaced', unitId: unit.id, cardId, lane, slot, replacedId });
}

/** Tokens whose time is up leave the stage. Call once per beat. */
export function expireTokens(state: EngineState, ctx: TickCtx): void {
  const beat = state.clock.beat;
  if (!state.units.some((u) => u.token && u.expiresBeat !== undefined && u.expiresBeat <= beat)) return;
  let left = 0;
  state.units = state.units.filter((u) => {
    const gone = u.token === true && u.expiresBeat !== undefined && u.expiresBeat <= beat;
    if (gone) {
      left += 1;
      ctx.events.push({ type: 'unitExpired', unitId: u.id, cardId: u.cardId, lane: u.lane, slot: u.slot });
    }
    return !gone;
  });
  // Clatter's Load Out: a Roadie leaving brings your latest Riff back from the discard pile.
  if (left > 0 && evolvedInto(state, 'load-out') && state.headliner.lastLoadOutBeat !== beat && state.hand.length < LOAD_OUT_HAND_MAX) {
    for (let i = state.discard.length - 1; i >= 0; i--) {
      if (getCard(state.discard[i]!.cardId).type !== 'riff') continue;
      state.hand.push(state.discard.splice(i, 1)[0]!);
      state.headliner.lastLoadOutBeat = beat;
      ctx.events.push({ type: 'drew', count: 1 });
      break;
    }
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
  const gradePct = play.accuracyPct;
  ctx.events.push({ type: 'resolved', id: play.id, cardId: def.id, lane: play.lane, grade: play.grade, beat, isEcho: play.isEcho });
  if (!play.isEcho) state.stats.cardsPlayed += 1;

  // Off-beat plays drop the chain, like breaking a combo in a rhythm game. Echoes keep it.
  if (play.grade === 'off' && !play.isEcho && state.chain.links > 0) {
    ctx.events.push({ type: 'chainEnd', links: state.chain.links, dropped: true });
    state.chain = emptyChain();
  }

  addLink(state, ctx, def.id, play.isEcho ? `${def.name} echoes` : def.name, play.lane, play.isEcho ? CHAIN_STEP_AUTO_PCT : play.chainStepPct);
  // Thrum's Metronome: a Tight play keeps the chain alive one extra beat.
  if (!play.isEcho && play.grade === 'tight' && evolvedInto(state, 'metronome')) state.chain.holdUntilBeat = beat + CHAIN_GRACE_BEATS + 1;
  const multPct = (gradePct * boostPct(state)) / 100;

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
  // Aria's passive: her Tight riffs slow the enemies in their lane.
  if (def.type === 'riff' && hasMember(state, 'aria') && play.grade === 'tight') {
    for (const e of state.enemies) if (e.hp > 0 && e.depth >= 0 && inLane(e, play.lane)) slowEnemy(state, e, ARIA_RIFF_SLOW_PCT, ARIA_RIFF_SLOW_BEATS);
  }

  if (def.echo && !play.isEcho && state.phase !== 'over') {
    state.queue.push({ ...play, id: state.nextId++, resolveBeat: beat + 1, isEcho: true });
    // Thrum's Polyrhythm: switch lanes from the beat before, and it echoes twice.
    const last = state.headliner.lastPlay;
    if (evolvedInto(state, 'polyrhythm') && last && last.beat === beat - 1 && last.lane !== play.lane) {
      state.queue.push({ ...play, id: state.nextId++, resolveBeat: beat + 2, isEcho: true });
    }
  }
  if (!play.isEcho) state.headliner.lastPlay = { beat, lane: play.lane };
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
    if (!oldest.token) state.discard.push(oldest.card);
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
    ...(stats.antiAir ? { antiAir: true } : {}),
    ...(stats.priority ? { priority: true } : {}),
    placedBeat: state.clock.beat,
    expiresBeat: -1,
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
  // Thrum's Fill: every unit fires on every eighth.
  const fill = state.headliner.id === 'thrum' && state.clock.beat < state.headliner.activeUntilBeat;
  const mult = boostPct(state);
  for (const u of state.units) {
    if (u.movedUntilBeat !== undefined && state.clock.beat < u.movedUntilBeat) continue;
    if (fill || eighth % u.fireEvery === 0) fireUnit(state, u, 1, mult);
  }
}
