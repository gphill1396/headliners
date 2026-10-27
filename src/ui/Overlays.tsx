import { useEffect, useRef, useState } from 'react';
import { drawAnim, PORTRAITS } from '../render/portraits';
import { getCard, HEADLINERS, type EngineState, type HeadlinerId } from '../engine';
import { CardTile } from './CardTile';
import { formatNumber } from './format';
import type { Bests, GameMode, Settings } from './storage';
import type { DailyResult } from '../meta/daily';
import { HEAT_RULES } from '../content/heat';

/** A headliner's animated portrait (only those drawn at the new art bar so far). Plays its frames at a steady 120 bpm. */
function Portrait({ headliner }: { headliner: HeadlinerId }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const art = PORTRAITS[headliner];
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !art) return;
    let frame = 0;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawAnim(ctx, art, frame, 0, 0, 1);
      frame += 1;
    };
    draw();
    const id = window.setInterval(draw, 250);
    return () => window.clearInterval(id);
  }, [art]);
  if (!art) return null;
  const rows = art.frames[0]!;
  return <canvas ref={ref} className="portrait" width={rows[0]!.length} height={rows.length} aria-hidden="true" />;
}

/** How long a hold takes to confirm something that ends a saved run. */
const HOLD_MS = 1000;

/**
 * A button that only fires after a press and hold (S4.4), for actions that would lose a run.
 * Keyboard users confirm with Enter or Space as usual.
 */
export function HoldButton({ className, label, onConfirm, disabled }: { className: string; label: string; onConfirm: () => void; disabled?: boolean }) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const cancel = () => {
    window.clearTimeout(timer.current);
    setHolding(false);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <button
      className={`${className} hold-btn${holding ? ' holding' : ''}`}
      style={{ ['--hold-ms' as string]: `${HOLD_MS}ms` }}
      disabled={disabled}
      aria-label={`${label} (press and hold)`}
      onPointerDown={(e) => {
        e.preventDefault();
        setHolding(true);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => {
          setHolding(false);
          onConfirm();
        }, HOLD_MS);
      }}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
      onClick={(e) => {
        // A real click from a keyboard (no pointer) confirms straight away.
        if (e.detail === 0) onConfirm();
      }}
    >
      <span className="hold-fill" aria-hidden="true" />
      <span className="hold-label">{label}</span>
      <span className="hold-hint" aria-hidden="true">
        {holding ? 'keep holding' : 'hold'}
      </span>
    </button>
  );
}

/** True once `ms` have passed since mount: menus that open mid-play ignore stray taps until then. */
function useArmed(ms: number): boolean {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setArmed(true), ms);
    return () => window.clearTimeout(id);
  }, [ms]);
  return armed;
}

const MODE_NAME = { encore: 'Encore', tour: 'Tour', daily: 'Daily' } as const;

/** One line per mode, under the mode picker: what you're signing up for. */
const MODE_BLURB = {
  encore: 'Endless waves with one headliner. Play until the crowd goes home; chase your best wave.',
  tour: 'A band of 3 across 3 acts: shows, markets, inns, and a boss at the end of each. Win it, or lose it.',
  daily: "Today's band and waves, the same for everyone. Your first run is scored; then it's practice.",
} as const;

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span className="toggle-track" aria-hidden="true" />
      <span>{label}</span>
    </label>
  );
}

interface SettingsProps {
  settings: Settings;
  onToggle: (key: keyof Settings) => void;
}

function SettingsList({ settings, onToggle }: SettingsProps) {
  return (
    <div className="settings">
      <Toggle label="Sound" checked={settings.sound} onChange={() => onToggle('sound')} />
      <Toggle label="Chill music" checked={settings.chillMusic} onChange={() => onToggle('chillMusic')} />
      <Toggle label="Relaxed timing" checked={settings.relaxedTiming} onChange={() => onToggle('relaxedTiming')} />
      <Toggle label="Calmer flashes" checked={settings.reduceFlash} onChange={() => onToggle('reduceFlash')} />
    </div>
  );
}

