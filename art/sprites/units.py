"""
The band's units (SPEC S4.2, batch 2): who stands on the stage lip and plays.
Front-facing like the monsters, about 18×22 so three fit in a lane. Two
frames: a rest pose and the beat they play on. Accents follow the headliner
family: Thrum orange, Lyra teal, Clatter yellow, Aria pink, Riot green.
"""
from pixelkit import Canvas, Part, put, put_on, render, trim

DARK = '#1a1222'
W, H = 20, 24

SKIN = {
    'human': ['#7a4a36', '#c08262', '#e8b494'],
    'kobold': ['#6a5216', '#b89432', '#e8cc62'],
    'sprite': ['#2a7a72', '#4fd1c5', '#b0fff4'],
    'gnome': ['#8a5a46', '#d4967a', '#f4c8aa'],
}


def ramp(dark, mid, light=None, hi=None):
    return [dark, mid] + ([light] if light else []) + ([hi] if hi else [])


def body(cv, outfit, skin='human', s=0, hat=None, legs='hose', small=False):
    """Base performer, front-facing. Returns parts (back to front), without arms or props."""
    k = 0.85 if small else 1.0
    cx = W / 2
    top = 4 if not small else 7
    P = []
    if legs == 'robe':
        P.append(Part('robe', outfit, cv.poly([(cx - 3.5, top + 8), (cx - 5.5, H - 1), (cx + 5.5, H - 1), (cx + 3.5, top + 8)]), group='body'))
    else:
        P.append(Part('legL', 'hose', cv.capsule(cx - 2, top + 11, cx - 2.2, H - 1.5, 1.4 * k), group='legs'))
        P.append(Part('legR', 'hose', cv.capsule(cx + 2, top + 11, cx + 2.2, H - 1.5, 1.4 * k), group='legs'))
    P.append(Part('torso', outfit, cv.ellipse(cx, top + 8.5, 4.2 * k, 4.6 * k), group='body'))
    P.append(Part('head', skin, cv.ellipse(cx, top + 2.2 - 0.5 * s, 3.3 * k, 3.4 * k), group='head'))
    return P


def face(c, top=4, s=0, eyes='#1a1222', mouth=None):
    y = int(top + 2 - 0.5 * s)
    put_on(c, [(8, y), (11, y)], eyes)
    if mouth:
        put_on(c, [(9, y + 2), (10, y + 2)], mouth)


def page(f):
    cv = Canvas(W, H)
    s = f
    R = {'human': SKIN['human'], 'tabard': ramp('#22305e', '#3a5aa0', '#5e86d0'), 'hose': ramp('#3a2a20', '#5e4430'), 'cap': ramp('#6a1e1e', '#a83232'), 'rock': ramp('#4a4a54', '#8a8a96')}
    P = body(cv, 'tabard', s=s)
    P += [
        Part('cap', 'cap', cv.ellipse(10, 3.2 - 0.5 * s, 3.6, 1.6), group='cap'),
        Part('armL', 'tabard', cv.capsule(6, 10, 4.5, 15, 1.1), group='armL'),
        Part('armR', 'tabard', cv.capsule(14, 10, 16, 5 + 3 * s, 1.1), group='armR'),
        Part('rock', 'rock', cv.ellipse(16.5, 3.5 + 3 * s, 1.5, 1.4), group='rock'),
    ]
    c = render(cv, P, R, DARK)
    face(c, s=s)
    put_on(c, [(10, 10), (10, 11), (10, 12)], '#e8c84a')  # tabard stripe
    return c


def war_drum(f):
    cv = Canvas(W, H)
    s = f
    R = {'human': SKIN['human'], 'coat': ramp('#5a1e12', '#a03a1e', '#e0662e'), 'hose': ramp('#2a1e16', '#4a3626'), 'shell': ramp('#4f2a1a', '#7d4626', '#a8683a', '#cf9255'), 'skin_': ramp('#bfa77a', '#e6d4ac', '#fff6e0'), 'wood': ramp('#3a2414', '#946a42')}
    P = body(cv, 'coat', s=s)
    P += [
        Part('shell', 'shell', cv.rect(4, 13, 16, 20) | cv.ellipse(10, 20, 6, 1.6), style='cyl', group='drum'),
        Part('drumhead', 'skin_', cv.ellipse(10, 13, 6, 1.7), group='drum'),
        Part('stickL', 'wood', cv.capsule(5, 9, 7 + s, 12 + s, 0.6), group='sticks'),
        Part('stickR', 'wood', cv.capsule(15, 9, 13 - s, 12 + s, 0.6), group='sticks'),
    ]
    c = render(cv, P, R, DARK, seam_dark=('shell', 'wood'))
    face(c, s=s)
    put_on(c, [(6, 16), (10, 16), (14, 16)], '#ffc94d')  # studs
    if s:
        put(c, [(10, 10), (8, 11), (12, 11)], '#fff3b0')
    return c


