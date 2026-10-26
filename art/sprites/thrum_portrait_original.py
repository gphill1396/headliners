"""
Thrum, the war-drum drake — a GBA-style (Metroid Fusion bar) sprite.

Shapes are built from primitives, each with a material. Every shape is shaded
as a soft dome lit from the top left and quantized to its material's 4-tone
ramp; outlines are a dark hue (not black), lighter where light hits; parts that
overlap get a dark seam. Then hand touches (eye, studs, rope, glints) go on top.

Output: preview PNGs and the sprite as palette rows for src/render/sprites.ts.
"""
import json
import sys
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt, binary_dilation

W, H = 48, 48
LIGHT = np.array([-0.55, -0.65, 0.52])
LIGHT = LIGHT / np.linalg.norm(LIGHT)

# Material ramps: shadow, mid, light, highlight.
RAMPS = {
    'scale': ['#7a2632', '#c24c2e', '#ec7c3c', '#ffc27a'],
    'limb':  ['#5e1c2c', '#9c3a2c', '#d0612f', '#f2944f'],
    'belly': ['#b07c42', '#e0b36c', '#f8dea2', '#f8dea2'],
    'horn':  ['#8a7a64', '#cdbd9c', '#f4ead2', '#f4ead2'],
    'wing':  ['#5c2236', '#8c3548', '#b65866', '#b65866'],
    'wingbone': ['#7a2632', '#7a2632', '#7a2632', '#7a2632'],
    'shell': ['#4f2a1a', '#7d4626', '#a8683a', '#cf9255'],
    'head':  ['#bfa77a', '#e6d4ac', '#fff6e0', '#fff6e0'],   # drumhead
    'rope':  ['#9a822e', '#9a822e', '#e3cb67', '#e3cb67'],
    'wood':  ['#5a3e28', '#5a3e28', '#9a7350', '#9a7350'],   # mallet handles
    'felt':  ['#5a2a3a', '#8a3c4a', '#c46a6a', '#c46a6a'],   # mallet heads
}
DARK = '#2a1320'
OUTLINE = {k: DARK for k in RAMPS}
EYE = {'white': '#fffaf0', 'iris': '#ffc94d', 'pupil': '#211934', 'glint': '#ffffff'}
STUD = ['#8a6a1e', '#ffc94d']

yy, xx = np.mgrid[0:H, 0:W].astype(float)


def ellipse(cx, cy, rx, ry, rot=0.0):
    c, s = np.cos(rot), np.sin(rot)
    dx, dy = xx + 0.5 - cx, yy + 0.5 - cy
    u, v = dx * c + dy * s, -dx * s + dy * c
    return (u / rx) ** 2 + (v / ry) ** 2 <= 1.0


def poly(points):
    """Filled polygon (even-odd), sampled at pixel centers."""
    px, py = xx + 0.5, yy + 0.5
    inside = np.zeros((H, W), bool)
    n = len(points)
    for i in range(n):
        x1, y1 = points[i]
        x2, y2 = points[(i + 1) % n]
        cond = ((y1 > py) != (y2 > py)) & (px < (x2 - x1) * (py - y1) / (y2 - y1 + 1e-9) + x1)
        inside ^= cond
    return inside


