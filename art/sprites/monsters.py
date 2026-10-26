"""
The monsters (SPEC S4.2), front-facing: they walk down the lanes toward the
stage. Two frames each (a walk, a flap, a flicker). Field resolution is 240 px
wide, so a lane is 80 px; most monsters are 16–28 px.
"""
import numpy as np

from pixelkit import Canvas, Part, put, put_on, render, trim

DARK = '#1a1222'


def ghoul(f):
    cv = Canvas(22, 26)
    R = {
        'skin': ['#3e4a2e', '#647a46', '#8fa865', '#c4d690'],
        'rag': ['#2e2032', '#4c3650', '#6e5274'],
        'bone': ['#7a7462', '#c8c0a6'],
    }
    s = 1 if f else 0
    P = [
        Part('legL', 'rag', cv.capsule(8, 18, 7 - s, 24, 1.8), group='legs'),
        Part('legR', 'rag', cv.capsule(14, 18, 15 - (1 - s), 24 - s, 1.8), group='legs'),
        Part('torso', 'rag', cv.ellipse(11, 14, 6, 6.2)),
        Part('chest', 'skin', cv.ellipse(11.5, 11.5, 3.6, 2.6) & cv.ellipse(11, 14, 6, 6.2), group='torso'),
        Part('armL', 'skin', cv.curve([(6, 11), (4, 15), (3, 19 - s)], 1.6, 1.2), group='armL'),
        Part('armR', 'skin', cv.curve([(16, 11), (18, 14), (19, 18 - (1 - s))], 1.6, 1.2), group='armR'),
        Part('head', 'skin', cv.ellipse(12, 6.5 + s * 0.5, 4.4, 4.6, rot=0.2)),
    ]
    c = render(cv, P, R, DARK)
    hy = 6 + s
    put(c, [(10, hy), (13, hy)], '#e8f07a')
    put(c, [(10, hy - 1), (13, hy - 1)], '#2e3a1e')
    put_on(c, [(11, hy + 3), (12, hy + 3), (13, hy + 3)], DARK)
    put_on(c, [(12, hy + 3)], '#c8c0a6')
    # Torn rag edges.
    put_on(c, [(7, 19), (10, 20), (13, 20), (16, 19)], DARK)
    return c


def ogre(f):
    cv = Canvas(32, 32)
    R = {
        'skin': ['#3e4222', '#6a7034', '#98a052', '#c8cc86'],
        'iron': ['#2c2c3a', '#56566a', '#8a8aa0', '#c8c8dc'],
        'cloth': ['#3a2416', '#64402a', '#8a5c3c'],
        'wood': ['#3a2414', '#6a4628', '#946a42'],
    }
    s = 1 if f else 0
    club_up = cv.curve([(25, 16), (27, 8 + s * 3), (28, 3 + s * 3)], 1.4, 3.0)
    P = [
        Part('legL', 'skin', cv.capsule(11, 22, 10 - s, 30, 2.6), group='legs'),
        Part('legR', 'skin', cv.capsule(20, 22, 21 + (1 - s), 30 - s, 2.6), group='legs'),
        Part('belly', 'skin', cv.ellipse(15.5, 17, 9, 8.5)),
        Part('loin', 'cloth', cv.rect(8, 20, 23, 25) & cv.ellipse(15.5, 19, 9, 9), group='belly'),
        Part('armL', 'skin', cv.curve([(7, 12), (4, 18), (5, 23)], 3.0, 2.4), group='armL'),
        Part('club', 'wood', club_up, group='club'),
        Part('armR', 'skin', cv.curve([(24, 12), (26, 15), (25, 17)], 3.0, 2.6), group='armR'),
        Part('pauldron', 'iron', cv.ellipse(7.5, 10.5, 4.5, 3.4), group='iron'),
        Part('head', 'skin', cv.ellipse(15.5, 7.5, 4.6, 4.2)),
        Part('helm', 'iron', cv.ellipse(15.5, 5.6, 4.8, 2.6) & cv.ellipse(15.5, 7.5, 4.9, 4.4), group='iron2'),
    ]
    c = render(cv, P, R, DARK, seam_dark=('iron', 'wood'))
    put(c, [(14, 8), (17, 8)], '#ffd24a')
    put_on(c, [(14, 10), (15, 10), (16, 10), (17, 10)], DARK)
    put_on(c, [(14, 11), (17, 11)], '#e8e0c8')  # tusks
    put_on(c, [(27, 4 + s * 3), (29, 6 + s * 3), (26, 7 + s * 3)], '#c8c8dc')  # club studs
    return c


