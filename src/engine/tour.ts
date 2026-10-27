import {
  PICK_OPTIONS,
  START_ENERGY,
  TOUR_ACT_LEVEL,
  TOUR_ACTS,
  TOUR_COLS,
  TOUR_COUNT_IN_BEATS,
  TOUR_FIGHT_WAVES,
  TOUR_MERCH,
  TOUR_PRICES,
  TOUR_REST_HEAL,
  HEAT_REST_HEAL,
  HEAT_START_CROWD,
  MAX_CROWD_CAP,
  TOUR_SHOP_HANDBILLS,
  TOUR_SHOP_HANDBILLS_PRICE,
  TOUR_ROWS,
  TOUR_SHOP_HEAL,
  TOUR_SHOP_HEAL_PRICE,
  TOUR_SHOP_REMOVE_PRICE,
  WAVE_BEATS,
} from './constants';
import type { TickCtx } from './context';
import { MAX_HEAT } from '../content/heat';
import { teamOf, unevolved } from './evolution';
import { gainCrowd, raiseCrowdCap } from './effects';
import { addCardToDeck, refillHand } from './deck';
import { nextFloat, nextInt, shuffleInPlace } from './rng';
import { emptyChain, type CardInstance, type EngineState, type TourNode, type TourNodeKind, type TourState } from './state';
import { BOSS_ORDER, bossCalls, cleanSet, spawnDue, startWave } from './waves';
import { getCard, pickPool } from '../content/cards';
import { TOUR_EVENTS, type TourEffect } from '../content/events';

/**
 * Tour mode (SPEC §5, S2.1): three acts, each a small map of stops (fights,
 * an elite, drafts, rests, shops, events) and a boss. Crowd carries over the
 * whole Tour. Your gear stays set up between fights within an act, and the
 * stage is struck at the start of each new act.
 */

// ---------------------------------------------------------------- setup

/** The Heat in force on this run (0 outside Tour). */
export function heatOf(state: EngineState): number {
  return state.tour?.heat ?? 0;
}

export function startTour(state: EngineState, heat = 0): void {
  const h = Math.max(0, Math.min(MAX_HEAT, Math.floor(heat)));
  const tour: TourState = { act: 1, nodes: [], at: null, merch: 0, fight: null, shop: null, event: null, after: [], cleared: 0, ...(h > 0 ? { heat: h } : {}) };
  state.tour = tour;
  // Heat 1: a smaller crowd to start with.
  if (h >= 1) state.crowd = Math.min(state.crowd, HEAT_START_CROWD);
  tour.nodes = generateMap(state, 1);
  clearStage(state);
  state.phase = 'map';
}

/** A layered map: 4 rows of 3 stops, each linked to the stops diagonally and straight above, then the boss. */
export function generateMap(state: EngineState, act: number): TourNode[] {
  const nodes: TourNode[] = [];
  let id = act * 100;
  for (let row = 1; row <= TOUR_ROWS; row++) {
    for (let col = 0; col < TOUR_COLS; col++) nodes.push({ id: id++, row, col, kind: row === 1 ? 'fight' : rollKind(state, row), next: [] });
  }
  const boss: TourNode = { id: id++, row: TOUR_ROWS + 1, col: 1, kind: 'boss', next: [] };
  nodes.push(boss);
  const at = (row: number, col: number) => nodes.find((n) => n.row === row && n.col === col);
  for (const n of nodes) {
    if (n.row === TOUR_ROWS) n.next = [boss.id];
    else if (n.row < TOUR_ROWS) for (const c of [n.col - 1, n.col, n.col + 1]) { const m = at(n.row + 1, c); if (m) n.next.push(m.id); }
  }
  // Every act has an elite, a shop on the way, and a chance to rest before the boss.
  ensure(state, nodes, 'elite', (n) => n.row >= 3 && n.row <= TOUR_ROWS);
  ensure(state, nodes, 'shop', (n) => n.row >= 2 && n.row <= 3 && n.kind !== 'elite');
  ensure(state, nodes, 'rest', (n) => n.row === TOUR_ROWS && n.kind !== 'elite');
  return nodes;
}

