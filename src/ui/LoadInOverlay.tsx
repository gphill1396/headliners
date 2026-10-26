import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { LOADIN_LEVELS } from '../content/loadin-levels';
import { dailyLoadIn, EXIT_ROW, isSolved, parse, SIZE, slideRange, TARGET, type Puzzle } from '../meta/loadin';
import { dailyDate } from '../meta/daily';

/**
 * Load-In (SPEC S4.1): slide the gear chests so the lute case reaches the wagon.
 * The board sits at the bottom of the screen (play input stays in the bottom
 * ~38%); the level list, counters, Undo and Restart sit above it.
 */

const PROGRESS_KEY = 'headliners.loadin.v1';
const DAILY_CACHE_KEY = 'headliners.loadin.daily.v1';

interface Progress {
  /** Fewest moves each pack level has been solved in, by level index. */
  best: Record<number, number>;
  /** Fewest moves for each day's daily puzzle. */
  daily: Record<string, number>;
}

function loadProgress(): Progress {
  try {
    const raw = JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? 'null') as Partial<Progress> | null;
    return { best: raw?.best ?? {}, daily: raw?.daily ?? {} };
  } catch {
    return { best: {}, daily: {} };
  }
}

function saveProgress(p: Progress): void {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
  } catch {
    /* storage full or blocked: progress just isn't kept */
  }
}

/** The day's puzzle takes a moment to make; keep it for the day. */
function loadDaily(date: string): { text: string; par: number } {
  try {
    const cached = JSON.parse(localStorage.getItem(DAILY_CACHE_KEY) ?? 'null') as { date: string; text: string; par: number } | null;
    if (cached?.date === date) return cached;
  } catch {
    /* fall through and make it */
  }
  const made = dailyLoadIn(date);
  try {
    localStorage.setItem(DAILY_CACHE_KEY, JSON.stringify({ date, ...made }));
  } catch {
    /* fine */
  }
  return made;
}

type Which = { kind: 'pack'; index: number } | { kind: 'daily'; date: string };

const CHEST_COLORS = ['#a8693a', '#8a5a34', '#b97f45', '#7d4a2a', '#9c6b3f', '#c08a52'];

export function LoadInOverlay({ onClose }: { onClose: () => void }) {
  const [progress, setProgress] = useState<Progress>(loadProgress);
  const [which, setWhich] = useState<Which | null>(null);
  const [making, setMaking] = useState(false);
  const [daily, setDaily] = useState<{ date: string; text: string; par: number } | null>(null);
  const today = dailyDate(new Date());

  const openDaily = () => {
    setMaking(true);
    // Let "Packing the wagon…" paint before the generator runs.
    window.setTimeout(() => {
      setDaily({ date: today, ...loadDaily(today) });
      setWhich({ kind: 'daily', date: today });
      setMaking(false);
    }, 30);
  };

  if (which) {
    const level = which.kind === 'pack' ? LOADIN_LEVELS[which.index]! : daily!;
    return (
      <Board
        key={which.kind === 'pack' ? `p${which.index}` : `d${which.date}`}
        title={which.kind === 'pack' ? `Level ${which.index + 1}` : 'Daily load-in'}
        text={level.text}
        par={level.par}
        best={which.kind === 'pack' ? progress.best[which.index] : progress.daily[which.date]}
        hasNext={which.kind === 'pack' && which.index + 1 < LOADIN_LEVELS.length}
        onSolved={(moves) => {
          const next: Progress =
            which.kind === 'pack'
              ? { ...progress, best: { ...progress.best, [which.index]: Math.min(moves, progress.best[which.index] ?? Infinity) } }
              : { ...progress, daily: { ...progress.daily, [which.date]: Math.min(moves, progress.daily[which.date] ?? Infinity) } };
          setProgress(next);
          saveProgress(next);
        }}
        onNext={() => which.kind === 'pack' && setWhich({ kind: 'pack', index: which.index + 1 })}
        onBack={() => setWhich(null)}
      />
    );
  }

  // Levels open in order: the next unsolved one, and everything before it.
  const open = LOADIN_LEVELS.findIndex((_, i) => progress.best[i] === undefined);
  const unlocked = open === -1 ? LOADIN_LEVELS.length : open + 1;
  return (
    <div className="overlay collection loadin" role="dialog" aria-modal="true" aria-label="Load-In">
      <div className="overlay-top">
        <h2 className="title small">Load-In</h2>
        <p className="lede">Slide the chests so the lute case reaches the wagon. Chests only slide along their length.</p>
        <div className="collection-body">
          <div className="loadin-grid">
            {LOADIN_LEVELS.map((l, i) => {
              const best = progress.best[i];
              const locked = i >= unlocked;
              return (
                <button key={i} className={`loadin-level${best !== undefined ? ' done' : ''}${best !== undefined && best <= l.par ? ' par' : ''}`} disabled={locked} onClick={() => setWhich({ kind: 'pack', index: i })} aria-label={`Level ${i + 1}${best !== undefined ? `, best ${best} moves, par ${l.par}` : locked ? ', locked' : ''}`}>
                  {i + 1}
                </button>
              );
            })}
          </div>
          <p className="muted small">A gold level was solved in par: the fewest moves it can be done in.</p>
        </div>
      </div>
      <div className="overlay-controls compact">
        <button className="primary-btn" disabled={making} onClick={openDaily}>
          {making ? 'Packing the wagon…' : progress.daily[today] !== undefined ? `Daily load-in (done in ${progress.daily[today]})` : 'Daily load-in'}
        </button>
        <button className="secondary-btn" onClick={onClose}>
          Back
        </button>
      </div>
    </div>
  );
}