def spiderling(f):
    cv = Canvas(15, 10)
    R = {'body': ['#3a2456', '#6a4a92', '#9a76c4', '#c8aae6']}
    s = 1 if f else 0
    legs = cv.empty()
    for side in (-1, 1):
        for k, (dy, reach) in enumerate([(-1, 5.5), (0, 6), (1, 6), (2, 5)]):
            lift = (k + s) % 2
            legs |= cv.capsule(7.5, 5, 7.5 + side * (reach + 1), 5 + dy * 1.6 - lift, 0.5)
    P = [
        Part('legs', 'body', legs, style='solid'),
        Part('abdomen', 'body', cv.ellipse(7.5, 5.8, 3.2, 3.0)),
        Part('head', 'body', cv.ellipse(7.5, 3.2, 2.0, 1.7)),
    ]
    c = render(cv, P, R, DARK)
    put(c, [(7, 3), (8, 3)], '#ff5a5a')
    return c


def harpy(f):
    cv = Canvas(26, 18)
    R = {
        'feather': ['#2e1c42', '#523072', '#7e52a0', '#b08ad0'],
        'skin': ['#8a6a6a', '#d0a898', '#f0d0c0'],
        'talon': ['#6a5a20', '#e0c050'],
    }
    up = f == 0
    wing = cv.poly([(11, 8), (2, 1 if up else 12), (1, 5 if up else 15), (4, 7 if up else 15), (6, 11 if up else 16), (10, 12)])
    P = [
        Part('wingL', 'feather', wing, group='wingL'),
        Part('wingR', 'feather', wing[:, ::-1], group='wingR'),
        Part('body', 'feather', cv.ellipse(13, 10, 3.6, 4.4)),
        Part('legs', 'talon', cv.capsule(12, 13, 11.5, 16.5, 0.6) | cv.capsule(14, 13, 14.5, 16.5, 0.6), group='legs'),
        Part('face', 'skin', cv.ellipse(13, 5.5, 2.6, 2.8)),
        Part('hair', 'feather', cv.ellipse(13, 4.0, 3.2, 2.0) & ~cv.ellipse(13, 6.2, 2.2, 2.0), group='hair'),
    ]
    c = render(cv, P, R, DARK)
    put(c, [(12, 6), (14, 6)], '#ffe066')
    put_on(c, [(13, 7)], '#8a4a3a')
    return c


def slime(f, small=False):
    w, h = (12, 10) if small else (18, 15)
    cv = Canvas(w, h)
    R = {'goo': ['#1e4a34', '#33804a', '#5cb664', '#b4f0a0']}
    squash = 0.85 if f else 1.0
    cx = w / 2
    ry = (h / 2 - 1) * squash
    body = cv.ellipse(cx, h - 1 - ry, w / 2 - 1.2, ry) | cv.rect(1.5, h - 3, w - 1.5, h - 1)
    P = [Part('goo', 'goo', body)]
    c = render(cv, P, R, '#10281c')
    ey = int(h - 1 - ry)
    put(c, [(int(cx) - 2, ey), (int(cx) + 1, ey)], '#10281c')
    put_on(c, [(int(cx) - 2, ey - 1), (int(cx) + 1, ey - 1)], '#e0ffe0')
    put_on(c, [(3, int(h - 1 - 1.6 * ry) + 1), (4, int(h - 1 - 1.6 * ry) + 1)], '#ffffff')
    return c