def capsule(x1, y1, x2, y2, r1, r2=None):
    r2 = r1 if r2 is None else r2
    px, py = xx + 0.5, yy + 0.5
    dx, dy = x2 - x1, y2 - y1
    t = np.clip(((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy + 1e-9), 0, 1)
    r = r1 + (r2 - r1) * t
    return (px - (x1 + t * dx)) ** 2 + (py - (y1 + t * dy)) ** 2 <= r * r


def curve(points, r1, r2):
    m = np.zeros((H, W), bool)
    n = len(points) - 1
    for i in range(n):
        a, b = points[i], points[i + 1]
        m |= capsule(a[0], a[1], b[0], b[1], r1 + (r2 - r1) * i / n, r1 + (r2 - r1) * (i + 1) / n)
    return m


def build(frame):
    """Return a list of (name, material, mask, style) back to front. frame 0: mallets up; 1: striking."""
    bob = 0 if frame == 0 else 1
    parts = []
    # Tail: sweeps back and down to a spade.
    tail = curve([(16, 36), (9, 40), (5, 44)], 4.0, 1.8)
    spade = poly([(2, 43), (8, 43), (7, 47), (2, 47)])
    parts.append(('tail', 'scale', tail | spade, 'dome'))
    # Wing behind the shoulders, three fingers.
    wy = bob
    wing = poly([(20, 21 + wy), (9, 4 + wy), (10, 10 + wy), (4, 9 + wy), (9, 15 + wy), (3, 17 + wy), (11, 21 + wy), (15, 26 + wy)])
    parts.append(('wing', 'wing', wing, 'flat'))
    parts.append(('wingbone', 'scale', curve([(20, 21 + wy), (14, 12 + wy), (9, 4 + wy)], 1.4, 0.7), 'dome'))
    # Finger bones out to the scalloped edge.
    parts.append(('fingers', 'wingbone', capsule(14, 12 + wy, 4, 9 + wy, 0.5) | capsule(14, 12 + wy, 3, 17 + wy, 0.5), 'flat'))
    # Back leg, body, front leg.
    legB = ellipse(17, 40, 4.6, 4.6) | poly([(13, 43), (20, 43), (21, 47), (12, 47)])
    parts.append(('legB', 'scale', legB, 'dome'))
    body = ellipse(23, 30 + bob, 9.5, 11)
    parts.append(('body', 'scale', body, 'dome'))
    parts.append(('belly', 'belly', ellipse(26.5, 29 + bob, 5.5, 9) & body, 'dome'))
    legF = ellipse(30, 40, 4.6, 4.6) | poly([(26, 43), (34, 43), (36, 47), (25, 47)])
    parts.append(('legF', 'scale', legF, 'dome'))
    # Neck and head.
    hy = 11 + bob
    parts.append(('neck', 'scale', capsule(24, 23 + bob, 26, hy + 4, 4.6, 4.0), 'dome'))
    head = ellipse(28, hy, 7, 6) | ellipse(36, hy + 2, 6, 3.8, rot=0.12)
    parts.append(('head', 'scale', head, 'dome'))
    parts.append(('jaw', 'belly', ellipse(34, hy + 5.2, 5.5, 1.7, rot=0.08) & ~head, 'dome'))
    # Horns sweep back; a short crest between them.
    parts.append(('hornB', 'horn', curve([(24, hy - 3), (20, hy - 4), (17, hy - 3)], 1.6, 0.6), 'dome'))
    parts.append(('hornF', 'horn', curve([(27, hy - 4), (23, hy - 7), (18, hy - 8), (14, hy - 6)], 2.7, 0.7), 'dome'))
    # The war drum, slung at the hip: a barrel with a skin on top.
    dcx, dtop, dbot, drx = 24, 33, 41, 9
    shell = (np.abs(xx + 0.5 - dcx) <= drx) & (yy + 0.5 >= dtop) & (yy + 0.5 <= dbot)
    shell |= ellipse(dcx, dbot, drx, 2.4)
    parts.append(('shell', 'shell', shell, 'cyl'))
    parts.append(('skin', 'head', ellipse(dcx, dtop, drx, 2.4), 'skin'))
    # Arms and mallets.
    if frame == 0:
        armR = curve([(29, 22 + bob), (35, 25), (38, 26)], 2.5, 1.9)
        armL = curve([(19, 23 + bob), (14, 25), (12, 24)], 2.3, 1.8)
        malR = capsule(38, 26, 43, 19, 0.8)
        malL = capsule(12, 24, 8, 17, 0.8)
        headR, headL = ellipse(43.5, 18, 2.3, 2.1), ellipse(7.5, 16, 2.3, 2.1)
    else:
        armR = curve([(29, 22 + bob), (34, 26), (31, 30)], 2.5, 1.9)
        armL = curve([(19, 23 + bob), (15, 27), (18, 30)], 2.3, 1.8)
        malR = capsule(31, 30, 28.5, 32, 0.8)
        malL = capsule(18, 30, 20.5, 32, 0.8)
        headR, headL = ellipse(27.6, 32.4, 1.7, 1.3), ellipse(21.4, 32.4, 1.7, 1.3)
    parts.append(('armL', 'limb', armL, 'dome'))
    parts.append(('malL', 'wood', malL, 'dome'))
    parts.append(('headL', 'felt', headL, 'dome'))
    parts.append(('armR', 'limb', armR, 'dome'))
    parts.append(('malR', 'wood', malR, 'dome'))
    parts.append(('headR', 'felt', headR, 'dome'))
    return parts


GROUP = {n: 'body' for n in ('tail', 'legB', 'body', 'belly', 'legF', 'neck', 'head', 'jaw')}
GROUP.update({'wing': 'wing', 'wingbone': 'wing', 'fingers': 'wing', 'shell': 'drum', 'skin': 'drum',
              'armL': 'armL', 'malL': 'armL', 'headL': 'armL', 'armR': 'armR', 'malR': 'armR', 'headR': 'armR',
              'hornB': 'horns', 'hornF': 'horns'})


def clean(color):
    """Remove lone specks: a pixel unlike all four neighbors (which agree) takes their color."""
    out = color.copy()
    for y in range(1, H - 1):
        for x in range(1, W - 1):
            n = [color[y - 1, x], color[y + 1, x], color[y, x - 1], color[y, x + 1]]
            if color[y, x] and all(v and v != color[y, x] for v in n) and len(set(n)) == 1:
                out[y, x] = n[0]
    return out


def shade_levels(mask, style):
    """0..3 tone index per pixel of `mask`."""
    if style == 'flat':
        # Membrane: lit toward the top left, shadowed toward the body.
        rows, cols = np.where(mask)
        u = (xx - cols.min()) / max(1, cols.max() - cols.min()) + (yy - rows.min()) / max(1, rows.max() - rows.min())
        return np.where(u < 0.75, 2, np.where(u < 1.35, 1, 0))
    if style == 'cyl':
        cols = np.where(mask.any(axis=0))[0]
        x0, x1 = cols.min(), cols.max()
        u = (xx - x0) / max(1, x1 - x0)          # 0 left .. 1 right
        n = np.cos((u - 0.32) * np.pi)            # brightest a third of the way in from the left
        lvl = np.digitize(n, [-0.15, 0.45, 0.9])
        return lvl
    if style == 'skin':
        d = distance_transform_edt(mask)
        lvl = np.where(d > 1.5, 2, 1)
        lvl = np.where((d > 1.5) & (xx < 23) & (yy < 33), 3, lvl)
        return lvl
    d = distance_transform_edt(mask)
    h = np.sqrt(np.minimum(d, 6.0) / 6.0)
    gy, gx = np.gradient(h)
    nz = np.full_like(h, 0.35)
    nrm = np.stack([-gx * 3, -gy * 3, nz])
    nrm /= np.linalg.norm(nrm, axis=0) + 1e-9
    lam = (nrm * LIGHT[:, None, None]).sum(axis=0)
    return np.digitize(lam, [0.15, 0.55, 0.86])


def render(frame):
    parts = build(frame)
    color = np.full((H, W), '', dtype=object)
    owner = np.full((H, W), -1)
    levels = {}
    for i, (name, mat, mask, style) in enumerate(parts):
        lv = shade_levels(mask, style)
        levels[i] = lv
        color[mask] = [RAMPS[mat][int(l)] for l in lv[mask]]
        owner[mask] = i
    # Seams: where a part sits on top of a part of a different group, its edge goes dark (depth).
    group = [GROUP.get(name, name) for (name, _, _, _) in parts]
    cross = np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]])
    for i, (name, mat, mask, style) in enumerate(parts):
        vis = owner == i
        other = np.zeros((H, W), bool)
        for j in range(i):
            if group[j] != group[i]:
                other |= owner == j
        seam = vis & binary_dilation(other, structure=cross)
        color[seam] = DARK if mat in ('wood', 'felt', 'horn', 'shell', 'head') else RAMPS[mat][0]
    # Outline: outside pixels touching the figure, colored by the part they touch.
    filled = owner >= 0
    ring = binary_dilation(filled, structure=np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]])) & ~filled
    for y, x in zip(*np.where(ring)):
        best = None
        for dy, dx in ((0, 1), (1, 0), (0, -1), (-1, 0)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < H and 0 <= nx < W and owner[ny, nx] >= 0:
                if best is None or owner[ny, nx] > best:
                    best = owner[ny, nx]
        mat = parts[best][1]
        color[y, x] = OUTLINE[mat]
    # Selective outline: where the light hits (top and left edges), the outline softens to the part's darkest tone.
    for y, x in zip(*np.where(ring)):
        for dy, dx in ((1, 0), (0, 1)):
            ny, nx = y + dy, x + dx
            if ny < H and nx < W and owner[ny, nx] >= 0 and (y - 1 < 0 or owner[y - 1, x] < 0) and (x - 1 < 0 or owner[y, x - 1] < 0):
                mat = parts[owner[ny, nx]][1]
                if mat in ('scale', 'wing', 'horn', 'felt'):
                    color[y, x] = RAMPS[mat][0]
    color = clean(color)
    touch_up(color, frame)
    return color


def touch_up(c, frame):
    bob = 0 if frame == 0 else 1
    hy = 11 + bob
    # Eye: white, gold iris, dark pupil, glint. A heavy brow over it.
    c[hy - 1, 31] = EYE['glint']
    c[hy - 1, 32] = EYE['white']
    c[hy, 31] = EYE['iris']
    c[hy, 32] = EYE['pupil']
    for x in (30, 31, 32, 33):
        c[hy - 2, x] = DARK if x in (31, 32) else RAMPS['scale'][0]
    # Nostril and a grin with one fang.
    c[hy + 1, 40] = DARK
    for x in range(33, 40):
        c[hy + 4, x] = DARK
    c[hy + 5, 37] = RAMPS['horn'][2]
    # Brass studs round the drum's rim, and the rope zigzag on the shell.
    for x in (17, 21, 25, 29):
        c[35, x] = STUD[1]
        c[36, x] = STUD[0]
    zig = [(16, 37), (17, 38), (18, 39), (19, 38), (20, 37), (21, 38), (22, 39), (23, 38), (24, 37), (25, 38), (26, 39), (27, 38), (28, 37), (29, 38), (30, 39), (31, 38)]
    for (x, y) in zig:
        c[y, x] = RAMPS['rope'][2 if x < 26 else 0]
    # Belly plates: faint lines.
    for y in range(24 + bob, 33, 3):
        for x in range(23, 31):
            if c[y, x] in RAMPS['belly'][1:]:
                c[y, x] = RAMPS['belly'][0]
    # Strike: a little flash on the drumhead.
    if frame == 1:
        for (x, y) in [(24, 29), (24, 28), (21, 30), (27, 30), (19, 31), (29, 31)]:
            if c[y, x] == '':
                c[y, x] = '#fff3b0'


def to_rgba(c):
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    px = img.load()
    for y in range(H):
        for x in range(W):
            if c[y, x]:
                h = c[y, x].lstrip('#')
                px[x, y] = (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255)
    return img


def to_rows(frames):
    colors = sorted({c for f in frames for c in f.flatten() if c})
    keys = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    assert len(colors) <= len(keys), len(colors)
    key = {col: keys[i] for i, col in enumerate(colors)}
    out = []
    for f in frames:
        rows = [''.join(key[f[y, x]] if f[y, x] else '.' for x in range(W)) for y in range(H)]
        # trim empty rows top
        out.append(rows)
    return out, {v: k for k, v in key.items()}


if __name__ == '__main__':
    out = sys.argv[1]
    frames = [render(0), render(1)]
    for i, f in enumerate(frames):
        im = to_rgba(f)
        im.save(f'{out}/thrum-{i}.png')
    rows, palette = to_rows(frames)
    print(len(palette), 'colors')
    json.dump({'frames': rows, 'colors': palette}, open(f'{out}/thrum.json', 'w'))
