# Art pipeline (SPEC S4.2)

Sprites are drawn as code: each script in `sprites/` builds a figure from shapes
(ellipses, capsules, polygons), and `pixelkit.py` shades them to a 2–4 tone ramp
lit from the top left, adds seams and a dark outline, cleans stray pixels, and
then the script adds hand touches (eyes, glints, studs). Two frames per sprite.

    python3 art/build.py --sheet /tmp/sheet.png

writes `src/render/art.ts` (the only thing the game reads) and a contact sheet
to review. Needs Python 3 with numpy, scipy and Pillow; it is a dev tool, not part
of the web build or CI.

- `sprites/monsters.py` — the 12 monsters, the Hobgoblin without its shield, the
  small Slime, and the three bosses (batch 1).
- `sprites/thrum_portrait_original.py` — the first sample (Thrum's title portrait),
  kept as it was approved; its output lives in `src/render/portraits.ts`.
