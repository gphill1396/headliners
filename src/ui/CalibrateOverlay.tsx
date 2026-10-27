import { useEffect, useRef, useState } from 'react';
import { CALIBRATE_TAPS, calibrationFrom, describeLatency } from './calibrate';

/**
 * Calibrate timing (S4.10): tap the drum along with the bare beat 8 times. The game measures how late
 * you hear and tap the beat on this device and plays the music that much earlier, so Tight means Tight.
 */
export function CalibrateOverlay({
  soundOn,
  currentMs,
  offsetFromBeat,
  beatPosition,
  onSave,
  onClose,
}: {
  soundOn: boolean;
  currentMs: number;
  offsetFromBeat: (t: number) => number;
  beatPosition: (now: number) => { beat: number; phase: number };
  onSave: (ms: number) => void;
  onClose: () => void;
}) {
  const [offsets, setOffsets] = useState<number[]>([]);
  const [result, setResult] = useState<number | null | undefined>(undefined);
  const lights = useRef<HTMLDivElement>(null);
  const done = result !== undefined;

  // The beat lights follow the music's clock, so you can see the beat as well as hear it.
  useEffect(() => {
    let raf = 0;
    const loop = (now: number) => {
      const el = lights.current;
      if (el) {
        const { beat, phase } = beatPosition(now);
        el.querySelectorAll<HTMLElement>('.cal-light').forEach((light, i) => {
          light.classList.toggle('on', i === beat && phase < 0.35);
        });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [beatPosition]);

  const tap = (timeStamp: number) => {
    if (done || !soundOn) return;
    const next = [...offsets, offsetFromBeat(timeStamp)];
    setOffsets(next);
    if (next.length >= CALIBRATE_TAPS) setResult(calibrationFrom(next, currentMs));
  };

  const retry = () => {
    setOffsets([]);
    setResult(undefined);
  };

  return (
    <div className="overlay calibrate" role="dialog" aria-modal="true" aria-label="Calibrate timing">
      <div className="overlay-top">
        <h2 className="title small">Timing</h2>
        {!soundOn ? (
          <p className="muted">Turn Sound on to calibrate.</p>
        ) : done ? (
          result === null ? (
            <p>Those taps were all over. Try again?</p>
          ) : (
            <p>
              You tap <strong>{describeLatency(result)}</strong>.
            </p>
          )
        ) : (
          <p>Tap the drum on each beat.</p>
        )}
        <div className="cal-lights" ref={lights} aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={`cal-light${i === 0 ? ' one' : ''}`} />
          ))}
        </div>
        <div className="cal-pips" aria-label={`${offsets.length} of ${CALIBRATE_TAPS} taps`}>
          {Array.from({ length: CALIBRATE_TAPS }, (_, i) => (
            <span key={i} className={`cal-pip${i < offsets.length ? ' on' : ''}`} />
          ))}
        </div>
        {currentMs !== 0 && !done && <p className="muted cal-now">Now: {describeLatency(currentMs)}</p>}
      </div>
      <div className="overlay-controls">
        {!done && soundOn && (
          <button
            className="cal-drum"
            aria-label="Tap on the beat"
            onPointerDown={(e) => {
              e.preventDefault();
              tap(e.timeStamp);
            }}
            onKeyDown={(e) => {
              if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
                e.preventDefault();
                tap(e.timeStamp);
              }
            }}
          />
        )}
        {done && result !== null && result !== undefined && (
          <button className="primary-btn" onClick={() => typeof result === 'number' && onSave(result)}>
            Save
          </button>
        )}
        {done && (
          <button className="secondary-btn" onClick={retry}>
            Try again
          </button>
        )}
        {currentMs !== 0 && (
          <button className="secondary-btn" onClick={() => onSave(0)}>
            Reset to 0
          </button>
        )}
        <button className="secondary-btn" onClick={onClose}>
          Back
        </button>
      </div>
    </div>
  );
}
