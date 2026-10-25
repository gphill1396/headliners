import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BEAT_UNITS,
  beatInBar,
  createState,
  ENEMIES,
  getCard,
  HEADLINERS,
  isBigChain,
  LANES,
  MAX_ENERGY,
  milliToMs,
  type EngineEvent,
  type EngineState,
  type Grade,
  type HeadlinerId,
} from '../engine';
import { addBurst, createFx, decayFx, depthToFraction, drawField, fitCanvas, GATE_COLORS } from '../render/field';
import { PALETTE } from '../render/palette';
import { CardTile } from './CardTile';
import { formatNumber } from './format';
import { GameOverOverlay, PauseOverlay, PickOverlay, TitleOverlay } from './Overlays';
import { GameRunner, type CountIn } from './runner';
import { mixFrom, playRiff, scheduleGroove, type MusicStyle } from '../audio/groove';
import { Conductor } from '../audio/conductor';
import { Synth } from '../audio/synth';
import { createTutorialState, freshProgress, TUTORIAL, type Progress, type Target } from './tutorial';
import {
  clearRun,
  markTutorialDone,
  tutorialDone as loadTutorialDone,
  loadBests,
  loadHeadliner,
  loadRun,
  loadSettings,
  recordRun,
  saveHeadliner,
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
  cooldown: 'Your ability is still cooling down.',
} as const;
/** Short banner lines and in-use button labels for each headliner's ability. */
const ACTIVE_BANNER: Record<HeadlinerId, string> = {
  thrum: 'Every unit fires on every eighth note',
  lyra: 'Every gate works twice as hard',
  clatter: 'A Roadie in every lane',
};
const ACTIVE_ON: Record<HeadlinerId, string> = { thrum: 'Filling', lyra: 'Swelling', clatter: 'All in' };


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
  pocket: number;
  headliner: HeadlinerId;
  fillIn: number;
  filling: boolean;
  phase: EngineState['phase'];
  mode: EngineState['mode'];
  hand: { iid: number; cardId: string }[];
  queuedLanes: number[];
  gates: { id: number; lane: number; depth: number; kind: keyof typeof GATE_COLORS; amount: number; hexed: boolean }[];
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
    pocket: s.pocket.depth,
    headliner: s.headliner.id,
    fillIn: Math.max(0, s.headliner.readyBeat - s.clock.beat),
    filling,
    phase: s.phase,
    mode: s.mode,
    hand: s.hand.map((c) => ({ iid: c.iid, cardId: c.cardId })),
    queuedLanes: [0, 1, 2].map((l) => s.queue.filter((q) => q.lane === l && !q.isEcho).length),
    gates: s.gates.map((g) => ({ id: g.id, lane: g.lane, depth: g.depth, kind: g.kind, amount: g.amount, hexed: g.hexed === true })),
  };
}

function newRun(settings: Settings, headliner: HeadlinerId): EngineState {
  // The UI picks the seed; the engine never reads the clock itself.
  return createState({ seed: `run-${new Date().toISOString()}`, relaxedTiming: settings.relaxedTiming, headliner });
}

function gateLabel(kind: Hud['gates'][number]['kind'], amount: number, lane: number): string {
  switch (kind) {
    case 'aim':
      return lane === 0 ? 'Speaker →' : lane === LANES - 1 ? '← Speaker' : '← Speaker →';
    case 'copy':
      return `×${amount}`;
    case 'damage':
      return `+${amount}`;
    case 'splash':
      return 'Splash';
    case 'pierce':
      return `Pierce +${amount}`;
    case 'shred':
      return 'Toolbox';
  }
}