def hobgoblin(f, shield=True):
    cv = Canvas(22, 26)
    R = {
        'skin': ['#5a2416', '#9a4428', '#cc6a3a', '#ec9a62'],
        'wood': ['#3a2414', '#6a4628', '#946a42', '#b88a5a'],
        'iron': ['#2c2c3a', '#5e5e72', '#9a9ab0'],
        'leather': ['#2a1e16', '#4a3626', '#6a4e36'],
    }
    s = 1 if f else 0
    P = [
        Part('legL', 'leather', cv.capsule(8, 18, 7 - s, 25, 1.9), group='legs'),
        Part('legR', 'leather', cv.capsule(14, 18, 15 + s - 1, 25 - s, 1.9), group='legs'),
        Part('torso', 'leather', cv.ellipse(11, 14, 5.5, 5.5)),
        Part('head', 'skin', cv.ellipse(11, 6.5, 4.2, 4.0)),
        Part('earL', 'skin', cv.poly([(7.5, 5), (2, 3), (7.5, 8)]), group='head'),
        Part('earR', 'skin', cv.poly([(14.5, 5), (20, 3), (14.5, 8)]), group='head'),
    ]
    if shield:
        P += [
            Part('shield', 'wood', cv.rect(3, 10, 19, 24) & cv.ellipse(11, 16, 9.5, 10), group='shield'),
            Part('boss', 'iron', cv.ellipse(11, 16.5, 2.4, 2.4), group='boss'),
        ]
    else:
        P += [
            Part('armL', 'skin', cv.curve([(6, 12), (4, 16), (5, 19)], 1.6, 1.3), group='armL'),
            Part('spear', 'wood', cv.capsule(17, 22, 18, 3, 0.6), group='spear'),
            Part('armR', 'skin', cv.curve([(16, 12), (18, 15), (17.5, 17)], 1.6, 1.3), group='armR'),
        ]
    c = render(cv, P, R, DARK, seam_dark=('iron', 'wood'))
    put(c, [(9, 7), (12, 7)], '#ffe066')
    put_on(c, [(10, 9), (11, 9)], DARK)
    if shield:
        for y in (12, 20):
            put_on(c, [(x, y) for x in range(4, 18)], '#5e5e72')  # iron bands
    else:
        put(c, [(18, 2), (18, 1), (17, 2), (19, 2)], '#c8c8dc')  # spear tip
    return c


def hag(f):
    cv = Canvas(22, 28)
    R = {
        'cloak': ['#1e1230', '#3a2252', '#5c3a7a', '#8a62a8'],
        'skin': ['#3e5a2e', '#6a8a46', '#9ab868'],
        'wood': ['#3a2414', '#6a4628'],
        'orb': ['#7a2a9a', '#c06bd6', '#f0c8ff'],
    }
    s = 1 if f else 0
    cloak = cv.poly([(10, 4), (4, 12), (2, 27), (18, 27), (16, 12)])
    P = [
        Part('cloak', 'cloak', cloak),
        Part('hood', 'cloak', cv.ellipse(10, 6.5, 5, 5.2), group='cloak'),
        Part('face', 'skin', cv.ellipse(10.5, 8, 2.8, 3.2)),
        Part('nose', 'skin', cv.poly([(11, 8), (14, 10.5), (11.5, 10.5)]), group='face'),
        Part('staff', 'wood', cv.capsule(18, 27, 18, 7, 0.7), group='staff'),
        Part('hand', 'skin', cv.ellipse(17, 15, 1.7, 1.6), group='hand'),
        Part('orb', 'orb', cv.ellipse(18, 5, 2.4 + 0.4 * s, 2.4 + 0.4 * s), group='orb'),
    ]
    c = render(cv, P, R, DARK, soft_outline=('cloak', 'skin', 'orb'))
    put(c, [(9, 8), (12, 8)], '#e8f07a')
    put_on(c, [(10, 11), (11, 11)], DARK)
    if s:
        put(c, [(18, 1), (21, 5), (15, 5), (18, 9)], '#f0c8ff')  # the hex flickers
    return c