def bass_viol(f):
    cv = Canvas(W, H)
    s = f
    R = {'human': SKIN['human'], 'robe': ramp('#2a2440', '#4a4070', '#6e64a0'), 'hose': ramp('#2a1e16', '#4a3626'), 'viol': ramp('#4a2412', '#8a4a22', '#c07a3a', '#e8a85a'), 'neck': ramp('#1e140e', '#3a2a1e'), 'bow': ramp('#6a5a3a', '#d0c090')}
    P = body(cv, 'robe', s=0, legs='robe')
    P = P[:1] + [Part('violbody', 'viol', cv.ellipse(13.5, 17, 4, 5.5), group='viol'), Part('violneck', 'neck', cv.capsule(13.5, 12, 13.5, 2, 0.8), group='viol')] + P[1:]
    P += [
        Part('armL', 'robe', cv.capsule(7, 10, 12, 8, 1.1), group='armL'),
        Part('bow', 'bow', cv.capsule(5 + 3 * s, 15, 16 + 3 * s, 18, 0.45), group='bow'),
    ]
    c = render(cv, P, R, DARK)
    face(c)
    put_on(c, [(13, 15), (13, 17), (13, 19)], '#1e140e')  # strings
    return c


def fire_juggler(f):
    cv = Canvas(W, H)
    s = f
    R = {'human': SKIN['human'], 'motley': ramp('#6a2a12', '#c05a1e', '#f08a3a'), 'hose': ramp('#3a2a50', '#5e4a80'), 'torch': ramp('#3a2414', '#6a4628'), 'fire': ramp('#c03a1a', '#ff8a2a', '#ffe07a')}
    P = body(cv, 'motley', s=s)
    xs = [(4, 3), (10, 0.5), (16, 3)] if s == 0 else [(5, 1), (10, 3), (15, 1)]
    for i, (x, y) in enumerate(xs):
        P.append(Part(f'flame{i}', 'fire', cv.ellipse(x, y + 1, 1.3, 1.6), group=f'flame{i}'))
    P += [
        Part('armL', 'motley', cv.capsule(6, 10, 4, 6 + s, 1.1), group='armL'),
        Part('armR', 'motley', cv.capsule(14, 10, 16, 6 + (1 - s), 1.1), group='armR'),
    ]
    c = render(cv, P, R, DARK)
    face(c, s=s)
    put_on(c, [(8, 11), (11, 11), (9, 13), (10, 9)], '#3a2a50')  # diamonds
    return c


def lantern_bearer(f):
    cv = Canvas(W, H)
    s = f
    R = {'human': SKIN['human'], 'cloak': ramp('#2e2a36', '#56505e', '#86808e'), 'hose': ramp('#2a1e16', '#4a3626'), 'iron': ramp('#2c2c3a', '#5e5e72'), 'glow': ramp('#c08a1a', '#ffd24a', '#fff6c0')}
    P = body(cv, 'cloak', legs='robe')
    P += [
        Part('hood', 'cloak', cv.ellipse(10, 5, 4.2, 4.4) & ~cv.ellipse(10, 6.6, 2.6, 2.6), group='hood'),
        Part('arm', 'cloak', cv.capsule(14, 10, 16, 6, 1.1), group='arm'),
        Part('lantern', 'glow', cv.rect(15, 2, 19, 7), group='lantern'),
        Part('cage', 'iron', cv.rect(15, 1, 19, 2) | cv.rect(16, 7, 18, 8), group='cage'),
    ]
    c = render(cv, P, R, DARK)
    face(c)
    if s:
        put(c, [(14, 3), (19, 8), (19, 1), (14, 7)], '#fff6c0')  # it flares on the beat
    return c


