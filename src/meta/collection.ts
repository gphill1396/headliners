import { CARDS, getCard, HEADLINERS, type CardDef, type EngineState, type HeadlinerId, type Keyword } from '../engine';
import { STARTER_DECKS } from '../content/cards';
import { cardText } from '../content/text';

/**
 * Collection (SPEC §5, S2.2): what you keep between runs. Headliner XP and
 * levels, a permanent evolution once a headliner is level 3, the cards you've
 * unlocked, each card's history, and up to 10 deck lists. Pure data and
 * functions; storage.ts reads and writes it.
 */

export const COLLECTION_VERSION = 1;
/** XP needed for levels 2, 3, 4 and 5. */
export const LEVEL_XP = [100, 250, 450, 700] as const;
export const MAX_LEVEL = LEVEL_XP.length + 1;
/** Level at which a headliner can lock in a permanent evolution (used in Encore). */
export const EVOLVE_LEVEL = 3;
/** Level at which you can change that choice. */
export const RE_EVOLVE_LEVEL = 5;
export const MAX_DECKS = 10;
export const DECK_MIN = 20;
export const DECK_MAX = 30;
export const MAX_COPIES = 2;

export interface HeadlinerProgress {
  xp: number;
  /** Permanent evolution (index into the headliner's two), once chosen. */
  evolution: 0 | 1 | null;
}

export interface CardHistory {
  /** Runs where the card was in your deck. */
  runs: number;
  /** Sum of the card's share of each run's damage (0–1), for the average. */
  shareSum: number;
  /** Tours won with the card in the deck. */
  wins: number;
  /** Best Encore wave with the card in the deck. */
  bestWave: number;
}

export interface DeckList {
  id: string;
  name: string;
  headliner: HeadlinerId;
  cards: string[];
}

export interface Collection {
  version: number;
  headliners: Record<HeadlinerId, HeadlinerProgress>;
  unlocked: string[];
  history: Record<string, CardHistory>;
  decks: DeckList[];
}

export function emptyCollection(): Collection {
  const unlocked = new Set<string>();
  for (const deck of Object.values(STARTER_DECKS)) for (const id of deck) unlocked.add(id);
  const headliners = {} as Record<HeadlinerId, HeadlinerProgress>;
  for (const id of Object.keys(HEADLINERS) as HeadlinerId[]) headliners[id] = { xp: 0, evolution: null };
  return { version: COLLECTION_VERSION, headliners, unlocked: [...unlocked].sort(), history: {}, decks: [] };
}

/** Fill in anything missing from an older or partial save. */
export function normalizeCollection(raw: Partial<Collection> | null | undefined): Collection {
  const base = emptyCollection();
  if (!raw || typeof raw !== 'object') return base;
  const headliners = { ...base.headliners };
  for (const id of Object.keys(headliners) as HeadlinerId[]) {
    const h = raw.headliners?.[id];
    if (h) headliners[id] = { xp: Math.max(0, Number(h.xp) || 0), evolution: h.evolution === 0 || h.evolution === 1 ? h.evolution : null };
  }
  const known = new Set(CARDS.map((c) => c.id));
  const unlocked = [...new Set([...base.unlocked, ...(raw.unlocked ?? []).filter((id) => known.has(id))])].sort();
  const decks = (raw.decks ?? []).filter((d) => d && typeof d.name === 'string' && d.headliner in HEADLINERS && Array.isArray(d.cards)).slice(0, MAX_DECKS);
  return { version: COLLECTION_VERSION, headliners, unlocked, history: { ...(raw.history ?? {}) }, decks };
}

// ---------------------------------------------------------------- levels

export function levelFor(xp: number): number {
  let level = 1;
  for (const need of LEVEL_XP) if (xp >= need) level += 1;
  return level;
}

/** Progress toward the next level: [xp into this level, xp this level needs], or null at max level. */
export function levelProgress(xp: number): [number, number] | null {
  const level = levelFor(xp);
  if (level >= MAX_LEVEL) return null;
  const from = level === 1 ? 0 : LEVEL_XP[level - 2]!;
  const to = LEVEL_XP[level - 1]!;
  return [xp - from, to - from];
}

/** XP for a finished run: 10 per Encore wave; 15 per Tour stop plus 100 for winning. */
export function xpForRun(state: EngineState): number {
  if (state.mode === 'tutorial') return 0;
  if (state.mode === 'tour') return 15 * (state.tour?.cleared ?? 0) + (state.phase === 'won' ? 100 : 0);
  return 10 * state.wave.index;
}

