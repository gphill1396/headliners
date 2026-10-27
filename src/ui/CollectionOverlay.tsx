import { KEYWORD_TEXT } from '../content/text';
import type { Keyword } from '../engine/types';
import { useRef, useState } from 'react';
import { CARDS, getCard, HEADLINERS, type HeadlinerId } from '../engine';
import {
  cardSummary,
  countCards,
  DECK_MAX,
  DECK_MIN,
  deckProblems,
  deckStats,
  eligibleCards,
  EVOLVE_LEVEL,
  levelFor,
  levelProgress,
  MAX_COPIES,
  MAX_DECKS,
  MAX_LEVEL,
  newDeck,
  RE_EVOLVE_LEVEL,
  type Collection,
  type DeckList,
} from '../meta/collection';
import { exportSave, parseSave, restoreSave } from './storage';

type Tab = 'headliners' | 'workshop' | 'cards' | 'backup';
const TAB_LABEL: Record<Tab, string> = { headliners: 'Band', workshop: 'Workshop', cards: 'Cards', backup: 'Backup' };
const IDS = Object.keys(HEADLINERS) as HeadlinerId[];

/** The Collection (SPEC §5, S2.2): headliner levels, the Workshop deck builder, card history and save backups. */
export function CollectionOverlay({
  collection,
  onChange,
  onClose,
  startTab = 'headliners',
}: {
  collection: Collection;
  onChange: (c: Collection) => void;
  onClose: () => void;
  /** Which tab opens first ('workshop' from the home menu's Decks). */
  startTab?: 'headliners' | 'workshop' | 'cards' | 'backup';
}) {
  const [tab, setTab] = useState<Tab>(startTab);
  const [editing, setEditing] = useState<DeckList | null>(null);
  if (editing) {
    return (
      <DeckEditor
        collection={collection}
        deck={editing}
        onSave={(deck) => {
          const decks = collection.decks.some((d) => d.id === deck.id) ? collection.decks.map((d) => (d.id === deck.id ? deck : d)) : [...collection.decks, deck];
          onChange({ ...collection, decks });
          setEditing(null);
        }}
        onDelete={(deck) => {
          onChange({ ...collection, decks: collection.decks.filter((d) => d.id !== deck.id) });
          setEditing(null);
        }}
        onCancel={() => setEditing(null)}
      />
    );
  }
  return (
    <div className="overlay collection" role="dialog" aria-modal="true" aria-label="Collection">
      <div className="overlay-top">
        <h2 className="title small">Collection</h2>
        <div className="tabs" role="tablist">
          {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className={`tab${tab === t ? ' on' : ''}`} onClick={() => setTab(t)}>
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>
      </div>
      <div className="collection-body">
        {tab === 'headliners' && <BandTab collection={collection} onChange={onChange} />}
        {tab === 'workshop' && <WorkshopTab collection={collection} onEdit={setEditing} />}
        {tab === 'cards' && <CardsTab collection={collection} />}
        {tab === 'backup' && <BackupTab />}
      </div>
      <div className="overlay-controls compact">
        <button className="primary-btn" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}

function BandTab({ collection, onChange }: { collection: Collection; onChange: (c: Collection) => void }) {
  const choose = (id: HeadlinerId, evolution: 0 | 1) => onChange({ ...collection, headliners: { ...collection.headliners, [id]: { ...collection.headliners[id], evolution } } });
  return (
    <div className="band">
      {IDS.map((id) => {
        const h = HEADLINERS[id];
        const p = collection.headliners[id];
        const level = levelFor(p.xp);
        const prog = levelProgress(p.xp);
        const canChoose = level >= EVOLVE_LEVEL && (p.evolution === null || level >= RE_EVOLVE_LEVEL);
        return (
          <section key={id} className={`band-member hl-${id}`}>
            <p className="headliner-name">
              {h.name} <span className="muted">level {level}{p.heat !== undefined ? ` · Tour won at Heat ${p.heat}` : ''}</span>
            </p>
            <div className="xp-bar" aria-label={prog ? `${prog[0]} of ${prog[1]} XP to level ${level + 1}` : 'Max level'}>
              <span style={{ width: `${prog ? (100 * prog[0]) / prog[1] : 100}%` }} />
            </div>
            <p className="muted small">{prog ? `${prog[1] - prog[0]} XP to level ${level + 1}` : `Level ${MAX_LEVEL}, the top.`}</p>
            {p.evolution !== null && <p>Encore evolution: <strong>{h.evolutions[p.evolution].name}</strong></p>}
            {canChoose ? (
              <div className="evolve-pick">
                {h.evolutions.map((e, i) => (
                  <button key={e.id} className={`hl-chip${p.evolution === i ? ' on' : ''}`} onClick={() => choose(id, i as 0 | 1)}>
                    {e.name}
                  </button>
                ))}
              </div>
            ) : (
              level < EVOLVE_LEVEL && <p className="muted small">At level {EVOLVE_LEVEL}, choose an evolution for good. Encore then uses it after wave 5. Tours still choose fresh.</p>
            )}
          </section>
        );
      })}
    </div>
  );
}

function WorkshopTab({ collection, onEdit }: { collection: Collection; onEdit: (d: DeckList) => void }) {
  const [makingFor, setMakingFor] = useState(false);
  return (
    <div className="workshop">
      {collection.decks.length === 0 && <p className="muted">No decks yet. Start one from a headliner's starter deck and build it up to {DECK_MIN}–{DECK_MAX} cards.</p>}
      {collection.decks.map((d) => {
        const problems = deckProblems(d, collection);
        return (
          <button key={d.id} className={`deck-row hl-${d.headliner}`} onClick={() => onEdit(d)}>
            <span className="deck-name">{d.name}</span>
            <span className="muted">
              {HEADLINERS[d.headliner].name} · {d.cards.length} cards
            </span>
            <span className={problems.length ? 'deck-bad' : 'deck-ok'}>{problems.length ? 'Not ready' : 'Ready'}</span>
          </button>
        );
      })}
      {collection.decks.length < MAX_DECKS &&
        (makingFor ? (
          <div className="hl-picker">
            {IDS.map((id) => (
              <button key={id} className={`hl-chip hl-${id}`} onClick={() => onEdit(newDeck(collection, id))}>
                {HEADLINERS[id].name}
              </button>
            ))}
          </div>
        ) : (
          <button className="secondary-btn" onClick={() => setMakingFor(true)}>
            New deck ({collection.decks.length}/{MAX_DECKS})
          </button>
        ))}
    </div>
  );
}

function DeckEditor({
  collection,
  deck: start,
  onSave,
  onDelete,
  onCancel,
}: {
  collection: Collection;
  deck: DeckList;
  onSave: (d: DeckList) => void;
  onDelete: (d: DeckList) => void;
  onCancel: () => void;
}) {
  const [deck, setDeck] = useState<DeckList>(start);
  const [filter, setFilter] = useState<'deck' | 'all'>('all');
  const [focus, setFocus] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const counts = countCards(deck.cards);
  const stats = deckStats(deck.cards);
  const problems = deckProblems(deck, collection);
  const unlocked = new Set(collection.unlocked);
  const cards = eligibleCards(deck.headliner)
    .filter((c) => filter === 'all' || (counts[c.id] ?? 0) > 0)
    .sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name));
  const add = (id: string) => (counts[id] ?? 0) < MAX_COPIES && deck.cards.length < DECK_MAX && setDeck({ ...deck, cards: [...deck.cards, id] });
  const remove = (id: string) => {
    const i = deck.cards.lastIndexOf(id);
    if (i !== -1) setDeck({ ...deck, cards: deck.cards.filter((_, j) => j !== i) });
  };
  const maxCurve = Math.max(1, ...stats.curve);
  const exists = collection.decks.some((d) => d.id === deck.id);
  return (
    <div className={`overlay collection hl-${deck.headliner}`} role="dialog" aria-modal="true" aria-label="Workshop">
      <div className="overlay-top">
        <input className="deck-title" value={deck.name} maxLength={28} aria-label="Deck name" onChange={(e) => setDeck({ ...deck, name: e.target.value })} />
        <p className="muted">
          {HEADLINERS[deck.headliner].name} · <b className={deck.cards.length < DECK_MIN || deck.cards.length > DECK_MAX ? 'deck-bad' : 'deck-ok'}>{deck.cards.length}</b> cards ({DECK_MIN}–{DECK_MAX}) · average cost{' '}
          {stats.averageCost.toFixed(1)}
        </p>
        <div className="deck-stats">
          <div className="curve" aria-label="Cost curve">
            {stats.curve.map((n, cost) => (
              <span key={cost} className="curve-col">
                <span className="curve-bar" style={{ height: `${(100 * n) / maxCurve}%` }} />
                <span className="curve-n">{cost === 7 ? '7+' : cost}</span>
              </span>
            ))}
          </div>
          <div className="deck-types">
            <span>Units {stats.types.unit}</span>
            <span>Gates {stats.types.gate}</span>
            <span>Riffs {stats.types.riff}</span>
            <span>Amps {stats.types.amp}</span>
            {Object.entries(stats.keywords)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 4)
              .map(([k, n]) => (
                <span key={k} className="muted">
                  {(KEYWORD_TEXT[k as Keyword] ?? k).split(':')[0]} {n}
                </span>
              ))}
          </div>
        </div>
        {stats.synergies.length > 0 && (
          <p className="synergies">
            {stats.synergies.slice(0, 3).map((s) => (
              <span key={s.a + s.b}>
                {getCard(s.a).name} → {getCard(s.b).name}: {s.why}
              </span>
            ))}
          </p>
        )}
      </div>
      <div className="collection-body">
        <div className="tabs small">
          <button className={`tab${filter === 'all' ? ' on' : ''}`} onClick={() => setFilter('all')}>
            All cards
          </button>
          <button className={`tab${filter === 'deck' ? ' on' : ''}`} onClick={() => setFilter('deck')}>
            In deck
          </button>
        </div>
        {focus && <p className="card-detail">{cardSummary(focus, collection)}</p>}
        <ul className="card-rows">
          {cards.map((c) => {
            const n = counts[c.id] ?? 0;
            const locked = !unlocked.has(c.id);
            return (
              <li key={c.id} className={`card-row${locked ? ' locked' : ''}${n > 0 ? ' in' : ''}`}>
                <button className="card-row-name" onClick={() => setFocus(focus === c.id ? null : c.id)}>
                  <span className="card-row-cost">{c.cost}</span>
                  {c.name}
                  {c.headliner && <span className={`card-sig inline hl-${c.headliner}`} />}
                  {locked && <span className="muted"> · locked</span>}
                </button>
                <span className="card-row-count">{n > 0 ? `×${n}` : ''}</span>
                <button className="step-btn" disabled={n === 0} onClick={() => remove(c.id)} aria-label={`Remove ${c.name}`}>
                  −
                </button>
                <button className="step-btn" disabled={locked || n >= MAX_COPIES || deck.cards.length >= DECK_MAX} onClick={() => add(c.id)} aria-label={`Add ${c.name}`}>
                  +
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="overlay-controls compact">
        {problems.length > 0 && <p className="deck-bad small">{problems[0]}</p>}
        <button className="primary-btn" onClick={() => onSave(deck)}>
          {problems.length ? 'Save draft' : 'Save deck'}
        </button>
        <div className="shop-extras">
          <button className="secondary-btn" onClick={onCancel}>
            Back
          </button>
          {exists && (
            <button className="secondary-btn" onClick={() => (confirmDelete ? onDelete(deck) : setConfirmDelete(true))}>
              {confirmDelete ? 'Tap again to delete' : 'Delete deck'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function CardsTab({ collection }: { collection: Collection }) {
  const [focus, setFocus] = useState<string | null>(null);
  const unlocked = new Set(collection.unlocked);
  const groups: [string, typeof CARDS][] = [
    ['Neutral', CARDS.filter((c) => !c.headliner && c.rarity !== 'token')],
    ...IDS.map((id) => [HEADLINERS[id].name, CARDS.filter((c) => c.headliner === id && c.rarity !== 'token')] as [string, typeof CARDS]),
  ];
  const total = CARDS.filter((c) => c.rarity !== 'token').length;
  return (
    <div>
      <p className="muted">
        {collection.unlocked.length} of {total} cards unlocked. Take a card in a run (a pick, the shop or an event) to unlock it.
      </p>
      {focus && <p className="card-detail">{cardSummary(focus, collection)}</p>}
      {groups.map(([name, cards]) => (
        <section key={name}>
          <h3 className="group-title">{name}</h3>
          <ul className="card-rows">
            {cards.map((c) => (
              <li key={c.id} className={`card-row${unlocked.has(c.id) ? '' : ' locked'}`}>
                <button className="card-row-name" onClick={() => setFocus(focus === c.id ? null : c.id)}>
                  <span className="card-row-cost">{c.cost}</span>
                  {c.name}
                  {!unlocked.has(c.id) && <span className="muted"> · locked</span>}
                </button>
                <span className="card-row-count muted">{collection.history[c.id]?.runs ? `${collection.history[c.id]!.runs} runs` : ''}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function BackupTab() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Record<string, string> | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const download = () => {
    const blob = new Blob([exportSave()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `headliners-save-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setMessage('Saved a backup file.');
  };
  return (
    <div className="backup">
      <p className="muted">Your Collection, settings, bests and any run in progress live on this device. Keep a backup file somewhere safe.</p>
      <button className="secondary-btn" onClick={download}>
        Export a backup
      </button>
      <button className="secondary-btn" onClick={() => fileRef.current?.click()}>
        Restore from a backup
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const result = parseSave(await file.text());
          if ('error' in result) {
            setPending(null);
            setMessage(result.error);
          } else {
            setPending(result.data);
            setMessage(null);
          }
        }}
      />
      {pending && (
        <button
          className="primary-btn"
          onClick={() => {
            restoreSave(pending);
            window.location.reload();
          }}
        >
          Replace this device's save
        </button>
      )}
      {message && <p>{message}</p>}
    </div>
  );
}