function rollKind(state: EngineState, row: number): TourNodeKind {
  const table: [TourNodeKind, number][] = [
    ['fight', 4],
    ['event', 2],
    ['draft', 2],
    ['shop', 1.2],
    ['rest', row >= 3 ? 1.5 : 0.6],
    ['elite', row >= 3 ? 1.4 : 0],
  ];
  const total = table.reduce((s, [, w]) => s + w, 0);
  let r = nextFloat(state.rng) * total;
  for (const [kind, w] of table) {
    r -= w;
    if (r < 0) return kind;
  }
  return 'fight';
}

function ensure(state: EngineState, nodes: TourNode[], kind: TourNodeKind, where: (n: TourNode) => boolean): void {
  if (nodes.some((n) => n.kind === kind && where(n))) return;
  const options = nodes.filter((n) => where(n) && n.kind !== 'boss');
  if (options.length > 0) options[nextInt(state.rng, 0, options.length)]!.kind = kind;
}

/** Every card in the deck goes back to the draw pile; the stage is cleared. */
export function clearStage(state: EngineState): void {
  const cards: CardInstance[] = [...state.draw, ...state.hand, ...state.discard, ...state.queue.filter((q) => !q.isEcho).map((q) => q.card)];
  for (const u of state.units) if (!u.token) cards.push(u.card);
  for (const g of state.gates) cards.push(g.card);
  for (const a of state.amps) cards.push(a.card);
  state.draw = shuffleInPlace(state.rng, cards);
  state.hand = [];
  state.discard = [];
  state.queue = [];
  state.units = [];
  state.gates = [];
  state.amps = [];
  state.enemies = [];
  state.projectiles = [];
  state.boss = null;
  state.chain = emptyChain();
  state.pocket = { depth: 0, avgOffsetMilli: 0 };
  state.energy = START_ENERGY;
  state.headliner.readyBeat = state.clock.beat;
  state.headliner.activeUntilBeat = -1;
}

/**
 * Between fights in the same act: the band's gear stays set up (units, gates and
 * amps stay on stage), Roadies go home, and your hand and discard shuffle back in.
 */
export function betweenFights(state: EngineState): void {
  const cards: CardInstance[] = [...state.draw, ...state.hand, ...state.discard, ...state.queue.filter((q) => !q.isEcho).map((q) => q.card)];
  state.draw = shuffleInPlace(state.rng, cards);
  state.hand = [];
  state.discard = [];
  state.queue = [];
  state.units = state.units.filter((u) => !u.token);
  state.enemies = [];
  state.projectiles = [];
  state.boss = null;
  state.chain = emptyChain();
  state.energy = START_ENERGY;
  state.headliner.readyBeat = state.clock.beat;
  state.headliner.activeUntilBeat = -1;
}

/** All the cards you own that aren't set up on stage. */
export function deckCards(state: EngineState): CardInstance[] {
  return [...state.draw, ...state.hand, ...state.discard];
}

/**
 * Every card the band owns: the piles plus the gear left set up on stage between
 * fights (units, gates, amps). Tokens aren't cards. This is the deck the player sees.
 */
export function ownedCards(state: EngineState): CardInstance[] {
  return [...deckCards(state), ...state.units.filter((u) => !u.token).map((u) => u.card), ...state.gates.map((g) => g.card), ...state.amps.map((a) => a.card)];
}

/** The smallest a Tour deck can be cut down to. */
export const MIN_DECK = 6;

// ---------------------------------------------------------------- the map

export function reachable(state: EngineState): number[] {
  const tour = state.tour;
  if (!tour || state.phase !== 'map') return [];
  if (tour.at === null) return tour.nodes.filter((n) => n.row === 1).map((n) => n.id);
  return tour.nodes.find((n) => n.id === tour.at)?.next ?? [];
}

export function travel(state: EngineState, ctx: TickCtx, nodeId: number): void {
  const tour = state.tour;
  if (!tour || !reachable(state).includes(nodeId)) return;
  const node = tour.nodes.find((n) => n.id === nodeId)!;
  tour.at = nodeId;
  tour.visited = [...(tour.visited ?? []), nodeId];
  ctx.events.push({ type: 'tourStop', kind: node.kind, act: tour.act, row: node.row });
  switch (node.kind) {
    case 'fight':
    case 'elite':
    case 'boss':
      startFight(state, ctx, node);
      return;
    case 'draft':
      offerTourPick(state, ctx, 'draft');
      return;
    case 'rest':
      state.phase = 'rest';
      return;
    case 'shop':
      openShop(state);
      return;
    case 'event':
      tour.event = TOUR_EVENTS[nextInt(state.rng, 0, TOUR_EVENTS.length)]!.id;
      state.phase = 'event';
      return;
  }
}