// ---------------------------------------------------------------- recording a run

/** Every card the run owned, wherever it was when the run ended (Roadies excluded). */
export function runDeck(state: EngineState): string[] {
  const cards = [...state.draw, ...state.hand, ...state.discard, ...state.queue.filter((q) => !q.isEcho).map((q) => q.card)];
  for (const u of state.units) if (!u.token) cards.push(u.card);
  for (const g of state.gates) cards.push(g.card);
  for (const a of state.amps) cards.push(a.card);
  return cards.map((c) => c.cardId);
}

export interface RunRecord {
  collection: Collection;
  xp: number;
  levelBefore: number;
  levelAfter: number;
  newlyUnlocked: string[];
}

/** Fold a finished run into the Collection: XP, unlocks and card history. */
export function recordRunInCollection(collection: Collection, state: EngineState): RunRecord {
  const next: Collection = JSON.parse(JSON.stringify(collection)) as Collection;
  const h = next.headliners[state.headliner.id];
  const levelBefore = levelFor(h.xp);
  const xp = xpForRun(state);
  h.xp += xp;

  const deck = runDeck(state);
  const ids = [...new Set(deck)];
  const unlocked = new Set(next.unlocked);
  const newlyUnlocked = ids.filter((id) => !unlocked.has(id) && getCard(id).rarity !== 'token');
  for (const id of newlyUnlocked) unlocked.add(id);
  next.unlocked = [...unlocked].sort();

  if (state.mode !== 'tutorial') {
    const total = Object.values(state.stats.damageBySource).reduce((a, b) => a + b, 0) || 1;
    for (const id of ids) {
      const rec = (next.history[id] ??= { runs: 0, shareSum: 0, wins: 0, bestWave: 0 });
      rec.runs += 1;
      rec.shareSum += (state.stats.damageBySource[id] ?? 0) / total;
      if (state.mode === 'tour' && state.phase === 'won') rec.wins += 1;
      if (state.mode === 'encore') rec.bestWave = Math.max(rec.bestWave, state.wave.index);
    }
  }
  return { collection: next, xp, levelBefore, levelAfter: levelFor(h.xp), newlyUnlocked };
}

// ---------------------------------------------------------------- decks

/** Cards a deck for this headliner may use: neutral cards and that headliner's signature cards (never tokens). */
export function eligibleCards(headliner: HeadlinerId): CardDef[] {
  return CARDS.filter((c) => c.rarity !== 'token' && (!c.headliner || c.headliner === headliner));
}

/** Why a deck can't be played yet (empty when it's fine). */
export function deckProblems(deck: DeckList, collection: Collection): string[] {
  const problems: string[] = [];
  if (deck.cards.length < DECK_MIN) problems.push(`Needs ${DECK_MIN - deck.cards.length} more card${DECK_MIN - deck.cards.length === 1 ? '' : 's'} (${DECK_MIN}–${DECK_MAX}).`);
  if (deck.cards.length > DECK_MAX) problems.push(`${deck.cards.length - DECK_MAX} too many cards (${DECK_MIN}–${DECK_MAX}).`);
  const counts = countCards(deck.cards);
  const unlocked = new Set(collection.unlocked);
  for (const [id, n] of Object.entries(counts)) {
    const def = getCard(id);
    if (n > MAX_COPIES) problems.push(`Only ${MAX_COPIES} copies of ${def.name}.`);
    if (def.headliner && def.headliner !== deck.headliner) problems.push(`${def.name} is ${HEADLINERS[def.headliner].name}'s card.`);
    if (def.rarity === 'token') problems.push(`${def.name} can't go in a deck.`);
    if (!unlocked.has(id)) problems.push(`${def.name} isn't unlocked yet.`);
  }
  return problems;
}

export function countCards(cards: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of cards) out[id] = (out[id] ?? 0) + 1;
  return out;
}

/** A fresh deck list: the headliner's starter deck, ready to build on. */
export function newDeck(collection: Collection, headliner: HeadlinerId): DeckList {
  const n = collection.decks.filter((d) => d.headliner === headliner).length + 1;
  const used = new Set(collection.decks.map((d) => d.id));
  let i = collection.decks.length + 1;
  while (used.has(`deck-${i}`)) i++;
  return { id: `deck-${i}`, name: `${HEADLINERS[headliner].name} deck ${n}`, headliner, cards: [...STARTER_DECKS[headliner]] };
}

// ---------------------------------------------------------------- deck stats

export interface DeckStats {
  /** Cards at each cost 0–7. */
  curve: number[];
  types: Record<CardDef['type'], number>;
  keywords: Partial<Record<Keyword, number>>;
  averageCost: number;
  synergies: Synergy[];
}

