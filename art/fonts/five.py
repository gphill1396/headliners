"""Pixelify Sans's 5 reads as an S at phone size (Grant, Oct 27). This makes a tiny face holding only a
clearer 5 (flat top, square corners: the classic 5x7 pixel 5) for each weight, which styles.css layers
over Pixelify Sans with unicode-range U+0035. Run: python3 art/fonts/five.py (needs fontTools)."""
import os
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset
from fontTools.pens.ttGlyphPen import TTGlyphPen

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, 'src', 'ui', 'fonts', 'pixelify-sans.woff')

# The 5x7 pixel 5, top row first.
FIVE = [
    '#####',
    '#....',
    '####.',
    '....#',
    '....#',
    '#...#',
    '.###.',
]


def build(weight, x0, x1, y0, y1, stem):
    font = TTFont(SRC)
    font = instancer.instantiateVariableFont(font, {'wght': weight})
    opts = subset.Options()
    opts.layout_features = []
    opts.name_IDs = ['*']
    opts.notdef_outline = True
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=[0x35])
    sub.subset(font)
    cols, rows = 5, 7
    cw = (x1 - x0) / cols
    rh = (y1 - y0) / rows
    # Bold strokes are thicker than a cell: grow each pixel up and to the right by the extra.
    grow = max(0, stem - cw)
    pen = TTGlyphPen(None)
    for r, line in enumerate(FIVE):
        for c, ch in enumerate(line):
            if ch != '#':
                continue
            left = round(x0 + c * cw)
            right = round(x0 + (c + 1) * cw + (grow if c < cols - 1 else 0))
            top = round(y1 - r * rh)
            bottom = round(y1 - (r + 1) * rh - (grow if r < rows - 1 else 0))
            right = min(right, round(x1))
            bottom = max(bottom, round(y0))
            # Clockwise (TrueType outer contour).
            pen.moveTo((left, bottom))
            pen.lineTo((left, top))
            pen.lineTo((right, top))
            pen.lineTo((right, bottom))
            pen.closePath()
    glyph = pen.glyph()
    font['glyf']['five'] = glyph
    glyph.recalcBounds(font['glyf'])
    font['hmtx']['five'] = (font['hmtx']['five'][0], glyph.xMin)
    font.flavor = 'woff'
    out = os.path.join(ROOT, 'src', 'ui', 'fonts', f'pixelify-five-{weight}.woff')
    font.save(out)
    print('wrote', out, os.path.getsize(out), 'bytes')


# Ink boxes measured from Pixelify Sans's own S at each weight, so the new 5 sits on the same grid.
build(400, 60, 525, -12, 631, 91)
build(700, 61, 542, -11, 638, 127)
