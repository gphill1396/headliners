import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BEAT_UNITS,
  beatInBar,
  createState,
  getCard,
  isBigChain,
  LANES,
  MAX_ENERGY,
  milliToMs,
  type EngineEvent,
  type EngineState,
  type Grade,
} from '../engine';
import { addBurst, createFx, decayFx, depthToFraction, drawField, fitCanvas, GATE_COLORS } from '../render/field';
import { PALETTE } from '../render/palette';
import { CardTile } from './CardTile';
import { formatNumber } from './format';
import { GameOverOverlay, PauseOverlay, PickOverlay, TitleOverlay } from './Overlays';
import { GameRunner, type CountIn } from './runner';
import {
  clearRun,
  loadBests,
  loadRun,
  loadSettings,
  recordRun,
  saveRun,
  saveSettings,
  type Bests,
  type Settings,
} from './storage';

const LANE_NAMES = ['Left', 'Mid', 'Right'] as const;
const LANE_KEYS: Record<string, number> = { j: 0, k: 1, l: 2, ArrowLeft: 0, ArrowDown: 1, ArrowRight: 2 };
const GRADE_LABEL: Record<Grade, string> = { tight: 'Tight', good: 'Good', off: 'Off' };
const REJECT_TEXT = {
  energy: 'Not enough energy yet. You gain 1 every beat.',
  'not-in-hand': 'That card already left your hand.',
  lane: 'Pick a lane.',
  'not-playing': 'Wait for the next wave.',
  cooldown: 'Fill is still cooling down.',
} as const;
const KIND_NAMES = { shambler: 'Shamblers', brute: 'Brutes', swarmling: 'Swarmlings' } as const;

type View = 'title' | 'playing' | 'paused' | 'over';

/** Everything the React layer shows, sampled from the engine a few times a second. */
interface Hud {
  wave: number;
  score: number;
  crowd: number;
  maxCrowd: number;
  energy: number;
  chain: number;
  mult: number;
  fillIn: number;
  filling: boolean;
  phase: EngineState['phase'];
  hand: { iid: number; cardId: string }[];
  queuedLanes: number[];
  gates: { id: number; lane: number; depth: number; kind: keyof typeof GATE_COLORS; amount: number }[];
}

function sampleHud(s: EngineState): Hud {
  const filling = s.clock.beat < s.headliner.activeUntilBeat;
  return {
    wave: s.wave.index,
    score: Math.floor(s.score),
    crowd: Math.max(0, s.crowd),
    maxCrowd: s.maxCrowd,
    energy: s.energy,
    chain: s.chain.links,
    mult: s.chain.links > 0 ? s.chain.multPct : 100,
    fillIn: Math.max(0, s.headliner.readyBeat - s.clock.beat),
    filling,
    phase: s.phase,
    hand: s.hand.map((c) => ({ iid: c.iid, cardId: c.cardId })),
    queuedLanes: [0, 1, 2].map((l) => s.queue.filter((q) => q.lane === l && !q.isEcho).length),
    gates: s.gates.map((g) => ({ id: g.id, lane: g.lane, depth: g.depth, kind: g.kind, amount: g.amount })),
  };
}

function newRun(settings: Settings): EngineState {
  // The UI picks the seed; the engine never reads the clock itself.
  return createState({ seed: `run-${new Date().toISOString()}`, relaxedTiming: settings.relaxedTiming });
}

function gateLabel(kind: Hud['gates'][number]['kind'], amount: number): string {
  switch (kind) {
    case 'copy':
      return `×${amount}`;
    case 'damage':
      return `+${amount}`;
    case 'splash':
      return 'Splash';
    case 'pierce':
      return `Pierce +${amount}`;
  }
}

