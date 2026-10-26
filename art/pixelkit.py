"""
pixelkit — the Headliners sprite pipeline (SPEC S4.2, the Metroid Fusion bar).

A sprite is a list of parts, back to front. Each part is a mask (built from
primitives on a Canvas), a material (a 2–4 tone ramp, shadow → highlight), a
shading style and a group. Rendering:

1. Shade each part as a soft form lit from the top left, quantized to its ramp.
2. Seams: where a part overlaps a part of another group, its edge goes dark.
3. Outline: a dark, slightly coloured line around the whole figure, softened
   to the part's own shadow tone on the lit (top/left) edges.
4. Clean lone specks, then hand touches (eyes, glints, studs) go on top.

Dev tool only (numpy, scipy, Pillow). `python3 art/build.py` regenerates
src/render/art.ts; the game never runs this.
"""
from __future__ import annotations

import numpy as np
from scipy.ndimage import binary_dilation, distance_transform_edt

LIGHT = np.array([-0.55, -0.65, 0.52])
LIGHT = LIGHT / np.linalg.norm(LIGHT)
CROSS = np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]])


class Canvas:
    def __init__(self, w: int, h: int):
        self.w, self.h = w, h
        self.yy, self.xx = np.mgrid[0:h, 0:w].astype(float)

    def empty(self):
        return np.zeros((self.h, self.w), bool)

    def ellipse(self, cx, cy, rx, ry, rot=0.0):
        c, s = np.cos(rot), np.sin(rot)
        dx, dy = self.xx + 0.5 - cx, self.yy + 0.5 - cy
        u, v = dx * c + dy * s, -dx * s + dy * c
        return (u / rx) ** 2 + (v / ry) ** 2 <= 1.0

    def rect(self, x0, y0, x1, y1):
        """Cells with x0 <= x < x1 and y0 <= y < y1."""
        return (self.xx >= x0) & (self.xx < x1) & (self.yy >= y0) & (self.yy < y1)

    def poly(self, points):
        px, py = self.xx + 0.5, self.yy + 0.5
        inside = self.empty()
        n = len(points)
        for i in range(n):
            x1, y1 = points[i]
            x2, y2 = points[(i + 1) % n]
            inside ^= ((y1 > py) != (y2 > py)) & (px < (x2 - x1) * (py - y1) / (y2 - y1 + 1e-9) + x1)
        return inside

    def capsule(self, x1, y1, x2, y2, r1, r2=None):
        r2 = r1 if r2 is None else r2
        px, py = self.xx + 0.5, self.yy + 0.5
        dx, dy = x2 - x1, y2 - y1
        t = np.clip(((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy + 1e-9), 0, 1)
        r = r1 + (r2 - r1) * t
        return (px - (x1 + t * dx)) ** 2 + (py - (y1 + t * dy)) ** 2 <= r * r

    def curve(self, points, r1, r2):
        m = self.empty()
        n = len(points) - 1
        for i in range(n):
            a, b = points[i], points[i + 1]
            m |= self.capsule(a[0], a[1], b[0], b[1], r1 + (r2 - r1) * i / n, r1 + (r2 - r1) * (i + 1) / n)
        return m

    def mirror(self, mask):
        """The mask plus its left-right reflection (for front-facing, symmetric figures)."""
        return mask | mask[:, ::-1]


class Part:
    def __init__(self, name, material, mask, style='dome', group=None):
        self.name, self.material, self.mask, self.style = name, material, mask, style
        self.group = group or name


def shade(cv: Canvas, mask, style, nramp: int):
    """Tone index (0 = shadow .. nramp-1 = highlight) per pixel."""
    xx, yy = cv.xx, cv.yy
    if not mask.any():
        return np.zeros_like(xx, int)
    if style == 'flat':
        rows, cols = np.where(mask)
        u = (xx - cols.min()) / max(1, cols.max() - cols.min()) + (yy - rows.min()) / max(1, rows.max() - rows.min())
        lv = np.where(u < 0.75, 2, np.where(u < 1.35, 1, 0))
    elif style == 'cyl':
        cols = np.where(mask.any(axis=0))[0]
        u = (xx - cols.min()) / max(1, cols.max() - cols.min())
        lv = np.digitize(np.cos((u - 0.32) * np.pi), [-0.15, 0.45, 0.9])
    elif style == 'solid':
        lv = np.full_like(xx, 1, dtype=int)
    else:  # dome
        d = distance_transform_edt(mask)
        hgt = np.sqrt(np.minimum(d, 6.0) / 6.0)
        gy, gx = np.gradient(hgt)
        nrm = np.stack([-gx * 3, -gy * 3, np.full_like(hgt, 0.35)])
        nrm /= np.linalg.norm(nrm, axis=0) + 1e-9
        lam = (nrm * LIGHT[:, None, None]).sum(axis=0)
        lv = np.digitize(lam, [0.15, 0.55, 0.86])
    # Squash 4 levels onto shorter ramps.
    if nramp == 3:
        lv = np.minimum(lv, 2)
    elif nramp == 2:
        lv = np.where(lv >= 2, 1, 0)
    elif nramp == 1:
        lv = np.zeros_like(lv)
    return lv.astype(int)


def render(cv: Canvas, parts: list[Part], ramps: dict, dark: str, soft_outline=None, seam_dark=()):
    """Colour grid (object array of '#rrggbb' or '') for the parts, back to front."""
    H, W = cv.h, cv.w
    color = np.full((H, W), '', dtype=object)
    owner = np.full((H, W), -1)
    for i, p in enumerate(parts):
        ramp = ramps[p.material]
        lv = shade(cv, p.mask, p.style, len(ramp))
        color[p.mask] = [ramp[int(l)] for l in lv[p.mask]]
        owner[p.mask] = i
    # Seams between groups.
    for i, p in enumerate(parts):
        vis = owner == i
        other = np.zeros((H, W), bool)
        for j in range(i):
            if parts[j].group != p.group:
                other |= owner == j
        seam = vis & binary_dilation(other, structure=CROSS)
        color[seam] = dark if p.material in seam_dark else ramps[p.material][0]
    # Outline around the figure.
    filled = owner >= 0
    ring = binary_dilation(filled, structure=CROSS) & ~filled
    for y, x in zip(*np.where(ring)):
        color[y, x] = dark
    soft = set(soft_outline if soft_outline is not None else ramps.keys())
    for y, x in zip(*np.where(ring)):
        for dy, dx in ((1, 0), (0, 1)):
            ny, nx = y + dy, x + dx
            if ny < H and nx < W and owner[ny, nx] >= 0 and (y - 1 < 0 or owner[y - 1, x] < 0) and (x - 1 < 0 or owner[y, x - 1] < 0):
                mat = parts[owner[ny, nx]].material
                if mat in soft:
                    color[y, x] = ramps[mat][0]
    return clean(color)


def clean(color):
    """A pixel unlike all four neighbours (which agree) takes their colour."""
    H, W = color.shape
    out = color.copy()
    for y in range(1, H - 1):
        for x in range(1, W - 1):
            n = [color[y - 1, x], color[y + 1, x], color[y, x - 1], color[y, x + 1]]
            if color[y, x] and all(v and v != color[y, x] for v in n) and len(set(n)) == 1:
                out[y, x] = n[0]
    return out


def put(color, pts, c):
    """Hand touch: set pixels (x, y) to colour c (skips out-of-range)."""
    H, W = color.shape
    for x, y in pts:
        if 0 <= x < W and 0 <= y < H:
            color[y, x] = c


def put_on(color, pts, c):
    """Hand touch, only where the figure already is."""
    H, W = color.shape
    for x, y in pts:
        if 0 <= x < W and 0 <= y < H and color[y, x]:
            color[y, x] = c


def trim(frames):
    """Crop every frame to the union bounding box (frames keep the same size and alignment)."""
    ys, xs = [], []
    for f in frames:
        r, c = np.where(f != '')
        if len(r):
            ys += [r.min(), r.max()]
            xs += [c.min(), c.max()]
    y0, y1, x0, x1 = min(ys), max(ys), min(xs), max(xs)
    return [f[y0:y1 + 1, x0:x1 + 1] for f in frames]


KEYS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'


def to_sprite(frames):
    """Frames → {'colors': {key: '#hex'}, 'frames': [[row, ...], ...]}."""
    colors = sorted({c for f in frames for c in f.flatten() if c})
    assert len(colors) <= len(KEYS), f'{len(colors)} colours'
    key = {col: KEYS[i] for i, col in enumerate(colors)}
    rows = [[''.join(key[f[y, x]] if f[y, x] else '.' for x in range(f.shape[1])) for y in range(f.shape[0])] for f in frames]
    return {'colors': {v: k for k, v in key.items()}, 'frames': rows}