def town_crier(f):
    cv = Canvas(W, H)
    s = f
    R = {'human': SKIN['human'], 'coat': ramp('#5a1414', '#a02424', '#d04a3a'), 'hose': ramp('#1e1e2a', '#3a3a4e'), 'hat': ramp('#141418', '#2e2e38'), 'brass': ramp('#7a5a1a', '#d0a23a', '#ffe08a')}
    P = body(cv, 'coat', s=s)
    P += [
        Part('hat', 'hat', cv.poly([(5, 3.5 - 0.5 * s), (15, 3.5 - 0.5 * s), (10, 0)]), group='hat'),
        Part('armL', 'coat', cv.capsule(6, 10, 5, 15, 1.1), group='armL'),
        Part('armR', 'coat', cv.capsule(14, 10, 16, 5 - s, 1.1), group='armR'),
        Part('bell', 'brass', cv.ellipse(16.5, 3.5 - s, 1.8, 2), group='bell'),
    ]
    c = render(cv, P, R, DARK)
    face(c, s=s, mouth='#5a1414' if s else None)
    put_on(c, [(10, 10), (10, 12), (10, 14)], '#ffe08a')  # buttons
    return c


def kettle_drums(f):
    cv = Canvas(W, H)
    s = f
    R = {'human': SKIN['human'], 'coat': ramp('#5a1e12', '#a03a1e', '#e0662e'), 'hose': ramp('#2a1e16', '#4a3626'), 'copper': ramp('#5a2a14', '#a85a2a', '#e08a4a', '#ffc28a'), 'skin_': ramp('#bfa77a', '#e6d4ac'), 'wood': ramp('#3a2414', '#946a42')}
    P = body(cv, 'coat', s=s)
    P += [
        Part('kettleL', 'copper', cv.ellipse(5, 17, 4.2, 4), group='kL'),
        Part('kettleR', 'copper', cv.ellipse(15, 17, 4.2, 4), group='kR'),
        Part('headL', 'skin_', cv.ellipse(5, 14, 4, 1.3), group='kL'),
        Part('headR', 'skin_', cv.ellipse(15, 14, 4, 1.3), group='kR'),
        Part('malletL', 'wood', cv.capsule(7, 10, 5, 12 + 2 * s - 2, 0.6), group='m'),
        Part('malletR', 'wood', cv.capsule(13, 10, 15, 12 - 2 * s, 0.6), group='m'),
    ]
    c = render(cv, P, R, DARK, seam_dark=('copper', 'wood'))
    face(c, s=s)
    return c


def lute_sprite(f):
    cv = Canvas(W, H)
    s = f
    R = {'sprite': SKIN['sprite'], 'wing': ramp('#3a8a9a', '#8ad8e8', '#e0faff'), 'dress': ramp('#1e6a64', '#36a89a', '#6ee0d0'), 'lute': ramp('#6a3a14', '#b8742a', '#e8b05a')}
    wing = cv.ellipse(6, 9 - 1.5 * s, 3, 2.2, rot=0.5) | cv.ellipse(14, 9 - 1.5 * s, 3, 2.2, rot=-0.5)
    P = [
        Part('wings', 'wing', wing, style='flat', group='wings'),
        Part('dress', 'dress', cv.poly([(10, 10), (6, 18), (14, 18)]), group='body'),
        Part('legs', 'dress', cv.capsule(9, 18, 9, 21, 0.7) | cv.capsule(11, 18, 11, 21, 0.7), group='legs'),
        Part('head', 'sprite', cv.ellipse(10, 7, 2.8, 2.8), group='head'),
        Part('lute', 'lute', cv.ellipse(12.5, 14, 2.6, 2.2) | cv.capsule(12.5, 13, 8, 10, 0.5), group='lute'),
    ]
    c = render(cv, P, R, '#10303a')
    put_on(c, [(9, 7), (11, 7)], '#10303a')
    put(c, [(3, 3 + 2 * s), (17, 4 - s), (10, 2)], '#e0faff')  # glitter
    return c


def tuning_fork(f):
    cv = Canvas(W, H)
    s = f
    R = {'gnome': SKIN['gnome'], 'coat': ramp('#1e5a54', '#2e8a80', '#4fd1c5'), 'hose': ramp('#2a1e16', '#4a3626'), 'hat': ramp('#1e4a6a', '#3a7ab0'), 'silver': ramp('#6a6a80', '#b8b8d0', '#f0f0ff'), 'beard': ramp('#a8a090', '#f0eadc')}
    P = body(cv, 'coat', skin='gnome', small=True)
    P += [
        Part('hat', 'hat', cv.poly([(6, 8), (14, 8), (10, 1)]), group='hat'),
        Part('beard', 'beard', cv.ellipse(10, 11.5, 2.4, 2.2), group='beard'),
        Part('forkL', 'silver', cv.capsule(15, 2, 15, 10, 0.6), group='fork'),
        Part('forkR', 'silver', cv.capsule(18, 2, 18, 10, 0.6), group='fork'),
        Part('forkStem', 'silver', cv.capsule(16.5, 10, 16.5, 16, 0.6) | cv.capsule(15, 10, 18, 10, 0.6), group='fork'),
        Part('arm', 'coat', cv.capsule(13, 13, 16, 14, 1.0), group='arm'),
    ]
    c = render(cv, P, R, DARK)
    put_on(c, [(9, 9), (11, 9)], DARK)
    if s:
        put(c, [(13, 3), (20, 3), (13, 6), (20, 6)], '#b0fff4')  # it hums
    return c