// ---------------------------------------------------------------- fights

/** The wave levels for a stop: a fight plays 3 waves from its row's level; a boss fight is one wave, then The Hush. */
export function fightWaves(act: number, row: number, kind: 'fight' | 'elite' | 'boss'): number[] {
  const base = (TOUR_ACT_LEVEL[act - 1] ?? 1) + row - 1;
  if (kind === 'boss') return [base - 1, base];
  const waves: number[] = [];
  for (let i = 0; i < TOUR_FIGHT_WAVES; i++) waves.push(base + i + (kind === 'elite' ? 1 : 0));
  return waves;
}

function startFight(state: EngineState, ctx: TickCtx, node: TourNode): void {
  const tour = state.tour!;
  const kind = node.kind as 'fight' | 'elite' | 'boss';
  betweenFights(state);
  refillHand(state, ctx.events);
  tour.fight = { node: node.id, kind, waves: fightWaves(tour.act, node.row, kind), wave: -1, startBeat: state.clock.beat + TOUR_COUNT_IN_BEATS };
  state.wave = { index: 0, startBeat: state.clock.beat, hpMult: 1, spawns: [], nextSpawn: 0, kinds: [] };
  state.phase = 'playing';
}

/** Once per beat while a Tour fight is on. */
export function onBeatTour(state: EngineState, ctx: TickCtx): void {
  const fight = state.tour?.fight;
  if (!fight) return;
  const beat = state.clock.beat;
  const last = fight.wave === fight.waves.length - 1;
  if (fight.wave === -1) {
    if (beat >= fight.startBeat) nextFightWave(state, ctx);
  } else if (!last) {
    if (beat >= state.wave.startBeat + WAVE_BEATS && !state.boss) nextFightWave(state, ctx);
  } else if (state.wave.nextSpawn >= state.wave.spawns.length && state.enemies.length === 0 && !state.boss) {
    fightWon(state, ctx);
    return;
  }
  if (state.phase !== 'playing') return;
  spawnDue(state);
  bossCalls(state, ctx);
}

function nextFightWave(state: EngineState, ctx: TickCtx): void {
  const fight = state.tour!.fight!;
  if (fight.wave >= 0) cleanSet(state, ctx);
  fight.wave += 1;
  const last = fight.wave === fight.waves.length - 1;
  // Each act has its own boss: The Hush, then The Critic, then Dead Air.
  startWave(state, ctx, fight.waves[fight.wave]!, { boss: fight.kind === 'boss' && last, bossKind: BOSS_ORDER[(state.tour!.act - 1) % BOSS_ORDER.length], elite: fight.kind === 'elite' || (heatOf(state) >= 10 && fight.kind === 'fight') });
}

function fightWon(state: EngineState, ctx: TickCtx): void {
  cleanSet(state, ctx);
  const tour = state.tour!;
  const fight = tour.fight!;
  const merch = TOUR_MERCH[fight.kind];
  tour.merch += merch;
  tour.cleared += 1;
  tour.fight = null;
  ctx.events.push({ type: 'fightWon', kind: fight.kind, merch });
  if (state.chain.links > 0) ctx.events.push({ type: 'chainEnd', links: state.chain.links, dropped: false, songEnd: true });
  betweenFights(state);
  if (fight.kind === 'boss') {
    if (tour.act >= TOUR_ACTS) tour.after.push('won');
    else {
      // Solo: evolve after act 1. Team: one member evolves after each of acts 1 and 2.
      if (state.headliner.team ? unevolved(state).length > 0 : tour.act === 1 && (state.headliner.evolution ?? null) === null) tour.after.push('evolve');
      tour.after.push('next-act');
    }
  }
  offerTourPick(state, ctx, fight.kind);
}

// ---------------------------------------------------------------- picks, rest, shop, events