def troll(f):
    cv = Canvas(32, 34)
    R = {
        'skin': ['#26343a', '#46606a', '#6c8c92', '#a4c4c2'],
        'wood': ['#3a2414', '#6a4628', '#946a42'],
        'stone': ['#2e2e34', '#5a5a64', '#8a8a96', '#bcbcc6'],
        'cloth': ['#2a2018', '#4a3a28', '#6a5438'],
    }
    up = f == 0
    hy = 6 if up else 22
    P = [
        Part('legL', 'skin', cv.capsule(11, 24, 10, 32, 2.8), group='legs'),
        Part('legR', 'skin', cv.capsule(20, 24, 21, 32, 2.8), group='legs'),
        Part('body', 'skin', cv.ellipse(15.5, 18, 9.5, 9)),
        Part('loin', 'cloth', cv.rect(8, 22, 23, 27) & cv.ellipse(15.5, 20, 9.5, 10), group='body'),
        Part('armL', 'skin', cv.curve([(7, 13), (4, 21), (4, 28)], 3.0, 2.6), group='armL'),
        Part('haft', 'wood', cv.capsule(25, 18, 26, hy, 0.9), group='hammer'),
        Part('hammer', 'stone', cv.rect(21, hy - 3, 31, hy + 3), group='hammerhead'),
        Part('armR', 'skin', cv.curve([(24, 13), (27, 16), (26, 19)], 3.0, 2.6), group='armR'),
        Part('head', 'skin', cv.ellipse(15.5, 9, 5, 4.5)),
        Part('brow', 'skin', cv.ellipse(15.5, 7.3, 5.2, 1.6), group='head'),
    ]
    c = render(cv, P, R, DARK, seam_dark=('stone', 'wood'))
    put(c, [(13, 9), (18, 9)], '#ff7a3a')
    put_on(c, [(14, 12), (15, 12), (16, 12), (17, 12)], DARK)
    put_on(c, [(14, 13), (17, 13)], '#e8e0c8')
    put_on(c, [(23, hy - 1), (27, hy + 1), (29, hy - 2)], '#2e2e34')  # cracks in the stone
    return c


def warg(f):
    cv = Canvas(26, 22)
    R = {
        'fur': ['#3a2e26', '#65523f', '#927a5c', '#c0a882'],
        'muzzle': ['#6a5a46', '#a08a6c', '#d0bc98'],
    }
    s = 1 if f else 0
    P = [
        Part('legL', 'fur', cv.capsule(8, 13, 7, 21 - s, 2.0), group='legs'),
        Part('legR', 'fur', cv.capsule(18, 13, 19, 20 + s, 2.0), group='legs'),
        Part('chest', 'fur', cv.ellipse(13, 13, 8, 5.5)),
        Part('head', 'fur', cv.ellipse(13, 8, 6, 5)),
        Part('earL', 'fur', cv.poly([(8, 6), (7, 0), (11, 4)]), group='head'),
        Part('earR', 'fur', cv.poly([(18, 6), (19, 0), (15, 4)]), group='head'),
        Part('muzzle', 'muzzle', cv.ellipse(13, 11, 3.2, 2.6)),
    ]
    c = render(cv, P, R, DARK)
    put(c, [(10, 7), (16, 7)], '#ffd84a')
    put(c, [(10, 6), (16, 6)], '#3e3228')
    put_on(c, [(12, 10), (13, 10), (14, 10)], DARK)  # nose
    put_on(c, [(11, 13), (15, 13)], '#f0ead8')  # fangs
    put_on(c, [(x, 12) for x in range(11, 16)], DARK)
    return c


def shaman(f):
    cv = Canvas(22, 26)
    R = {
        'skin': ['#2e4a22', '#4e7434', '#76a050', '#a8d07a'],
        'bone': ['#7a7462', '#bcb49a', '#ece4cc'],
        'robe': ['#2a1e14', '#4a3624', '#6e5236'],
        'wood': ['#3a2414', '#6a4628'],
        'flame': ['#1e8a4a', '#4ad07a', '#c0ffc8'],
        'feather': ['#7a2a1e', '#c04a2a'],
    }
    s = 1 if f else 0
    P = [
        Part('robe', 'robe', cv.poly([(10, 10), (5, 16), (4, 25), (16, 25), (15, 16)])),
        Part('staff', 'wood', cv.capsule(17, 25, 17.5, 8, 0.7), group='staff'),
        Part('flame', 'flame', cv.ellipse(17.5, 5 - s * 0.5, 2.2, 3.2 + s * 0.6), group='flame'),
        Part('arm', 'skin', cv.curve([(13, 13), (16, 14)], 1.3, 1.1), group='arm'),
        Part('head', 'skin', cv.ellipse(10, 8, 3.6, 3.6)),
        Part('mask', 'bone', cv.ellipse(10, 8.5, 3.0, 3.0), group='mask'),
        Part('feather1', 'feather', cv.capsule(8, 5, 5, 0, 0.8), group='feathers'),
        Part('feather2', 'feather', cv.capsule(11, 5, 12, 0, 0.8), group='feathers'),
    ]
    c = render(cv, P, R, DARK, seam_dark=('bone',))
    put_on(c, [(9, 8), (11, 8)], DARK)  # skull eye holes
    put_on(c, [(9, 10), (10, 10), (11, 10)], '#7a7462')  # teeth line
    put_on(c, [(10, 18), (10, 20), (10, 22)], '#bcb49a')  # bone beads
    if s:
        put(c, [(15, 3), (20, 4), (17, 0)], '#c0ffc8')
    return c


