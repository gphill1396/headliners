"""
Headliner portraits (SPEC S4.2, batch 2), drawn to Thrum's approved sample:
48×48, three-quarter view facing right, lit from the top left, two frames
(the rest pose and the note). Thrum's own portrait is the original sample
(sprites/thrum_portrait_original.py, data in src/render/portraits.ts).
"""
from pixelkit import Canvas, Part, put, put_on, render

DARK = '#1e1224'
EYE_W = '#fffaf0'


def lyra(f):
    """The serpent lutenist: a cobra-hooded naga, coiled, playing a lute."""
    cv = Canvas(48, 48)
    s = f
    R = {
        'scale': ['#0f4a46', '#227a72', '#3cb4a8', '#8ef0e0'],
        'belly': ['#9a8a46', '#d8c87a', '#f6eab0'],
        'hood': ['#0c3a38', '#1c665e', '#33a094'],
        'lute': ['#5a2a10', '#9a5422', '#d08a3c', '#f4c070'],
        'face': ['#1e3a6a', '#3a64a8'],  # hood markings
        'string': ['#d8d0b8', '#d8d0b8'],
    }
    coil = cv.ellipse(22, 40, 15, 6.5) | cv.ellipse(30, 36, 9, 5)
    tailtip = cv.curve([(8, 40), (3, 35), (5, 30)], 2.4, 0.8)
    body = cv.curve([(26, 36), (25, 28), (26, 20), (28, 13)], 6.0, 4.2)
    hood = cv.ellipse(29, 11, 8.5, 9.5)
    head = cv.ellipse(31, 11, 4.6, 4.2) | cv.ellipse(36, 13 + s * 0.3, 4, 2.6, rot=0.15)
    lute = cv.ellipse(23, 28, 7.5, 6, rot=-0.5) | cv.capsule(26, 26, 42, 15, 1.4)
    P = [
        Part('tail', 'scale', tailtip, group='body'),
        Part('coil', 'scale', coil, group='coil'),
        Part('body', 'scale', body, group='body'),
        Part('belly', 'belly', cv.curve([(29, 34), (28, 26), (29, 19)], 2.6, 2.0) & body, group='body'),
        Part('hood', 'hood', hood, group='hood'),
        Part('head', 'scale', head, group='head'),
        Part('armB', 'scale', cv.curve([(30, 20), (36, 21), (40, 17)], 1.8, 1.5), group='armB'),
        Part('lute', 'lute', lute, group='lute'),
        Part('rose', 'hood', cv.ellipse(22, 28, 2.0, 1.8), group='rose'),
        Part('armF', 'scale', cv.curve([(25, 20), (21, 25), (24, 29 + s)], 2.0, 1.6), group='armF'),
    ]
    c = render(cv, P, R, DARK, seam_dark=('lute',))
    # Eye, tongue, hood markings.
    put(c, [(33, 10)], EYE_W)
    put(c, [(34, 10)], '#ffd24a')
    put(c, [(34, 11)], '#101820')
    if s:
        put(c, [(41, 14), (42, 15), (42, 13)], '#e04a5a')  # forked tongue, mid-song
    put_on(c, [(24, 7), (25, 9), (24, 12), (34, 6)], '#1e3a6a')
    for k in range(6):
        put_on(c, [(27 + k * 2.5 if False else 27 + int(k * 2.5), 25 - k * 2)], '#d8d0b8')  # strings along the neck
    # Notes rise when she plays.
    if s:
        put(c, [(44, 6), (44, 7), (45, 5), (40, 3), (40, 4), (41, 2)], '#8ef0e0')
    # Coil scale bands.
    for x in range(10, 36, 4):
        put_on(c, [(x, 41), (x + 1, 42)], '#0f4a46')
    return c


