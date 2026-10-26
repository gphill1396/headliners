/**
 * Load-In level pack (SPEC S4.1): 30 levels, easy to hard. Levels 1–2 are hand-made
 * introductions; the rest were generated (`npm run loadin`), then picked and ordered by hand.
 * `par` is the fewest moves, found by the solver; tests/loadin-pack.test.ts re-solves every one.
 */
export interface LoadInLevel {
  /** Where it came from (generator seed, or hand-N). */
  source: string;
  par: number;
  /** 6 rows of 6: '.' empty, 'A' the lute case, letters chests, 'x' barrels. */
  text: string;
}

export const LOADIN_LEVELS: readonly LoadInLevel[] = [
  {
    source: 'hand-1',
    par: 1,
    text: ['.B....', '.B....', 'AA....', '......', '......', '......'].join('\n'),
  },
  {
    source: 'hand-2',
    par: 2,
    text: ['......', '......', 'AA..B.', '....B.', '......', '......'].join('\n'),
  },
  {
    source: 'easy-0',
    par: 4,
    text: ['FCCHH.', 'F.I...', 'AAI...', 'JEE...', 'JDD...', 'GGBB..'].join('\n'),
  },
  {
    source: 'easy-3',
    par: 4,
    text: ['.BCC..', '.BxEE.', 'AA..F.', 'II..Fx', 'DDD.FH', '.GGJJH'].join('\n'),
  },
  {
    source: 'easy-10',
    par: 4,
    text: ['......', '...IIB', 'AA..HB', 'FFDDH.', 'CC.EE.', 'JJGG..'].join('\n'),
  },
  {
    source: 'easy-1',
    par: 5,
    text: ['FBHHH.', 'FBGGCC', 'AA.IDJ', '...IDJ', '...I..', '..EE..'].join('\n'),
  },
  {
    source: 'easy-2',
    par: 6,
    text: ['....C.', 'GGEECF', 'AAHDCF', 'I.HD..', 'Ix....', 'I..BB.'].join('\n'),
  },
  {
    source: 'easy-5',
    par: 6,
    text: ['ICCEE.', 'IFFFBH', 'DAAMBH', 'DG.MB.', 'LGJ...', 'L.JKK.'].join('\n'),
  },
  {
    source: 'easy-8',
    par: 7,
    text: ['.....C', 'FFF.EC', 'AA..EC', 'I..HHH', 'I.GGBB', '....DD'].join('\n'),
  },
  {
    source: 'easy-9',
    par: 9,
    text: ['.CC.E.', '..IIEF', '.AA.BF', '..GHB.', '..GHDD', '......'].join('\n'),
  },
  {
    source: 'mid-4',
    par: 11,
    text: ['HBBB.F', 'H.GCCF', 'AAGJI.', 'EEEJI.', '...D..', '...D..'].join('\n'),
  },
  {
    source: 'mid-13',
    par: 11,
    text: ['.EBBGG', '.EDDFF', 'AAIHKJ', '..IHKJ', '...HC.', '....C.'].join('\n'),
  },
  {
    source: 'mid-0',
    par: 11,
    text: ['EEKKJI', 'LLBBJI', 'DAAFJI', 'DHHF..', 'MMCF..', '..CGGG'].join('\n'),
  },
  {
    source: 'mid-1',
    par: 12,
    text: ['..JG..', '..JGBB', '.AAD..', '.HHDF.', '.CIIF.', '.CEE..'].join('\n'),
  },
  {
    source: 'mid-6',
    par: 12,
    text: ['BIII.E', 'B.GGFE', 'B.AAFE', 'K..DJJ', 'K..DC.', 'HH.DC.'].join('\n'),
  },
  {
    source: 'mid-12',
    par: 12,
    text: ['..FCEE', '..FCBB', '.AACIL', '.JJ.IL', '.GGGHK', '.DDDHK'].join('\n'),
  },
  {
    source: 'mid-3',
    par: 14,
    text: ['GBBBEE', 'G.CCI.', 'AA.DI.', '.KKDFF', '..JD..', '..JHH.'].join('\n'),
  },
  {
    source: 'mid-9',
    par: 14,
    text: ['.LLHHH', 'CC...J', 'AA..MJ', 'FIIIMx', 'FEBBGG', 'FEDDKK'].join('\n'),
  },
  {
    source: 'mid-2',
    par: 16,
    text: ['C.B.DD', 'C.B..H', 'AAB..H', '..IIIH', '....G.', 'EEFFG.'].join('\n'),
  },
  {
    source: 'mid-14',
    par: 18,
    text: ['HFFIID', 'HJJJED', 'AAG.E.', '..GK..', 'CCCK..', 'BBBLL.'].join('\n'),
  },
  {
    source: 'hardA-9',
    par: 20,
    text: ['DIMMLH', 'DIEFLH', 'AAEF..', '..CJJJ', 'BBC...', 'GGGKK.'].join('\n'),
  },
  {
    source: 'hardB-30',
    par: 20,
    text: ['IGGDDM', 'I.LJ.M', 'AALJ..', 'CFFB..', 'CEEB..', 'CHHKK.'].join('\n'),
  },
  {
    source: 'hardA-10',
    par: 21,
    text: ['F.GHHC', 'FLG..C', 'FLAAD.', '...ED.', 'KK.EB.', 'JJIIB.'].join('\n'),
  },
  {
    source: 'hardB-22',
    par: 21,
    text: ['.EE..C', 'HHLJJC', '..LAAI', 'x.FGGI', '..FDBB', '.KKD..'].join('\n'),
  },
  {
    source: 'hardA-18',
    par: 22,
    text: ['HI.MBB', 'HIEM..', '.IEAAJ', 'GGC.LJ', '..C.LK', '.DDFFK'].join('\n'),
  },
  {
    source: 'hardB-7',
    par: 22,
    text: ['.I....', '.IKCJH', 'AAKCJH', '..KGGB', 'LEEF.B', 'L..FDD'].join('\n'),
  },
  {
    source: 'hardA-11',
    par: 23,
    text: ['III..J', '..EGGJ', 'AAE..J', 'KBCCLL', 'KBFFDD', 'xMMHH.'].join('\n'),
  },
  {
    source: 'hardA-1',
    par: 25,
    text: ['.KK.IE', '.MF.IE', '.MFAAH', 'GGLD.H', '..LDJJ', '.CCBB.'].join('\n'),
  },
  {
    source: 'hardA-2',
    par: 26,
    text: ['.EFFHH', '.EJGG.', 'AAJ...', 'BLL.CI', 'BDDDCI', 'KKK.C.'].join('\n'),
  },
  {
    source: 'hardB-3',
    par: 27,
    text: ['KK.EDD', 'IJJE..', 'IAAB..', 'L.FBCC', 'L.FHHM', 'GG...M'].join('\n'),
  },
];