/** The ren faire setup, in two short lines (S4.6). */
const INTRO = 'Mid-encore at the Grand Faire, a portal swallowed the stage: band, crowd and all. Now monsters march on the show.';
const INTRO_2 = 'Play on the beat. Keep the crowd safe.';

export type TitleScreen = 'splash' | 'menu' | 'new' | 'options';

/** A classic menu window (S4.6): framed, one item per row, a cursor beside the one in focus. */
function MenuWindow({ items, label }: { items: { label: string; onPick: () => void; hint?: string }[]; label: string }) {
  const [focus, setFocus] = useState(0);
  return (
    <nav className="menu-window" aria-label={label}>
      {items.map((item, i) => (
        <button
          key={item.label}
          className={`menu-item${i === focus ? ' focus' : ''}`}
          onPointerEnter={() => setFocus(i)}
          onFocus={() => setFocus(i)}
          onClick={item.onPick}
        >
          <span className="menu-cursor" aria-hidden="true" />
          <span className="menu-label">{item.label}</span>
          {item.hint && <span className="menu-hint">{item.hint}</span>}
        </button>
      ))}
    </nav>
  );
}

export function TitleOverlay({
  startAt = 'splash',
  bests,
  canResume,
  tutorialDone,
  onTutorial,
  onResume,
  onNew,
  headliner,
  onHeadliner,
  mode,
  onMode,
  decks,
  deckChoice,
  onDeckChoice,
  onCollection,
  onLoadIn,
  onSongbook,
  team,
  onTeam,
  daily,
  heat,
  maxHeat,
  onHeat,
  ...settings
}: SettingsProps & {
  /** Where the title starts: the splash on launch, the menu when coming back from a run. */
  startAt?: TitleScreen;
  bests: Bests;
  canResume: boolean;
  tutorialDone: boolean;
  onTutorial: () => void;
  onResume: () => void;
  onNew: () => void;
  headliner: HeadlinerId;
  onHeadliner: (id: HeadlinerId) => void;
  mode: GameMode;
  onMode: (mode: GameMode) => void;
  /** Encore: saved decks that are ready for this headliner. */
  decks: { id: string; name: string }[];
  deckChoice: string | null;
  onDeckChoice: (id: string | null) => void;
  onCollection: () => void;
  onLoadIn: () => void;
  onSongbook: () => void;
  /** Tour: the team of 3 being picked, in order (the first leads). */
  team: HeadlinerId[];
  onTeam: (id: HeadlinerId) => void;
  /** Tour: the Heat chosen, and the highest unlocked (0 until a Tour is won). */
  heat: number;
  maxHeat: number;
  onHeat: (heat: number) => void;
  /** Daily Setlist: today's band and how today went. */
  daily: { team: HeadlinerId[]; played: boolean; result: DailyResult | null; streak: number; onShare: (() => void) | null; note: string | null };
}) {
  const [screen, setScreen] = useState<TitleScreen>(startAt);
  const h = HEADLINERS[headliner];
  const touring = mode === 'tour';
  const isDaily = mode === 'daily';
  const dailyNames = daily.team.map((id) => HEADLINERS[id].name).join(', ');
  const teamReady = team.length === 3;

  if (screen === 'splash') {
    return (
      <button className="overlay title-splash" aria-label="Headliners. Tap to begin" onClick={() => setScreen('menu')}>
        <span className="splash-scene" aria-hidden="true" />
        <span className="logo-banner">
          <span className="title logo">Headliners</span>
        </span>
        <span className="splash-intro">{INTRO}</span>
        <span className="splash-intro strong">{INTRO_2}</span>
        <span className="tap-to-begin">Tap to begin</span>
      </button>
    );
  }

  if (screen === 'options') {
    return (
      <div className="overlay" role="dialog" aria-modal="true" aria-label="Options">
        <div className="overlay-top">
          <h2 className="title small">Options</h2>
        </div>
        <div className="overlay-controls">
          <div className="menu-window options-window">
            <SettingsList {...settings} />
          </div>
          <button className="secondary-btn" onClick={() => setScreen('menu')}>
            Back
          </button>
        </div>
      </div>
    );
  }

  if (screen === 'menu') {
    const items: { label: string; onPick: () => void; hint?: string }[] = [];
    if (!tutorialDone) items.push({ label: 'Learn to play', onPick: onTutorial, hint: '2 min' });
    if (canResume) items.push({ label: 'Continue', onPick: onResume });
    items.push({ label: 'New show', onPick: () => setScreen('new') });
    if (tutorialDone) items.push({ label: 'How to play', onPick: onTutorial });
    items.push({ label: 'Songbook', onPick: onSongbook, hint: 'every card' });
    items.push({ label: 'Collection', onPick: onCollection });
    items.push({ label: 'Load-In', onPick: onLoadIn, hint: 'puzzles' });
    items.push({ label: 'Options', onPick: () => setScreen('options') });
    return (
      <div className="overlay title-menu" role="dialog" aria-modal="true" aria-label="Headliners">
        <div className="overlay-top">
          <span className="splash-scene small" aria-hidden="true" />
          <span className="logo-banner">
            <h1 className="title logo">Headliners</h1>
          </span>
          {bests.runs > 0 && (
            <p className="muted menu-best">
              Best: wave {bests.wave} · {formatNumber(bests.score)}
            </p>
          )}
        </div>
        <div className="overlay-controls">
          <MenuWindow items={items} label="Main menu" />
        </div>
      </div>
    );
  }

  // New show: pick the mode, then who plays.
  return (
    <div className="overlay title-new" role="dialog" aria-modal="true" aria-label="New show">
      <div className="overlay-top">
        <h2 className="title small">New show</h2>
        <div className="mode-list" role="radiogroup" aria-label="Mode">
          {(['encore', 'tour', 'daily'] as const).map((m) => (
            <button key={m} role="radio" aria-checked={m === mode} className={`mode-row${m === mode ? ' on' : ''}`} onClick={() => onMode(m)}>
              <span className="menu-cursor" aria-hidden="true" />
              <span className="mode-name">{MODE_NAME[m]}</span>
              <span className="mode-blurb">
                {MODE_BLURB[m]}
                {m === 'tour' && maxHeat === 0 ? ' Win one to unlock Heat.' : ''}
              </span>
            </button>
          ))}
        </div>
        {isDaily ? (
          <div className={`headliner hl-${daily.team[0]}`}>
            <Portrait headliner={daily.team[0]!} />
            <p className="headliner-name">Today's setlist</p>
            <p>{dailyNames}</p>
            {daily.result ? (
              <p>
                Today: wave {daily.result.wave}, {daily.result.chain}-link chain{daily.streak > 1 ? ` · ${daily.streak}-day streak` : ''}
              </p>
            ) : daily.played ? (
              <p className="muted">Today's scored run is in progress or was left unfinished.</p>
            ) : daily.streak > 0 ? (
              <p className="muted">{daily.streak}-day streak. Keep it going.</p>
            ) : null}
            {daily.note && <p className="muted">{daily.note}</p>}
          </div>
        ) : (
          <div className={`headliner hl-${headliner}`}>
            <Portrait headliner={headliner} />
            <p className="headliner-name">
              {h.name}, {h.title}
            </p>
            <p className="muted">{h.style}</p>
            <p>{h.passive}</p>
            <p>
              <strong>{h.active.name}:</strong> {h.active.text}
            </p>
          </div>
        )}
        {mode === 'tour' && (bests.tours ?? 0) > 0 && (
          <p className="muted">
            Tours won: {bests.toursWon ?? 0} of {bests.tours}.
          </p>
        )}
      </div>
      <div className="overlay-controls">
        {!isDaily && (
          <div className="hl-picker" role={touring ? 'group' : 'radiogroup'} aria-label={touring ? 'Your band of 3 for the Tour' : 'Headliner for a new run'}>
            {(Object.keys(HEADLINERS) as HeadlinerId[]).map((id) => {
              const slot = team.indexOf(id);
              const on = touring ? slot >= 0 : id === headliner;
              return (
                <button
                  key={id}
                  role={touring ? 'checkbox' : 'radio'}
                  aria-checked={on}
                  className={`hl-chip hl-${id}${on ? ' on' : ''}`}
                  aria-label={touring && slot >= 0 ? `${HEADLINERS[id].name}, ${slot === 0 ? 'lead' : `pick ${slot + 1}`}` : HEADLINERS[id].name}
                  onClick={() => (touring ? onTeam(id) : onHeadliner(id))}
                >
                  {HEADLINERS[id].name}
                  {touring && slot >= 0 && <span className="team-slot">{slot + 1}</span>}
                </button>
              );
            })}
          </div>
        )}
        {touring && maxHeat > 0 && (
          <div className="heat-picker" role="group" aria-label="Heat">
            <button className="hl-chip" aria-label="Less heat" disabled={heat <= 0} onClick={() => onHeat(heat - 1)}>
              ◀
            </button>
            <span className="heat-now">
              <b>Heat {heat}</b>
              <span className="muted">{heat === 0 ? 'No extra rules.' : `+ ${HEAT_RULES[heat - 1]}`}</span>
            </span>
            <button className="hl-chip" aria-label="More heat" disabled={heat >= maxHeat} onClick={() => onHeat(heat + 1)}>
              ▶
            </button>
          </div>
        )}
        {mode === 'encore' && decks.length > 0 && (
          <div className="hl-picker deck-picker" role="radiogroup" aria-label="Deck">
            {[{ id: null as string | null, name: 'Starter deck' }, ...decks].map((d) => (
              <button key={d.id ?? 'starter'} role="radio" aria-checked={d.id === deckChoice} className={`hl-chip${d.id === deckChoice ? ' on mode-on' : ''}`} onClick={() => onDeckChoice(d.id)}>
                {d.name}
              </button>
            ))}
          </div>
        )}
        {isDaily && daily.onShare && (
          <button className="secondary-btn" onClick={daily.onShare}>
            Share today's result
          </button>
        )}
        {(() => {
          const label = isDaily ? (daily.played ? "Practice today's setlist" : "Play today's setlist") : touring ? 'Start the tour' : `Start as ${h.name}`;
          if (touring && !teamReady) {
            return (
              <button className="primary-btn" disabled>
                {`Pick 3 to tour (${team.length}/3)`}
              </button>
            );
          }
          // Starting over a saved run ends it: that takes a press and hold (S4.4).
          return canResume ? (
            <HoldButton className="primary-btn" onConfirm={onNew} label={label} />
          ) : (
            <button className="primary-btn" onClick={onNew}>
              {label}
            </button>
          );
        })()}
        <button className="secondary-btn" onClick={() => setScreen('menu')}>
          Back
        </button>
      </div>
    </div>
  );
}

