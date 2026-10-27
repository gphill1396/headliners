import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';
import {
  BEAT_UNITS,
  beatInBar,
  createState,
  ENEMIES,
  getCard,
  HEADLINERS,
  bossKind,
  isBigChain,
  LANES,
  MAX_ENERGY,
  milliToMs,
  ownedCards,
  type CrowdGainReason,
  type EnemyKind,
  type EngineEvent,
  type EngineState,
  type Grade,
  type HeadlinerId,
} from '../engine';
import { addBurst, createFx, decayFx, depthToFraction, drawField, fitCanvas, GATE_COLORS, LANE_PX } from '../render/field';
import { PALETTE } from '../render/palette';
import { CardTile } from './CardTile';
import { cardText, KEYWORD_TEXT } from '../content/text';
import { formatNumber } from './format';
import { LoadInOverlay } from './LoadInOverlay';
import { EvolveOverlay, GameOverOverlay, PauseOverlay, PickOverlay, TitleOverlay, type TitleScreen } from './Overlays';
import { SongbookOverlay } from './SongbookOverlay';
import { EventOverlay, MapOverlay, RestOverlay, ShopOverlay, TourEndOverlay } from './TourOverlays';
import { CollectionOverlay } from './CollectionOverlay';
import { deckProblems, EVOLVE_LEVEL, levelFor, recordRunInCollection, unlockedHeat, type Collection } from '../meta/collection';
import { dailyDate, dailySeed, dailyTeam, resultFrom, shareText, streak, type DailyHistory } from '../meta/daily';
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
  loadCollection,
  loadDeckChoice,
  loadHeadliner,
  loadTeam,
  loadHeat,
  saveHeat,
  loadDaily,
  saveDaily,
  loadMode,
  loadRun,
  loadSettings,
  recordRun,
  saveCollection,
  saveDeckChoice,
  saveHeadliner,
  saveTeam,
  saveMode,
  saveRun,
  saveSettings,
  type Bests,
  type GameMode,
  type Settings,
} from './storage';

const LANE_NAMES = ['Left', 'Mid', 'Right'] as const;
/** Hold this long without moving to see a card's full text or an enemy's trait. */
const LONG_PRESS_MS = 450;
/** Move a card this far and it becomes a drag. */
const DRAG_START_PX = 14;

interface Inspect {
  title: string;
  body: string;
  lines: string[];
}

function cardInspect(cardId: string): Inspect {
  const def = getCard(cardId);
  return {
    title: `${def.name} · ${def.cost}`,
    body: cardText(def),
    lines: [...new Set(def.keywords)].map((k) => KEYWORD_TEXT[k]).concat(def.flavor ? [`“${def.flavor}”`] : []),
  };
}
/** How far ahead the band's notes are scheduled. Long enough to ride out a slow frame, short enough to follow the board. */
const MUSIC_LOOKAHEAD_MS = 220;
const LANE_KEYS: Record<string, number> = { j: 0, k: 1, l: 2, ArrowLeft: 0, ArrowDown: 1, ArrowRight: 2 };
const GRADE_LABEL: Record<Grade, string> = { tight: 'Tight', good: 'Good', off: 'Off' };
const REJECT_TEXT = {
  energy: 'Not enough energy yet. You gain 1 every beat.',
  'not-in-hand': 'That card already left your hand.',
  lane: 'Pick a lane.',
  'not-playing': 'Wait for the next wave.',
  cooldown: 'Your ability is still cooling down.',
  busy: 'Let the ability finish before you switch the lead.',
  cycled: 'That one just came in. Swap it next bar.',
  shifted: 'One Shift per bar.',
} as const;
/** Short banner lines and in-use button labels for each headliner's ability. */
const ACTIVE_BANNER: Record<HeadlinerId, string> = {
  thrum: 'Every unit fires on every eighth note',
  lyra: 'Every gate works twice as hard',
  clatter: 'A Squire in every lane',
  aria: 'Every enemy holds still',
  riot: 'All damage doubled',
};
const ACTIVE_ON: Record<HeadlinerId, string> = { thrum: 'Filling', lyra: 'Swelling', clatter: 'All in', aria: 'Holding', riot: 'Rioting' };


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
  /** The boss's phase, 0 when there isn't one. */
  bossPhase: 0 | 1 | 2 | 3;
  /** Team Tour: the three members (the lead is `headliner`). */
  team: HeadlinerId[] | null;
  /** The Hush, phase 2: the beat dots go quiet. */
  hushed: boolean;
  /** Tour: "Act 1 · Gig", shown where Encore shows the wave. */
  tourLabel: string | null;
  /** Changes whenever a Tour menu's contents change, so its overlay re-arms. */
  menuKey: string;
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
    bossPhase: s.boss?.phase ?? 0,
    team: s.headliner.team ? [...s.headliner.team] : null,
    hushed: s.boss?.phase === 2 && bossKind(s) === 'hush',
    tourLabel: s.tour
      ? `Act ${s.tour.act}${s.tour.fight ? ` · ${FIGHT_LABEL[s.tour.fight.kind]}` : ''}`
      : s.daily && s.wave.index > 0
        ? `${s.daily.scored ? 'Daily' : 'Practice'} · Wave ${s.wave.index}`
        : null,
    menuKey: s.tour ? `${s.phase}:${s.tour.at}:${s.tour.act}:${s.pick.join(',')}:${s.tour.merch}:${s.tour.shop?.cards.filter((c) => c.sold).length ?? 0}` : s.phase,
    fillIn: Math.max(0, s.headliner.readyBeat - s.clock.beat),
    filling,
    phase: s.phase,
    mode: s.mode,
    hand: s.hand.map((c) => ({ iid: c.iid, cardId: c.cardId })),
    queuedLanes: [0, 1, 2].map((l) => s.queue.filter((q) => q.lane === l && !q.isEcho).length),
    gates: s.gates.map((g) => ({ id: g.id, lane: g.lane, depth: g.depth, kind: g.kind, amount: g.amount, hexed: g.hexed === true })),
  };
}

