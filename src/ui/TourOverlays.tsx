import { useEffect, useState } from 'react';
import {
  deckCards,
  getCard,
  HEADLINERS,
  reachable,
  TOUR_ACTS,
  TOUR_REST_HEAL,
  TOUR_SHOP_HEAL,
  TOUR_SHOP_HEAL_PRICE,
  TOUR_SHOP_REMOVE_PRICE,
  type EngineState,
  type TourNodeKind,
} from '../engine';
import { TOUR_EVENTS } from '../content/events';
import { cardText } from '../content/text';
import { CardTile } from './CardTile';
import { formatNumber } from './format';

/** Ignore taps for a moment when a screen opens, so a tap meant for the last screen can't choose here. */
const LOCKOUT_MS = 600;

function useArmed(): boolean {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setArmed(true), LOCKOUT_MS);
    return () => window.clearTimeout(id);
  }, []);
  return armed;
}

const STOP_LABEL: Record<TourNodeKind, string> = {
  fight: 'Show',
  elite: 'Tournament',
  draft: 'Draft',
  rest: 'Inn',
  shop: 'Market',
  event: 'Event',
  boss: 'Boss',
};

/** A small pixel mark per stop kind, drawn in CSS (no icon font needed). */
function StopMark({ kind }: { kind: TourNodeKind }) {
  return <span className={`stop-mark stop-${kind}`} aria-hidden="true" />;
}

function TourStatus({ state }: { state: EngineState }) {
  const tour = state.tour!;
  return (
    <p className="tour-status">
      <span>
        Crowd <b>{state.crowd}</b>/{state.maxCrowd}
      </span>
      <span>
        Coin <b>{tour.merch}</b>
      </span>
      <span>
        Deck <b>{deckCards(state).length + state.units.filter((u) => !u.token).length + state.gates.length + state.amps.length}</b>
      </span>
    </p>
  );
}