export function PauseOverlay({
  state,
  tutorial,
  onResume,
  onHome,
  onSkipTutorial,
  onSongbook,
  ...settings
}: SettingsProps & { state: EngineState; tutorial: boolean; onResume: () => void; onHome: () => void; onSkipTutorial: () => void; onSongbook: () => void }) {
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Paused">
      <div className="overlay-top">
        <h2 className="title small">Paused</h2>
        <p className="lede">
          {tutorial
            ? 'Soundcheck paused. Pick up where you left off, or skip ahead to the real show.'
            : `Wave ${state.wave.index}, ${formatNumber(state.score)} score. Your run is saved right where you left it.`}
        </p>
      </div>
      <div className="overlay-controls">
        <SettingsList {...settings} />
        <button className="secondary-btn" onClick={onSongbook}>
          Songbook: what each card does
        </button>
        {tutorial && (
          <button className="secondary-btn" onClick={onSkipTutorial}>
            Skip soundcheck
          </button>
        )}
        <div className="btn-pair">
          <button className="secondary-btn" onClick={onHome}>
            Home
          </button>
          <button className="primary-btn" onClick={onResume}>
            Resume
          </button>
        </div>
      </div>
    </div>
  );
}

/** How long the pick screen ignores taps after it opens, so a play in progress can't pick by accident. */
const PICK_LOCKOUT_MS = 600;

