import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BEAT_UNITS,
  beatInBar,
  createState,
  milliToMs,
  type EngineEvent,
  type EngineState,
  type Grade,
} from '../engine';
import { createFx, decayFx, drawField, fitCanvas } from '../render/field';
import { PALETTE } from '../render/palette';
import { GameRunner } from './runner';

const LANE_NAMES = ['Left', 'Mid', 'Right'] as const;
const LANE_KEYS: Record<string, number> = { '1': 0, '2': 1, '3': 2, j: 0, k: 1, l: 2, ArrowLeft: 0, ArrowDown: 1, ArrowRight: 2 };
const SETTINGS_KEY = 'headliners.settings.v1';

interface Hud {
  beat: number;
  bpm: number;
  tight: number;
  good: number;
  off: number;
  cleared: number;
  missed: number;
}

function readHud(s: EngineState): Hud {
  return { beat: s.clock.beat, bpm: s.clock.bpm, ...s.stats };
}

function loadRelaxed(): boolean {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}').relaxedTiming === true;
  } catch {
    return false;
  }
}

function saveRelaxed(value: boolean): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ relaxedTiming: value }));
  } catch {
    /* storage unavailable: setting lasts for this session only */
  }
}

const GRADE_LABEL: Record<Grade, string> = { tight: 'Tight', good: 'Good', off: 'Off' };