export function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [bests, setBests] = useState<Bests>(loadBests);
  const [newBest, setNewBest] = useState({ wave: false, score: false, chain: false });
  const savedRun = useRef<EngineState | null>(loadRun());
  const [canResume, setCanResume] = useState(savedRun.current !== null);

  const runnerRef = useRef<GameRunner | null>(null);
  if (!runnerRef.current) runnerRef.current = new GameRunner(newRun(settings, loadHeadliner()));
  const runner = runnerRef.current;
  // Dev builds only: lets automated play-throughs read the beat clock. Stripped from production.
  if (import.meta.env.DEV) {
    const w = window as unknown as { __runner?: GameRunner; __synth?: () => Synth | null };
    w.__runner = runner;
    w.__synth = () => synthRef.current;
  }

  const [view, setView] = useState<View>('title');
  const [hud, setHud] = useState<Hud>(() => sampleHud(runner.state));
  const [selected, setSelected] = useState<number | null>(null);
  const [pickSent, setPickSent] = useState(false);
  const [tutorialDone, setTutorialDone] = useState(loadTutorialDone);
  const [headliner, setHeadliner] = useState<HeadlinerId>(loadHeadliner);
  const [tutStep, setTutStep] = useState<number | null>(null);
  const [nudge, setNudge] = useState<string | null>(null);
  const [practiceHits, setPracticeHits] = useState(0);
  const tutStepRef = useRef<number | null>(null);
  const progressRef = useRef<Progress>(freshProgress());
  const synthRef = useRef<Synth | null>(null);
  const lastEighthScheduled = useRef(-1);
  /** Keeps the beat going whenever the engine isn't driving the music (title, pause, picks, game over). */
  const conductorRef = useRef<Conductor>(new Conductor());
  const tutorialTick = useRef<((events: EngineEvent[], s: EngineState) => void) | null>(null);

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

  /** Light the four stage-light pads for a beat position. */
  const drawPads = useCallback((current: number, phase: number, live: boolean) => {
    padRefs.current.forEach((pad, i) => {
      if (!pad) return;
      pad.style.setProperty('--lit', live && i === current ? (1 - phase).toFixed(3) : '0');
      const next = (current + 1) % 4;
      pad.style.setProperty('--warm', live && i === next ? Math.max(0, (phase - 0.75) * 4).toFixed(3) : '0');
    });
  }, []);

  /** The engine stops driving the music (pause, card pick, game over); the Conductor carries the beat on from here. */
  const handToConductor = useCallback(
    (mode: 'muffled' | 'fade', s: EngineState) => {
      const now = performance.now();
      const beatTime = runner.realTimeOfTick(s.tick - s.clock.phase / s.clock.bpm);
      const synth = settingsRef.current.sound ? synthRef.current : null;
      conductorRef.current.takeOver(mode, now, beatTime, s.clock.beat, s.clock.bpm, lastEighthScheduled.current + 1, synth);
    },
    [runner],
  );

  /** Create/resume audio (must happen inside a tap on iOS) and start the beat if it isn't going yet. */
  const ensureAudio = useCallback(() => {
    if (settingsRef.current.sound) {
      if (!synthRef.current) synthRef.current = Synth.create();
      synthRef.current?.resume();
    }
    const conductor = conductorRef.current;
    if (!conductor.running) conductor.startMetronome(performance.now(), runner.state.clock.bpm);
  }, [runner]);

  // The beat never stops: the metronome starts on the first tap, and this loop keeps the Conductor going
  // whenever the engine isn't driving the music.
  useEffect(() => {
    const first = () => ensureAudio();
    window.addEventListener('pointerdown', first, { once: true });
    window.addEventListener('keydown', first, { once: true });
    let raf = 0;
    const loop = (now: number) => {
      const conductor = conductorRef.current;
      const synth = settingsRef.current.sound ? synthRef.current : null;
      const style: MusicStyle = settingsRef.current.chillMusic ? 'chill' : 'full';
      const handoff = conductor.tick(now, synth, style, () => mixFrom(runner.state));
      if (handoff) {
        // Back in on the beat: the full band plays the first engine eighth, then the engine carries on.
        lastEighthScheduled.current = handoff.eighth;
        if (synth) scheduleGroove(synth, mixFrom(runner.state), handoff.eighth, synth.audioTimeAt(handoff.at), 30 / runner.state.clock.bpm, style);
      }
      if (conductor.mode !== 'engine' && conductor.running) {
        const pos = conductor.position(now);
        drawPads(pos.beat, pos.phase, true);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointerdown', first);
      window.removeEventListener('keydown', first);
    };
  }, [runner, ensureAudio, drawPads]);

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

  const showBanner = useCallback((title: string, sub: string, tip?: string) => {
    const el = bannerRef.current;
    if (!el) return;
    // Text comes from our own content files, never from the player.
    el.innerHTML = `<strong>${title}</strong><span>${sub}</span>${tip ? `<em>${tip}</em>` : ''}`;
    el.classList.remove('show', 'long');
    void el.offsetWidth;
    // A new enemy's tip stays up long enough to read.
    el.classList.add('show');
    if (tip) el.classList.add('long');
  }, []);

  const finishRun = useCallback((s: EngineState) => {
    // The band fades out over two bars, leaving the metronome: the beat never stops.
    handToConductor('fade', s);
    const result = recordRun(s);
    clearRun();
    setCanResume(false);
    setBests(result.bests);
    setNewBest(result.newBest);
    setView('over');
  }, [handToConductor]);

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
      const sfx = settingsRef.current.sound ? synthRef.current : null;
      for (const e of events) {
        if (sfx) {
          if (e.type === 'resolved') {
            if (getCard(e.cardId).type === 'riff') playRiff(sfx, e.cardId, e.lane, e.beat, s.clock.bpm, settingsRef.current.chillMusic ? 0.65 : 1);
            // The band already sounds the play; add a sparkle for Tight and a clunk for Off.
            if (!e.isEcho && e.grade !== 'good') sfx.play(e.grade);
          }
          else if (e.type === 'tapped') sfx.play(e.grade);
          else if (e.type === 'link' && e.links >= 2) sfx.link(e.links);
          else if (e.type === 'killed') sfx.kill();
          else if (e.type === 'leaked') sfx.leak();
          else if (e.type === 'showstopper') sfx.crash();
          else if (e.type === 'gatePlaced') sfx.place('gate');
          else if (e.type === 'unitPlaced') sfx.place('unit');
        }
        switch (e.type) {
          case 'graded': {
            const ms = Math.round(milliToMs(e.offsetMilli, s.clock.bpm));
            const when = Math.abs(ms) <= 2 ? 'on the beat' : ms < 0 ? `${-ms} ms early` : `${ms} ms late`;
            const mult = (e.accuracyPct / 100).toFixed(2);
            flashInfo(`<strong>${GRADE_LABEL[e.grade]} ×${mult}</strong><span>${getCard(e.cardId).name}, ${when}</span>`, e.grade);
            break;
          }
          case 'rejected':
            flashInfo(`<span>${REJECT_TEXT[e.reason]}</span>`, 'off');
            break;
          case 'tapped': {
            const ms = Math.round(milliToMs(e.offsetMilli, s.clock.bpm));
            const when = Math.abs(ms) <= 2 ? 'on the beat' : ms < 0 ? `${-ms} ms early` : `${ms} ms late`;
            flashInfo(`<strong>${GRADE_LABEL[e.grade]}</strong><span>${when}</span>`, e.grade);
            break;
          }
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
            if (e.dropped) flashInfo(`<strong>Chain dropped</strong><span>Off-beat play</span>`, 'off');
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
          case 'gateSmashed':
            fx.laneMiss[e.lane] = Math.max(fx.laneMiss[e.lane] ?? 0, 0.5);
            pop('Smash', e.lane, e.slot === 0 ? 70_000 : 48_000, 'pop-leak');
            break;
          case 'blocked':
            pop(e.broke ? 'Shield broke' : 'Blocked', e.lane, e.depth + 4_000, 'pop-note');
            break;
          case 'split':
            pop('Split!', e.lane, e.depth, 'pop-note');
            break;
          case 'waveStart': {
            const names = e.kinds.map((k) => ENEMIES[k].name);
            const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] ?? '';
            const fresh = e.debut?.find((k) => k !== 'shambler');
            if (fresh) showBanner(`Wave ${e.index}`, `New: ${ENEMIES[fresh].name}`, ENEMIES[fresh].tip);
            else showBanner(`Wave ${e.index}`, list);
            break;
          }
          case 'energy':
            if (e.reason === 'tight') pop('+1 energy', 1, 80_000, 'pop-energy');
            break;
          case 'fill': {
            const active = HEADLINERS[e.headliner].active;
            showBanner(`${active.name}!`, ACTIVE_BANNER[e.headliner]);
            break;
          }
          case 'pocket':
            if (e.depth === 10 && e.delta > 0) pop('Deep in the pocket', 1, 30_000, 'pop-pocket');
            else if (e.depth === 5 && e.delta > 0) pop('In the pocket', 1, 30_000, 'pop-pocket');
            else if (e.depth === 0 && e.delta <= -4) pop('Lost the pocket', 1, 30_000, 'pop-note');
            break;
          case 'pickOffered':
            handToConductor('muffled', s);
            break;
          case 'gameOver':
            break;
          default:
            break;
        }
      }
      tutorialTick.current?.(events, s);
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

      void countIn;
      const conductor = conductorRef.current;
      const phase = Math.min(0.999, (s.clock.phase + s.clock.bpm * alpha) / BEAT_UNITS);
      const style: MusicStyle = settingsRef.current.chillMusic ? 'chill' : 'full';

      // The engine drives the music while a run is playing; the Conductor covers every other moment.
      const synth = settingsRef.current.sound ? synthRef.current : null;
      if (synth) synth.sfx = style === 'chill' ? 0.6 : 1;
      if (synth && conductor.mode === 'engine' && s.phase === 'playing') {
        const pos = s.clock.beat * BEAT_UNITS + s.clock.phase;
        const next = Math.floor(pos / (BEAT_UNITS / 2)) + 1;
        if (next > lastEighthScheduled.current) {
          const tickAt = s.tick + (next * (BEAT_UNITS / 2) - pos) / s.clock.bpm;
          const at = runner.realTimeOfTick(tickAt);
          if (at - now < 120) {
            lastEighthScheduled.current = next;
            scheduleGroove(synth, mixFrom(s), next, synth.audioTimeAt(at), 30 / s.clock.bpm, style);
          }
        }
      }
      drawField(ctx, s, s.phase === 'playing' ? alpha : 0, fx, phase, now);

      if (conductor.mode === 'engine') drawPads(beatInBar(s.clock.beat), phase, s.phase === 'playing');

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
        if (runner.state.phase === 'playing' && conductorRef.current.mode === 'engine') handToConductor('muffled', runner.state);
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
  }, [runner, flashInfo, pop, showLink, showBanner, finishRun, handToConductor, drawPads]);

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
    el.innerHTML = `<span>${def.text} <em>Now tap a lane on the beat.</em></span>`;
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
        const step = tutStepRef.current === null ? null : TUTORIAL[tutStepRef.current];
        if (step?.practiceTaps) runner.send({ type: 'tap', lane, permille: 0 }, timeStamp);
        else flashInfo('<span>Tap a card first, then tap a lane on the beat.</span>', 'off');
        if (!step?.practiceTaps) return;
        const btn = laneRefs.current[lane];
        if (btn) {
          btn.classList.remove('hit');
          void btn.offsetWidth;
          btn.classList.add('hit');
        }
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

  /**
   * Start or resume play, dropping the engine in on the running beat: it is held
   * until the Conductor's next beat at the same place in the bar (at least two
   * beats away), so the band comes back in exactly in time.
   */
  const startPlaying = () => {
    lastFrame.current = 0;
    ensureAudio();
    const conductor = conductorRef.current;
    const s = runner.state;
    setView('playing');
    if (s.phase === 'picking') {
      // Back onto a card pick: the muffled band keeps playing until a card is chosen.
      conductor.setMode('muffled', settingsRef.current.sound ? synthRef.current : null);
      runner.start(false);
      return;
    }
    const now = performance.now();
    const at = conductor.nextBeatAt(now, beatInBar(s.clock.beat), 2);
    conductor.handBackAt(at, s.clock.beat);
    lastEighthScheduled.current = 2 * s.clock.beat;
    runner.start(false);
    runner.holdUntil(at, now);
  };

  const pauseGame = () => {
    if (conductorRef.current.mode === 'engine') handToConductor('muffled', runner.state);
    runner.pause();
    saveRun(runner.state);
    setView('paused');
  };

  const resumeSaved = () => {
    if (savedRun.current) runner.load(savedRun.current);
    savedRun.current = null;
    setHud(sampleHud(runner.state));
    startPlaying();
  };

  const startNew = () => {
    tutStepRef.current = null;
    setTutStep(null);
    clearRun();
    savedRun.current = null;
    setCanResume(false);
    runner.load(newRun(settings, headliner));
    fxRef.current = createFx();
    overlayRef.current?.replaceChildren();
    setSelected(null);
    setHud(sampleHud(runner.state));
    startPlaying();
  };

  const pick = (index: number | null) => {
    setPickSent(true);
    const now = performance.now();
    const conductor = conductorRef.current;
    const beat = runner.state.clock.beat;
    // Back in on the next beat 1 of the still-running groove, at least one beat away so it doesn't lurch.
    const at = conductor.nextBeatAt(now, beatInBar(beat), 1);
    conductor.handBackAt(at, beat);
    runner.send({ type: 'pick', index });
    runner.holdUntil(at, now);
  };

  // ---------------------------------------------------------------- soundcheck

  const goToStep = (i: number) => {
    if (i >= TUTORIAL.length) {
      finishTutorial();
      return;
    }
    tutStepRef.current = i;
    progressRef.current = freshProgress();
    setTutStep(i);
    setNudge(null);
    setPracticeHits(0);
    setSelected(null);
    for (const input of TUTORIAL[i]!.setup ?? []) runner.send(input);
  };

  tutorialTick.current = (events, s) => {
    const i = tutStepRef.current;
    if (i === null) return;
    const step = TUTORIAL[i]!;
    const p = progressRef.current;
    for (const e of events) {
      if (e.type === 'tapped') {
        p.taps += 1;
        if (e.grade !== 'off') p.hits += 1;
        setPracticeHits(p.hits);
      } else if (e.type === 'beat') p.beats += 1;
      else if (e.type === 'killed') p.kills += 1;
      else if (e.type === 'resolved' && !e.isEcho) p.plays += 1;
    }
    const before = p.nudge;
    const again = step.retry?.(events, s, p);
    if (again) for (const input of again) runner.send(input);
    if (p.nudge !== before) setNudge(p.nudge);
    if (step.done?.(events, s, p)) goToStep(i + 1);
  };

  const startTutorial = () => {
    // A saved run is left alone; the soundcheck never saves.
    runner.load(createTutorialState(settings.relaxedTiming));
    fxRef.current = createFx();
    overlayRef.current?.replaceChildren();
    setHud(sampleHud(runner.state));
    goToStep(0);
    startPlaying();
  };

  function finishTutorial() {
    markTutorialDone();
    setTutorialDone(true);
    tutStepRef.current = null;
    setTutStep(null);
    setNudge(null);
    const saved = loadRun();
    if (saved) {
      // They had a run going: back to the title so they can resume it.
      runner.pause();
      savedRun.current = saved;
      setCanResume(true);
      setView('title');
      return;
    }
    startNew();
  }

  const coachStep = tutStep === null ? null : TUTORIAL[tutStep]!;
  const selectedCardId = hud.hand.find((c) => c.iid === selected)?.cardId ?? null;
  const targets = new Set<Target>(coachStep ? coachStep.targets(selectedCardId) : []);
  const coached = (t: Target) => (targets.has(t) ? ' coach' : '');
  const activeName = HEADLINERS[hud.headliner].active.name;
  const coachedCardIid = (() => {
    for (const t of targets) {
      if (!t.startsWith('card:')) continue;
      const id = t.slice(5);
      return hud.hand.find((c) => c.cardId === id)?.iid ?? null;
    }
    return null;
  })();

  const toggleSetting = (key: keyof Settings) => {
    const next = { ...settings, [key]: !settings[key] };
    setSettings(next);
    saveSettings(next);
    if (key === 'relaxedTiming') runner.send({ type: 'setRelaxedTiming', value: next.relaxedTiming });
    if (key === 'sound' && next.sound) {
      // Toggling on is a tap, so audio can start here.
      if (!synthRef.current) synthRef.current = Synth.create();
      synthRef.current?.resume();
    }
  };

  const selectedDef = (() => {
    const card = hud.hand.find((c) => c.iid === selected);
    return card ? getCard(card.cardId) : null;
  })();

  return (
    <div className="app">
      <header className="hud">
        <span className="hud-wave">{hud.mode === 'tutorial' ? 'Soundcheck' : hud.wave > 0 ? `Wave ${hud.wave}` : 'Get ready'}</span>
        <span className={`hud-crowd${coached('crowd')}`} aria-label={`Crowd ${hud.crowd} of ${hud.maxCrowd}`}>
          <span className="hud-label">Crowd</span>
          <span className="crowd-bar">
            <span style={{ width: `${(hud.crowd / hud.maxCrowd) * 100}%` }} />
          </span>
          {hud.crowd}
        </span>
        <span className="hud-score">
          <span className="hud-label">Score</span> {formatNumber(hud.score, settings.scientific)}
        </span>
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
                color: g.hexed ? '#c06bd6' : GATE_COLORS[g.kind],
              }}
            >
              {g.hexed ? 'Hexed' : gateLabel(g.kind, g.amount, g.lane)}
            </span>
          ))}
        </div>
        <div ref={overlayRef} className="field-layer pops" aria-hidden="true" />
        <div ref={linkRef} className="link-pop" aria-hidden="true" />
        <div ref={bannerRef} className="banner" aria-live="polite" />
        {coachStep && view === 'playing' && (
          <div className="coach-panel" role="status">
            <div className="coach-head">
              <p className="coach-count">
                Soundcheck {tutStep! + 1} of {TUTORIAL.length}
              </p>
              <button className="link-btn" onClick={finishTutorial}>
                Skip soundcheck
              </button>
            </div>
            <p className="coach-title">{coachStep.title}</p>
            <p className="coach-body">{coachStep.body}</p>
            {coachStep.practiceTaps && <p className="coach-progress">On the beat: {Math.min(3, practiceHits)} of 3</p>}
            {nudge && <p className="coach-nudge">{nudge}</p>}
            {coachStep.button && (
              <div className="coach-actions">
                <button className="coach-btn" onClick={() => goToStep(tutStep! + 1)}>
                  {coachStep.button}
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      <section className="controls" aria-label="Controls">
        <div className="control-top">
          <div className="beat-stack">
            <div className={`pads${coached('pads')}`} aria-hidden="true">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} ref={(el) => void (padRefs.current[i] = el)} className={i === 0 ? 'pad pad-down' : 'pad'} />
              ))}
            </div>
            <div
              className={`pocket${hud.pocket >= 8 ? ' deep' : ''}${coached('pocket')}`}
              aria-label={`Pocket ${hud.pocket} of 10, plus ${hud.pocket * 4} percent damage`}
            >
              <span className="pocket-segs" aria-hidden="true">
                {Array.from({ length: 10 }, (_, i) => (
                  <span key={i} className={i < hud.pocket ? 'on' : ''} />
                ))}
              </span>
            </div>
          </div>
          <div ref={chainRef} className={`chain${hud.chain >= 8 ? ' hot' : ''}${hud.chain > 0 ? ' on' : ''}${coached('chain')}`}>
            <span className="chain-line">
              {hud.chain > 0 ? (
                <>
                  <span>Chain {hud.chain}</span>
                  <strong>×{(hud.mult / 100).toFixed(2).replace(/\.?0+$/, '')}</strong>
                </>
              ) : (
                <span className="muted">No chain</span>
              )}
            </span>
            <span className={`pocket-line${hud.pocket >= 8 ? ' deep' : ''}`}>
              Pocket {hud.pocket > 0 ? `+${hud.pocket * 4}%` : '—'}
            </span>
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
                coach={coachedCardIid === card.iid}
                onSelect={() => selectCard(card.iid)}
              />
            );
          })}
        </div>

        <div className="info-row">
          <div ref={infoRef} className="info" aria-live="polite" />
          <div className={`energy${coached('energy')}`} aria-label={`Energy ${hud.energy} of ${MAX_ENERGY}`}>
            <span className="energy-label">
              Energy <b>{hud.energy}</b>
            </span>
            <span className="pips">
              {Array.from({ length: MAX_ENERGY }, (_, i) => (
                <span
                  key={i}
                  className={i < hud.energy ? 'pip on' : 'pip'}
                  data-need={selectedDef && i < selectedDef.cost ? 'y' : undefined}
                />
              ))}
            </span>
          </div>
          <button
            className={`fill-btn hl-${hud.headliner}${hud.filling ? ' active' : ''}${coached('fill')}`}
            disabled={hud.fillIn > 0 || view !== 'playing'}
            onPointerDown={(e) => {
              e.preventDefault();
              activate(e.timeStamp);
            }}
          >
            {hud.filling ? ACTIVE_ON[hud.headliner] : hud.fillIn > 0 ? `${activeName} ${hud.fillIn}` : activeName}
          </button>
        </div>

        <div className="lanes">
          {LANE_NAMES.map((name, lane) => (
            <button
              key={name}
              ref={(el) => void (laneRefs.current[lane] = el)}
              className={`lane-btn${selected !== null ? ' armed' : ''}${coached('lanes') || coached(`lane-${lane}` as Target)}`}
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
          tutorialDone={tutorialDone}
          onTutorial={startTutorial}
          onResume={resumeSaved}
          onNew={startNew}
          headliner={headliner}
          onHeadliner={(id) => {
            setHeadliner(id);
            saveHeadliner(id);
          }}
          settings={settings}
          onToggle={toggleSetting}
        />
      )}
      {view === 'paused' && (
        <PauseOverlay
          state={runner.state}
          tutorial={tutStep !== null}
          onResume={() => startPlaying()}
          onRestart={tutStep !== null ? finishTutorial : startNew}
          settings={settings}
          onToggle={toggleSetting}
        />
      )}
      {view === 'playing' && hud.phase === 'picking' && !pickSent && <PickOverlay state={runner.state} onPick={pick} />}
      {view === 'over' && <GameOverOverlay state={runner.state} bests={bests} newBest={newBest} onAgain={startNew} />}
    </div>
  );
}