def clatter(f):
    """The kobold tinker, cranking a hurdy-gurdy."""
    cv = Canvas(48, 48)
    s = f
    R = {
        'scale': ['#6a4a12', '#b08a26', '#e2c050', '#fff0a0'],
        'belly': ['#a88a5a', '#e0c890', '#f8eac0'],
        'horn': ['#8a7a64', '#d0c0a0', '#f4ead2'],
        'leather': ['#2e2014', '#523a24', '#7a5838'],
        'gurdy': ['#4a2210', '#8a4a1e', '#c47a34', '#eaa858'],
        'iron': ['#2c2c3a', '#5e5e72', '#9a9ab0', '#d0d0e4'],
        'lens': ['#1a4a6a', '#4aa0d0', '#c0f0ff'],
    }
    head = cv.ellipse(25, 13, 7, 6.2) | cv.ellipse(32, 15.5, 5, 3.2, rot=0.15)
    P = [
        Part('tail', 'scale', cv.curve([(18, 38), (9, 42), (4, 38), (6, 33)], 3.4, 1.2), group='body'),
        Part('legB', 'scale', cv.ellipse(18, 41, 4, 4.5) | cv.rect(14, 43, 22, 47), group='body'),
        Part('body', 'scale', cv.ellipse(22, 30, 8.5, 10)),
        Part('belly', 'belly', cv.ellipse(25, 30, 5, 8.5) & cv.ellipse(22, 30, 8.5, 10), group='body'),
        Part('legF', 'scale', cv.ellipse(28, 41, 4, 4.5) | cv.rect(24, 43, 33, 47), group='body'),
        Part('belt', 'leather', cv.rect(13, 34, 31, 37) & cv.ellipse(22, 30, 9, 10.5), group='belt'),
        Part('neck', 'scale', cv.capsule(23, 22, 25, 16, 3.6), group='body'),
        Part('head', 'scale', head, group='body'),
        Part('hornB', 'horn', cv.curve([(21, 9), (16, 6), (13, 7)], 1.7, 0.6), group='horns'),
        Part('hornF', 'horn', cv.curve([(24, 8), (21, 3), (17, 2)], 2.0, 0.6), group='horns'),
        Part('goggles', 'iron', cv.ellipse(27, 11, 4.2, 2.4), group='goggles'),
        Part('lensA', 'lens', cv.ellipse(25.5, 11, 1.5, 1.5), group='lens'),
        Part('lensB', 'lens', cv.ellipse(29, 11, 1.5, 1.5), group='lens'),
        # The hurdy-gurdy: a fiddle-shaped box held across the body, a crank at the tail end, keys along the top.
        Part('gurdy', 'gurdy', cv.ellipse(26, 30, 11, 5, rot=-0.15) | cv.rect(31, 24, 41, 30), group='gurdy'),
        Part('keys', 'leather', cv.rect(27, 25, 40, 27), group='keys'),
        Part('armB', 'scale', cv.curve([(26, 22), (31, 24), (34, 25)], 2.0, 1.6), group='armB'),
        Part('armF', 'scale', cv.curve([(19, 22), (13, 24), (10, 25 + 6 * s)], 2.2, 1.7), group='armF'),
        Part('crank', 'iron', cv.capsule(15, 31, 10, 25 + 6 * s, 0.8) | cv.ellipse(15, 31, 1.6, 1.6), group='crank'),
    ]
    c = render(cv, P, R, DARK, seam_dark=('gurdy', 'iron', 'leather'))
    put(c, [(25, 10), (28, 10)], '#ffffff')  # lens glints
    put_on(c, [(36, 16)], DARK)  # nostril
    put_on(c, [(x, 18) for x in range(30, 36)], DARK)  # grin
    put_on(c, [(31, 19)], '#f4ead2')
    for x in range(29, 40, 2):
        put_on(c, [(x, 26)], '#d0d0e4')  # key tips
    put_on(c, [(16, 35), (20, 35), (24, 35)], '#9a9ab0')  # tools on the belt
    if s:
        put(c, [(42, 20), (44, 18), (43, 22), (45, 21)], '#fff3b0')  # the buzz
    return c


def aria(f):
    """The siren: long hair, a fish tail curled beneath her, singing."""
    cv = Canvas(48, 48)
    s = f
    R = {
        'skin': ['#9a5a4a', '#d08e6e', '#f0b896', '#ffe0c8'],
        'hair': ['#5a1240', '#9a2a6a', '#d04a8e', '#f88ac0'],
        'tail': ['#0e5a5a', '#1e8a80', '#3cc4b0', '#a0f4e0'],
        'fin': ['#4a2a6a', '#7a4aa8', '#b08ad6'],
        'shell': ['#a86a7a', '#f0b4c4', '#fff0f4'],
    }
    hair = cv.ellipse(23, 12, 8, 8.5) | cv.curve([(19, 14), (16, 24), (18, 32)], 4.5, 2.0)
    tail = cv.curve([(25, 32), (21, 39), (14, 42), (8, 40)], 6.0, 2.6)
    fin = cv.poly([(9, 40), (1, 33), (4, 41), (1, 47), (9, 43)])
    P = [
        Part('hairBack', 'hair', hair, group='hair'),
        Part('fin', 'fin', fin, style='flat', group='fin'),
        Part('tail', 'tail', tail, group='tail'),
        Part('hips', 'tail', cv.ellipse(25, 31, 6, 4.5), group='tail'),
        Part('torso', 'skin', cv.ellipse(25, 24, 5, 7), group='body'),
        Part('shellL', 'shell', cv.ellipse(23, 22, 2.2, 1.8), group='shell'),
        Part('shellR', 'shell', cv.ellipse(27.5, 22, 2.2, 1.8), group='shell'),
        Part('neck', 'skin', cv.capsule(26, 18, 26.5, 14, 1.8), group='body'),
        Part('face', 'skin', cv.ellipse(27.5, 12, 4.4, 5), group='face'),
        Part('fringe', 'hair', cv.ellipse(26, 8, 5.5, 3) & ~cv.ellipse(29.5, 13, 3.8, 4.2), group='fringe'),
        Part('lock', 'hair', cv.curve([(31, 9), (32.5, 16), (31, 22)], 1.4, 0.8), group='lock'),
        Part('armB', 'skin', cv.curve([(29, 19), (34, 16 - 2 * s), (37, 11 - 3 * s)], 1.5, 1.2), group='armB'),
        Part('armF', 'skin', cv.curve([(22, 19), (21, 24), (25, 23)], 1.6, 1.3), group='armF'),
    ]
    c = render(cv, P, R, DARK, soft_outline=('skin', 'hair', 'tail', 'fin'))
    put(c, [(29, 11)], '#3a1e4a')
    put(c, [(28, 10)], '#ffffff')
    put_on(c, [(31, 11)], '#7a3a3a')  # far eye, small
    if s:
        put_on(c, [(29, 15), (30, 15), (29, 16)], '#7a1e3a')  # singing
        put(c, [(40, 6), (41, 6), (42, 4), (42, 5), (38, 2), (39, 1), (39, 2)], '#ffc0dc')  # notes
    else:
        put_on(c, [(29, 15), (30, 15)], '#c06a6a')
    for x in range(10, 24, 3):
        put_on(c, [(x, 40)], '#0e5a5a')  # tail scales
    return c


