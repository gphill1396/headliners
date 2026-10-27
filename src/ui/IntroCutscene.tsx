import { useEffect, useLayoutEffect, useRef } from 'react';
import { ART } from '../render/art';
import { land } from '../render/field';
import { PALETTE } from '../render/palette';
import { drawAnim } from '../render/portraits';
import { SCENE_EMPTY } from './scene-art';

/**
 * The intro (S4.11): after "Tap to begin", the title's window onto the Grand Faire grows to fill the
 * screen and becomes the first shot. A portal tears open over the stage and lifts the band, they fall
 * through it, and land in front of the monsters' cave. About eight seconds; a tap skips it. Tapping the
 * picture on the home menu plays it again.
 *
 * Drawn at 240×320 game pixels and scaled up, like the field. The title scene (240×128, `--ui-scene`)
 * sits in the middle rows, so at the start the canvas lines up exactly with the window it came from.
 */

const W = 240;
const H = 320;
/** Where the title scene sits in the canvas (its rows SCENE_Y…SCENE_Y+128). */
const SCENE_Y = 104;
const SCENE_H = 128;
/** The landing stage's top edge. */
const STAGE_Y = 262;
/** The four performers in the title scene, where art/ui.py drew them (top-left, in scene pixels). */
const PERFORMERS = ['kick-drum', 'arpeggiator', 'guitar-tech', 'soprano'].map((id, i) => ({ id, x: 72 + i * 27, y: 85 }));

/** When each beat of the story starts, in ms. Slowed so the captions can be read (Grant, Oct 27). */
export const INTRO_TIMES = { grow: 800, portal: 1900, lift: 2800, fall: 3900, land: 6000, end: 8600 } as const;

const CAPTIONS: { at: number; text: string }[] = [
  { at: 400, text: 'The Grand Faire. The last encore.' },
  { at: INTRO_TIMES.portal, text: 'Then the sky tore open.' },
  { at: INTRO_TIMES.fall, text: 'Down, down, down…' },
  { at: INTRO_TIMES.land + 500, text: '…into the land of monsters.' },
];

export type IntroSound = 'portal' | 'fall' | 'land';

/** Where the intro grows from: the on-screen box of the title scene that was tapped. */
export interface IntroFrom {
  x: number;
  y: number;
  width: number;
  height: number;
}

function hash(x: number, y: number): number {
  let v = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) >>> 0;
  v = Math.imul(v ^ (v >>> 13), 1274126177) >>> 0;
  return ((v ^ (v >>> 16)) >>> 0) / 4294967296;
}

const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

/** Each performer pre-drawn to small canvases (every frame), so they can be moved, turned and scaled cheaply. */
function performerCanvases(): HTMLCanvasElement[][] {
  return PERFORMERS.map(({ id }) => {
    const sprite = ART[`unit:${id}`];
    if (!sprite) return [];
    return sprite.frames.map((rows, f) => {
      const c = document.createElement('canvas');
      c.width = rows[0]!.length;
      c.height = rows.length;
      drawAnim(c.getContext('2d')!, sprite, f, 0, 0, 1);
      return c;
    });
  });
}

/**
 * The title scene with an empty stage (the intro draws the band itself). Loaded as soon as this module
 * is, so it's decoded long before anyone taps "Tap to begin".
 */
const emptyScene: HTMLImageElement | null = (() => {
  if (typeof Image === 'undefined') return null;
  const img = new Image();
  img.src = SCENE_EMPTY;
  return img;
})();

/** An image that can be drawn: loaded and not broken (Safari throws when drawing a broken one). */
const drawable = (img: HTMLImageElement | null): img is HTMLImageElement => !!img && img.complete && img.naturalWidth > 0;

/** The faire shot: the title scene, with night sky above it and the crowd's dark below. */
function drawFaire(g: CanvasRenderingContext2D, scene: HTMLImageElement | null, now: number): void {
  g.fillStyle = '#16101f';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 40; i++) {
    const twinkle = hash(i, Math.floor(now / 400)) < 0.15;
    g.fillStyle = twinkle ? '#8f82a8' : '#f6ecd6';
    g.fillRect(Math.floor(hash(i, 1) * W), Math.floor(hash(i, 2) * (SCENE_Y - 4)), 1, 1);
  }
  if (drawable(scene)) g.drawImage(scene, 0, SCENE_Y);
  // Two more rows of the crowd below the scene's own front row: heads and shoulders, darker further forward.
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 26; i++) {
      const cx = Math.round(i * 9.6 + hash(i, 7 + row) * 5 + row * 4) - 4;
      const cy = SCENE_Y + SCENE_H + 4 + row * 12 + Math.floor(hash(i, 9 + row) * 4);
      g.fillStyle = row === 0 ? (i % 3 ? '#2f2547' : '#3f3360') : i % 3 ? '#211934' : '#2f2547';
      g.fillRect(cx - 2, cy - 3, 5, 4);
      g.fillRect(cx - 4, cy + 1, 9, 6);
    }
  }
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
    const p = ((t / 1100 + k / 7) % 1 + 1) % 1;
    const r = 4 + p * p * 260;
    g.strokeStyle = ['#6b3fa0', '#4fd1c5', '#2a1f4a', '#d6caef'][k % 4]!;
    g.lineWidth = Math.max(1, Math.round(p * 5));
    g.beginPath();
    g.ellipse(cx, cy, r, r * 0.7, 0, 0, Math.PI * 2);
    g.stroke();
  }
  for (let i = 0; i < 50; i++) {
    const x = Math.floor(hash(i, 3) * W);
    const speed = 0.2 + hash(i, 4) * 0.35;
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
    [W / 2 - 18, 48, 700],
    [W / 2 + 9, 52, 1000],
    [W / 2 - 4, 43, 1300],
    [W / 2 + 26, 50, 1600],
  ];
  for (const [x, y, at] of eyes) {
    if (t < at) continue;
    if (Math.floor((t + at) / 160) % 17 === 0) continue; // a blink
    g.fillStyle = '#e2574c';
    g.fillRect(Math.round(x), y, 2, 1);
    g.fillRect(Math.round(x) + 5, y, 2, 1);
  }
}