function newRun(settings: Settings, headliner: HeadlinerId, mode: GameMode = 'encore', collection?: Collection, deckId?: string | null, team?: HeadlinerId[], heat = 0): EngineState {
  // The UI picks the seed; the engine never reads the clock itself.
  const seed = `run-${new Date().toISOString()}`;
  // The Daily Setlist: the day's seed and band, the same for everyone. The first run of the day is the scored one.
  if (mode === 'daily') {
    const date = dailyDate(new Date());
    const history = loadDaily();
    const scored = !history[date]?.started;
    if (scored) saveDaily({ ...history, [date]: { started: true } });
    return createState({ seed: dailySeed(date), relaxedTiming: settings.relaxedTiming, team: dailyTeam(date), daily: { date, scored } });
  }
  // Tour takes a team of 3 (S2.4); the first one picked leads.
  if (mode === 'tour' && team && team.length === 3) return createState({ seed, relaxedTiming: settings.relaxedTiming, mode, team, heat });
  if (mode === 'tour' || !collection) return createState({ seed, relaxedTiming: settings.relaxedTiming, headliner, mode });
  // Encore can use a saved Workshop deck and the headliner's permanent evolution from the Collection.
  const deck = collection.decks.find((d) => d.id === deckId && d.headliner === headliner);
  const progress = collection.headliners[headliner];
  return createState({
    seed,
    relaxedTiming: settings.relaxedTiming,
    headliner,
    mode,
    ...(deck && deckProblems(deck, collection).length === 0 ? { deck: deck.cards } : {}),
    ...(levelFor(progress.xp) >= EVOLVE_LEVEL && progress.evolution !== null ? { evolution: progress.evolution } : {}),
  });
}

/** Phases where a menu is up and the band plays on, muffled, behind it. */
const MENU_PHASES: EngineState['phase'][] = ['picking', 'evolving', 'map', 'shop', 'rest', 'event'];
const FIGHT_LABEL = { fight: 'Show', elite: 'Tournament', boss: 'Boss' } as const;

/** A short reason after "+1 crowd" (kept to a word or two). */
const GAIN_LABEL: Record<CrowdGainReason, string> = {
  clean: ' · Clean set',
  singalong: ' · Sing-along',
  card: '',
  riot: '',
  boss: '',
  tour: '',
};

/** Each boss's phase 2 and phase 3 banners: [title, one short line]. */
const BOSS_PHASE_BANNER: Partial<Record<EnemyKind, [[string, string], [string, string]]>> = {
  hush: [
    ['Hushed', 'The beat goes quiet. No timing bonuses.'],
    ['Ogres!', 'The Hush calls for backup'],
  ],
  critic: [
    ['Unimpressed', 'Armor off, but your chain stops growing'],
    ['Shamans!', 'The Black Knight calls for Shamans'],
  ],
  'dead-air': [
    ['It landed', 'Every shot hits now. Wisps are coming.'],
    ['Rush!', 'Everything else runs at the stage'],
  ],
};