def brood_mother(f):
    cv = Canvas(32, 24)
    R = {'body': ['#34204c', '#5c3e82', '#8a66b4', '#b898dc'], 'mark': ['#8a1a1e', '#e04a3a']}
    s = 1 if f else 0
    legs = cv.empty()
    for side in (-1, 1):
        for k, (dy, reach) in enumerate([(-3, 13), (-1, 15), (1.5, 15), (4, 12)]):
            lift = (k + s) % 2
            knee = (16 + side * reach * 0.6, 10 + dy - 2 - lift)
            foot = (16 + side * reach, 12 + dy * 1.6 - lift)
            legs |= cv.capsule(16, 10, knee[0], knee[1], 0.9) | cv.capsule(knee[0], knee[1], foot[0], foot[1], 0.7)
    P = [
        Part('legs', 'body', legs, style='solid'),
        Part('abdomen', 'body', cv.ellipse(16, 15 + s * 0.4, 7.5, 7)),
        Part('head', 'body', cv.ellipse(16, 7, 4, 3.4)),
        Part('mark', 'mark', cv.poly([(14.5, 13), (17.5, 13), (16, 16), (17.5, 19), (14.5, 19), (16, 16)]), group='mark'),
    ]
    c = render(cv, P, R, DARK)
    put(c, [(14, 6), (15, 5), (17, 5), (18, 6), (15, 7), (17, 7)], '#ff5a5a')
    # Egg sacs glint on her back.
    put_on(c, [(12, 18), (20, 17), (13, 21)], '#d8d0c0')
    return c


def wisp(f):
    cv = Canvas(16, 20)
    R = {'flame': ['#203a7a', '#3e6ec0', '#84b4f0', '#e2f4ff']}
    s = 1 if f else 0
    tip = (8 + (1 if s else -1), 0.5)
    flame = cv.ellipse(8, 12, 5.5, 6.5) | cv.poly([(3, 11), tip, (13, 11)])
    P = [Part('flame', 'flame', flame)]
    c = render(cv, P, R, '#101a3a')
    put(c, [(6, 12), (10, 12)], '#101a3a')
    put_on(c, [(6, 11), (10, 11)], '#ffffff')
    put_on(c, [(7, 15), (8, 15), (9, 15)], '#203a7a')
    put_on(c, [(4, 18), (12, 18), (8, 19)], '')  # a ragged lower edge
    return c


def hush(f):
    cv = Canvas(76, 40)
    R = {
        'robe': ['#3a3060', '#6c5e98', '#a698cc', '#dcd2f2'],
        'void': ['#0e0a18', '#1e1830'],
        'hand': ['#8a80a8', '#d6ceec'],
    }
    s = 1 if f else 0
    sleeveL = cv.poly([(32, 12), (4, 14 + s), (0, 24 + s), (8, 20 + s), (6, 30 + s), (14, 22), (16, 32), (22, 22), (30, 26)])
    P = [
        Part('sleeveL', 'robe', sleeveL, group='sleeveL'),
        Part('sleeveR', 'robe', sleeveL[:, ::-1], group='sleeveR'),
        Part('robe', 'robe', cv.poly([(38, 6), (27, 16), (24, 40), (52, 40), (49, 16)])),
        Part('hood', 'robe', cv.ellipse(38, 10, 7.5, 8.5), group='robe'),
        Part('face', 'void', cv.ellipse(38, 11.5, 4.6, 5.6), group='face'),
        Part('hand', 'hand', cv.capsule(38, 18, 38, 13.5, 1.0), group='hand'),
    ]
    c = render(cv, P, R, '#140e22', soft_outline=('robe',))
    put(c, [(36, 10), (40, 10)], '#e2daf6')
    # Tatters along the hems.
    for x in range(26, 52, 3):
        put(c, [(x, 39)], '')
    return c


