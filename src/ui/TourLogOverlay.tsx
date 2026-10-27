import { useState } from 'react';
import { bandName, logText, outcome, type TourLogEntry } from '../meta/tourlog';
import { HoldButton } from './Overlays';
import { clearTourLog, loadTourLog } from './storage';

/**
 * The Tour log (S4.13): every finished Tour, newest first: band, Heat, how it ended, and timing.
 * "Copy log" puts it all on the clipboard as plain text, to paste into a message for tuning.
 */
export function TourLogOverlay({ onClose }: { onClose: () => void }) {
  const [log, setLog] = useState<TourLogEntry[]>(loadTourLog);
  const [copied, setCopied] = useState<'yes' | 'no' | null>(null);
  const wins = log.filter((e) => e.won).length;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(logText(log));
      setCopied('yes');
    } catch {
      setCopied('no');
    }
  };

  return (
    <div className="overlay collection tour-log" role="dialog" aria-modal="true" aria-label="Tour log">
      <div className="overlay-top">
        <h2 className="title small">Tour log</h2>
        <p className="muted">{log.length ? `${log.length} Tours, ${wins} won` : 'Finished Tours show up here.'}</p>
      </div>
      <div className="collection-body">
        <ul className="tour-log-list">
          {log.map((e, i) => (
            <li key={i} className={`tour-log-row${e.won ? ' won' : ''}`}>
              <span className="tour-log-band">{bandName(e.team)}</span>
              <span className="tour-log-heat">Heat {e.heat}</span>
              <span className="tour-log-outcome">{outcome(e)}</span>
              <span className="tour-log-meta muted">
                {e.date} · Tight {e.tight}%
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="overlay-controls compact">
        {log.length > 0 && (
          <button className="primary-btn" onClick={() => void copy()}>
            {copied === 'yes' ? 'Copied' : copied === 'no' ? "Couldn't copy" : 'Copy log'}
          </button>
        )}
        {log.length > 0 && (
          <HoldButton
            className="secondary-btn"
            label="Clear log"
            onConfirm={() => {
              clearTourLog();
              setLog([]);
              setCopied(null);
            }}
          />
        )}
        <button className="secondary-btn" onClick={onClose}>
          Back
        </button>
      </div>
    </div>
  );
}