/** Three cards, weighted toward your headliner's signature cards. Elites and bosses always offer a rare. */
export function offerTourPick(state: EngineState, ctx: TickCtx, kind: 'fight' | 'elite' | 'boss' | 'draft'): void {
  const pool = pickPool(teamOf(state));
  const weight = (id: string) => {
    const def = getCard(id);
    return def.headliner ? 3 : def.rarity === 'common' ? 2 : 1;
  };
  // Heat 9: two cards to choose from instead of three.
  const options = weightedSample(state, pool, weight, heatOf(state) >= 9 ? PICK_OPTIONS - 1 : PICK_OPTIONS);
  if ((kind === 'elite' || kind === 'boss') && !options.some((id) => getCard(id).rarity === 'rare')) {
    const rares = pool.filter((id) => getCard(id).rarity === 'rare' && !options.includes(id));
    if (rares.length > 0) options[nextInt(state.rng, 0, options.length)] = rares[nextInt(state.rng, 0, rares.length)]!;
  }
  state.pick = options;
  state.phase = 'picking';
  ctx.events.push({ type: 'pickOffered', options: [...options] });
}

function weightedSample(state: EngineState, pool: string[], weight: (id: string) => number, count: number): string[] {
  const left = [...pool];
  const out: string[] = [];
  while (out.length < count && left.length > 0) {
    const total = left.reduce((s, id) => s + weight(id), 0);
    let r = nextFloat(state.rng) * total;
    let i = 0;
    for (; i < left.length - 1; i++) {
      r -= weight(left[i]!);
      if (r < 0) break;
    }
    out.push(left.splice(i, 1)[0]!);
  }
  return out;
}

/** After a card pick or an evolution in a Tour: on to whatever is next. */
export function afterTourChoice(state: EngineState, ctx: TickCtx): void {
  const tour = state.tour!;
  const next = tour.after.shift();
  if (next === 'evolve') {
    state.phase = 'evolving';
    ctx.events.push({ type: 'evolveOffered' });
  } else if (next === 'next-act') {
    // A new act is a new leg of the tour: the stage is struck and you start fresh.
    clearStage(state);
    tour.act += 1;
    tour.nodes = generateMap(state, tour.act);
    tour.at = null;
    tour.visited = [];
    state.phase = 'map';
    ctx.events.push({ type: 'actStart', act: tour.act });
  } else if (next === 'won') {
    state.phase = 'won';
    ctx.events.push({ type: 'tourWon', merch: tour.merch, cleared: tour.cleared });
  } else {
    state.phase = 'map';
  }
}

export function rest(state: EngineState, ctx: TickCtx, choice: 'heal' | 'cut', iid?: number): void {
  if (state.phase !== 'rest') return;
  if (choice === 'heal') {
    // Heat 5: inns win back less.
    gainCrowd(state, ctx, heatOf(state) >= 5 ? HEAT_REST_HEAL : TOUR_REST_HEAL, 'tour');
  } else if (!removeCard(state, iid)) return;
  state.phase = 'map';
}

/** Cut a card from anywhere the band owns it, including gear still set up on stage. */
function removeCard(state: EngineState, iid: number | undefined): boolean {
  if (iid === undefined || ownedCards(state).length <= MIN_DECK) return false;
  for (const pile of [state.draw, state.hand, state.discard]) {
    const i = pile.findIndex((c) => c.iid === iid);
    if (i !== -1) {
      pile.splice(i, 1);
      return true;
    }
  }
  for (const list of [state.units, state.gates, state.amps] as { card: CardInstance }[][]) {
    const i = list.findIndex((x) => x.card.iid === iid && !(x as { token?: boolean }).token);
    if (i !== -1) {
      list.splice(i, 1);
      return true;
    }
  }
  return false;
}

function openShop(state: EngineState): void {
  const pool = pickPool(teamOf(state));
  const cards = weightedSample(state, pool, (id) => (getCard(id).headliner ? 2 : 1), 4).map((cardId) => {
    const def = getCard(cardId);
    // Heat 4: Market cards cost 25% more.
    const base = TOUR_PRICES[def.rarity] + (def.headliner ? 5 : 0);
    return { cardId, price: heatOf(state) >= 4 ? Math.round((base * 5) / 4) : base, sold: false };
  });
  state.tour!.shop = { cards, removed: false, healed: false };
  state.phase = 'shop';
}

