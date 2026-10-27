"""
The faire's UI kit (SPEC S4.6): pixel-art window frames, buttons, cards, lane
plaques, tiles (vellum, oak, tent awning, bunting), small icons and the title
scene, written as PNG data URIs into src/ui/pixel-ui.css.

    python3 art/ui.py                 # writes src/ui/pixel-ui.css
    python3 art/ui.py --sheet out.png # also a contact sheet for review

The CSS draws these at whole-pixel scale (--upx CSS px per art pixel) with
image-rendering: pixelated, so the menus have the same chunky pixels as the field.
"""
import base64
import io
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'sprites'))

P = {
    'K': '#2b1a10',  # ink
    'I': '#1c1418',  # iron
    'V': '#f5e8c8', 'v': '#e8d3a2', 'u': '#c4a46c', 'w': '#a8884e',  # vellum
    'L': '#a07040', 'O': '#7a5130', 'o': '#5c3a20', 'd': '#3b2414',  # oak
    'R': '#d9583c', 'C': '#b33c2c', 'c': '#8c2420', 'r': '#5c1612',  # crimson
    'Y': '#f8dc7a', 'G': '#e0b04a', 'g': '#8a5e14',  # gilt
    'F': '#5f9a44', 'f': '#2f5a2a',  # forest
    'B': '#4a74b8', 'b': '#24406e',  # royal blue
    'N': '#2f2547', 'n': '#211934', 'm': '#3f3360', 'k': '#16101f',  # night
}


def grid(rows):
    """ASCII rows → RGBA array ('.' is clear)."""
    h, w = len(rows), len(rows[0])
    a = np.zeros((h, w, 4), np.uint8)
    for y, row in enumerate(rows):
        assert len(row) == w, (y, row)
        for x, ch in enumerate(row):
            if ch != '.':
                hx = P[ch].lstrip('#')
                a[y, x] = (int(hx[0:2], 16), int(hx[2:4], 16), int(hx[4:6], 16), 255)
    return a


def frame(rings, fill=None, center=4):
    """A 9-slice frame: rings from the outside in, each (top/left colour, bottom/right colour).
    The outermost corner pixels are cut, so corners read as notched, not square."""
    n = len(rings)
    size = 2 * n + center
    rows = [['.'] * size for _ in range(size)]
    for y in range(size):
        for x in range(size):
            d = min(x, y, size - 1 - x, size - 1 - y)
            if d < n:
                tl, br = rings[d]
                # Top and left edges take the light colour; bottom and right the dark.
                light = (y == d and x < size - 1 - d) or (x == d and y < size - 1 - d)
                rows[y][x] = tl if light else br
            elif fill:
                rows[y][x] = fill
    for (x, y) in [(0, 0), (size - 1, 0), (0, size - 1), (size - 1, size - 1)]:
        rows[y][x] = '.'
    if n > 1:
        o = rings[0][0]
        for (x, y) in [(1, 1), (size - 2, 1), (1, size - 2), (size - 2, size - 2)]:
            rows[y][x] = o
    return grid([''.join(r) for r in rows]), n


def stamp(a, rows, x0, y0):
    s = grid(rows)
    m = s[..., 3] > 0
    a[y0:y0 + s.shape[0], x0:x0 + s.shape[1]][m] = s[m]


def hash01(x, y, seed=0):
    v = (x * 374761393 + y * 668265263 + seed * 1442695041) & 0xFFFFFFFF
    v = (v ^ (v >> 13)) * 1274126177 & 0xFFFFFFFF
    return (v ^ (v >> 16)) / 0xFFFFFFFF


# ---------------------------------------------------------------- frames


def window():
    """Menus: an ink line, a two-tone gilt band, ink again; the vellum page shows through."""
    a, n = frame([('K', 'K'), ('Y', 'g'), ('G', 'g'), ('K', 'K')])
    # Gilt studs in the corners.
    for (x, y) in [(1, 1), (10, 1), (1, 10), (10, 10)]:
        a[y, x] = grid(['Y'])[0, 0]
    return a, n


def button(down=False):
    rings = [('K', 'K'), ('Y', 'g') if not down else ('g', 'Y'), ('R', 'r') if not down else ('r', 'R')]
    return frame(rings, fill='c')


def plank_button(down=False):
    return frame([('I', 'I'), ('L', 'd') if not down else ('d', 'L')])


def card():
    return frame([('K', 'K'), ('V', 'u')])


