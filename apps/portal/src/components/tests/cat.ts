export const BAND_LABEL: Record<string, string> = { READY: 'Ready', NEAR_READY: 'Near ready', GETTING_THERE: 'Getting there', NEEDS_WORK: 'Needs work' };
export const BANDS = ['NEEDS_WORK', 'GETTING_THERE', 'NEAR_READY', 'READY'];
export const REASON: Record<string, string> = {
  CONFIDENCE: 'stopped early: it was sure enough',
  MAX: 'reached the most questions',
  TIME: 'time ran out',
  ENDED: 'you ended it before a result',
};