def black_knight(f):
    cv = Canvas(76, 40)
    R = {
        'steel': ['#262634', '#46465a', '#72728a', '#b4b4ca'],
        'cape': ['#2a0e14', '#4e1a22', '#7a2a32'],
        'plume': ['#5a1a1e', '#9a2a2e', '#d84a48'],
        'gold': ['#6a4a10', '#c89a2a', '#f6d870'],
        'blade': ['#5a5a70', '#a8a8c0', '#e8e8f8'],
    }
    s = 1 if f else 0
    P = [
        Part('cape', 'cape', cv.poly([(24, 10), (14, 40), (62, 40), (52, 10)])),
        Part('body', 'steel', cv.poly([(29, 14), (26, 40), (50, 40), (47, 14)])),
        Part('pauldronL', 'steel', cv.ellipse(25, 15, 8, 5), group='pL'),
        Part('pauldronR', 'steel', cv.ellipse(51, 15, 8, 5), group='pR'),
        Part('helm', 'steel', cv.rect(31, 2, 45, 17) & cv.ellipse(38, 9, 8, 10), group='helm'),
        Part('plume', 'plume', cv.curve([(38, 3), (44, -1 + s), (52, 1 + s), (58, 5)], 2.0, 0.8), group='plume'),
        Part('sword', 'blade', cv.capsule(14, 38 - s, 62, 22 - s, 1.2), group='sword'),
        Part('hilt', 'gold', cv.capsule(56, 18 - s, 60, 28 - s, 1.0), group='hilt'),
    ]
    c = render(cv, P, R, '#08080c', seam_dark=('steel', 'gold'))
    for x in range(33, 44):
        put_on(c, [(x, 9)], '#08080c')  # visor slit
    put(c, [(35, 9), (41, 9)], '#ff4a3a')  # eyes in the slit
    put_on(c, [(38, 24), (38, 27), (38, 30)], '#c89a2a')  # rivets
    return c


def bone_wyrm(f):
    cv = Canvas(76, 40)
    R = {
        'bone': ['#5e584c', '#9e9682', '#d0c8b4', '#f2ecdc'],
        'membrane': ['#16121e', '#2a2238', '#40345a'],
    }
    up = f == 0
    tipY = 2 if up else 14
    wingL = cv.poly([(34, 16), (2, tipY), (8, tipY + 10), (4, tipY + 14), (14, 22), (12, 30), (24, 24), (30, 28)])
    bonesL = cv.curve([(34, 16), (18, tipY + 6), (2, tipY)], 1.4, 0.7) | cv.capsule(18, tipY + 6, 6, tipY + 14, 0.6) | cv.capsule(18, tipY + 6, 13, 28, 0.6)
    P = [
        Part('wingL', 'membrane', wingL, style='flat', group='wingL'),
        Part('wingR', 'membrane', wingL[:, ::-1], style='flat', group='wingR'),
        Part('bonesL', 'bone', bonesL, group='wingL'),
        Part('bonesR', 'bone', bonesL[:, ::-1], group='wingR'),
        Part('ribs', 'bone', cv.ellipse(38, 24, 7, 9)),
        Part('neck', 'bone', cv.curve([(38, 18), (38, 12), (38, 8)], 2.2, 1.6), group='ribs'),
        Part('skull', 'bone', cv.ellipse(38, 6, 5, 4) | cv.ellipse(38, 10, 3, 3), group='skull'),
        Part('tail', 'bone', cv.curve([(38, 32), (36, 37), (40, 40)], 1.8, 0.8), group='tail'),
    ]
    c = render(cv, P, R, '#0a0810')
    # Gaps between the ribs.
    for y in (21, 24, 27):
        put_on(c, [(x, y) for x in range(34, 43)], '#2a2238')
    put_on(c, [(x, 24) for x in range(37, 40)], '#9e9682')  # spine
    put(c, [(36, 6), (40, 6)], '#ff3a2a')
    put_on(c, [(37, 10), (38, 10), (39, 10)], '#0a0810')
    return c


SPRITES = {
    'shambler': ghoul,
    'brute': ogre,
    'swarmling': spiderling,
    'bat': harpy,
    'splitter': slime,
    'splitter-child': lambda f: slime(f, small=True),
    'shieldbearer': hobgoblin,
    'shieldbearer-bare': lambda f: hobgoblin(f, shield=False),
    'hexer': hag,
    'breaker': troll,
    'charger': warg,
    'medic': shaman,
    'nest': brood_mother,
    'ghost': wisp,
    'hush': hush,
    'critic': black_knight,
    'dead-air': bone_wyrm,
}


def frames(name):
    return trim([SPRITES[name](0), SPRITES[name](1)])