function Board({
  title,
  text,
  par,
  best,
  hasNext,
  onSolved,
  onNext,
  onBack,
}: {
  title: string;
  text: string;
  par: number;
  best: number | undefined;
  hasNext: boolean;
  onSolved: (moves: number) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const puzzle: Puzzle = useMemo(() => parse(text), [text]);
  const [history, setHistory] = useState<number[][]>([puzzle.start]);
  const positions = history[history.length - 1]!;
  const moves = history.length - 1;
  const solved = isSolved(puzzle, positions);
  const boardRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ index: number; startX: number; startY: number; range: [number, number]; cell: number } | null>(null);
  const [offset, setOffset] = useState<{ index: number; cells: number } | null>(null);
  const reported = useRef(false);

  useEffect(() => {
    if (solved && !reported.current) {
      reported.current = true;
      onSolved(moves);
      try {
        navigator.vibrate?.(30);
      } catch {
        /* no haptics */
      }
    }
  }, [solved, moves, onSolved]);

  const down = (e: React.PointerEvent, index: number) => {
    if (solved || puzzle.pieces[index]!.dir === 'fixed') return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const cell = (boardRef.current?.clientWidth ?? 300) / SIZE;
    drag.current = { index, startX: e.clientX, startY: e.clientY, range: slideRange(puzzle, positions, index), cell };
    setOffset({ index, cells: 0 });
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = puzzle.pieces[d.index]!;
    const raw = (p.dir === 'h' ? e.clientX - d.startX : e.clientY - d.startY) / d.cell;
    setOffset({ index: d.index, cells: Math.max(d.range[0], Math.min(d.range[1], raw)) });
  };
  const up = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || !offset) return setOffset(null);
    const steps = Math.round(offset.cells);
    setOffset(null);
    if (steps === 0) return;
    const next = [...positions];
    next[d.index] = positions[d.index]! + steps;
    setHistory([...history, next]);
  };

  return (
    <div className="overlay collection loadin" role="dialog" aria-modal="true" aria-label={title}>
      <div className="overlay-top">
        <h2 className="title small">{title}</h2>
        <p className="loadin-status">
          <span>
            Moves <b>{moves}</b>
          </span>
          <span>
            Par <b>{par}</b>
          </span>
          {best !== undefined && (
            <span>
              Best <b>{best}</b>
            </span>
          )}
        </p>
        {solved && <p className="loadin-win">{moves <= par ? `Loaded in ${moves}. That's par!` : `Loaded in ${moves}. Par is ${par}.`}</p>}
        <div className="loadin-actions">
          <button className="secondary-btn" disabled={moves === 0 || solved} onClick={() => setHistory(history.slice(0, -1))}>
            Undo
          </button>
          <button className="secondary-btn" disabled={moves === 0} onClick={() => {
            reported.current = false;
            setHistory([puzzle.start]);
          }}>
            Restart
          </button>
          <button className="secondary-btn" onClick={onBack}>
            Levels
          </button>
          {solved && hasNext && (
            <button className="primary-btn" onClick={onNext}>
              Next
            </button>
          )}
        </div>
      </div>
      <div className="loadin-yard">
        <div ref={boardRef} className={`loadin-board${solved ? ' solved' : ''}`} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
          <div className="loadin-wagon" style={{ top: `${(EXIT_ROW * 100) / SIZE}%`, height: `${100 / SIZE}%` }} aria-hidden="true" />
          {puzzle.pieces.map((p, i) => {
            const pos = positions[i]! + (offset?.index === i ? offset.cells : 0);
            const fixed = p.dir === 'fixed';
            const x = fixed ? positions[i]! % SIZE : p.dir === 'h' ? pos : p.lane;
            const y = fixed ? Math.floor(positions[i]! / SIZE) : p.dir === 'h' ? p.lane : pos;
            const w = p.dir === 'h' ? p.len : 1;
            const h = p.dir === 'v' ? p.len : 1;
            const target = p.id === TARGET;
            return (
              <div
                key={p.id}
                className={`loadin-piece${target ? ' target' : ''}${fixed ? ' barrel' : ''}${p.dir === 'v' ? ' tall' : ''}`}
                style={{
                  left: `${(x * 100) / SIZE}%`,
                  top: `${(y * 100) / SIZE}%`,
                  width: `${(w * 100) / SIZE}%`,
                  height: `${(h * 100) / SIZE}%`,
                  ...(target || fixed ? {} : { ['--chest' as string]: CHEST_COLORS[i % CHEST_COLORS.length] }),
                  transition: offset?.index === i ? 'none' : undefined,
                }}
                onPointerDown={(e) => down(e, i)}
                aria-label={target ? 'Lute case' : fixed ? 'Barrel' : 'Chest'}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