/** Draw a sprite canvas centred at (x, y), turned by `angle` and scaled by `s`. */
function drawMember(g: CanvasRenderingContext2D, img: HTMLCanvasElement | undefined, x: number, y: number, angle = 0, s = 1): void {
  if (!img) return;
  g.save();
  g.translate(Math.round(x), Math.round(y));
  if (angle) g.rotate(angle);
  if (s !== 1) g.scale(s, s);
  g.drawImage(img, -img.width / 2, -img.height / 2);
  g.restore();
}

/** How long the intro takes to fade out at the end, revealing the menu. */
const FADE_OUT_MS = 500;

export function IntroCutscene({
  from,
  onCovered,
  onDone,
  onSound,
  reduceFlash,
}: {
  from?: IntroFrom | null;
  /** Called once the intro fully covers the page, so the menu can be put behind it. */
  onCovered?: () => void;
  onDone: () => void;
  onSound?: (s: IntroSound) => void;
  reduceFlash?: boolean;
}) {
  const root = useRef<HTMLButtonElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const soundRef = useRef(onSound);
  soundRef.current = onSound;
  const coveredRef = useRef(onCovered);
  coveredRef.current = onCovered;

  // Grow from the window: start the canvas scaled and placed so its scene rows sit exactly over the
  // picture that was tapped, then let it ease to its own place (a FLIP transition).
  useLayoutEffect(() => {
    const c = canvas.current;
    const el = root.current;
    if (!c || !el) return;
    el.classList.add('growing');
    // Measure the canvas where it will end up (clear any transform first: dev mode runs effects twice).
    c.style.transition = 'none';
    c.style.transform = 'none';
    if (from && from.width > 0) {
      const r = c.getBoundingClientRect();
      const s = from.width / r.width;
      const sceneTop = (SCENE_Y / H) * r.height;
      c.style.transformOrigin = '0 0';
      c.style.transform = `translate(${from.x - r.x}px, ${from.y - r.y - s * sceneTop}px) scale(${s})`;
    }
    void c.offsetWidth; // commit the starting place before the transition is set
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        c.style.transition = `transform ${INTRO_TIMES.grow}ms cubic-bezier(0.4, 0, 0.2, 1)`;
        c.style.transform = 'none';
        el.classList.remove('growing');
      }),
    );
    // Once it has grown, drop the transform styles altogether: iOS Safari can stop repainting a canvas
    // left on its own compositing layer after a transform transition.
    const settle = window.setTimeout(() => {
      c.style.transition = '';
      c.style.transform = '';
      c.style.transformOrigin = '';
    }, INTRO_TIMES.grow + 150);
    return () => {
      cancelAnimationFrame(id);
      window.clearTimeout(settle);
    };
  }, [from]);

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
    const band = performerCanvases();
    const scene = emptyScene;
    let start = -1;
    let raf = 0;
    const played = new Set<IntroSound>();
    const sound = (s: IntroSound) => {
      if (played.has(s)) return;
      played.add(s);
      soundRef.current?.(s);
    };
    let captionShown = '';
    const caption = root.current?.querySelector<HTMLElement>('.intro-caption');
    let covered = false;
    const portalX = W / 2;
    const portalY = SCENE_Y - 30;

    let failed = false;
    const frame = (now: number) => {
      if (start < 0) start = now;
      const t = now - start;
      if (t >= INTRO_TIMES.end) {
        doneRef.current();
        return;
      }
      // Ask for the next frame first: a drawing error on one frame must never stop the intro (it froze on iOS).
      raf = requestAnimationFrame(frame);
      if (!covered && t > INTRO_TIMES.grow + 100) {
        covered = true;
        coveredRef.current?.();
      }
      // Fade out at the end onto the menu.
      const el = root.current;
      if (el) el.style.opacity = t > INTRO_TIMES.end - FADE_OUT_MS ? ((INTRO_TIMES.end - t) / FADE_OUT_MS).toFixed(3) : '';
      try {
        draw(t, now);
      } catch (err) {
        g.restore();
        if (!failed) console.warn('Intro frame failed', err);
        failed = true;
      }
      let text = '';
      for (const cap of CAPTIONS) if (t >= cap.at) text = cap.text;
      if (caption && text !== captionShown) {
        captionShown = text;
        caption.textContent = text;
      }
    };

    const draw = (t: number, now: number) => {
      g.save();
      // A shake as the portal opens and when the band hits the ground.
      const shake = (t > INTRO_TIMES.portal + 700 && t < INTRO_TIMES.fall) || (t > INTRO_TIMES.land + 520 && t < INTRO_TIMES.land + 720);
      if (shake) g.translate(Math.round(Math.sin(t * 0.09) * 2), Math.round(Math.cos(t * 0.13)));

      if (t < INTRO_TIMES.fall) {
        drawFaire(g, scene, now);
        const portalT = clamp01((t - INTRO_TIMES.portal) / 1100);
        if (portalT > 0) sound('portal');
        drawPortal(g, portalX, portalY, ease(portalT) * 72, t / 300);
        // The band plays on, then is lifted up into the portal one by one.
        const lift = clamp01((t - INTRO_TIMES.lift) / (INTRO_TIMES.fall - INTRO_TIMES.lift));
        band.forEach((frames, i) => {
          const p = PERFORMERS[i]!;
          const x0 = p.x + 8;
          const y0 = SCENE_Y + p.y + 8;
          const k = ease(clamp01(lift * 1.4 - i * 0.12));
          const x = x0 + (portalX - x0) * k;
          const y = y0 + (portalY - y0) * k;
          // Frame 0 until the window has grown, so the first shot matches the title picture exactly.
          const f = t < INTRO_TIMES.grow ? 0 : Math.floor(t / 300 + i) % Math.max(1, frames.length);
          drawMember(g, frames[f], x, y, k * (i % 2 ? 2 : -2), 1 - 0.5 * k);
        });
      } else if (t < INTRO_TIMES.land) {
        sound('fall');
        const ft = t - INTRO_TIMES.fall;
        drawTunnel(g, ft);
        band.forEach((frames, i) => {
          const a = (i / band.length) * Math.PI * 2 + ft / 900;
          const x = W / 2 + Math.cos(a) * 60;
          const y = H * 0.42 + Math.sin(a) * 42 + Math.sin(ft / 240 + i) * 4;
          drawMember(g, frames[0], x, y, ft / (420 + i * 70) + i, 2);
        });
        // A flash as they go through.
        if (!reduceFlash && ft < 160) {
          g.fillStyle = `rgba(246, 236, 214, ${(1 - ft / 160).toFixed(2)})`;
          g.fillRect(0, 0, W, H);
        }
      } else {
        const lt = t - INTRO_TIMES.land;
        drawLanding(g, lt);
        band.forEach((frames, i) => {
          const x = 42 + i * 52;
          const groundY = STAGE_Y - 16;
          const drop = clamp01((lt - i * 90) / 480);
          const y = -40 + (groundY + 40) * drop * drop;
          // A little bounce on landing.
          const after = lt - i * 90 - 480;
          const bounce = after > 0 && after < 200 ? -Math.sin((after / 200) * Math.PI) * 6 : 0;
          if (after > 0) sound('land');
          const f = after > 0 ? Math.floor(lt / 300 + i) % Math.max(1, frames.length) : 0;
          drawMember(g, frames[f], x, y + bounce, 0, 2);
          // Dust where they land.
          if (after > 0 && after < 360) {
            g.fillStyle = '#c4a46c';
            const spread = Math.round(after / 20);
            for (const side of [-1, 1]) g.fillRect(Math.round(x + side * (14 + spread)), STAGE_Y - 2 - Math.round(after / 140), 2, 2);
          }
        });
      }
      g.restore();

      // While the window grows, only the scene itself shows; the sky and crowd around it fade in.
      if (t < INTRO_TIMES.grow) {
        const fade = 1 - ease(t / INTRO_TIMES.grow);
        g.save();
        g.globalCompositeOperation = 'destination-out';
        g.fillStyle = `rgba(0, 0, 0, ${fade.toFixed(3)})`;
        g.fillRect(0, 0, W, SCENE_Y);
        g.fillRect(0, SCENE_Y + SCENE_H, W, H - SCENE_Y - SCENE_H);
        g.restore();
      }
    };
    raf = requestAnimationFrame(frame);
    // A backstop: whatever happens to the frames, the intro ends and the menu comes up.
    const backstop = window.setTimeout(() => doneRef.current(), INTRO_TIMES.end + 1500);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(backstop);
    };
  }, [reduceFlash]);

  return (
    <button ref={root} className="overlay intro" aria-label="The band falls through a portal into the land of monsters. Tap to skip" onClick={() => doneRef.current()}>
      <canvas ref={canvas} className="intro-canvas" width={W} height={H} aria-hidden="true" />
      <span className="intro-caption" aria-hidden="true" />
      <span className="intro-skip" aria-hidden="true">
        tap to skip
      </span>
    </button>
  );
}