def kobold_body(cv, outfit, s=0, helm=None):
    P = body(cv, outfit, skin='kobold', s=s, small=True)
    P.insert(0, Part('tail', 'kobold', cv.curve([(12, 18), (16, 21), (18, 18)], 1.1, 0.6), group='tail'))
    # A pale muzzle pushed forward from the face: nostrils on top, no mouth line (a dark line under it read as a second mouth).
    P.append(Part('snout', 'muzzle', cv.ellipse(10, 10.6 - 0.5 * s, 2.1, 1.4), group='head'))
    P.append(Part('hornL', 'horn', cv.capsule(8, 7 - 0.5 * s, 6.5, 4.5, 0.6), group='horns'))
    P.append(Part('hornR', 'horn', cv.capsule(12, 7 - 0.5 * s, 13.5, 4.5, 0.6), group='horns'))
    return P


KOBOLD_R = {'kobold': SKIN['kobold'], 'muzzle': ramp('#c8a850', '#f0dc8a', '#fff4c4'), 'hose': ramp('#3a2a20', '#5e4430'), 'horn': ramp('#a89878', '#f0e6cc')}


def kobold_face(c, s=0):
    y = int(8 - 0.5 * s)
    put_on(c, [(8, y), (11, y)], '#1a1222')
    # Nostrils as two tiny dots at the muzzle's top corners, far apart so they can't read as a mouth.
    put_on(c, [(8, y + 2), (11, y + 2)], '#a8883a')


def quartermaster(f):
    cv = Canvas(W, H)
    s = f
    R = dict(KOBOLD_R, vest=ramp('#5a4a10', '#a8902a', '#e8d36a'), paper=ramp('#b0a488', '#f0e8d0'), hat=ramp('#2a2a3a', '#4a4a60'))
    P = kobold_body(cv, 'vest', s=s)
    P += [
        Part('hat', 'hat', cv.rect(6, 4, 14, 6) | cv.rect(7.5, 1.5, 12.5, 4.5), group='hat'),
        Part('ledger', 'paper', cv.rect(3, 12, 8, 18), group='ledger'),
        Part('arm', 'vest', cv.capsule(13, 13, 15, 8 + s, 0.9), group='arm'),
    ]
    c = render(cv, P, R, DARK)
    kobold_face(c, s)
    put_on(c, [(4, 13), (4, 15), (4, 17), (6, 14), (6, 16)], '#6a6a80')  # ledger lines
    put(c, [(15, 7 + s), (16, 7 + s)], '#d0d0e0')  # whistle
    return c


def luthier(f):
    cv = Canvas(W, H)
    s = f
    R = dict(KOBOLD_R, apron=ramp('#3a2a1a', '#6a4e30', '#9a7448'), lute=ramp('#6a3a14', '#b8742a', '#e8b05a'), tool=ramp('#4a4a5a', '#a8a8c0'))
    P = kobold_body(cv, 'apron', s=s)
    P += [
        Part('lute', 'lute', cv.ellipse(5, 16, 2.8, 3) | cv.capsule(5, 14, 5, 7, 0.6), group='lute'),
        Part('arm', 'apron', cv.capsule(13, 13, 15, 11 - s, 0.9), group='arm'),
        Part('wrench', 'tool', cv.capsule(15, 11 - s, 17, 7 - s, 0.6), group='tool'),
    ]
    c = render(cv, P, R, DARK)
    kobold_face(c, s)
    if s:
        put(c, [(18, 5), (16, 4)], '#fff3b0')
    return c


