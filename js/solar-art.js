export const SOLAR_PROPOSAL_MARK_SRC = 'assets/solar-proposal-mark.svg';

export function createSolarProposalMark({ className = 'solar-art-mark', alt = 'Solar proposal platform artwork' } = {}) {
  const img = document.createElement('img');
  img.className = className;
  img.src = SOLAR_PROPOSAL_MARK_SRC;
  img.alt = alt;
  img.decoding = 'async';
  img.loading = 'eager';
  return img;
}