function gateLabel(kind: Hud['gates'][number]['kind'], amount: number, lane: number): string {
  switch (kind) {
    case 'aim':
      return lane === 0 ? 'Horn →' : lane === LANES - 1 ? '← Horn' : '← Horn →';
    case 'copy':
      return `×${amount}`;
    case 'damage':
      return `+${amount}`;
    case 'splash':
      return 'Splash';
    case 'pierce':
      return `Pierce +${amount}`;
    case 'shred':
      return 'Tinker';
    case 'slow':
      return 'Vibrato';
    case 'lift':
      return 'Anti-Air';
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
  const [team, setTeam] = useState<HeadlinerId[]>(loadTeam);
  const [heat, setHeat] = useState<number>(loadHeat);
  const [dailyHistory, setDailyHistory] = useState<DailyHistory>(loadDaily);
  const [shareNote, setShareNote] = useState<string | null>(null);
  /** Share a Daily result: the phone's share sheet if there is one, otherwise copy it. */
  const shareDaily = useCallback(async (text: string) => {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ text });
        return;
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setShareNote('Copied. Paste it anywhere.');
    } catch {
      setShareNote("Couldn't copy here.");
    }
  }, []);
  const today = dailyDate(new Date());
  const todayEntry = dailyHistory[today];
  const todayShare = todayEntry?.result ? shareText(todayEntry.result, streak(dailyHistory, today)) : null;
  const [inspect, setInspect] = useState<Inspect | null>(null);
  const [mode, setMode] = useState<GameMode>(loadMode);
  const [collection, setCollection] = useState<Collection>(loadCollection);
  const [collectionOpen, setCollectionOpen] = useState(false);
  /** The Songbook (S4.6): null when shut; from Pause it opens on the run's deck. */
  const [songbook, setSongbook] = useState<{ deck?: string[] } | null>(null);
  /** On the title: who's picked, so the waiting beat plays their style. Null during a run. */
  const titlePickRef = useRef<{ headliner: HeadlinerId; team?: HeadlinerId[] } | null>(null);
  /** Where the title screen opens: the splash on launch, the menu when coming back from a run. */
  const [titleStart, setTitleStart] = useState<TitleScreen>('splash');
  const [loadInOpen, setLoadInOpen] = useState(false);
  const [deckChoice, setDeckChoice] = useState(loadDeckChoice);
  const [runProgress, setRunProgress] = useState<string | null>(null);
  /** What the last Tour fight paid, for the pick screen. */
  const lastReward = useRef<{ kind: string; merch: number } | null>(null);
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
      // On the title, the waiting beat is in the style of whoever you've picked (S4.7).
      const handoff = conductor.tick(now, synth, style, () => {
        const m = mixFrom(runner.state);
        const pick = titlePickRef.current;
        return pick ? { ...m, headliner: pick.headliner, ...(pick.team ? { team: pick.team } : { team: undefined }) } : m;
      });
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
    // Daily Setlist: the day's scored attempt keeps its result (practice runs don't).
    if (s.daily?.scored) {
      const history = loadDaily();
      const next = { ...history, [s.daily.date]: { started: true, result: resultFrom(s, s.daily.date) } };
      saveDaily(next);
      setDailyHistory(next);
    }
    // The Collection: XP, unlocks and card history (SPEC S2.2).
    if (s.mode !== 'tutorial') {
      const rec = recordRunInCollection(loadCollection(), s);
      saveCollection(rec.collection);
      setCollection(rec.collection);
      const members = s.headliner.team ?? [s.headliner.id];
      const names = members.map((id) => HEADLINERS[id].name);
      const parts = [`+${rec.xp} XP for ${names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0]}`];
      for (const up of rec.levelUps) parts.push(members.length > 1 ? `${HEADLINERS[up.headliner].name} level ${up.level}!` : `level ${up.level}!`);
      if (rec.newlyUnlocked.length) parts.push(`unlocked ${rec.newlyUnlocked.map((id) => getCard(id).name).join(', ')}`);
      setRunProgress(parts.join(' · '));
    }
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
            if (getCard(e.cardId).type === 'riff') playRiff(sfx, e.cardId, e.lane, e.beat, s.clock.bpm, settingsRef.current.chillMusic ? 0.65 : 1, s.headliner.id);
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
          else if (e.type === 'shifted') sfx.place('unit');
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
          case 'crowdGain':
            // Crowd coming back gets the same spot as crowd leaving, in green. (Boss and Tour stops have their own banners.)
            if (e.reason === 'boss' || e.reason === 'tour') break;
            pop(`+${e.amount} crowd${GAIN_LABEL[e.reason]}`, 1, 84_000, 'pop-gain');
            break;
          case 'crowdCost':
            // Feedback cards cost crowd; say so where the leaks show, so it never looks like a mystery leak.
            pop(`-${e.amount} crowd · Feedback`, e.lane, 88_000, 'pop-leak');
            break;
          case 'shifted':
            fx.laneFlash[e.from] = 0.6;
            fx.laneFlash[e.to] = 0.6;
            fx.flashColor[e.from] = PALETTE.cream;
            fx.flashColor[e.to] = PALETTE.cream;
            pop('Shift', e.to, 30_000, 'pop-note');
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
          case 'bossPhase': {
            const banner = e.phase > 1 ? BOSS_PHASE_BANNER[e.boss]?.[e.phase - 2] : undefined;
            if (banner) showBanner(banner[0], banner[1]);
            break;
          }
          case 'bossEnd':
            showBanner(e.defeated ? `${ENEMIES[e.boss].name}: beaten` : 'It got through', e.defeated ? `+${e.crowd} crowd` : `${e.crowd} crowd`);
            break;
          case 'healed':
            pop(`+${Math.round(e.amount)}`, e.lane, e.depth, 'pop-note');
            break;
          case 'hatched':
            pop('Hatched!', e.lane, e.depth, 'pop-note');
            break;
          case 'split':
            pop('Split!', e.lane, e.depth, 'pop-note');
            break;
          case 'waveStart': {
            const names = e.kinds.map((k) => ENEMIES[k].name);
            const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] ?? '';
            const fresh = e.debut?.find((k) => k !== 'shambler');
            if (e.boss && e.bossKind) showBanner(`Wave ${e.index}`, ENEMIES[e.bossKind].name, e.debut?.includes(e.bossKind) ? ENEMIES[e.bossKind].tip : undefined);
            else if (fresh) showBanner(`Wave ${e.index}`, `New: ${ENEMIES[fresh].name}`, ENEMIES[fresh].tip);
            else showBanner(`Wave ${e.index}`, list);
            break;
          }
          case 'energy':
            if (e.reason === 'tight') pop('+1 energy', 1, 80_000, 'pop-energy');
            break;
          case 'fill': {
            const active = HEADLINERS[e.headliner].active;
            // Abilities land on the beat too: Off fizzles, Good is a beat shorter.
            if (e.grade === 'off') flashInfo(`<strong>Off</strong><span>${active.name} missed the beat. Try again in a moment.</span>`, 'off');
            else showBanner(`${active.name}!`, e.grade === 'good' ? `${ACTIVE_BANNER[e.headliner]} (Good: a beat shorter)` : ACTIVE_BANNER[e.headliner]);
            break;
          }
          case 'pocket':
            if (e.depth === 10 && e.delta > 0) pop('Deep in the pocket', 1, 30_000, 'pop-pocket');
            else if (e.depth === 5 && e.delta > 0) pop('In the pocket', 1, 30_000, 'pop-pocket');
            else if (e.depth === 0 && e.delta <= -4) pop('Lost the pocket', 1, 30_000, 'pop-note');
            break;
          case 'pickOffered':
          case 'evolveOffered':
            if (conductorRef.current.mode === 'engine') handToConductor('muffled', s);
            break;
          case 'fightWon':
            lastReward.current = { kind: e.kind, merch: e.merch };
            showBanner(e.kind === 'boss' ? 'Boss beaten' : "Show's over", `+${e.merch} coin`);
            break;
          case 'actStart':
          case 'tourStop':
            lastReward.current = null;
            break;
          case 'tourWon':
            break;
          case 'evolved': {
            const evo = HEADLINERS[e.headliner].evolutions.find((x) => x.id === e.evolution)!;
            showBanner(`${HEADLINERS[e.headliner].name} evolves`, evo.name);
            break;
          }
          case 'gameOver':
            break;
          default:
            break;
        }
      }
      tutorialTick.current?.(events, s);
      if (events.some((e) => e.type === 'gameOver' || e.type === 'tourWon')) {
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
        // Schedule every eighth note that falls inside the look-ahead, not just the next one: on a
        // slow frame (a busy phone, a touch) the old one-per-frame scheduler skipped notes, and the
        // band seemed to drop out. An eighth already in the past is skipped, never played late.
        const pos = s.clock.beat * BEAT_UNITS + s.clock.phase;
        const current = Math.floor(pos / (BEAT_UNITS / 2));
        if (lastEighthScheduled.current < current) lastEighthScheduled.current = current;
        const mix = mixFrom(s);
        for (let next = lastEighthScheduled.current + 1; ; next++) {
          const tickAt = s.tick + (next * (BEAT_UNITS / 2) - pos) / s.clock.bpm;
          const at = runner.realTimeOfTick(tickAt);
          if (at - now >= MUSIC_LOOKAHEAD_MS) break;
          lastEighthScheduled.current = next;
          scheduleGroove(synth, mix, next, synth.audioTimeAt(at), 30 / s.clock.bpm, style);
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

  // The title's waiting beat follows your pick (a saved run keeps its own band).
  useEffect(() => {
    titlePickRef.current =
      view === 'title' && !canResume && mode !== 'daily' ? { headliner: mode === 'tour' && team.length ? team[0]! : headliner, ...(mode === 'tour' && team.length ? { team } : {}) } : null;
  }, [view, canResume, mode, team, headliner]);

  // Keep the selected card valid as the hand changes.
  useEffect(() => {
    if (selected !== null && !hud.hand.some((c) => c.iid === selected)) setSelected(null);
  }, [hud.hand, selected]);

  // Clear the "pick sent" flag once the engine leaves the pick screen.
  useEffect(() => {
    setPickSent(false);
  }, [hud.phase, hud.menuKey]);

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
    // The hint is only for the soundcheck; after that, just what the card does.
    el.innerHTML = `<span>${cardText(def)}${tutStepRef.current !== null ? ' <em>Now tap a lane on the beat.</em>' : ''}</span>`;
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
        else flashInfo('<span>Tap a card first. Or slide to another lane to Shift your band (2 energy).</span>', 'off');
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

  // ---------------------------------------------------------------- drag, long-press, swap

  /** Which lane button (if any) is under a point on screen. */
  const laneAt = (x: number, y: number): number | null => {
    for (let lane = 0; lane < LANES; lane++) {
      const r = laneRefs.current[lane]?.getBoundingClientRect();
      if (r && x >= r.left && x <= r.right && y >= r.top - 12 && y <= r.bottom) return lane;
    }
    return null;
  };

  /** Drop a dragged card on a lane: a play, timed to when the finger lifts. */
  const commitDrop = (iid: number, lane: number, timeStamp: number) => {
    if (!runner.running || runner.state.phase !== 'playing') return;
    runner.send({ type: 'commit', iid, lane, permille: 0 }, timeStamp);
    setSelected(null);
    showCardText(null);
    const btn = laneRefs.current[lane];
    if (btn) {
      btn.classList.remove('hit');
      void btn.offsetWidth;
      btn.classList.add('hit');
    }
  };

  /**
   * A press on a card in hand. Move it more than a few pixels and it becomes a drag
   * (drop on a lane to play); hold still and it opens the full card text.
   */
  const pressCard = (iid: number, cardId: string, e: React.PointerEvent) => {
    const start = { x: e.clientX, y: e.clientY };
    let dragging = false;
    let ghost: HTMLDivElement | null = null;
    const timer = window.setTimeout(() => {
      if (!dragging) setInspect(cardInspect(cardId));
    }, LONG_PRESS_MS);
    const clearDrop = () => laneRefs.current.forEach((b) => b?.classList.remove('drop'));
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      if (!dragging && dx * dx + dy * dy > DRAG_START_PX * DRAG_START_PX) {
        dragging = true;
        window.clearTimeout(timer);
        setInspect(null);
        ghost = document.createElement('div');
        ghost.className = 'drag-ghost';
        ghost.textContent = getCard(cardId).name;
        document.body.appendChild(ghost);
      }
      if (dragging && ghost) {
        ghost.style.transform = `translate(${ev.clientX}px, ${ev.clientY}px)`;
        const lane = laneAt(ev.clientX, ev.clientY);
        laneRefs.current.forEach((b, i) => b?.classList.toggle('drop', i === lane));
      }
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.clearTimeout(timer);
      setInspect(null);
      if (!dragging) return;
      ghost?.remove();
      clearDrop();
      const lane = ev.type === 'pointerup' ? laneAt(ev.clientX, ev.clientY) : null;
      if (lane !== null) commitDrop(iid, lane, ev.timeStamp);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  /**
   * A press on a lane button. With a card selected it plays at once (timed to the press).
   * With none, slide to another lane and let go to Shift: the two lanes swap their units (S4.3).
   */
  const pressLane = (lane: number, e: React.PointerEvent) => {
    const step = tutStepRef.current === null ? null : TUTORIAL[tutStepRef.current];
    if (selectedRef.current !== null || step?.practiceTaps || !runner.running || runner.state.phase !== 'playing') {
      playLane(lane, e.timeStamp);
      return;
    }
    let target: number | null = lane;
    laneRefs.current[lane]?.classList.add('shift-from');
    const mark = () => laneRefs.current.forEach((b, i) => b?.classList.toggle('shift-to', i === target && i !== lane));
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      target = laneAt(ev.clientX, ev.clientY);
      mark();
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      laneRefs.current.forEach((b) => b?.classList.remove('shift-from', 'shift-to'));
      if (ev.type !== 'pointerup') return;
      const to = laneAt(ev.clientX, ev.clientY);
      if (to === lane || to === null) playLane(lane, ev.timeStamp);
      else if (runner.running && runner.state.phase === 'playing') runner.send({ type: 'shift', from: lane, to }, ev.timeStamp);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  /** Long-press an enemy on the field to see what it does. */
  const pressField = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const fx = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const fy = ((e.clientY - rect.top) / rect.height) * canvas.height;
    const start = { x: e.clientX, y: e.clientY };
    const timer = window.setTimeout(() => {
      let best: { d: number; kind: keyof typeof ENEMIES } | null = null;
      for (const en of runner.state.enemies) {
        if (en.hp <= 0 || en.depth < 0) continue;
        const wide = ENEMIES[en.kind].wide;
        const ex = wide ? canvas.width / 2 : en.lane * LANE_PX + LANE_PX / 2;
        const ey = depthToFraction(en.depth) * canvas.height - 8;
        const d = (ex - fx) * (ex - fx) + (ey - fy) * (ey - fy) * (wide ? 0.2 : 1);
        if (d < (wide ? 2_000 : 400) && (!best || d < best.d)) best = { d, kind: en.kind };
      }
      if (best) setInspect({ title: ENEMIES[best.kind].name, body: ENEMIES[best.kind].trait, lines: [] });
    }, LONG_PRESS_MS);
    const end = (ev: PointerEvent) => {
      if (ev.type === 'pointermove') {
        const dx = ev.clientX - start.x;
        const dy = ev.clientY - start.y;
        if (dx * dx + dy * dy < DRAG_START_PX * DRAG_START_PX) return;
      }
      window.clearTimeout(timer);
      setInspect(null);
      window.removeEventListener('pointermove', end);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
    window.addEventListener('pointermove', end);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };

  /** Discard-cycle the selected card for 1 energy. */
  const swapSelected = (timeStamp: number) => {
    const iid = selectedRef.current;
    if (iid === null) return;
    runner.send({ type: 'cycle', iid }, timeStamp);
    setSelected(null);
    showCardText(null);
  };

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
    if (MENU_PHASES.includes(s.phase)) {
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
    runner.load(newRun(settings, headliner, mode, collection, deckChoice[headliner] ?? null, team, Math.min(heat, unlockedHeat(collection))));
    fxRef.current = createFx();
    overlayRef.current?.replaceChildren();
    setSelected(null);
    setHud(sampleHud(runner.state));
    startPlaying();
  };

  /** Pause or end of run → the title screen (S4.4). A run in progress stays saved, ready to resume. */
  const goHome = () => {
    runner.pause();
    if (tutStepRef.current !== null) {
      // Leaving the soundcheck early: it isn't marked done, and any saved run is still there.
      tutStepRef.current = null;
      setTutStep(null);
      setNudge(null);
      savedRun.current = loadRun();
      setCanResume(savedRun.current !== null);
    } else if (view === 'paused') {
      saveRun(runner.state);
      savedRun.current = null;
      setCanResume(true);
    }
    setSelected(null);
    setTitleStart('menu');
    setView('title');
  };

  /** Tour menus: the band stays muffled, so just send the choice. */
  const sendMenu = (input: Parameters<typeof runner.send>[0]) => {
    setPickSent(true);
    runner.send(input);
  };

  /** Tour: go to a stop. Fights bring the band back in on the next beat 1, like after a card pick. */
  const travel = (node: number) => {
    const kind = runner.state.tour?.nodes.find((n) => n.id === node)?.kind;
    if (kind !== 'fight' && kind !== 'elite' && kind !== 'boss') return sendMenu({ type: 'travel', node });
    setPickSent(true);
    const now = performance.now();
    const conductor = conductorRef.current;
    const beat = runner.state.clock.beat;
    const at = conductor.nextBeatAt(now, beatInBar(beat), 1);
    conductor.handBackAt(at, beat);
    lastEighthScheduled.current = 2 * beat;
    runner.send({ type: 'travel', node });
    runner.holdUntil(at, now);
  };

  const pick = (index: number | null) => {
    if (runner.state.mode === 'tour') return sendMenu({ type: 'pick', index });
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

  /** Same as a card pick: the band comes back in on the next beat 1. */
  const evolve = (index: 0 | 1, member?: HeadlinerId) => {
    if (runner.state.mode === 'tour') return sendMenu({ type: 'evolve', index, ...(member ? { headliner: member } : {}) });
    setPickSent(true);
    const now = performance.now();
    const conductor = conductorRef.current;
    const beat = runner.state.clock.beat;
    const at = conductor.nextBeatAt(now, beatInBar(beat), 1);
    conductor.handBackAt(at, beat);
    runner.send({ type: 'evolve', index });
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
      setTitleStart('menu');
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
        <span className="hud-wave">{hud.mode === 'tutorial' ? 'Soundcheck' : hud.tourLabel ?? (hud.wave > 0 ? `Wave ${hud.wave}` : 'Get ready')}</span>
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
        <canvas ref={canvasRef} className="field-canvas" aria-label="Playfield: three lanes" onPointerDown={pressField} />
        {inspect && (
          <div className="inspect" role="status">
            <strong>{inspect.title}</strong>
            <p>{inspect.body}</p>
            {inspect.lines.map((l) => (
              <p key={l} className="muted">
                {l}
              </p>
            ))}
          </div>
        )}
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
          <div className={`beat-stack${hud.hushed ? ' hushed' : ''}`}>
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
                onPress={(e) => pressCard(card.iid, card.cardId, e)}
              />
            );
          })}
        </div>

        <div className="info-row">
          <div ref={infoRef} className="info" aria-live="polite" />
          {selected !== null && view === 'playing' && tutStep === null && (
            <button
              className="swap-btn"
              disabled={hud.energy < 1}
              aria-label="Swap this card for the next one, 1 energy"
              onPointerDown={(e) => {
                e.preventDefault();
                swapSelected(e.timeStamp);
              }}
            >
              Swap
            </button>
          )}
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
          {hud.team && (
            <div className="lead-chips" role="radiogroup" aria-label="Lead: whose ability the button fires">
              {hud.team.map((id) => (
                <button
                  key={id}
                  role="radio"
                  aria-checked={id === hud.headliner}
                  aria-label={`${HEADLINERS[id].name}: ${HEADLINERS[id].active.name}`}
                  className={`lead-chip hl-${id}${id === hud.headliner ? ' on' : ''}`}
                  disabled={hud.filling || view !== 'playing'}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    if (id !== hud.headliner) runner.send({ type: 'lead', headliner: id }, e.timeStamp);
                  }}
                >
                  {HEADLINERS[id].name[0]}
                </button>
              ))}
            </div>
          )}
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
                // Let the slide reach the other lane buttons (no implicit capture on touch).
                if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
                pressLane(lane, e);
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
          startAt={titleStart}
          onSongbook={() => setSongbook({})}
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
          team={team}
          heat={Math.min(heat, unlockedHeat(collection))}
          maxHeat={unlockedHeat(collection)}
          onHeat={(h) => {
            setHeat(h);
            saveHeat(h);
          }}
          daily={{
            team: dailyTeam(today),
            played: todayEntry?.started === true,
            result: todayEntry?.result ?? null,
            streak: streak(dailyHistory, today),
            onShare: todayShare ? () => void shareDaily(todayShare) : null,
            note: shareNote,
          }}
          onTeam={(id) => {
            // Tap to add (up to 3, in order: the first leads); tap again to drop.
            const next = team.includes(id) ? team.filter((t) => t !== id) : team.length < 3 ? [...team, id] : team;
            setTeam(next);
            saveTeam(next);
            setHeadliner(id);
            saveHeadliner(id);
          }}
          mode={mode}
          onMode={(m) => {
            setMode(m);
            saveMode(m);
          }}
          decks={collection.decks.filter((d) => d.headliner === headliner && deckProblems(d, collection).length === 0).map((d) => ({ id: d.id, name: d.name }))}
          deckChoice={collection.decks.some((d) => d.id === deckChoice[headliner] && deckProblems(d, collection).length === 0) ? deckChoice[headliner]! : null}
          onDeckChoice={(id) => {
            const next = { ...deckChoice, [headliner]: id ?? undefined };
            setDeckChoice(next);
            saveDeckChoice(next);
          }}
          onCollection={() => setCollectionOpen(true)}
          onLoadIn={() => setLoadInOpen(true)}
          settings={settings}
          onToggle={toggleSetting}
        />
      )}
      {view === 'paused' && (
        <PauseOverlay
          state={runner.state}
          tutorial={tutStep !== null}
          onResume={() => startPlaying()}
          onHome={goHome}
          onSkipTutorial={finishTutorial}
          onSongbook={() => setSongbook({ deck: ownedCards(runner.state).map((c) => c.cardId) })}
          settings={settings}
          onToggle={toggleSetting}
        />
      )}
      {view === 'playing' && hud.phase === 'picking' && !pickSent && (
        <PickOverlay
          key={hud.menuKey}
          state={runner.state}
          onPick={pick}
          title={runner.state.mode === 'tour' ? (runner.state.tour?.fight === null && lastReward.current ? "Show's over" : 'Draft') : undefined}
          lede={
            runner.state.mode === 'tour'
              ? lastReward.current
                ? `+${lastReward.current.merch} coin. Pick a card for your deck, or skip to keep it lean.`
                : 'Pick a card for your deck, or skip to keep it lean.'
              : undefined
          }
        />
      )}
      {view === 'playing' && hud.phase === 'map' && !pickSent && <MapOverlay key={hud.menuKey} state={runner.state} onTravel={travel} />}
      {view === 'playing' && hud.phase === 'rest' && !pickSent && (
        <RestOverlay key={hud.menuKey} state={runner.state} onRest={(choice, iid) => sendMenu({ type: 'rest', choice, iid })} />
      )}
      {view === 'playing' && hud.phase === 'shop' && <ShopOverlay state={runner.state} onShop={(a) => runner.send({ type: 'shop', ...a })} />}
      {view === 'playing' && hud.phase === 'event' && !pickSent && (
        <EventOverlay key={hud.menuKey} state={runner.state} onChoose={(option) => sendMenu({ type: 'event', option })} />
      )}
      {view === 'playing' && hud.phase === 'evolving' && !pickSent && <EvolveOverlay state={runner.state} onEvolve={evolve} />}
      {view === 'over' && runner.state.mode === 'tour' && <TourEndOverlay state={runner.state} onAgain={startNew} onHome={goHome} progress={runProgress ?? undefined} />}
      {view === 'over' && runner.state.mode !== 'tour' && (
        <GameOverOverlay
          state={runner.state}
          bests={bests}
          newBest={newBest}
          onAgain={startNew}
          onHome={goHome}
          progress={runProgress ?? undefined}
          daily={
            runner.state.daily
              ? {
                  practice: !runner.state.daily.scored,
                  onShare: runner.state.daily.scored && todayShare ? () => void shareDaily(todayShare) : null,
                  note: shareNote,
                }
              : undefined
          }
        />
      )}
      {loadInOpen && <LoadInOverlay onClose={() => setLoadInOpen(false)} />}
      {songbook && <SongbookOverlay deck={songbook.deck} onClose={() => setSongbook(null)} />}
      {collectionOpen && (
        <CollectionOverlay
          collection={collection}
          onChange={(c) => {
            setCollection(c);
            saveCollection(c);
          }}
          onClose={() => setCollectionOpen(false)}
        />
      )}
    </div>
  );
}