export interface Synergy {
  a: string;
  b: string;
  why: string;
}

export function deckStats(cards: readonly string[]): DeckStats {
  const curve = [0, 0, 0, 0, 0, 0, 0, 0];
  const types: Record<CardDef['type'], number> = { unit: 0, gate: 0, riff: 0, amp: 0 };
  const keywords: Partial<Record<Keyword, number>> = {};
  let cost = 0;
  for (const id of cards) {
    const def = getCard(id);
    curve[Math.min(7, def.cost)]! += 1;
    types[def.type] += 1;
    cost += def.cost;
    for (const k of new Set(def.keywords)) keywords[k] = (keywords[k] ?? 0) + 1;
  }
  return { curve, types, keywords, averageCost: cards.length ? cost / cards.length : 0, synergies: synergies(cards) };
}

/** What a card offers and wants, read from its data (so new cards join in on their own). */
function tags(def: CardDef): { gives: Set<string>; wants: Set<string> } {
  const gives = new Set<string>();
  const wants = new Set<string>();
  const effects = [...(def.onPlay ?? []), ...(def.triggers ?? []).flatMap((t) => t.effects)];
  const flat = (list: typeof effects): typeof effects =>
    list.flatMap((e) => (e.do === 'ifChain' || e.do === 'ifDownbeat' ? [e, ...flat(e.then), ...flat(e.else ?? [])] : [e]));
  const all = flat(effects);
  if (def.type === 'unit') gives.add('shots');
  if (def.type === 'gate') {
    wants.add('shots');
    gives.add('gates');
  }
  if (def.echo || def.triggers?.some((t) => t.link)) gives.add('links');
  for (const e of all) {
    if (e.do === 'volley' && e.tokensOnly) wants.add('roadies');
    else if (e.do === 'volley' || e.do === 'selfFire') wants.add('units');
    if (e.do === 'roadie') gives.add('roadies');
    if (e.do === 'repairGates') wants.add('gates');
    if (e.do === 'ifChain') wants.add('links');
    if (e.do === 'gainEnergy') gives.add('energy');
  }
  if (def.triggers?.some((t) => t.when === 'chainGrow')) wants.add('links');
  if (def.type === 'unit' && def.unit!.fireEvery === 1) gives.add('many-shots');
  if (def.type === 'gate' && def.gate!.kind === 'copy') wants.add('many-shots');
  if (def.cost >= 3) wants.add('energy');
  return { gives, wants };
}

const WHY: Record<string, string> = {
  shots: 'its shots go through the gate',
  'many-shots': 'fast shots multiply',
  roadies: 'more Squires to work with',
  gates: 'keeps the gates going',
  links: 'chain links power it',
  units: 'more units, more shots',
  energy: 'energy to cast it',
};

/** Pairs of different cards in the deck that feed each other, strongest reasons first, at most 12. */
export function synergies(cards: readonly string[]): Synergy[] {
  const ids = [...new Set(cards)];
  const out: Synergy[] = [];
  const priority = ['roadies', 'links', 'many-shots', 'gates', 'units', 'shots', 'energy'];
  for (const reason of priority) {
    for (const a of ids) {
      for (const b of ids) {
        if (a === b) continue;
        if (!tags(getCard(a)).gives.has(reason) || !tags(getCard(b)).wants.has(reason)) continue;
        if (out.some((s) => (s.a === a && s.b === b) || (s.a === b && s.b === a))) continue;
        // Generic pairings (any unit with any gate) only count for signature or rare cards, so the list stays useful.
        const special = ['shots', 'units', 'energy'].includes(reason) ? getCard(a).headliner || getCard(b).headliner || getCard(b).rarity === 'rare' : true;
        if (special) out.push({ a, b, why: WHY[reason]! });
      }
    }
  }
  return out.slice(0, 12);
}

/** Plain-text summary of a card for the Workshop's detail line. */
export function cardSummary(id: string, collection: Collection): string {
  const def = getCard(id);
  const h = collection.history[id];
  const record = h && h.runs > 0 ? ` Played in ${h.runs} run${h.runs === 1 ? '' : 's'}, ${Math.round((h.shareSum / h.runs) * 100)}% of damage on average${h.wins ? `, ${h.wins} Tour win${h.wins === 1 ? '' : 's'}` : ''}${h.bestWave ? `, best Encore wave ${h.bestWave}` : ''}.` : ' Not played yet.';
  return `${cardText(def)}${record}`;
}