export function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [bests, setBests] = useState<Bests>(loadBests);
  const [newBest, setNewBest] = useState({ wave: false, score: false, chain: false });
  const savedRun = useRef<EngineState | null>(loadRun());
  const [canResume, setCanResume] = useState(savedRun.current !== null);

  const runnerRef = useRef<GameRunner | null>(null);
  if (!runnerRef.current) runnerRef.current = new GameRunner(newRun(settings));
  const runner = runnerRef.current;

  const [view, setView] = useState<View>('title');
  const [hud, setHud] = useState<Hud>(() => sampleHud(runner.state));
  const [selected, setSelected] = useState<number | null>(null);
  const [pickSent, setPickSent] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const padRefs = useRef<(HTMLDivElement | null)[]>([]);
  const infoRef = useRef<HTMLDivElement>(null);
  const linkRef = useRef<HTMLDivElement>(null);
  const bannerRef = useRef<HTMLDivElement>(null);
  const chainRef = useRef<HTMLDivElement>(null);
  const laneRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const fxRef = useRef(createFx());
  const lastFrame = useRef(0);
  const lastHudSample = useRef(0);
  const hudKey = useRef('');
  const lastSave = useRef(0);
  const laneDamage = useRef([0, 0, 0]);
  const laneDamageDepth = useRef([0, 0, 0]);
  const lastPopFlush = useRef(0);
  const infoTimer = useRef(0);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  /** Short message in the info strip (grades, rejections). Card text shows there while a card is selected. */
  const flashInfo = useCallback((html: string, tone: string) => {
    const el = infoRef.current;
    if (!el) return;
    el.dataset.tone = tone;
    el.innerHTML = html;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    window.clearTimeout(infoTimer.current);
    infoTimer.current = window.setTimeout(() => el.classList.remove('show'), 900);
  }, []);

  const pop = useCallback((text: string, lane: number, depth: number, cls: string) => {
    const layer = overlayRef.current;
    if (!layer) return;
    if (layer.childElementCount > 18) layer.firstElementChild?.remove();
    const el = document.createElement('div');
    el.className = `pop ${cls}`;
    el.textContent = text;
    el.style.left = `${((lane + 0.5) / LANES) * 100}%`;
    el.style.top = `${depthToFraction(depth) * 100}%`;
    el.addEventListener('animationend', () => el.remove());
    layer.appendChild(el);
  }, []);

  const showLink = useCallback((label: string, mult: number, big: boolean) => {
    const el = linkRef.current;
    if (!el) return;
    el.innerHTML = `<span>${label}</span><strong>×${(mult / 100).toFixed(2).replace(/\.?0+$/, '')}</strong>`;
    el.classList.toggle('big', big);
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }, []);

  const showBanner = useCallback((title: string, sub: string) => {
    const el = bannerRef.current;
    if (!el) return;
    el.innerHTML = `<strong>${title}</strong><span>${sub}</span>`;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }, []);

  const finishRun = useCallback((s: EngineState) => {
    const result = recordRun(s);
    clearRun();
    setCanResume(false);
    setBests(result.bests);
    setNewBest(result.newBest);
    setView('over');
  }, []);

  // Wire the runner to rendering, effects and the HUD.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.imageSmoothingEnabled = false;
    fitCanvas(canvas);
    const ro = new ResizeObserver(() => fitCanvas(canvas));
    ro.observe(canvas);
    const fx = fxRef.current;

    const onEvents = (events: EngineEvent[], s: EngineState) => {
      const now = performance.now();
      for (const e of events) {
        switch (e.type) {
          case 'graded': {
            const ms = Math.round(milliToMs(e.offsetMilli, s.clock.bpm));
            const when = Math.abs(ms) <= 2 ? 'on the beat' : ms < 0 ? `${-ms} ms early` : `${ms} ms late`;
            flashInfo(`<strong>${GRADE_LABEL[e.grade]}</strong><span>${getCard(e.cardId).name}, ${when}</span>`, e.grade);
            break;
          }
          case 'rejected':
            flashInfo(`<span>${REJECT_TEXT[e.reason]}</span>`, 'off');
            break;
          case 'resolved':
            fx.laneFlash[e.lane] = e.grade === 'tight' ? 1 : e.grade === 'good' ? 0.7 : 0.4;
            fx.flashColor[e.lane] = PALETTE.footlight;
            break;
          case 'link':
            showLink(e.label, e.multPct, isBigChain(e.links));
            // Flash at chain milestones (8, 16, 24…), not on every link.
            if (isBigChain(e.links) && e.links % 8 === 0 && !settingsRef.current.reduceFlash) fx.bigFlash = 0.7;
            break;
          case 'chainEnd':
            if (e.dropped) flashInfo(`<strong>Chain dropped</strong><span>${e.links} links. Off-beat plays break the chain.</span>`, 'off');
            break;
          case 'showstopper':
            showBanner('Showstopper!', `${e.links}-link chain hits everything for ${formatNumber(e.damage)}`);
            if (!settingsRef.current.reduceFlash) fx.bigFlash = 1;
            break;
          case 'damage':
            laneDamage.current[e.lane] = (laneDamage.current[e.lane] ?? 0) + e.amount;
            laneDamageDepth.current[e.lane] = e.depth;
            break;
          case 'killed':
            addBurst(fx, e.lane, e.depth, e.kind === 'brute' ? PALETTE.cream : PALETTE.footlight, now, canvas.height);
            break;
          case 'leaked':
            fx.laneMiss[e.lane] = 1;
            pop(`-${e.crowdDamage} crowd`, e.lane, 88_000, 'pop-leak');
            break;
          case 'gateBroken':
            pop('Gate broke', e.lane, 60_000, 'pop-note');
            break;
          case 'waveStart':
            showBanner(`Wave ${e.index}`, e.kinds.map((k) => KIND_NAMES[k]).join(' and '));
            break;
          case 'energy':
            if (e.reason === 'tight') pop('+1 energy', 1, 80_000, 'pop-energy');
            break;
          case 'fill':
            showBanner('Fill!', 'Every unit fires on every eighth note');
            break;
          case 'gameOver':
            break;
          default:
            break;
        }
      }
      if (events.some((e) => e.type === 'gameOver')) {
        runner.pause();
        finishRun(s);
      }
      // Save every couple of seconds while playing, so closing the app never loses much.
      if (now - lastSave.current > 2_000 && s.phase !== 'over') {
        lastSave.current = now;
        saveRun(s);
      }
    };

    const onFrame = (s: EngineState, alpha: number, countIn: CountIn | null, now: number) => {
      const dt = lastFrame.current ? now - lastFrame.current : 16;
      lastFrame.current = now;
      decayFx(fx, dt);

      const phase = countIn ? countIn.phase : Math.min(0.999, (s.clock.phase + s.clock.bpm * alpha) / BEAT_UNITS);
      drawField(ctx, s, s.phase === 'playing' ? alpha : 0, fx, phase, now);

      const current = countIn ? countIn.beat : beatInBar(s.clock.beat);
      const live = countIn !== null || s.phase === 'playing';
      padRefs.current.forEach((pad, i) => {
        if (!pad) return;
        pad.style.setProperty('--lit', live && i === current ? (1 - phase).toFixed(3) : '0');
        const next = (current + 1) % 4;
        pad.style.setProperty('--warm', live && i === next ? Math.max(0, (phase - 0.75) * 4).toFixed(3) : '0');
      });
      const chainEl = chainRef.current;
      if (chainEl) chainEl.classList.toggle('count-in', countIn !== null);

      // Grouped damage numbers: one per lane every 160 ms.
      if (now - lastPopFlush.current > 160) {
        lastPopFlush.current = now;
        for (let lane = 0; lane < LANES; lane++) {
          const amount = laneDamage.current[lane] ?? 0;
          if (amount >= 1) pop(formatNumber(amount, settingsRef.current.scientific), lane, laneDamageDepth.current[lane] ?? 0, 'pop-dmg');
          laneDamage.current[lane] = 0;
        }
      }

      if (now - lastHudSample.current > 90) {
        lastHudSample.current = now;
        const next = sampleHud(s);
        const key = JSON.stringify(next);
        if (key !== hudKey.current) {
          hudKey.current = key;
          setHud(next);
        }
      }
    };

    runner.setHooks({ onEvents, onFrame });
    onFrame(runner.state, 0, null, performance.now());

    const onHide = () => {
      if (runner.running) {
        runner.pause();
        saveRun(runner.state);
        setView((v) => (v === 'playing' ? 'paused' : v));
      }
    };
    const onVisibility = () => document.hidden && onHide();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onHide);
    return () => {
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onHide);
      runner.pause();
    };
  }, [runner, flashInfo, pop, showLink, showBanner, finishRun]);

  // Keep the selected card valid as the hand changes.
  useEffect(() => {
    if (selected !== null && !hud.hand.some((c) => c.iid === selected)) setSelected(null);
  }, [hud.hand, selected]);

  // Clear the "pick sent" flag once the engine leaves the pick screen.
  useEffect(() => {
    if (hud.phase !== 'picking') setPickSent(false);
  }, [hud.phase]);

  const showCardText = (iid: number | null) => {
    const el = infoRef.current;
    if (!el) return;
    if (iid === null) {
      el.classList.remove('show');
      return;
    }
    const card = runner.state.hand.find((c) => c.iid === iid);
    if (!card) return;
    const def = getCard(card.cardId);
    window.clearTimeout(infoTimer.current);
    el.dataset.tone = 'card';
    el.innerHTML = `<span>${def.text}</span>`;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  };

  const selectCard = (iid: number) => {
    const next = selected === iid ? null : iid;
    setSelected(next);
    showCardText(next);
  };

  const playLane = useCallback(
    (lane: number, timeStamp: number) => {
      if (!runner.running || runner.state.phase !== 'playing') return;
      const iid = selectedRef.current;
      if (iid === null) {
        flashInfo('<span>Pick a card first, then tap a lane on the beat.</span>', 'off');
        return;
      }
      runner.send({ type: 'commit', iid, lane, permille: 0 }, timeStamp);
      setSelected(null);
      const btn = laneRefs.current[lane];
      if (btn) {
        btn.classList.remove('hit');
        void btn.offsetWidth;
        btn.classList.add('hit');
      }
    },
    [runner, flashInfo],
  );

  const activate = (timeStamp: number) => runner.send({ type: 'activate', permille: 0 }, timeStamp);

  // Keyboard for desktop testing: 1–5 select a card, J/K/L or arrows play it, F fills, Space pauses.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || view !== 'playing') return;
      if (e.key === ' ' || e.key === 'Escape') {
        e.preventDefault();
        pauseGame();
        return;
      }
      if (e.key === 'f') return activate(e.timeStamp);
      const n = Number(e.key);
      if (n >= 1 && n <= 5) {
        const card = runner.state.hand[n - 1];
        if (card) {
          setSelected(card.iid);
          showCardText(card.iid);
        }
        return;
      }
      const lane = LANE_KEYS[e.key];
      if (lane !== undefined) playLane(lane, e.timeStamp);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const startPlaying = (countIn: boolean) => {
    lastFrame.current = 0;
    setView('playing');
    runner.start(countIn);
  };

  const pauseGame = () => {
    runner.pause();
    saveRun(runner.state);
    setView('paused');
  };

  const resumeSaved = () => {
    if (savedRun.current) runner.load(savedRun.current);
    savedRun.current = null;
    setHud(sampleHud(runner.state));
    startPlaying(true);
  };

  const startNew = () => {
    clearRun();
    savedRun.current = null;
    setCanResume(false);
    runner.load(newRun(settings));
    fxRef.current = createFx();
    overlayRef.current?.replaceChildren();
    setSelected(null);
    setHud(sampleHud(runner.state));
    startPlaying(true);
  };

  const pick = (index: number | null) => {
    setPickSent(true);
    runner.send({ type: 'pick', index });
    runner.delay(runner.barMs());
  };

  const toggleSetting = (key: keyof Settings) => {
    const next = { ...settings, [key]: !settings[key] };
    setSettings(next);
    saveSettings(next);
    if (key === 'relaxedTiming') runner.send({ type: 'setRelaxedTiming', value: next.relaxedTiming });
  };

  const selectedDef = (() => {
    const card = hud.hand.find((c) => c.iid === selected);
    return card ? getCard(card.cardId) : null;
  })();

  return (
    <div className="app">
      <header className="hud">
        <span className="hud-wave">{hud.wave > 0 ? `Wave ${hud.wave}` : 'Count-in'}</span>
        <span className="hud-crowd" aria-label={`Crowd ${hud.crowd} of ${hud.maxCrowd}`}>
          <span className="crowd-bar">
            <span style={{ width: `${(hud.crowd / hud.maxCrowd) * 100}%` }} />
          </span>
          {hud.crowd}
        </span>
        <span className="hud-score">{formatNumber(hud.score, settings.scientific)}</span>
      </header>

      <main className="field">
        <canvas ref={canvasRef} className="field-canvas" aria-label="Playfield: three lanes" />
        <div className="field-layer" aria-hidden="true">
          {hud.gates.map((g) => (
            <span
              key={g.id}
              className="gate-label"
              style={{
                left: `${((g.lane + 0.5) / LANES) * 100}%`,
                top: `${depthToFraction(g.depth) * 100}%`,
                color: GATE_COLORS[g.kind],
              }}
            >
              {gateLabel(g.kind, g.amount)}
            </span>
          ))}
        </div>
        <div ref={overlayRef} className="field-layer pops" aria-hidden="true" />
        <div ref={linkRef} className="link-pop" aria-hidden="true" />
        <div ref={bannerRef} className="banner" aria-live="polite" />
      </main>

      <section className="controls" aria-label="Controls">
        <div className="control-top">
          <div className="pads" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} ref={(el) => void (padRefs.current[i] = el)} className={i === 0 ? 'pad pad-down' : 'pad'} />
            ))}
          </div>
          <div ref={chainRef} className={`chain${hud.chain >= 8 ? ' hot' : ''}${hud.chain > 0 ? ' on' : ''}`}>
            {hud.chain > 0 ? (
              <>
                <span>Chain {hud.chain}</span>
                <strong>×{(hud.mult / 100).toFixed(2).replace(/\.?0+$/, '')}</strong>
              </>
            ) : (
              <span className="muted">No chain</span>
            )}
          </div>
          <button className="icon-btn" onClick={pauseGame} aria-label="Pause" disabled={view !== 'playing'}>
            <span className="pause-glyph" />
          </button>
        </div>

        <div className="hand" role="group" aria-label="Your hand">
          {Array.from({ length: 5 }, (_, i) => {
            const card = hud.hand[i];
            if (!card) return <div key={`empty-${i}`} className="card-slot" />;
            const def = getCard(card.cardId);
            return (
              <CardTile
                key={card.iid}
                def={def}
                selected={selected === card.iid}
                affordable={def.cost <= hud.energy}
                onSelect={() => selectCard(card.iid)}
              />
            );
          })}
        </div>

        <div className="info-row">
          <div ref={infoRef} className="info" aria-live="polite" />
          <div className="energy" aria-label={`Energy ${hud.energy} of ${MAX_ENERGY}`}>
            {Array.from({ length: MAX_ENERGY }, (_, i) => (
              <span
                key={i}
                className={i < hud.energy ? 'pip on' : 'pip'}
                data-need={selectedDef && i < selectedDef.cost ? 'y' : undefined}
              />
            ))}
          </div>
          <button
            className={`fill-btn${hud.filling ? ' active' : ''}`}
            disabled={hud.fillIn > 0 || view !== 'playing'}
            onPointerDown={(e) => {
              e.preventDefault();
              activate(e.timeStamp);
            }}
          >
            {hud.filling ? 'Filling' : hud.fillIn > 0 ? `Fill ${hud.fillIn}` : 'Fill'}
          </button>
        </div>

        <div className="lanes">
          {LANE_NAMES.map((name, lane) => (
            <button
              key={name}
              ref={(el) => void (laneRefs.current[lane] = el)}
              className={`lane-btn${selected !== null ? ' armed' : ''}`}
              onPointerDown={(e) => {
                e.preventDefault();
                playLane(lane, e.timeStamp);
              }}
              onAnimationEnd={(e) => e.currentTarget.classList.remove('hit')}
            >
              {name}
              {(hud.queuedLanes[lane] ?? 0) > 0 && <span className="queued-pip" aria-label="Card waiting for the beat" />}
            </button>
          ))}
        </div>
      </section>

      {view === 'title' && (
        <TitleOverlay
          bests={bests}
          canResume={canResume}
          onResume={resumeSaved}
          onNew={startNew}
          settings={settings}
          onToggle={toggleSetting}
        />
      )}
      {view === 'paused' && (
        <PauseOverlay
          state={runner.state}
          onResume={() => startPlaying(true)}
          onRestart={startNew}
          settings={settings}
          onToggle={toggleSetting}
        />
      )}
      {view === 'playing' && hud.phase === 'picking' && !pickSent && <PickOverlay state={runner.state} onPick={pick} />}
      {view === 'over' && <GameOverOverlay state={runner.state} bests={bests} newBest={newBest} onAgain={startNew} />}
    </div>
  );
}