export function PickOverlay({ state, onPick, title, lede }: { state: EngineState; onPick: (index: number | null) => void; title?: string; lede?: string }) {
  const [armed, setArmed] = useState(false);
  const [chosen, setChosen] = useState<number | null>(null);
  useEffect(() => {
    const id = window.setTimeout(() => setArmed(true), PICK_LOCKOUT_MS);
    return () => window.clearTimeout(id);
  }, []);
  const chosenId = chosen === null ? null : state.pick[chosen];
  return (
    <div className={`overlay${armed ? '' : ' arming'}`} role="dialog" aria-modal="true" aria-label="Encore pick">
      <div className="overlay-top">
        <h2 className="title small">{title ?? 'Encore pick'}</h2>
        <p className="lede">
          {lede ?? `Wave ${state.wave.index} survived. Tap a card to look at it, then add it to your deck. Or skip to keep it lean.`}
        </p>
      </div>
      <div className="overlay-controls">
        <div className="pick-row">
          {state.pick.map((id, i) => (
            <CardTile
              key={id + i}
              def={getCard(id)}
              large
              selected={chosen === i}
              activateOn="click"
              onSelect={() => armed && setChosen(i)}
            />
          ))}
        </div>
        <button className="primary-btn" disabled={!armed || chosenId === null} onClick={() => armed && chosen !== null && onPick(chosen)}>
          {chosenId ? `Add ${getCard(chosenId).name}` : 'Pick a card'}
        </button>
        <button className="secondary-btn" disabled={!armed} onClick={() => armed && onPick(null)}>
          Skip
        </button>
      </div>
    </div>
  );
}

