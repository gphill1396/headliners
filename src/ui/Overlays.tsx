import { useEffect, useState } from 'react';
import { getCard, HEADLINERS, type EngineState, type HeadlinerId } from '../engine';
import { CardTile } from './CardTile';
import { formatNumber } from './format';
import type { Bests, Settings } from './storage';

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
}) {
  const h = HEADLINERS[headliner];
  // A new run is played as the chosen headliner; a saved run keeps whoever it started with.
  const choosing = !canResume && tutorialDone;
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Headliners">
      <div className="overlay-top">
        <h1 className="title">Headliners</h1>
        <p className="lede">
          {tutorialDone
            ? 'Tap a card, then tap a lane on the beat. Units shoot up their lane, gates multiply the shots, and plays on back-to-back beats chain together.'
            : 'A card game played to the beat. Hold back the horde and keep your crowd. New here? The soundcheck teaches it in about two minutes.'}
        </p>
        <div className={`headliner hl-${headliner}`}>
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
        {bests.runs > 0 && (
          <p className="muted">
            Best: wave {bests.wave}, {formatNumber(bests.score)} score, {bests.chain}-link chain
          </p>
        )}
      </div>
      <div className="overlay-controls">
        <SettingsList {...settings} />
        {(choosing || canResume) && (
          <div className="hl-picker" role="radiogroup" aria-label="Headliner for a new run">
            {(Object.keys(HEADLINERS) as HeadlinerId[]).map((id) => (
              <button
                key={id}
                role="radio"
                aria-checked={id === headliner}
                className={`hl-chip hl-${id}${id === headliner ? ' on' : ''}`}
                onClick={() => onHeadliner(id)}
              >
                {HEADLINERS[id].name}
              </button>
            ))}
          </div>
        )}
        {canResume ? (
          <>
            <button className="primary-btn" onClick={onResume}>
              Resume run
            </button>
            <button className="secondary-btn" onClick={onNew}>
              New run as {h.name}
            </button>
          </>
        ) : tutorialDone ? (
          <button className="primary-btn" onClick={onNew}>
            Start as {h.name}
          </button>
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
          <button className="link-btn" onClick={onTutorial}>
            How to play
          </button>
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

export function PickOverlay({ state, onPick }: { state: EngineState; onPick: (index: number | null) => void }) {
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
        <h2 className="title small">Encore pick</h2>
        <p className="lede">
          Wave {state.wave.index} survived. Tap a card to look at it, then add it to your deck. Or skip to keep it lean.
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
export function EvolveOverlay({ state, onEvolve }: { state: EngineState; onEvolve: (index: 0 | 1) => void }) {
  const [armed, setArmed] = useState(false);
  const [chosen, setChosen] = useState<0 | 1 | null>(null);
  useEffect(() => {
    const id = window.setTimeout(() => setArmed(true), PICK_LOCKOUT_MS);
    return () => window.clearTimeout(id);
  }, []);
  const h = HEADLINERS[state.headliner.id];
  return (
    <div className={`overlay${armed ? '' : ' arming'}`} role="dialog" aria-modal="true" aria-label="Evolve">
      <div className="overlay-top">
        <h2 className="title small">{h.name} evolves</h2>
        <p className="lede">Choose one. It lasts the rest of the run.</p>
      </div>
      <div className="overlay-controls">
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
        <button className="primary-btn" disabled={!armed || chosen === null} onClick={() => armed && chosen !== null && onEvolve(chosen)}>
          {chosen === null ? 'Choose one' : `Evolve into ${h.evolutions[chosen].name}`}
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
}: {
  state: EngineState;
  bests: Bests;
  newBest: { wave: boolean; score: boolean; chain: boolean };
  onAgain: () => void;
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
        <h2 className="title small">The crowd went home</h2>
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
        <p className="muted">
          {bests.runs} {bests.runs === 1 ? 'run' : 'runs'} played. Best wave {bests.wave}.
        </p>
      </div>
      <div className="overlay-controls">
        <button className="primary-btn" onClick={onAgain}>
          Play again
        </button>
      </div>
    </div>
  );
}
