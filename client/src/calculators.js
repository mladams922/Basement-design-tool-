// Pure math helpers behind the Calculators page. Kept dependency-free and
// framework-free so they're easy to sanity-check against a spec sheet.

export function viewingAngleDeg(screenWidthIn, distanceIn) {
  return (2 * Math.atan(screenWidthIn / 2 / distanceIn) * 180) / Math.PI;
}

export function screenWidthFromDiagonal(diagonalIn, aspect = 16 / 9) {
  const heightIn = diagonalIn / Math.sqrt(aspect * aspect + 1);
  const widthIn = heightIn * aspect;
  return { widthIn, heightIn };
}

// THX recommends up to ~40 deg for the best row; SMPTE's more relaxed
// minimum is ~26-30 deg. This gives a comfortable band between the two.
export function recommendedDistanceRangeIn(screenWidthIn) {
  const minDistanceIn = screenWidthIn / 2 / Math.tan((40 * Math.PI) / 180 / 2);
  const maxDistanceIn = screenWidthIn / 2 / Math.tan((26 * Math.PI) / 180 / 2);
  return { minDistanceIn, maxDistanceIn };
}

export function throwDistanceIn(throwRatio, screenWidthIn) {
  return throwRatio * screenWidthIn;
}

export function screenWidthFromThrow(throwDistanceInVal, throwRatio) {
  return throwDistanceInVal / throwRatio;
}

export const SPEAKER_ANGLES_5_1 = [
  { name: 'Center', angleDeg: 0 },
  { name: 'Front Left', angleDeg: -30 },
  { name: 'Front Right', angleDeg: 30 },
  { name: 'Surround Left', angleDeg: -110 },
  { name: 'Surround Right', angleDeg: 110 },
];

export const SPEAKER_ANGLES_7_1 = [
  { name: 'Center', angleDeg: 0 },
  { name: 'Front Left', angleDeg: -30 },
  { name: 'Front Right', angleDeg: 30 },
  { name: 'Surround Left', angleDeg: -90 },
  { name: 'Surround Right', angleDeg: 90 },
  { name: 'Rear Left', angleDeg: -135 },
  { name: 'Rear Right', angleDeg: 135 },
];

// Simplified DIY riser formula: raises the next row so its occupant's eyes
// clear the row-ahead occupant's head by `clearanceIn`, assuming similar
// seated eye heights row to row. Good for planning, not a structural spec.
export function riserHeightIn(clearanceIn, distanceToScreenIn, rowSpacingIn) {
  return (clearanceIn * (distanceToScreenIn + rowSpacingIn)) / distanceToScreenIn;
}

// Axial room modes: f = n * c / (2L), c = speed of sound (~1130 ft/s).
export function axialModes(dimensionFt, count = 4) {
  const modes = [];
  for (let n = 1; n <= count; n++) {
    modes.push({ n, freqHz: Math.round((565 * n) / dimensionFt) });
  }
  return modes;
}