def gate_guard(f):
    cv = Canvas(W, H)
    s = f
    R = dict(KOBOLD_R, mail=ramp('#3a3a4a', '#6a6a7e', '#a0a0b4'), helm=ramp('#2c2c3a', '#5e5e72', '#9a9ab0'), wood=ramp('#3a2414', '#6a4628'), blade=ramp('#6a6a80', '#d0d0e8'))
    P = kobold_body(cv, 'mail', s=0)
    P += [
        Part('helm', 'helm', cv.ellipse(10, 6.5, 3.4, 2.4) & ~cv.rect(0, 8, 20, 20), group='helm'),
        Part('haft', 'wood', cv.capsule(16, 22, 16, 3 - s, 0.6), group='halberd'),
        Part('blade', 'blade', cv.poly([(16, 1 - s), (19, 4 - s), (16, 7 - s)]), group='halberd'),
        Part('arm', 'mail', cv.capsule(13, 13, 16, 13, 0.9), group='arm'),
    ]
    c = render(cv, P, R, DARK)
    kobold_face(c)
    return c


def slinger(f):
    cv = Canvas(W, H)
    s = f
    R = dict(KOBOLD_R, vest=ramp('#3a3010', '#6a5a20', '#9a8a3a'), sling=ramp('#4a3626', '#8a6a4a'), stone=ramp('#4a4a54', '#9a9aa6'))
    P = kobold_body(cv, 'vest', s=s)
    a = (16, 4) if s else (17, 9)
    P += [
        Part('arm', 'vest', cv.capsule(13, 12, a[0] - 1, a[1] + 1, 0.9), group='arm'),
        Part('sling', 'sling', cv.capsule(a[0] - 1, a[1] + 1, a[0] + 2, a[1] - 2, 0.5), group='sling'),
        Part('stone', 'stone', cv.ellipse(a[0] + 2, a[1] - 2, 1.2, 1.2), group='stone'),
    ]
    c = render(cv, P, R, DARK)
    kobold_face(c, s)
    return c


def singer(f, tall=False):
    cv = Canvas(W, H)
    s = f
    gown = ramp('#7a2a5a', '#c04a8a', '#f29cc3', '#ffd0e6') if not tall else ramp('#4a2a6a', '#7a4aa8', '#b08ad6', '#e0ccf4')
    R = {'human': SKIN['human'], 'gown': gown, 'hair': ramp('#3a1e14', '#6a3a24', '#9a5a36'), 'hose': gown}
    top = 2 if tall else 4
    P = [
        Part('gown', 'gown', cv.poly([(10, top + 8), (4, H - 1), (16, H - 1)]), group='body'),
        Part('torso', 'gown', cv.ellipse(10, top + 9, 3.6, 4), group='body'),
        Part('hair', 'hair', cv.ellipse(10, top + 2.5, 4, 4.4), group='hair'),
        Part('head', 'human', cv.ellipse(10, top + 3, 2.9, 3.1), group='head'),
    ]
    if tall:
        P.append(Part('arm', 'human', cv.capsule(13, top + 9, 16, top + 3 - s, 0.9), group='arm'))
    else:
        P.append(Part('armL', 'human', cv.capsule(7, top + 9, 9, top + 12, 0.9), group='arms'))
        P.append(Part('armR', 'human', cv.capsule(13, top + 9, 11, top + 12, 0.9), group='arms'))
    c = render(cv, P, R, DARK)
    y = top + 3
    put_on(c, [(9, y), (11, y)], DARK)
    if s:
        put_on(c, [(10, y + 2)], '#5a1a2a')  # singing
        put(c, [(15 if not tall else 5, top + 1), (16 if not tall else 4, top), (17 if not tall else 3, top + 1)], '#ffd0e6' if not tall else '#e0ccf4')
    return c


def jester(f):
    cv = Canvas(W, H)
    s = f
    R = {'human': SKIN['human'], 'motleyA': ramp('#2a5a1e', '#4a9a2e', '#7ed048'), 'motleyB': ramp('#3a1e4a', '#62307a', '#9050b0'), 'hose': ramp('#3a1e4a', '#62307a'), 'bell': ramp('#8a6a1a', '#ffd24a')}
    P = body(cv, 'motleyA', s=s)
    P += [
        Part('hatL', 'motleyB', cv.curve([(9, 3 - 0.5 * s), (5, 1), (3, 3)], 1.3, 0.6), group='hat'),
        Part('hatR', 'motleyA', cv.curve([(11, 3 - 0.5 * s), (15, 1), (17, 3)], 1.3, 0.6), group='hat2'),
        Part('half', 'motleyB', cv.ellipse(10, 12.5, 4.2, 4.6) & cv.rect(10, 0, 20, 24), group='body'),
        Part('armL', 'motleyB', cv.capsule(6, 10, 3 + s, 6 + 2 * s, 1.1), group='armL'),
        Part('armR', 'motleyA', cv.capsule(14, 10, 17 - s, 8 - 2 * s, 1.1), group='armR'),
    ]
    c = render(cv, P, R, DARK)
    face(c, s=s, mouth='#7a2a2a')
    put(c, [(3, 3), (17, 3)], '#ffd24a')  # bells
    put(c, [(10, 1 if s else 3)], '#ffd24a')  # juggled ball
    return c


