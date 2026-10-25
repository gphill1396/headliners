/** GBA-style limited palette (SPEC §8). One main set plus an accent per headliner. */
export const PALETTE = {
  night: '#211934',
  floor: '#2f2547',
  floorLine: '#3f3360',
  stage: '#4a3a2e',
  stageLip: '#7a5c3e',
  footlight: '#ffc94d',
  cream: '#f6ecd6',
  dim: '#8f82a8',
  shambler: '#9bbf6a',
  shamblerShade: '#5f7d3f',
  eye: '#211934',
  miss: '#e2574c',
  // Headliner accents
  thrum: '#f0773e',
  lyra: '#4fd1c5',
  clatter: '#e8d36a',
} as const;