export function App() {
  const [relaxed, setRelaxed] = useState(loadRelaxed);
  const runnerRef = useRef<GameRunner | null>(null);
  if (!runnerRef.current) {
    // UI picks the seed; the engine never reads the clock itself.
    runnerRef.current = new GameRunner(createState({ seed: `sandbox-${new Date().toISOString()}`, relaxedTiming: relaxed }));
  }
  const runner = runnerRef.current;

  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(true);
  const [hud, setHud] = useState<Hud>(() => readHud(runner.state));

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRefs = useRef<(HTMLDivElement | null)[]>([]);
  const gradeRef = useRef<HTMLDivElement>(null);
  const laneRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const fxRef = useRef(createFx());
  const lastFrame = useRef(0);
  const gradeTimer = useRef(0);

  const showGrade = useCallback((grade: Grade, offsetMilli: number, bpm: number) => {
    const el = gradeRef.current;
    if (!el) return;
    const ms = Math.round(milliToMs(offsetMilli, bpm));
    const when = ms === 0 ? 'on the beat' : ms < 0 ? `${-ms} ms early` : `${ms} ms late`;
    el.dataset.grade = grade;
    el.innerHTML = `<strong>${GRADE_LABEL[grade]}</strong><span>${when}</span>`;
    el.classList.remove('show');
    void el.offsetWidth; // restart the animation
    el.classList.add('show');
    window.clearTimeout(gradeTimer.current);
    gradeTimer.current = window.setTimeout(() => el.classList.remove('show'), 700);
  }, []);

  // Wire the runner to rendering and the HUD.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.imageSmoothingEnabled = false;
    fitCanvas(canvas);
    const ro = new ResizeObserver(() => fitCanvas(canvas));
    ro.observe(canvas);

    const fx = fxRef.current;
    const laneColors = [PALETTE.thrum, PALETTE.lyra, PALETTE.clatter];

    const onEvents = (events: EngineEvent[], s: EngineState) => {
      let hudDirty = false;
      for (const e of events) {
        switch (e.type) {
          case 'graded':
            showGrade(e.grade, e.offsetMilli, s.clock.bpm);
            hudDirty = true;
            break;
          case 'resolved':
            fx.laneFlash[e.lane] = e.grade === 'tight' ? 1 : e.grade === 'good' ? 0.7 : 0.4;
            fx.flashColor[e.lane] = laneColors[e.lane] ?? PALETTE.footlight;
            hudDirty = true;
            break;
          case 'markerReachedStage':
            fx.laneMiss[e.lane] = 1;
            hudDirty = true;
            break;
          case 'beat':
            hudDirty = true;
            break;
          case 'markerSpawned':
            break;
        }
      }
      if (hudDirty) setHud(readHud(s));
    };

    const onFrame = (s: EngineState, alpha: number) => {
      const now = performance.now();
      const dt = lastFrame.current ? now - lastFrame.current : 16;
      lastFrame.current = now;
      decayFx(fx, dt);

      const phase = Math.min(0.999, (s.clock.phase + s.clock.bpm * alpha) / BEAT_UNITS);
      drawField(ctx, s, alpha, fx, phase);

      const current = beatInBar(s.clock.beat);
      padRefs.current.forEach((pad, i) => {
        if (!pad) return;
        pad.style.setProperty('--lit', i === current ? (1 - phase).toFixed(3) : '0');
        // Anticipation: the next pad starts warming up in the last quarter of the beat.
        const next = (current + 1) % 4;
        pad.style.setProperty('--warm', i === next ? Math.max(0, (phase - 0.75) * 4).toFixed(3) : '0');
      });
    };

    runner.setHooks({ onEvents, onFrame });
    // Draw one frame so the field isn't blank before Start.
    onFrame(runner.state, 0);

    const onVisibility = () => {
      if (document.hidden && runner.running) {
        runner.pause();
        setPaused(true);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onVisibility);

    return () => {
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onVisibility);
      runner.pause();
    };
  }, [runner, showGrade]);

  const play = useCallback(
    (lane: number, timeStamp: number) => {
      if (!runner.running) return;
      runner.send({ type: 'commit', lane, slot: -1, permille: 0 }, timeStamp);
      const btn = laneRefs.current[lane];
      if (btn) {
        btn.classList.remove('hit');
        void btn.offsetWidth;
        btn.classList.add('hit');
      }
    },
    [runner],
  );

  // Keyboard for desktop testing: 1/2/3, J/K/L or arrow keys.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.key === ' ' || e.key === 'Escape') {
        e.preventDefault();
        if (runner.running) {
          runner.pause();
          setPaused(true);
        }
        return;
      }
      const lane = LANE_KEYS[e.key];
      if (lane !== undefined) play(lane, e.timeStamp);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [play, runner]);

  const resume = () => {
    lastFrame.current = 0;
    setStarted(true);
    setPaused(false);
    runner.start();
  };

  const pause = () => {
    runner.pause();
    setPaused(true);
  };

  const toggleRelaxed = () => {
    const value = !relaxed;
    setRelaxed(value);
    saveRelaxed(value);
    runner.send({ type: 'setRelaxedTiming', value });
  };

  return (
    <div className="app">
      <header className="hud" aria-live="off">
        <span className="hud-beat">
          Bar {Math.floor(hud.beat / 4) + 1}
        </span>
        <span className="hud-tempo">{hud.bpm} bpm</span>
        <span className="hud-stats">
          <span className="stat stat-cleared" title="Cleared">{hud.cleared} cleared</span>
          <span className="stat stat-missed" title="Reached the stage">{hud.missed} missed</span>
        </span>
      </header>

      <main className="field">
        <canvas ref={canvasRef} className="field-canvas" aria-label="Playfield: three lanes" />
      </main>

      <section className="controls" aria-label="Controls">
        <div className="control-top">
          <div className="pads" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} ref={(el) => void (padRefs.current[i] = el)} className={i === 0 ? 'pad pad-down' : 'pad'} />
            ))}
          </div>
          <button className="icon-btn" onClick={pause} aria-label="Pause" disabled={paused}>
            <span className="pause-glyph" />
          </button>
        </div>

        <div className="hand" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="card-slot" />
          ))}
        </div>

        <div className="grade-row">
          <div ref={gradeRef} className="grade" />
          <div className="timing-tally">
            <span data-grade="tight">{hud.tight}</span>
            <span data-grade="good">{hud.good}</span>
            <span data-grade="off">{hud.off}</span>
          </div>
        </div>

        <div className="lanes">
          {LANE_NAMES.map((name, lane) => (
            <button
              key={name}
              ref={(el) => void (laneRefs.current[lane] = el)}
              className={`lane-btn lane-${lane}`}
              onPointerDown={(e) => {
                e.preventDefault();
                play(lane, e.timeStamp);
              }}
              onAnimationEnd={(e) => e.currentTarget.classList.remove('hit')}
            >
              {name}
            </button>
          ))}
        </div>
      </section>

      {paused && (
        <div className="overlay" role="dialog" aria-modal="true" aria-label={started ? 'Paused' : 'Start'}>
          <div className="overlay-top">
            <h1 className="title">Headliners</h1>
            {started ? (
              <p className="lede">Paused. Your run is right where you left it.</p>
            ) : (
              <p className="lede">
                Rhythm sandbox. Tap a lane on the beat to clear the shambler closest to the stage. The wide amber light
                is beat one.
              </p>
            )}
          </div>
          <div className="overlay-controls">
            <label className="toggle">
              <input type="checkbox" checked={relaxed} onChange={toggleRelaxed} />
              <span className="toggle-track" aria-hidden="true" />
              <span>Relaxed timing</span>
            </label>
            <button className="primary-btn" onClick={resume}>
              {started ? 'Resume' : 'Start'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
