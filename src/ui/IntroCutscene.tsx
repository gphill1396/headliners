import { useEffect, useRef } from 'react';
import type { HeadlinerId } from '../engine';
import { land } from '../render/field';
import { PALETTE } from '../render/palette';
import { drawAnim, PORTRAITS, type AnimSprite } from '../render/portraits';

/**
 * The intro (S4.11): after "Tap to begin", the band plays the Grand Faire, a portal tears open over the
 * stage, they fall through it, and land in front of the monsters' cave. About five seconds; a tap skips it.
 * Drawn at 240×320 game pixels and scaled up, like the field.
 */

const W = 240;
const H = 320;
const STAGE_Y = 262;
const BAND: HeadlinerId[] = ['lyra', 'clatter', 'thrum', 'aria', 'riot'];

/** When each beat of the story starts, in ms. */
export const INTRO_TIMES = { portal: 1100, fall: 2300, land: 3600, end: 5400 } as const;

const CAPTIONS: { at: number; text: string }[] = [
  { at: 0, text: 'The Grand Faire. The last encore.' },
  { at: INTRO_TIMES.portal, text: 'Then the sky tore open.' },
  { at: INTRO_TIMES.fall, text: 'Down, down, down…' },
  { at: INTRO_TIMES.land + 300, text: '…into the land of monsters.' },
];

export type IntroSound = 'portal' | 'fall' | 'land';

function hash(x: number, y: number): number {
  let v = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) >>> 0;
  v = Math.imul(v ^ (v >>> 13), 1274126177) >>> 0;
  return ((v ^ (v >>> 16)) >>> 0) / 4294967296;
}

/** Each portrait pre-drawn to its own small canvas (both frames), so it can be moved, turned and scaled cheaply. */
function portraitCanvases(): { id: HeadlinerId; frames: HTMLCanvasElement[] }[] {
  return BAND.flatMap((id) => {
    const sprite: AnimSprite | undefined = PORTRAITS[id];
    if (!sprite) return [];
    const frames = sprite.frames.map((rows, f) => {
      const c = document.createElement('canvas');
      c.width = rows[0]!.length;
      c.height = rows.length;
      drawAnim(c.getContext('2d')!, sprite, f, 0, 0, 1);
      return c;
    });
    return [{ id, frames }];
  });
}

const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

/** The faire at night: stars, tents, bunting and the stage. */
function drawFaire(g: CanvasRenderingContext2D, now: number): void {
  g.fillStyle = '#16101f';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 70; i++) {
    const twinkle = hash(i, Math.floor(now / 400)) < 0.15;
    g.fillStyle = twinkle ? '#8f82a8' : '#f6ecd6';
    g.fillRect(Math.floor(hash(i, 1) * W), Math.floor(hash(i, 2) * 170), 1, 1);
  }
  // Tents on the skyline: striped cones.
  for (let k = 0; k < 4; k++) {
    const cx = 30 + k * 60;
    const top = 168 + (k % 2) * 8;
    for (let y = top; y < 214; y++) {
      const half = Math.round((y - top) * 0.75);
      for (let x = cx - half; x <= cx + half; x++) {
        const stripe = Math.floor((x - cx + 64) / 5) % 2 === 0;
        g.fillStyle = stripe ? (k % 2 ? '#8c2420' : '#3a64a8') : '#e8d3a2';
        g.fillRect(x, y, 1, 1);
      }
    }
    g.fillStyle = '#e0b04a';
    g.fillRect(cx, top - 6, 1, 6);
    g.fillRect(cx + 1, top - 6, 3, 2);
  }
  g.fillStyle = '#2a1f33';
  g.fillRect(0, 214, W, STAGE_Y - 214);
  // Bunting across the top of the stage.
  for (let x = 0; x < W; x++) {
    const sag = Math.round(Math.sin((x / W) * Math.PI) * 10);
    g.fillStyle = '#4e3826';
    g.fillRect(x, 150 + sag, 1, 1);
    if (x % 10 < 6) {
      g.fillStyle = ['#8c2420', '#e0b04a', '#3a64a8', '#4f8a3a'][Math.floor(x / 10) % 4]!;
      const len = 6 - (x % 10);
      g.fillRect(x, 151 + sag, 1, Math.max(1, Math.min(x % 10 + 1, len)));
    }
  }
  drawStage(g);
}

