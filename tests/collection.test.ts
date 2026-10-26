import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, ofTypeSafe } from './collection-helpers';
import { STARTER_DECKS } from '../src/content/cards';
import {
  DECK_MAX,
  DECK_MIN,
  deckProblems,
  deckStats,
  emptyCollection,
  EVOLVE_LEVEL,
  levelFor,
  levelProgress,
  newDeck,
  normalizeCollection,
  recordRunInCollection,
  synergies,
} from '../src/meta/collection';
import { step } from '../src/engine';

test('a new Collection: every headliner at level 1, the starter cards unlocked, no decks', () => {
  const c = emptyCollection();
  assert.equal(levelFor(c.headliners.thrum.xp), 1);
  for (const deck of Object.values(STARTER_DECKS)) for (const id of deck) assert.ok(c.unlocked.includes(id));
  assert.ok(!c.unlocked.includes('blast-beat'));
  assert.equal(c.decks.length, 0);
});

test('levels: 100, 250, 450 and 700 XP; evolution opens at level 3', () => {
  assert.deepEqual([0, 99, 100, 249, 250, 449, 450, 699, 700, 5000].map(levelFor), [1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
  assert.deepEqual(levelProgress(150), [50, 150]);
  assert.equal(levelProgress(700), null);
  assert.equal(EVOLVE_LEVEL, 3);
});

test('a finished run gives XP, unlocks what you picked, and records card history', () => {
  const s = createState({ seed: 'record' });
  s.wave.index = 12;
  s.draw.push({ iid: 9_999, cardId: 'blast-beat' });
  s.stats.damageBySource = { stagehand: 300, 'blast-beat': 100 };
  const r = recordRunInCollection(emptyCollection(), s);
  assert.equal(r.xp, 120);
  assert.equal(r.levelAfter, 2);
  assert.deepEqual(r.newlyUnlocked, ['blast-beat']);
  assert.ok(r.collection.unlocked.includes('blast-beat'));
  const h = r.collection.history.stagehand!;
  assert.equal(h.runs, 1);
  assert.equal(h.shareSum, 0.75);
  assert.equal(h.bestWave, 12);
});

test("deck rules: 20–30 cards, 2 copies max, only your headliner's signature cards, unlocked only", () => {
  const c = emptyCollection();
  const deck = newDeck(c, 'thrum');
  assert.equal(deck.cards.length, 12);
  assert.ok(deckProblems(deck, c).some((p) => p.includes('more card')));
  deck.cards = [...STARTER_DECKS.thrum, ...STARTER_DECKS.thrum].slice(0, 22);
  assert.ok(deckProblems(deck, c).some((p) => p.includes('Only 2 copies')), deckProblems(deck, c).join(' | '));
  const ok = { ...deck, cards: [...new Set(STARTER_DECKS.thrum)].flatMap((id) => [id, id]).slice(0, DECK_MIN) };
  while (ok.cards.length < DECK_MIN) ok.cards.push('pyro');
  c.unlocked.push('pyro');
  assert.deepEqual(deckProblems({ ...ok, cards: ok.cards.slice(0, DECK_MIN) }, c).filter((p) => !p.includes('Only 2')), []);
  assert.ok(deckProblems({ ...ok, cards: [...ok.cards, 'arpeggiator'] }, c).some((p) => p.includes("Lyra's card")));
  assert.ok(deckProblems({ ...ok, cards: [...ok.cards, 'blast-beat'] }, emptyCollection()).some((p) => p.includes('unlocked')));
  assert.ok(deckProblems({ ...ok, cards: Array.from({ length: DECK_MAX + 1 }, () => 'stagehand') }, c).some((p) => p.includes('too many')));
});

test('deck stats: cost curve, card types, keywords and synergy links', () => {
  const stats = deckStats(['stagehand', 'stagehand', 'double-stop', 'power-chord', 'load-in', 'stage-dive']);
  assert.equal(stats.curve[1], 2);
  assert.equal(stats.types.unit, 2);
  assert.equal(stats.types.gate, 1);
  assert.equal(stats.keywords.roadie, 2);
  assert.ok(stats.synergies.some((x) => x.a === 'load-in' && x.b === 'stage-dive'), JSON.stringify(stats.synergies));
  assert.ok(synergies(['arpeggiator', 'harmonizer']).some((x) => x.a === 'arpeggiator' && x.b === 'harmonizer'));
});

test('an older or damaged save loads as a valid Collection', () => {
  const c = normalizeCollection({ headliners: { thrum: { xp: 300, evolution: 1 } } as never, unlocked: ['blast-beat', 'not-a-card'] });
  assert.equal(c.headliners.thrum.xp, 300);
  assert.equal(c.headliners.thrum.evolution, 1);
  assert.equal(c.headliners.lyra.xp, 0);
  assert.ok(c.unlocked.includes('blast-beat') && !c.unlocked.includes('not-a-card'));
  assert.deepEqual(normalizeCollection(null), emptyCollection());
});

test('Encore applies the Collection evolution after wave 5 without asking', () => {
  const s = createState({ seed: 'preset', evolution: 1 });
  s.wave.index = 5;
  s.wave.startBeat = s.clock.beat - 100;
  const evolved = [];
  for (let t = 0; t < 200; t++) evolved.push(...ofTypeSafe(step(s), 'evolved'));
  assert.equal(evolved[0]?.evolution, 'polyrhythm');
  assert.equal(s.phase, 'playing');
  assert.equal(s.wave.index, 6);
});