def fire_archer(f):
    cv = Canvas(W, H)
    s = f
    R = {'human': SKIN['human'], 'hood': ramp('#1e3a14', '#36602a', '#5a9040'), 'hose': ramp('#2a2018', '#4a3a28'), 'bow': ramp('#4a2a12', '#8a5a2a'), 'fire': ramp('#c03a1a', '#ff8a2a', '#ffe07a')}
    P = body(cv, 'hood', s=0)
    P += [
        Part('hoodtop', 'hood', cv.ellipse(10, 5, 4, 4.2) & ~cv.ellipse(10, 6.8, 2.5, 2.5), group='hoodtop'),
        Part('bow', 'bow', cv.curve([(15, 2), (18, 8), (15, 14)], 0.7, 0.7), group='bow'),
        Part('arm', 'hood', cv.capsule(13, 10, 16 - 2 * s, 8, 1.0), group='arm'),
        Part('arrow', 'fire', cv.ellipse(16, 2 - s, 1.2, 1.8), group='flame'),
    ]
    c = render(cv, P, R, DARK)
    face(c)
    put_on(c, [(16, 3 - s), (16, 4 - s), (16, 5 - s), (16, 6 - s)], '#8a5a2a')  # arrow shaft
    return c


def bouncer(f):
    cv = Canvas(W, H)
    s = f
    R = {'human': SKIN['human'], 'vest': ramp('#1e2a14', '#3a5224', '#5a7a36'), 'hose': ramp('#2a2018', '#4a3a28'), 'arms': SKIN['human']}
    P = [
        Part('legL', 'hose', cv.capsule(7.5, 15, 7, 22.5, 1.7), group='legs'),
        Part('legR', 'hose', cv.capsule(12.5, 15, 13, 22.5, 1.7), group='legs'),
        Part('torso', 'vest', cv.ellipse(10, 12, 6.2, 5.6), group='body'),
        Part('head', 'human', cv.ellipse(10, 5 - 0.5 * s, 3.2, 3.2), group='head'),
        Part('arms', 'arms', cv.capsule(5, 12, 15, 13, 1.7), group='arms'),
    ]
    c = render(cv, P, R, DARK)
    y = int(5 - 0.5 * s)
    put_on(c, [(9, y), (11, y)], DARK)
    put_on(c, [(9, y + 2), (10, y + 2), (11, y + 2)], '#7a4a36')  # frown
    return c


def squire(f):
    cv = Canvas(W, H)
    s = f
    R = dict(KOBOLD_R, tunic=ramp('#5a4a10', '#a8902a', '#e8d36a'), helm=ramp('#3a3a4a', '#7a7a8e', '#b4b4c8'), crate=ramp('#4a2e18', '#8a5a30', '#b8844a'))
    P = kobold_body(cv, 'tunic', s=s)
    P += [
        Part('helm', 'helm', cv.ellipse(10, 6.5 - 0.5 * s, 3.4, 2.2) & ~cv.rect(0, 7.5, 20, 20), group='helm'),
        Part('crate', 'crate', cv.rect(6, 13 - s, 14, 19 - s), group='crate'),
    ]
    c = render(cv, P, R, DARK, seam_dark=('crate',))
    kobold_face(c, s)
    put_on(c, [(x, 16 - s) for x in range(6, 14)], '#4a2e18')  # crate slat
    return c


SPRITES = {
    'stagehand': page,
    'kick-drum': war_drum,
    'bassline': bass_viol,
    'pyro': fire_juggler,
    'spotlight': lantern_bearer,
    'hype-man': town_crier,
    'double-kick': kettle_drums,
    'arpeggiator': lute_sprite,
    'tuning-fork': tuning_fork,
    'crew-chief': quartermaster,
    'guitar-tech': luthier,
    'security': gate_guard,
    'rigger': slinger,
    'backup-singer': singer,
    'soprano': lambda f: singer(f, tall=True),
    'skater': jester,
    'bottle-rocket': fire_archer,
    'bouncer': bouncer,
    'roadie': squire,
}


def frames(name):
    return trim([SPRITES[name](0), SPRITES[name](1)])