/** After wave 5 the headliner evolves: pick one of two branches for the rest of the run. Guarded like a card pick. */
export function EvolveOverlay({ state, onEvolve }: { state: EngineState; onEvolve: (index: 0 | 1, member?: HeadlinerId) => void }) {
  const [armed, setArmed] = useState(false);
  const [chosen, setChosen] = useState<0 | 1 | null>(null);
  // A team chooses who evolves first (only members that haven't yet).
  const open = state.headliner.team ? state.headliner.team.filter((id) => state.headliner.evolutions?.[id] === undefined) : null;
  const [member, setMember] = useState<HeadlinerId>(open?.[0] ?? state.headliner.id);
  useEffect(() => {
    const id = window.setTimeout(() => setArmed(true), PICK_LOCKOUT_MS);
    return () => window.clearTimeout(id);
  }, []);
  const h = HEADLINERS[member];
  return (
    <div className={`overlay${armed ? '' : ' arming'}`} role="dialog" aria-modal="true" aria-label="Evolve">
      <div className="overlay-top">
        <h2 className="title small">{open ? 'One of the band evolves' : `${h.name} evolves`}</h2>
        <p className="lede">{open ? 'Choose who, then how. It lasts the rest of the run.' : 'Choose one. It lasts the rest of the run.'}</p>
      </div>
      <div className="overlay-controls">
        {open && (
          <div className="hl-picker" role="radiogroup" aria-label="Who evolves">
            {open.map((id) => (
              <button
                key={id}
                role="radio"
                aria-checked={id === member}
                className={`hl-chip hl-${id}${id === member ? ' on' : ''}`}
                onClick={() => {
                  setMember(id);
                  setChosen(null);
                }}
              >
                {HEADLINERS[id].name}
              </button>
            ))}
          </div>
        )}
        <div className={`evolve-row hl-${h.id}`}>
          {h.evolutions.map((evo, i) => (
            <button
              key={evo.id}
              type="button"
              className={`evolve-card${chosen === i ? ' selected' : ''}`}
              aria-pressed={chosen === i}
              onClick={() => armed && setChosen(i as 0 | 1)}
            >
              <span className="evolve-name">{evo.name}</span>
              <span className="evolve-text">{evo.text}</span>
            </button>
          ))}
        </div>
        <button className="primary-btn" disabled={!armed || chosen === null} onClick={() => armed && chosen !== null && onEvolve(chosen, open ? member : undefined)}>
          {chosen === null ? 'Choose one' : `${open ? `${h.name}: e` : 'E'}volve into ${h.evolutions[chosen].name}`}
        </button>
      </div>
    </div>
  );
}