export function MapOverlay({ state, onTravel }: { state: EngineState; onTravel: (node: number) => void }) {
  const armed = useArmed();
  const tour = state.tour!;
  const next = new Set(reachable(state));
  const visited = new Set(tour.visited ?? []);
  const rows = [5, 4, 3, 2, 1];
  const pos = (row: number, col: number) => ({ x: ((col + 0.5) / 3) * 100, y: ((5 - row + 0.5) / 5) * 100 });
  return (
    <div className={`overlay map-overlay${armed ? '' : ' arming'}`} role="dialog" aria-modal="true" aria-label="Tour map">
      <div className="overlay-top">
        <h2 className="title small">
          Act {tour.act} of {TOUR_ACTS}
        </h2>
        <TourStatus state={state} />
      </div>
      <div className="tour-map">
        <svg className="tour-links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {tour.nodes.flatMap((n) =>
            n.next.map((id) => {
              const m = tour.nodes.find((x) => x.id === id)!;
              const a = pos(n.row, n.col);
              const b = pos(m.row, m.col);
              const walked = visited.has(n.id) && visited.has(m.id);
              return <line key={`${n.id}-${id}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={walked ? 'walked' : ''} vectorEffect="non-scaling-stroke" />;
            }),
          )}
        </svg>
        {rows.map((row) =>
          tour.nodes
            .filter((n) => n.row === row)
            .map((n) => {
              const p = pos(n.row, n.col);
              const open = next.has(n.id);
              return (
                <button
                  key={n.id}
                  className={`stop${open ? ' open' : ''}${visited.has(n.id) ? ' visited' : ''}${tour.at === n.id ? ' here' : ''}`}
                  style={{ left: `${p.x}%`, top: `${p.y}%` }}
                  disabled={!open || !armed}
                  onClick={() => armed && open && onTravel(n.id)}
                  aria-label={`${STOP_LABEL[n.kind]}${open ? ', you can go here' : ''}`}
                >
                  <StopMark kind={n.kind} />
                  <span>{STOP_LABEL[n.kind]}</span>
                </button>
              );
            }),
        )}
      </div>
    </div>
  );
}

/** Choose a card from your deck (to cut at a rest stop or remove at a shop). */
function DeckPicker({ state, verb, onChoose, onCancel }: { state: EngineState; verb: string; onChoose: (iid: number) => void; onCancel: () => void }) {
  const [chosen, setChosen] = useState<number | null>(null);
  const cards = deckCards(state).slice().sort((a, b) => getCard(a.cardId).name.localeCompare(getCard(b.cardId).name));
  const chosenCard = cards.find((c) => c.iid === chosen);
  return (
    <>
      <div className="deck-grid">
        {cards.map((c) => (
          <CardTile key={c.iid} def={getCard(c.cardId)} selected={chosen === c.iid} activateOn="click" onSelect={() => setChosen(c.iid)} />
        ))}
      </div>
      <button className="primary-btn" disabled={!chosenCard || cards.length <= 6} onClick={() => chosenCard && onChoose(chosenCard.iid)}>
        {cards.length <= 6 ? 'Deck is as small as it gets' : chosenCard ? `${verb} ${getCard(chosenCard.cardId).name}` : 'Choose a card'}
      </button>
      <button className="secondary-btn" onClick={onCancel}>
        Back
      </button>
    </>
  );
}

export function RestOverlay({ state, onRest }: { state: EngineState; onRest: (choice: 'heal' | 'cut', iid?: number) => void }) {
  const armed = useArmed();
  const [cutting, setCutting] = useState(false);
  return (
    <div className={`overlay${armed ? '' : ' arming'}`} role="dialog" aria-modal="true" aria-label="Inn">
      <div className="overlay-top">
        <h2 className="title small">The inn</h2>
        <TourStatus state={state} />
        <p className="lede">{cutting ? 'Which card leaves the band?' : 'A quiet night. Recover, or tighten up the set.'}</p>
      </div>
      <div className="overlay-controls">
        {cutting ? (
          <DeckPicker state={state} verb="Cut" onChoose={(iid) => onRest('cut', iid)} onCancel={() => setCutting(false)} />
        ) : (
          <>
            <button className="primary-btn" disabled={!armed || state.crowd >= state.maxCrowd} onClick={() => armed && onRest('heal')}>
              Rest: +{TOUR_REST_HEAL} crowd
            </button>
            <button className="secondary-btn" disabled={!armed} onClick={() => armed && setCutting(true)}>
              Cut a card from your deck
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function ShopOverlay({
  state,
  onShop,
}: {
  state: EngineState;
  onShop: (a: { action: 'buy'; index: number } | { action: 'remove'; iid: number } | { action: 'heal' } | { action: 'leave' }) => void;
}) {
  const armed = useArmed();
  const tour = state.tour!;
  const shop = tour.shop!;
  const [chosen, setChosen] = useState<number | null>(null);
  const [removing, setRemoving] = useState(false);
  const item = chosen === null ? null : shop.cards[chosen];
  return (
    <div className={`overlay${armed ? '' : ' arming'}`} role="dialog" aria-modal="true" aria-label="Market">
      <div className="overlay-top">
        <h2 className="title small">Market</h2>
        <TourStatus state={state} />
      </div>
      <div className="overlay-controls">
        {removing ? (
          <DeckPicker
            state={state}
            verb={`Remove (${TOUR_SHOP_REMOVE_PRICE})`}
            onChoose={(iid) => {
              onShop({ action: 'remove', iid });
              setRemoving(false);
            }}
            onCancel={() => setRemoving(false)}
          />
        ) : (
          <>
            <div className="shop-row">
              {shop.cards.map((c, i) => (
                <div key={c.cardId + i} className={`shop-item${c.sold ? ' sold' : ''}`}>
                  <CardTile def={getCard(c.cardId)} selected={chosen === i} activateOn="click" onSelect={() => armed && !c.sold && setChosen(i)} />
                  <span className="price">{c.sold ? 'Sold' : c.price}</span>
                </div>
              ))}
            </div>
            <p className="shop-info">{item ? cardText(getCard(item.cardId)) : 'Tap a card to read it.'}</p>
            <button
              className="primary-btn"
              disabled={!armed || !item || item.sold || tour.merch < item.price}
              onClick={() => {
                if (chosen === null) return;
                onShop({ action: 'buy', index: chosen });
                setChosen(null);
              }}
            >
              {item && !item.sold ? (tour.merch < item.price ? `Need ${item.price} coin` : `Buy ${getCard(item.cardId).name} for ${item.price}`) : 'Choose a card'}
            </button>
            <div className="shop-extras">
              <button className="secondary-btn" disabled={!armed || shop.removed || tour.merch < TOUR_SHOP_REMOVE_PRICE} onClick={() => setRemoving(true)}>
                Remove a card ({TOUR_SHOP_REMOVE_PRICE})
              </button>
              <button className="secondary-btn" disabled={!armed || shop.healed || tour.merch < TOUR_SHOP_HEAL_PRICE || state.crowd >= state.maxCrowd} onClick={() => onShop({ action: 'heal' })}>
                +{TOUR_SHOP_HEAL} crowd ({TOUR_SHOP_HEAL_PRICE})
              </button>
            </div>
            <button className="secondary-btn" disabled={!armed} onClick={() => onShop({ action: 'leave' })}>
              Back on the road
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function EventOverlay({ state, onChoose }: { state: EngineState; onChoose: (option: 0 | 1) => void }) {
  const armed = useArmed();
  const def = TOUR_EVENTS.find((e) => e.id === state.tour?.event);
  if (!def) return null;
  return (
    <div className={`overlay${armed ? '' : ' arming'}`} role="dialog" aria-modal="true" aria-label={def.title}>
      <div className="overlay-top">
        <h2 className="title small">{def.title}</h2>
        <TourStatus state={state} />
        <p className="lede">{def.text}</p>
      </div>
      <div className="overlay-controls">
        {def.options.map((o, i) => (
          <button key={o.label} className={i === 0 ? 'primary-btn event-btn' : 'secondary-btn event-btn'} disabled={!armed} onClick={() => armed && onChoose(i as 0 | 1)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function TourEndOverlay({ state, onAgain, progress }: { state: EngineState; onAgain: () => void; progress?: string }) {
  const tour = state.tour!;
  const won = state.phase === 'won';
  const names = (state.headliner.team ?? [state.headliner.id]).map((id) => HEADLINERS[id].name);
  const who = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0]!;
  return (
    <div className="overlay over" role="dialog" aria-modal="true" aria-label={won ? 'Tour complete' : 'Tour over'}>
      <div className="overlay-top">
        <h2 className="title small">{won ? 'Tour complete!' : 'The wagon broke an axle'}</h2>
        <p className="lede">
          {won ? `${who} played all ${TOUR_ACTS} acts and beat every boss.` : `${who} made it to act ${tour.act}.`}
        </p>
        {progress && <p className="run-progress">{progress}</p>}
        <dl className="run-stats">
          <div>
            <dt>Stops</dt>
            <dd>{tour.cleared}</dd>
          </div>
          <div>
            <dt>Score</dt>
            <dd>{formatNumber(state.score)}</dd>
          </div>
          <div>
            <dt>Best chain</dt>
            <dd>{state.stats.bestChain}</dd>
          </div>
        </dl>
      </div>
      <div className="overlay-controls">
        <button className="primary-btn" onClick={onAgain}>
          New tour
        </button>
      </div>
    </div>
  );
}