def riot(f):
    """The piper drake: a green drake with a mohawk crest and the bagpipes."""
    cv = Canvas(48, 48)
    s = f
    R = {
        'scale': ['#1e4a1a', '#3a7a26', '#68b03a', '#b0e078'],
        'belly': ['#8a8a46', '#c8c87a', '#eeeab0'],
        'crest': ['#8a1a3a', '#d03a5a', '#ff7a8a'],
        'bag': ['#2a1a3a', '#4a2a62', '#74449a', '#a272c6'],
        'tartan': ['#1a3a1a', '#2e5e2a'],
        'pipe': ['#1e140e', '#4a3420', '#7a5a38', '#c8a070'],
        'silver': ['#6a6a80', '#c8c8dc'],
        'wing': ['#1a3a1e', '#2e5e30', '#4a8a46'],
    }
    hy = 11 + s * 0.5
    head = cv.ellipse(27, hy, 7, 6) | cv.ellipse(34.5, hy + 2, 5.5, 3.6, rot=0.12)
    P = [
        Part('tail', 'scale', cv.curve([(16, 36), (9, 41), (4, 45)], 4.0, 1.4), group='body'),
        Part('wing', 'wing', cv.poly([(19, 21), (8, 6), (9, 12), (3, 12), (9, 17), (4, 21), (14, 25)]), style='flat', group='wing'),
        Part('legB', 'scale', cv.ellipse(17, 41, 4.4, 4.4) | cv.rect(13, 43, 21, 47), group='body'),
        Part('body', 'scale', cv.ellipse(23, 30, 9, 10.5)),
        Part('belly', 'belly', cv.ellipse(26, 30, 5.2, 8.5) & cv.ellipse(23, 30, 9, 10.5), group='body'),
        Part('legF', 'scale', cv.ellipse(29, 41, 4.4, 4.4) | cv.rect(25, 43, 34, 47), group='body'),
        Part('neck', 'scale', cv.capsule(24, 22, 26, hy + 4, 4.4, 3.8), group='body'),
        Part('head', 'scale', head, group='body'),
        Part('crest', 'crest', cv.poly([(20, hy - 1), (21, hy - 9), (24, hy - 5), (25, hy - 11), (28, hy - 6), (30, hy - 10), (31, hy - 4)]), group='crest'),
        # Bagpipes: the bag under the near arm, three drones over the shoulder, the chanter to the mouth.
        Part('drones', 'pipe', cv.capsule(17, 26, 9, 8, 1.0) | cv.capsule(19, 26, 14, 5, 1.0) | cv.capsule(21, 26, 19, 6, 0.9), group='drones'),
        Part('bag', 'bag', cv.ellipse(22, 29 - s * 0.5, 7.5 - s * 0.6, 5.5 + s * 0.3, rot=-0.3), group='bag'),
        Part('chanter', 'pipe', cv.capsule(36, hy + 4, 37, 31, 1.0), group='chanter'),
        Part('armF', 'scale', cv.curve([(20, 22), (17, 27), (24, 31)], 2.4, 1.8), group='armF'),
        Part('armB', 'scale', cv.curve([(29, 22), (34, 24), (36, 27)], 2.2, 1.7), group='armB'),
    ]
    c = render(cv, P, R, DARK, seam_dark=('pipe', 'bag'))
    put(c, [(30, int(hy) - 1)], '#ffffff')
    put(c, [(31, int(hy) - 1), (31, int(hy))], '#ffd24a')
    put(c, [(32, int(hy))], '#101810')
    put_on(c, [(30, int(hy) - 2), (31, int(hy) - 2), (32, int(hy) - 2)], DARK)  # scowl
    put_on(c, [(9, 8), (14, 5), (19, 6)], '#c8c8dc')  # drone caps
    for k in range(3):
        put_on(c, [(19 + k * 3, 27 - k), (20 + k * 3, 30 - k)], '#2e5e2a')  # tartan on the bag
    if s:
        put(c, [(42, 20), (43, 18), (44, 21), (6, 4), (12, 2)], '#b0e078')  # the skirl
    return c


PORTRAITS = {'lyra': lyra, 'clatter': clatter, 'aria': aria, 'riot': riot}


def frames(name):
    return [PORTRAITS[name](0), PORTRAITS[name](1)]