export type ShopAction = { action: 'buy'; index: number } | { action: 'remove'; iid: number } | { action: 'heal' } | { action: 'handbills' } | { action: 'leave' };

export function shop(state: EngineState, ctx: TickCtx, a: ShopAction): void {
  const tour = state.tour;
  const shop = tour?.shop;
  if (!tour || !shop || state.phase !== 'shop') return;
  switch (a.action) {
    case 'buy': {
      const item = shop.cards[a.index];
      if (!item || item.sold || tour.merch < item.price) return;
      tour.merch -= item.price;
      item.sold = true;
      addCardToDeck(state, item.cardId);
      ctx.events.push({ type: 'picked', cardId: item.cardId });
      return;
    }
    case 'remove':
      if (shop.removed || tour.merch < TOUR_SHOP_REMOVE_PRICE || !removeCard(state, a.iid)) return;
      tour.merch -= TOUR_SHOP_REMOVE_PRICE;
      shop.removed = true;
      return;
    case 'heal': {
      if (shop.healed || tour.merch < TOUR_SHOP_HEAL_PRICE || state.crowd >= state.maxCrowd) return;
      tour.merch -= TOUR_SHOP_HEAL_PRICE;
      shop.healed = true;
      gainCrowd(state, ctx, TOUR_SHOP_HEAL, 'tour');
      return;
    }
    case 'handbills': {
      // S4.8: post handbills around the faire: room for more crowd, and they come.
      if (shop.handbills || tour.merch < TOUR_SHOP_HANDBILLS_PRICE || state.maxCrowd >= MAX_CROWD_CAP) return;
      tour.merch -= TOUR_SHOP_HANDBILLS_PRICE;
      shop.handbills = true;
      raiseCrowdCap(state, ctx, TOUR_SHOP_HANDBILLS, 'handbills');
      return;
    }
    case 'leave':
      tour.shop = null;
      state.phase = 'map';
      return;
  }
}

export function eventChoice(state: EngineState, ctx: TickCtx, option: 0 | 1): void {
  const tour = state.tour;
  if (!tour || state.phase !== 'event') return;
  const def = TOUR_EVENTS.find((e) => e.id === tour.event);
  if (!def) return;
  for (const effect of def.options[option].effects) applyTourEffect(state, ctx, effect);
  tour.event = null;
  if (state.crowd <= 0) {
    state.crowd = 0;
    state.phase = 'over';
    ctx.events.push({ type: 'gameOver', wave: state.wave.index, score: state.score });
    return;
  }
  state.phase = 'map';
}

function applyTourEffect(state: EngineState, ctx: TickCtx, effect: TourEffect): void {
  const tour = state.tour!;
  switch (effect.do) {
    case 'merch':
      tour.merch = Math.max(0, tour.merch + effect.amount);
      return;
    case 'crowd': {
      if (effect.amount > 0) gainCrowd(state, ctx, effect.amount, 'tour');
      else state.crowd = Math.max(0, state.crowd + effect.amount);
      return;
    }
    case 'addCard': {
      const pool = pickPool(teamOf(state)).filter((id) => {
        const def = getCard(id);
        return effect.rarity === 'signature' ? def.headliner !== undefined && teamOf(state).includes(def.headliner) : def.rarity === effect.rarity;
      });
      if (pool.length === 0) return;
      const cardId = pool[nextInt(state.rng, 0, pool.length)]!;
      addCardToDeck(state, cardId);
      ctx.events.push({ type: 'picked', cardId });
      return;
    }
    case 'removeRandom': {
      // A random card from the piles (not gear on stage), down to the usual minimum.
      const deck = deckCards(state);
      if (deck.length > 0 && ownedCards(state).length > MIN_DECK) removeCard(state, deck[nextInt(state.rng, 0, deck.length)]!.iid);
      return;
    }
    case 'duplicateRandom': {
      const deck = deckCards(state);
      if (deck.length > 0) {
        const cardId = deck[nextInt(state.rng, 0, deck.length)]!.cardId;
        addCardToDeck(state, cardId);
        ctx.events.push({ type: 'picked', cardId });
      }
      return;
    }
  }
}