/** The end-of-run screen opens mid-play: ignore taps this long so a lane tap can't start the next run (S4.4). */
export const END_LOCKOUT_MS = 1200;

export function GameOverOverlay({
  state,
  bests,
  newBest,
  onAgain,
  onHome,
  progress,
  daily,
}: {
  state: EngineState;
  bests: Bests;
  newBest: { wave: boolean; score: boolean; chain: boolean };
  onAgain: () => void;
  onHome: () => void;
  /** XP, level-ups and unlocks from this run. */
  progress?: string;
  /** Daily Setlist: practice or scored, and sharing the day's result. */
  daily?: { practice: boolean; onShare: (() => void) | null; note: string | null };
}) {
  const breakdown = Object.entries(state.stats.damageBySource)
    .filter(([, dmg]) => dmg >= 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  const total = breakdown.reduce((sum, [, v]) => sum + v, 0) || 1;
  const nameOf = (id: string) => (id === 'showstopper' ? 'Showstopper' : getCard(id).name);
  const armed = useArmed(END_LOCKOUT_MS);
  return (
    <div className={`overlay over${armed ? '' : ' arming'}`} role="dialog" aria-modal="true" aria-label="Run over">
      <div className="overlay-top">
        <h2 className="title small">{daily ? (daily.practice ? 'Practice over' : "Today's setlist is done") : 'The crowd went home'}</h2>
        {daily?.practice && <p className="muted">Practice runs aren't scored. Today's scored run was your first.</p>}
        {progress && <p className="run-progress">{progress}</p>}
        <dl className="run-stats">
          <div>
            <dt>Wave</dt>
            <dd>
              {state.wave.index}
              {newBest.wave && <span className="best">best</span>}
            </dd>
          </div>
          <div>
            <dt>Score</dt>
            <dd>
              {formatNumber(state.score)}
              {newBest.score && <span className="best">best</span>}
            </dd>
          </div>
          <div>
            <dt>Best chain</dt>
            <dd>
              {state.stats.bestChain}
              {newBest.chain && <span className="best">best</span>}
            </dd>
          </div>
          <div>
            <dt>Timing</dt>
            <dd className="timing-split">
              <span data-grade="tight">{state.stats.tight} tight</span>
              <span data-grade="good">{state.stats.good} good</span>
              <span data-grade="off">{state.stats.off} off</span>
            </dd>
          </div>
        </dl>
        {breakdown.length > 0 && (
          <ol className="breakdown" aria-label="Damage by card">
            {breakdown.map(([id, dmg]) => (
              <li key={id}>
                <span className="bd-name">{nameOf(id)}</span>
                <span className="bd-bar" style={{ width: `${Math.max(2, (dmg / total) * 100)}%` }} />
                <span className="bd-num">{formatNumber(dmg)}</span>
              </li>
            ))}
          </ol>
        )}
        {!daily && (
          <p className="muted">
            {bests.runs} {bests.runs === 1 ? 'run' : 'runs'} played. Best wave {bests.wave}.
          </p>
        )}
        {daily?.note && <p className="muted">{daily.note}</p>}
      </div>
      <div className="overlay-controls">
        {daily?.onShare && (
          <button className="primary-btn" disabled={!armed} onClick={daily.onShare}>
            Share result
          </button>
        )}
        <div className="btn-pair">
          <button className="secondary-btn" disabled={!armed} onClick={onHome}>
            Home
          </button>
          <button className={daily?.onShare ? 'secondary-btn' : 'primary-btn'} disabled={!armed} onClick={onAgain}>
            {daily ? 'Practice again' : 'Play again'}
          </button>
        </div>
      </div>
    </div>
  );
}
