import { useState } from 'react';
import { CARDS } from '../content/cards';
import { cardText, KEYWORD_TEXT } from '../content/text';
import { HEADLINERS, type CardDef } from '../engine';
import { TYPE_COLOR, TYPE_LABEL } from './CardTile';

type Tab = 'deck' | CardDef['type'];
const TYPES: CardDef['type'][] = ['unit', 'gate', 'riff', 'amp'];
const PLURAL: Record<CardDef['type'], string> = { unit: 'Units', gate: 'Gates', riff: 'Riffs', amp: 'Amps' };
const TYPE_BLURB: Record<CardDef['type'], string> = {
  unit: 'Band members. They stand on the stage and fire up their lane on their own.',
  gate: 'Set mid-lane. Every shot that passes through is changed. They wear out.',
  riff: 'One-off plays that happen on the beat.',
  amp: 'Stay in play and change the rules. Two at a time.',
};

/**
 * The Songbook (S4.6): every card and what it does, grouped and coloured by type.
 * Opens from the home menu and from Pause. In a run, it starts on the cards in your deck.
 */
export function SongbookOverlay({ deck, onClose }: { deck?: string[]; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>(deck && deck.length ? 'deck' : 'unit');
  const [open, setOpen] = useState<string | null>(null);
  const inDeck = new Set(deck ?? []);
  const shown = CARDS.filter((c) => (tab === 'deck' ? inDeck.has(c.id) : c.type === tab && (c.rarity !== 'token' || c.id === 'roadie'))).sort(
    (a, b) => TYPES.indexOf(a.type) - TYPES.indexOf(b.type) || a.cost - b.cost || a.name.localeCompare(b.name),
  );
  return (
    <div className="overlay collection songbook" role="dialog" aria-modal="true" aria-label="Songbook">
      <div className="overlay-top">
        <h2 className="title small">Songbook</h2>
        <div className="tabs songbook-tabs" role="tablist">
          {deck && deck.length > 0 && (
            <button role="tab" aria-selected={tab === 'deck'} className={`tab${tab === 'deck' ? ' on' : ''}`} onClick={() => setTab('deck')}>
              Your deck
            </button>
          )}
          {TYPES.map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className={`tab type-tab type-${t}${tab === t ? ' on' : ''}`} style={{ ['--accent' as string]: TYPE_COLOR[t] }} onClick={() => setTab(t)}>
              <span className={`type-badge type-${t}`} aria-hidden="true" />
              {PLURAL[t]}
            </button>
          ))}
        </div>
        {tab !== 'deck' && <p className="muted songbook-blurb">{TYPE_BLURB[tab]}</p>}
      </div>
      <div className="collection-body">
        <ul className="songbook-list">
          {shown.map((c) => (
            <li key={c.id} className={`song type-${c.type}`} style={{ ['--accent' as string]: TYPE_COLOR[c.type] }}>
              <button className="song-head" aria-expanded={open === c.id} onClick={() => setOpen(open === c.id ? null : c.id)}>
                <span className="card-row-cost">{c.cost}</span>
                <span className={`type-badge type-${c.type}`} aria-label={TYPE_LABEL[c.type]} />
                <span className="song-name">{c.name}</span>
                {c.headliner && <span className={`song-who hl-${c.headliner}`}>{HEADLINERS[c.headliner].name}</span>}
              </button>
              <p className="song-text">{cardText(c)}</p>
              {open === c.id && (
                <div className="song-more">
                  {[...new Set(c.keywords)].map((k) => (
                    <p key={k}>{KEYWORD_TEXT[k]}</p>
                  ))}
                  {c.flavor && <p className="muted">“{c.flavor}”</p>}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
      <div className="overlay-controls compact">
        <button className="primary-btn" onClick={onClose}>
          Close the book
        </button>
      </div>
    </div>
  );
}