function drawStage(g: CanvasRenderingContext2D): void {
  g.fillStyle = PALETTE.stage;
  g.fillRect(0, STAGE_Y, W, H - STAGE_Y);
  g.fillStyle = PALETTE.stageLip;
  g.fillRect(0, STAGE_Y, W, 3);
  g.fillStyle = '#3a2c22';
  for (let x = 17; x < W; x += 24) g.fillRect(x, STAGE_Y + 3, 1, H - STAGE_Y);
  g.fillStyle = PALETTE.footlight;
  for (let x = 12; x < W; x += 36) g.fillRect(x, STAGE_Y + 1, 3, 2);
}

/** A portal: rings of colour turning around a dark eye. `r` is its radius; `spin` turns the rings. */
function drawPortal(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, spin: number): void {
  if (r < 1) return;
  const ring = ['#211934', '#6b3fa0', '#4fd1c5', '#d6caef', '#6b3fa0', '#2a1f4a'];
  const r2 = r * r;
  for (let y = Math.floor(cy - r * 0.6); y <= cy + r * 0.6; y++) {
    for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const dx = x - cx;
      const dy = (y - cy) / 0.6;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      const d = Math.sqrt(d2) / r;
      const angle = Math.atan2(dy, dx);
      const band = Math.floor((d * 6 + angle / Math.PI + spin) % 6 + 6) % 6;
      const core = d < 0.32;
      if (core && (x + y) % 2 === 0) g.fillStyle = '#0b0712';
      else if (core) g.fillStyle = '#16101f';
      else g.fillStyle = ring[band]!;
      g.fillRect(x, y, 1, 1);
    }
  }
}

/** The tunnel between worlds: rings rushing past and stars streaking up. */
function drawTunnel(g: CanvasRenderingContext2D, t: number): void {
  g.fillStyle = '#0b0712';
  g.fillRect(0, 0, W, H);
  const cx = W / 2;
  const cy = H * 0.42;
  for (let k = 0; k < 7; k++) {
    // Each ring grows from the centre out past the screen, then starts again.
    const p = ((t / 900 + k / 7) % 1 + 1) % 1;
    const r = 4 + p * p * 260;
    g.strokeStyle = ['#6b3fa0', '#4fd1c5', '#2a1f4a', '#d6caef'][k % 4]!;
    g.lineWidth = Math.max(1, Math.round(p * 5));
    g.beginPath();
    g.ellipse(cx, cy, r, r * 0.7, 0, 0, Math.PI * 2);
    g.stroke();
  }
  for (let i = 0; i < 50; i++) {
    const x = Math.floor(hash(i, 3) * W);
    const speed = 0.25 + hash(i, 4) * 0.45;
    const y = H - ((t * speed + hash(i, 5) * H) % (H + 30));
    g.fillStyle = hash(i, 6) < 0.3 ? '#4fd1c5' : '#f6ecd6';
    g.fillRect(x, Math.floor(y), 1, 3 + Math.floor(speed * 8));
  }
}

/** The landing: the monster land itself, with eyes waking up in the cave. */
function drawLanding(g: CanvasRenderingContext2D, t: number): void {
  g.fillStyle = '#16101f';
  g.fillRect(0, 0, W, H);
  g.drawImage(land(W, H), 0, 0);
  drawStage(g);
  // Eyes in the dark of the cave, opening one pair at a time.
  const eyes: [number, number, number][] = [
    [W / 2 - 18, 48, 500],
    [W / 2 + 9, 52, 750],
    [W / 2 - 4, 43, 1000],
    [W / 2 + 26, 50, 1250],
  ];
  for (const [x, y, at] of eyes) {
    if (t < at) continue;
    const blink = Math.floor((t + at) / 160) % 17 === 0;
    if (blink) continue;
    g.fillStyle = '#e2574c';
    g.fillRect(Math.round(x), y, 2, 1);
    g.fillRect(Math.round(x) + 5, y, 2, 1);
  }
}

/** Draw a portrait canvas centred at (x, y), turned by `angle` and scaled by `s`. */
function drawMember(g: CanvasRenderingContext2D, img: HTMLCanvasElement, x: number, y: number, angle = 0, s = 1): void {
  g.save();
  g.translate(Math.round(x), Math.round(y));
  if (angle) g.rotate(angle);
  if (s !== 1) g.scale(s, s);
  g.drawImage(img, -img.width / 2, -img.height / 2);
  g.restore();
}

