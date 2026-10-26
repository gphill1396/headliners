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

export function TitleOverlay({
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
  team,
  onTeam,
  daily,
  heat,
  maxHeat,
  onHeat,
  ...settings
}: SettingsProps & {
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
  const h = HEADLINERS[headliner];
  const touring = mode === 'tour';
  const isDaily = mode === 'daily';
  const dailyNames = daily.team.map((id) => HEADLINERS[id].name).join(', ');
  const teamReady = team.length === 3;
  // A new run is played as the chosen headliner; a saved run keeps whoever it started with.
  const choosing = !canResume && tutorialDone;
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Headliners">
      <div className="overlay-top">
        <h1 className="title">Headliners</h1>
        <p className="lede">
          {tutorialDone
            ? 'Tap a card, then tap a lane on the beat. Units shoot up their lane, gates multiply the shots, and plays on back-to-back beats chain together.'
            : 'Your ren faire band fell through a portal into a land of monsters. Play to the beat, hold back the horde, keep your crowd. New here? The soundcheck teaches it in about two minutes.'}
        </p>
        {isDaily ? (
          <div className={`headliner hl-${daily.team[0]}`}>
            <Portrait headliner={daily.team[0]!} />
            <p className="headliner-name">Today's setlist</p>
            <p>{dailyNames}</p>
            <p className="muted">Same waves, deck and band for everyone today. Your first run counts; after that it's practice.</p>
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
          <p className="muted">Sound: {h.sound}</p>
        </div>
        )}
        {mode === 'encore' && bests.runs > 0 && (
          <p className="muted">
            Best: wave {bests.wave}, {formatNumber(bests.score)} score, {bests.chain}-link chain
          </p>
        )}
        {mode === 'tour' && (
          <p className="muted">
            Tour: take a band of 3 across the realm. Pick three below; the first leads. 3 acts of shows, markets and inns, with a boss at the end of each.
            {maxHeat === 0 ? ' Win a Tour to unlock Heat.' : ''}
            {(bests.tours ?? 0) > 0 ? ` Tours won: ${bests.toursWon ?? 0} of ${bests.tours}.` : ''}
          </p>
        )}
      </div>
      <div className="overlay-controls">
        <SettingsList {...settings} />
        {(choosing || canResume) && (
          <div className="hl-picker mode-picker" role="radiogroup" aria-label="Mode for a new run">
            {(['encore', 'tour', 'daily'] as const).map((m) => (
              <button key={m} role="radio" aria-checked={m === mode} className={`hl-chip${m === mode ? ' on mode-on' : ''}`} onClick={() => onMode(m)}>
                {m === 'encore' ? 'Encore' : m === 'tour' ? 'Tour' : 'Daily'}
              </button>
            ))}
          </div>
        )}
        {(choosing || canResume) && !isDaily && (
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
        {(choosing || canResume) && touring && maxHeat > 0 && (
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
        {(choosing || canResume) && mode === 'encore' && decks.length > 0 && (
          <div className="hl-picker deck-picker" role="radiogroup" aria-label="Deck">
            {[{ id: null as string | null, name: 'Starter deck' }, ...decks].map((d) => (
              <button key={d.id ?? 'starter'} role="radio" aria-checked={d.id === deckChoice} className={`hl-chip${d.id === deckChoice ? ' on mode-on' : ''}`} onClick={() => onDeckChoice(d.id)}>
                {d.name}
              </button>
            ))}
          </div>
        )}
        {canResume ? (
          <>
            <button className="primary-btn" onClick={onResume}>
              Resume run
            </button>
            <button className="secondary-btn" disabled={touring && !teamReady} onClick={onNew}>
              {isDaily ? (daily.played ? "Practice today's setlist" : "Play today's setlist") : touring ? (teamReady ? 'New tour' : `Pick 3 for a new tour (${team.length}/3)`) : `New run as ${h.name}`}
            </button>
          </>
        ) : tutorialDone ? (
          <>
            {isDaily && daily.onShare && (
              <button className="secondary-btn" onClick={daily.onShare}>
                Share today's result
              </button>
            )}
            <button className="primary-btn" disabled={touring && !teamReady} onClick={onNew}>
              {isDaily ? (daily.played ? "Practice today's setlist" : "Play today's setlist") : touring ? (teamReady ? 'Start the tour' : `Pick 3 to tour (${team.length}/3)`) : `Start as ${h.name}`}
            </button>
          </>
        ) : (
          <>
            <button className="primary-btn" onClick={onTutorial}>
              Learn to play
            </button>
            <button className="secondary-btn" onClick={onNew}>
              Skip and play
            </button>
          </>
        )}
        {(tutorialDone || canResume) && (
          <div className="title-links">
            <button className="link-btn" onClick={onTutorial}>
              How to play
            </button>
            <button className="link-btn" onClick={onCollection}>
              Collection
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function PauseOverlay({
  state,
  tutorial,
  onResume,
  onRestart,
  ...settings
}: SettingsProps & { state: EngineState; tutorial: boolean; onResume: () => void; onRestart: () => void }) {
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
        <button className="secondary-btn" onClick={onRestart}>
          {tutorial ? 'Skip soundcheck' : 'Start a new run'}
        </button>
        <button className="primary-btn" onClick={onResume}>
          Resume
        </button>
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

export function GameOverOverlay({
  state,
  bests,
  newBest,
  onAgain,
  progress,
  daily,
}: {
  state: EngineState;
  bests: Bests;
  newBest: { wave: boolean; score: boolean; chain: boolean };
  onAgain: () => void;
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
  return (
    <div className="overlay over" role="dialog" aria-modal="true" aria-label="Run over">
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
          <button className="primary-btn" onClick={daily.onShare}>
            Share result
          </button>
        )}
        <button className={daily?.onShare ? 'secondary-btn' : 'primary-btn'} onClick={onAgain}>
          {daily ? 'Practice again' : 'Play again'}
        </button>
      </div>
    </div>
  );
}