def chip(on=False):
    return frame([('K', 'K') if on else ('w', 'w'), ('V', 'u') if not on else ('Y', 'g')])


def plaque():
    a, n = frame([('I', 'I'), ('L', 'd'), ('O', 'o')])
    for (x, y) in [(2, 2), (7, 2), (2, 7), (7, 7)]:
        a[y, x] = grid(['I'])[0, 0]
    return a, n


# ---------------------------------------------------------------- tiles


def vellum_tile():
    rows = []
    for y in range(16):
        row = ''
        for x in range(16):
            h = hash01(x, y, 1)
            row += 'u' if h < 0.06 else 'V' if h > 0.95 else 'w' if 0.5 < h < 0.505 else 'v'
        rows.append(row)
    return grid(rows)


def oak_tile():
    rows = []
    for y in range(16):
        row = ''
        for x in range(32):
            plank = y // 8
            if y % 8 == 0:
                row += 'd'
            elif (x + plank * 13) % 32 == 0:
                row += 'd'  # plank end
            else:
                h = hash01(x // 3, y, 2 + plank)
                row += 'O' if h < 0.22 else 'd' if h > 0.97 else 'o'
        rows.append(row)
    return grid(rows)


def awning():
    """A striped tent awning, crimson and cream, scalloped along the bottom."""
    w, h = 16, 10
    rows = [['.'] * w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            red = x < 8
            col = 'c' if red else 'v'
            if y == 0:
                rows[y][x] = 'K'
                continue
            if y >= 6:
                cx = 3.5 if red else 11.5
                if (x - cx) ** 2 / 16 + (y - 5.5) ** 2 / 16 > 1:
                    continue
            shade = (x % 8 == 7) or y == h - 1
            rows[y][x] = ('r' if red else 'u') if shade else ('C' if red and y == 1 else 'V' if (not red and y == 1) else col)
    a = grid([''.join(r) for r in rows])
    # Ink edge under each scallop.
    for x in range(w):
        for y in range(h - 1, 0, -1):
            if a[y, x, 3]:
                if y + 1 < h:
                    pass
                break
    return a


def bunting():
    rows = [
        'dddddddddddddddddddddddd',
        '.KKKKKK..KKKKKK..KKKKKK.',
        '.KCCCcK..KYGGgK..KFFFfK.',
        '..KCcK....KGgK....KFfK..',
        '..KCcK....KGgK....KFfK..',
        '...KK......KK......KK...',
    ]
    return grid(rows)


def heart():
    return grid([
        '.KK.KK.',
        'KRCKCcK',
        'KCccccK',
        '.KcccK.',
        '..KcK..',
        '...K...',
    ])


def coin():
    return grid([
        '.KKKK.',
        'KYGGgK',
        'KGYggK',
        'KGggrK'.replace('r', 'g'),
        'KggggK',
        '.KKKK.',
    ])


def cursor():
    return grid([
        'KK....',
        'KYK...',
        'KGYK..',
        'KGGYK.',
        'KGGgK.',
        'KGgK..',
        'KgK...',
        'KK....',
    ])


def type_icons():
    """One small heraldic badge per card type (S4.6): Unit a figure, Gate an arch, Riff a note, Amp a pennant."""
    return {
        'type-unit': grid([
            '..KKK..',
            '.KFFfK.',
            '.KFffK.',
            'KKKFKKK',
            'KFFFFfK',
            '.KFfFK.',
            '.KfKfK.',
            '.KK.KK.',
        ]),
        'type-gate': grid([
            '.KKKKK.',
            'KBBBBbK',
            'KBKKKbK',
            'KBK.KbK',
            'KBK.KbK',
            'KBK.KbK',
            'KbK.KbK',
            'KKK.KKK',
        ]),
        'type-riff': grid([
            '...KKKK',
            '...KYGK',
            '...KGKK',
            '...KGK.',
            '.KKKGK.',
            'KYGGgK.',
            'KGggK..',
            '.KKK...',
        ]),
        'type-amp': grid([
            'KK.....',
            'KdKKKK.',
            'KdKRCcK',
            'KdKCccK',
            'KdKccK.',
            'KdKcK..',
            'KdKK...',
            'KdK....',
        ]),
    }


def seal():
    """A wax seal for primary choices."""
    return grid([
        '..KKKK..',
        '.KRCCcK.',
        'KRCcccrK',
        'KCcYYcrK',
        'KCcYYcrK',
        'KcccccrK',
        '.KrrrrK.',
        '..KKKK..',
    ])


# ---------------------------------------------------------------- the title scene


def scene():
    """A night faire: banded sky, hills, two striped pavilions, the band's stage
    with bunting and lanterns, the band on it, and the crowd in front. 240×128."""
    import units

    W, H = 240, 128
    a = np.zeros((H, W, 4), np.uint8)

    def put(x, y, ch):
        if 0 <= x < W and 0 <= y < H:
            hx = P[ch].lstrip('#')
            a[y, x] = (int(hx[0:2], 16), int(hx[2:4], 16), int(hx[4:6], 16), 255)

    def fill(mask, ch):
        ys, xs = np.nonzero(mask)
        for y, x in zip(ys, xs):
            put(x, y, ch)

    yy, xx = np.mgrid[0:H, 0:W]
    # Sky in bands, dithered where they meet (no smooth gradients).
    for y in range(H):
        for x in range(W):
            band = 'k' if y < 22 else 'n' if y < 46 else 'N' if y < 64 else 'm'
            edge = y in (22, 23, 46, 47, 64, 65)
            if edge and (x + y) % 2 == 0:
                band = {'n': 'k', 'N': 'n', 'm': 'N'}[band]
            put(x, y, band)
    for i in range(40):
        x, y = int(hash01(i, 1, 9) * W), int(hash01(i, 2, 9) * 50)
        put(x, y, 'V' if i % 4 else 'Y')
    # Moon.
    fill((xx - 204) ** 2 + (yy - 18) ** 2 <= 64, 'V')
    fill(((xx - 207) ** 2 + (yy - 16) ** 2 <= 30) & ((xx - 204) ** 2 + (yy - 18) ** 2 <= 64), 'v')
    # Hills.
    hills = yy > 70 - 10 * np.sin(xx / 23.0) - 6 * np.sin(xx / 9.0 + 1)
    fill(hills, 'k')

    def pavilion(x0, w, top, stripe, stripe_dk, flag):
        cx = x0 + w // 2
        body = (xx >= x0) & (xx < x0 + w) & (yy >= top + 16) & (yy < 104)
        roof = (yy >= top) & (yy < top + 17) & (np.abs(xx - cx) <= (yy - top) * (w / 2) / 16 + 1)
        for m in (roof, body):
            ys, xs = np.nonzero(m)
            for y, x in zip(ys, xs):
                s = ((x - x0) // 5) % 2 == 0
                put(x, y, stripe if s else 'v')
        # Shading on the right, an opening, an outline.
        fill(body & (xx >= x0 + w - 3), stripe_dk)
        fill((np.abs(xx - cx) <= 4) & (yy >= 88) & (yy < 104), 'k')
        edge = (roof | body) & ~(np.roll(roof | body, 1, 0) & np.roll(roof | body, -1, 0) & np.roll(roof | body, 1, 1) & np.roll(roof | body, -1, 1))
        fill(edge, 'K')
        for y in range(top - 9, top):
            put(cx, y, 'd')
        stamp_flag = [(cx + 1 + i, top - 9 + j) for i in range(5) for j in range(3) if i < 5 - j]
        for (x, y) in stamp_flag:
            put(x, y, flag)

    pavilion(6, 54, 52, 'c', 'r', 'G')
    pavilion(184, 50, 56, 'b', 'k', 'C')

    # The stage: an oak platform with an awning and bunting.
    x0, x1, floor = 62, 178, 100
    for y in range(floor, 112):
        for x in range(x0, x1):
            put(x, y, 'd' if y == floor or (x - x0) % 12 == 0 else 'O' if y == floor + 1 else 'o')
    for x in range(x0 - 2, x1 + 2):
        put(x, floor - 1, 'K')
    for px in (x0, x1 - 3):
        for y in range(46, floor):
            for dx in range(3):
                put(px + dx, y, 'o' if dx else 'O')
    aw = awning()
    for x in range(x0 - 4, x1 + 4, 16):
        for y in range(aw.shape[0]):
            for dx in range(16):
                if aw[y, dx, 3] and x + dx < x1 + 4:
                    a[38 + y, x + dx] = aw[y, dx]
    bt = bunting()
    for x in range(x0, x1, 24):
        for y in range(bt.shape[0]):
            for dx in range(24):
                if bt[y, dx, 3] and x + dx < x1:
                    a[50 + y, x + dx] = bt[y, dx]
    # Lanterns on the posts, with a dithered glow.
    for lx in (x0 + 1, x1 - 2):
        for y in range(58, 70):
            for x in range(lx - 7, lx + 8):
                r2 = (x - lx) ** 2 + (y - 63) ** 2
                if r2 < 40 and (x + y) % 2 == 0 and a[y, x, 3]:
                    put(x, y, 'g')
        for dy in range(4):
            for dx in range(-1, 2):
                put(lx + dx, 61 + dy, 'Y' if dy in (1, 2) and dx == 0 else 'G')

    # The band: four performers from the unit art, one per family.
    for i, name in enumerate(['kick-drum', 'arpeggiator', 'guitar-tech', 'soprano']):
        f = units.frames(name)[0]
        ox = x0 + 10 + i * 27
        oy = floor - f.shape[0] + 1
        for y in range(f.shape[0]):
            for x in range(f.shape[1]):
                if f[y, x]:
                    hx = f[y, x].lstrip('#')
                    a[oy + y, ox + x] = (int(hx[0:2], 16), int(hx[2:4], 16), int(hx[4:6], 16), 255)

    # The crowd: heads and shoulders in front of the stage.
    for i in range(30):
        cx = int(i * 8.3 + hash01(i, 3, 4) * 4)
        cy = 117 + int(hash01(i, 4, 4) * 4)
        tone = 'N' if i % 3 else 'm'
        fill(((xx - cx) ** 2 / 9 + (yy - cy) ** 2 / 9 <= 1), tone)
        fill((np.abs(xx - cx) <= 4) & (yy >= cy + 2), tone)
        if i % 5 == 0:
            for y in range(cy - 9, cy - 1):
                put(cx + 3, y, tone)  # a raised arm
    return a


# ---------------------------------------------------------------- output


def uri(a):
    buf = io.BytesIO()
    Image.fromarray(a, 'RGBA').save(buf, 'PNG', optimize=True)
    return 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()


def css():
    frames = {
        'window': window(),
        'btn': button(),
        'btn-down': button(True),
        'plank': plank_button(),
        'plank-down': plank_button(True),
        'card': card(),
        'chip': chip(),
        'chip-on': chip(True),
        'plaque': plaque(),
    }
    tiles = {
        'vellum': vellum_tile(),
        'oak': oak_tile(),
        'awning': awning(),
        'bunting': bunting(),
    }
    icons = {'heart': heart(), 'coin': coin(), 'cursor': cursor(), 'seal': seal(), **type_icons(), 'scene': scene()}
    out = [
        '/* Generated by art/ui.py (the faire UI kit, SPEC S4.6). Do not edit by hand. */',
        ':root {',
    ]
    for name, (a, n) in frames.items():
        out.append(f'  --ui-{name}: url("{uri(a)}");')
        out.append(f'  --ui-{name}-slice: {n};')
    for name, a in {**tiles, **icons}.items():
        out.append(f'  --ui-{name}: url("{uri(a)}");')
        out.append(f'  --ui-{name}-w: {a.shape[1]};')
        out.append(f'  --ui-{name}-h: {a.shape[0]};')
    out.append('}')
    with open(os.path.join(ROOT, 'src', 'ui', 'pixel-ui.css'), 'w') as fh:
        fh.write('\n'.join(out) + '\n')
    return {**{k: v[0] for k, v in frames.items()}, **tiles, **icons}


def sheet(images, path, scale=6):
    pad = 8
    widths = [im.shape[1] * scale for im in images.values()]
    W = 1200
    x = y = pad
    row_h = 0
    places = []
    for name, im in images.items():
        w, h = im.shape[1] * scale, im.shape[0] * scale
        if x + w > W:
            x, y = pad, y + row_h + pad
            row_h = 0
        places.append((name, im, x, y))
        x += w + pad
        row_h = max(row_h, h)
    out = Image.new('RGBA', (W, y + row_h + pad), (90, 80, 100, 255))
    for name, im, x, y in places:
        img = Image.fromarray(im, 'RGBA').resize((im.shape[1] * scale, im.shape[0] * scale), Image.NEAREST)
        out.alpha_composite(img, (x, y))
    out.save(path)
    del widths


if __name__ == '__main__':
    imgs = css()
    if '--sheet' in sys.argv:
        sheet(imgs, sys.argv[sys.argv.index('--sheet') + 1])
    print(f'{len(imgs)} UI images')