export function IntroCutscene({ onDone, onSound, reduceFlash }: { onDone: () => void; onSound?: (s: IntroSound) => void; reduceFlash?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const soundRef = useRef(onSound);
  soundRef.current = onSound;

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    // Motion turned down: skip straight to the menu.
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) {
      doneRef.current();
      return;
    }
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    const band = portraitCanvases();
    const n = band.length;
    let start = -1;
    let raf = 0;
    const played = new Set<IntroSound>();
    const sound = (s: IntroSound) => {
      if (played.has(s)) return;
      played.add(s);
      soundRef.current?.(s);
    };
    let captionShown = '';
    const caption = c.parentElement?.querySelector<HTMLElement>('.intro-caption');

    const frame = (now: number) => {
      if (start < 0) start = now;
      const t = now - start;
      if (t >= INTRO_TIMES.end) {
        doneRef.current();
        return;
      }
      g.save();
      // A shake as the portal opens and when the band hits the ground.
      const shake = (t > INTRO_TIMES.portal + 600 && t < INTRO_TIMES.fall) || (t > INTRO_TIMES.land + 380 && t < INTRO_TIMES.land + 560);
      if (shake) g.translate(Math.round(Math.sin(t * 0.09) * 2), Math.round(Math.cos(t * 0.13)));

      if (t < INTRO_TIMES.fall) {
        drawFaire(g, now);
        const portalT = clamp01((t - INTRO_TIMES.portal) / 900);
        if (portalT > 0) sound('portal');
        drawPortal(g, W / 2, 100, ease(portalT) * 78, t / 260);
        // The band plays, then is lifted up into the portal.
        const lift = clamp01((t - INTRO_TIMES.portal - 550) / 650);
        band.forEach((m, i) => {
          const x0 = 24 + i * ((W - 48) / Math.max(1, n - 1));
          const y0 = STAGE_Y - 24;
          const k = ease(clamp01(lift * 1.3 - i * 0.06));
          const x = x0 + (W / 2 - x0) * k;
          const y = y0 + (100 - y0) * k;
          const img = m.frames[Math.floor(t / 300 + i) % m.frames.length]!;
          drawMember(g, img, x, y, k * (i % 2 ? 1.2 : -1.2), 1 - 0.6 * k);
        });
      } else if (t < INTRO_TIMES.land) {
        sound('fall');
        const ft = t - INTRO_TIMES.fall;
        drawTunnel(g, ft);
        band.forEach((m, i) => {
          const a = (i / n) * Math.PI * 2 + ft / 700;
          const x = W / 2 + Math.cos(a) * 58;
          const y = H * 0.42 + Math.sin(a) * 40 + Math.sin(ft / 200 + i) * 4;
          drawMember(g, m.frames[0]!, x, y, ft / (350 + i * 60) + i, 0.8);
        });
        // A flash as they go through.
        if (!reduceFlash && ft < 140) {
          g.fillStyle = `rgba(246, 236, 214, ${(1 - ft / 140).toFixed(2)})`;
          g.fillRect(0, 0, W, H);
        }
      } else {
        const lt = t - INTRO_TIMES.land;
        drawLanding(g, lt);
        band.forEach((m, i) => {
          const x = 24 + i * ((W - 48) / Math.max(1, n - 1));
          const groundY = STAGE_Y - 24;
          const drop = clamp01((lt - i * 70) / 380);
          const y = -40 + (groundY + 40) * drop * drop;
          // A little bounce on landing.
          const after = lt - i * 70 - 380;
          const bounce = after > 0 && after < 160 ? -Math.sin((after / 160) * Math.PI) * 5 : 0;
          if (after > 0) sound('land');
          drawMember(g, m.frames[after > 0 ? Math.floor(lt / 300 + i) % m.frames.length : 0]!, x, y + bounce);
          // Dust where they land.
          if (after > 0 && after < 300) {
            g.fillStyle = '#c4a46c';
            const spread = Math.round(after / 18);
            for (const side of [-1, 1]) g.fillRect(Math.round(x + side * (14 + spread)), STAGE_Y - 2 - Math.round(after / 120), 2, 2);
          }
        });
      }
      g.restore();

      let text = '';
      for (const cap of CAPTIONS) if (t >= cap.at) text = cap.text;
      if (caption && text !== captionShown) {
        captionShown = text;
        caption.textContent = text;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [reduceFlash]);

  return (
    <button className="overlay intro" aria-label="The band falls through a portal into the land of monsters. Tap to skip" onClick={() => doneRef.current()}>
      <canvas ref={canvas} className="intro-canvas" width={W} height={H} aria-hidden="true" />
      <span className="intro-caption" aria-hidden="true" />
      <span className="intro-skip" aria-hidden="true">
        tap to skip
      </span>
    </button>
  );
}
