// Home theater math: speaker placement targets, projector performance and
// sightlines. Angle conventions: azimuth is measured at the main listening
// position (MLP), 0° facing the screen, positive to the right. Elevation is
// measured up from the listener's ear plane.

// Target angles follow the Dolby Atmos Home Theater Installation Guidelines,
// with the stereo/THX convention for the front stage.
export const CHANNELS = [
  { key: 'L', label: 'Front Left', group: 'bed', azimuth: -28, range: [-30, -22], height: 'ear' },
  { key: 'C', label: 'Center', group: 'bed', azimuth: 0, range: [-5, 5], height: 'ear' },
  { key: 'R', label: 'Front Right', group: 'bed', azimuth: 28, range: [22, 30], height: 'ear' },
  { key: 'LW', label: 'Wide Left', group: 'bed', azimuth: -60, range: [-70, -55], height: 'ear' },
  { key: 'RW', label: 'Wide Right', group: 'bed', azimuth: 60, range: [55, 70], height: 'ear' },
  { key: 'LSS', label: 'Surround Left', group: 'surround', azimuth: -100, range: [-110, -90], height: 'above' },
  { key: 'RSS', label: 'Surround Right', group: 'surround', azimuth: 100, range: [90, 110], height: 'above' },
  { key: 'LRS', label: 'Rear Left', group: 'surround', azimuth: -142, range: [-150, -135], height: 'above' },
  { key: 'RRS', label: 'Rear Right', group: 'surround', azimuth: 142, range: [135, 150], height: 'above' },
  { key: 'TFL', label: 'Top Front Left', group: 'overhead', azimuth: -45, range: [-55, -30], elevation: 45, elevationRange: [30, 55] },
  { key: 'TFR', label: 'Top Front Right', group: 'overhead', azimuth: 45, range: [30, 55], elevation: 45, elevationRange: [30, 55] },
  { key: 'TML', label: 'Top Middle Left', group: 'overhead', azimuth: -90, range: [-110, -70], elevation: 80, elevationRange: [65, 100] },
  { key: 'TMR', label: 'Top Middle Right', group: 'overhead', azimuth: 90, range: [70, 110], elevation: 80, elevationRange: [65, 100] },
  { key: 'TRL', label: 'Top Rear Left', group: 'overhead', azimuth: -135, range: [-150, -125], elevation: 45, elevationRange: [30, 55] },
  { key: 'TRR', label: 'Top Rear Right', group: 'overhead', azimuth: 135, range: [125, 150], elevation: 45, elevationRange: [30, 55] },
  { key: 'SW1', label: 'Subwoofer 1', group: 'sub' },
  { key: 'SW2', label: 'Subwoofer 2', group: 'sub' },
  { key: 'SW3', label: 'Subwoofer 3', group: 'sub' },
  { key: 'SW4', label: 'Subwoofer 4', group: 'sub' },
];

export const CHANNELS_BY_KEY = Object.fromEntries(CHANNELS.map((c) => [c.key, c]));

export const FORMATS = {
  '2.1': ['L', 'R', 'SW1'],
  '5.1': ['L', 'C', 'R', 'LSS', 'RSS', 'SW1'],
  '5.1.2': ['L', 'C', 'R', 'LSS', 'RSS', 'TML', 'TMR', 'SW1'],
  '5.1.4': ['L', 'C', 'R', 'LSS', 'RSS', 'TFL', 'TFR', 'TRL', 'TRR', 'SW1'],
  '5.2.4': ['L', 'C', 'R', 'LSS', 'RSS', 'TFL', 'TFR', 'TRL', 'TRR', 'SW1', 'SW2'],
  '7.1.4': ['L', 'C', 'R', 'LSS', 'RSS', 'LRS', 'RRS', 'TFL', 'TFR', 'TRL', 'TRR', 'SW1'],
  '7.2.4': ['L', 'C', 'R', 'LSS', 'RSS', 'LRS', 'RRS', 'TFL', 'TFR', 'TRL', 'TRR', 'SW1', 'SW2'],
  '9.2.6': [
    'L', 'C', 'R', 'LW', 'RW', 'LSS', 'RSS', 'LRS', 'RRS',
    'TFL', 'TFR', 'TML', 'TMR', 'TRL', 'TRR', 'SW1', 'SW2',
  ],
};

// 'front' is the unit vector from the MLP toward the screen; 'right' is 90°
// clockwise from it in screen coordinates (x right, y down).
export function screenWallVectors(screenWall) {
  switch (screenWall) {
    case 'south':
      return { front: { x: 0, y: 1 }, right: { x: -1, y: 0 } };
    case 'east':
      return { front: { x: 1, y: 0 }, right: { x: 0, y: 1 } };
    case 'west':
      return { front: { x: -1, y: 0 }, right: { x: 0, y: -1 } };
    case 'north':
    default:
      return { front: { x: 0, y: -1 }, right: { x: 1, y: 0 } };
  }
}

function polarToPlan(mlp, front, right, azimuthDeg, distanceIn) {
  const rad = (azimuthDeg * Math.PI) / 180;
  const f = Math.cos(rad) * distanceIn;
  const r = Math.sin(rad) * distanceIn;
  return {
    xIn: mlp.xIn + front.x * f + right.x * r,
    yIn: mlp.yIn + front.y * f + right.y * r,
  };
}

// Azimuth/elevation/distance of a point as heard from the MLP.
export function measureFromMlp(point, mlp, screenWall, earHeightIn) {
  const { front, right } = screenWallVectors(screenWall);
  const dx = point.xIn - mlp.xIn;
  const dy = point.yIn - mlp.yIn;
  const f = dx * front.x + dy * front.y;
  const r = dx * right.x + dy * right.y;
  const horizontal = Math.hypot(f, r);
  const azimuth = (Math.atan2(r, f) * 180) / Math.PI;
  const dz = (point.zIn ?? earHeightIn) - earHeightIn;
  const elevation = (Math.atan2(dz, horizontal) * 180) / Math.PI;
  return {
    azimuth,
    elevation,
    horizontalIn: horizontal,
    distanceIn: Math.hypot(horizontal, dz),
  };
}

// Generates a complete speaker layout for a format around the MLP.
export function autoLayout({
  format,
  mlp,
  screenWall = 'north',
  radiusIn,
  earHeightIn = 42,
  ceilingHeightIn = 92,
  roomBox,
  surroundHeightIn,
}) {
  const { front, right } = screenWallVectors(screenWall);
  const keys = FORMATS[format] || FORMATS['5.1.4'];
  const surroundZ = surroundHeightIn ?? Math.min(ceilingHeightIn - 12, earHeightIn + 26);
  const placements = [];

  for (const key of keys) {
    const spec = CHANNELS_BY_KEY[key];
    if (!spec) continue;

    if (spec.group === 'sub') {
      placements.push({ channel: key, ...subPosition(key, roomBox, screenWall), zIn: 0 });
      continue;
    }

    if (spec.group === 'overhead') {
      const rise = ceilingHeightIn - earHeightIn;
      const horizontal = rise / Math.tan((spec.elevation * Math.PI) / 180);
      const pos = polarToPlan(mlp, front, right, spec.azimuth, horizontal);
      placements.push({ channel: key, ...pos, zIn: ceilingHeightIn });
      continue;
    }

    const pos = polarToPlan(mlp, front, right, spec.azimuth, radiusIn);
    placements.push({
      channel: key,
      ...pos,
      zIn: spec.height === 'above' ? surroundZ : earHeightIn,
    });
  }

  if (roomBox) {
    for (const p of placements) {
      p.xIn = Math.max(roomBox.minX + 6, Math.min(roomBox.maxX - 6, p.xIn));
      p.yIn = Math.max(roomBox.minY + 6, Math.min(roomBox.maxY - 6, p.yIn));
    }
  }
  return placements;
}

// Subs go in corners / at wall midpoints, which is where multi-sub setups
// smooth modal response best.
function subPosition(key, roomBox, screenWall) {
  if (!roomBox) return { xIn: 0, yIn: 0 };
  const inset = 18;
  const { minX, minY, maxX, maxY } = roomBox;
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  const frontIsY = screenWall === 'north' || screenWall === 'south';
  const table = frontIsY
    ? {
        SW1: { xIn: minX + inset, yIn: screenWall === 'north' ? minY + inset : maxY - inset },
        SW2: { xIn: maxX - inset, yIn: screenWall === 'north' ? maxY - inset : minY + inset },
        SW3: { xIn: minX + inset, yIn: midY },
        SW4: { xIn: maxX - inset, yIn: midY },
      }
    : {
        SW1: { xIn: screenWall === 'west' ? minX + inset : maxX - inset, yIn: minY + inset },
        SW2: { xIn: screenWall === 'west' ? maxX - inset : minX + inset, yIn: maxY - inset },
        SW3: { xIn: midX, yIn: minY + inset },
        SW4: { xIn: midX, yIn: maxY - inset },
      };
  return table[key] || { xIn: midX, yIn: midY };
}

// --- Screen & viewing ----------------------------------------------------

export function screenDimensions({ widthIn, diagonalIn, aspect }) {
  if (widthIn) {
    const heightIn = widthIn / aspect;
    return { widthIn, heightIn, diagonalIn: Math.hypot(widthIn, heightIn) };
  }
  const heightIn = diagonalIn / Math.sqrt(aspect * aspect + 1);
  return { widthIn: heightIn * aspect, heightIn, diagonalIn };
}

export function horizontalViewingAngle(screenWidthIn, distanceIn) {
  if (distanceIn <= 0) return 0;
  return (2 * Math.atan(screenWidthIn / 2 / distanceIn) * 180) / Math.PI;
}

// Pixels per degree at the seat; ~60 PPD is the limit of 20/20 acuity.
export function pixelsPerDegree(horizontalPixels, screenWidthIn, distanceIn) {
  const angle = horizontalViewingAngle(screenWidthIn, distanceIn);
  if (!angle) return 0;
  return horizontalPixels / angle;
}

export function viewingVerdict(angleDeg) {
  if (angleDeg < 26) return { level: 'warn', text: 'Narrower than SMPTE’s 30° — room to go bigger or sit closer.' };
  if (angleDeg < 33) return { level: 'ok', text: 'Around the SMPTE 30° recommendation — relaxed, good for mixed use.' };
  if (angleDeg < 41) return { level: 'good', text: 'In the THX 36–40° sweet spot for cinema immersion.' };
  if (angleDeg < 50) return { level: 'warn', text: 'Wider than THX reference — immersive but you’ll scan the image.' };
  return { level: 'error', text: 'Very wide — expect eye fatigue and visible pixel structure.' };
}

export function detailVerdict(ppd) {
  if (ppd < 25) return { level: 'warn', text: 'Below ~25 PPD — softness and pixel structure may show.' };
  if (ppd < 40) return { level: 'ok', text: 'Reasonable detail; 4K material still resolves well.' };
  if (ppd < 60) return { level: 'good', text: 'Sharp — approaching the limit of normal acuity.' };
  return { level: 'good', text: 'Beyond ~60 PPD you can’t resolve more detail; consider a bigger screen.' };
}

// --- Projector -----------------------------------------------------------

export function projectorAnalysis({
  throwRatioMin,
  throwRatioMax,
  lumens,
  lumensMode = 1,
  horizontalPixels = 3840,
  screenWidthIn,
  screenHeightIn,
  screenGain = 1.0,
  mountDistanceIn,
  mountHeightIn,
  screenBottomIn,
  seats = [],
  headHeightIn = 50,
  lensShiftMaxPct = 60,
}) {
  const minThrowIn = throwRatioMin * screenWidthIn;
  const maxThrowIn = throwRatioMax * screenWidthIn;
  const withinThrow = mountDistanceIn >= minThrowIn && mountDistanceIn <= maxThrowIn;

  const areaSqFt = (screenWidthIn * screenHeightIn) / 144;
  const effectiveLumens = lumens * lumensMode;
  const footLamberts = areaSqFt > 0 ? (effectiveLumens * screenGain) / areaSqFt : 0;
  const nits = footLamberts * 3.426;

  let brightness;
  if (footLamberts < 10) {
    brightness = { level: 'error', text: 'Dim — below ~10 fL the picture will look flat, especially in HDR.' };
  } else if (footLamberts < 16) {
    brightness = { level: 'warn', text: 'A little dim for HDR but acceptable for SDR in a fully dark room.' };
  } else if (footLamberts <= 24) {
    brightness = { level: 'good', text: 'In the 16–22 fL window used for SDR cinema reference.' };
  } else if (footLamberts <= 45) {
    brightness = { level: 'good', text: 'Bright enough to give HDR real punch.' };
  } else {
    brightness = { level: 'warn', text: 'Very bright for a dark room — you may want an iris or eco mode.' };
  }

  // Lens shift needed to put the image where you want it, as a percentage of
  // image height above the lens axis.
  const screenCenterIn = screenBottomIn + screenHeightIn / 2;
  const shiftNeededPct = screenHeightIn
    ? ((screenCenterIn - mountHeightIn) / screenHeightIn) * 100
    : 0;
  const shiftOk = Math.abs(shiftNeededPct) <= lensShiftMaxPct;

  // Does the light path clear the heads in front of it?
  const beamIssues = [];
  for (const seat of seats) {
    const distFromScreen = seat.distanceIn;
    if (distFromScreen >= mountDistanceIn) continue; // seat is behind the lens
    const t = distFromScreen / mountDistanceIn;
    const beamHeight = screenBottomIn + (mountHeightIn - screenBottomIn) * t;
    const clearance = beamHeight - (seat.headHeightIn ?? headHeightIn);
    if (clearance < 0) {
      beamIssues.push({ seat: seat.label, clearanceIn: clearance });
    }
  }

  return {
    minThrowIn,
    maxThrowIn,
    withinThrow,
    imageWidthAtMountIn: mountDistanceIn / ((throwRatioMin + throwRatioMax) / 2),
    areaSqFt,
    footLamberts,
    nits,
    brightness,
    shiftNeededPct,
    shiftOk,
    beamIssues,
  };
}

// --- Sightlines ----------------------------------------------------------

// Rows are ordered front to back. Returns per-row eye height, viewing angle
// and whether that row can see the bottom of the screen over the row ahead.
export function analyzeRows({
  rows,
  screenBottomIn,
  screenWidthIn,
  seatedEyeHeightIn = 42,
  headAboveEyeIn = 4,
}) {
  const sorted = [...rows].sort((a, b) => a.distanceIn - b.distanceIn);
  return sorted.map((row, index) => {
    const eyeHeight = seatedEyeHeightIn + (row.riserHeightIn || 0);
    const angle = horizontalViewingAngle(screenWidthIn, row.distanceIn);
    let clearanceIn = null;
    if (index > 0) {
      const ahead = sorted[index - 1];
      const aheadEye = seatedEyeHeightIn + (ahead.riserHeightIn || 0);
      const aheadHeadTop = aheadEye + headAboveEyeIn;
      // Height of the sightline (this row's eye -> bottom of screen) where the
      // row in front sits.
      const t = ahead.distanceIn / row.distanceIn;
      const sightlineHeight = screenBottomIn + (eyeHeight - screenBottomIn) * t;
      clearanceIn = sightlineHeight - aheadHeadTop;
    }
    return {
      ...row,
      eyeHeightIn: eyeHeight,
      viewingAngleDeg: angle,
      viewingVerdict: viewingVerdict(angle),
      clearanceIn,
    };
  });
}

// Riser height needed for a row to clear the heads in front of it.
export function requiredRiserHeight({
  rowDistanceIn,
  aheadDistanceIn,
  aheadRiserIn = 0,
  screenBottomIn,
  seatedEyeHeightIn = 42,
  headAboveEyeIn = 4,
  targetClearanceIn = 2,
}) {
  const aheadHeadTop = seatedEyeHeightIn + aheadRiserIn + headAboveEyeIn;
  const t = aheadDistanceIn / rowDistanceIn;
  if (t <= 0 || t >= 1) return 0;
  // Solve sightlineHeight = screenBottom + (eye - screenBottom) * t for eye.
  const requiredEye = (aheadHeadTop + targetClearanceIn - screenBottomIn * (1 - t)) / t;
  return Math.max(0, requiredEye - seatedEyeHeightIn);
}

// --- Speaker validation --------------------------------------------------

// Left/right counterparts. Asymmetry between a pair pulls the soundstage off
// centre and can't be corrected with delay alone, so it matters more than the
// absolute distances (which the AVR compensates for).
const MIRROR_PAIRS = [
  ['L', 'R'],
  ['LW', 'RW'],
  ['LSS', 'RSS'],
  ['LRS', 'RRS'],
  ['TFL', 'TFR'],
  ['TML', 'TMR'],
  ['TRL', 'TRR'],
];

export function validateSpeakers({ speakers, mlp, screenWall, earHeightIn }) {
  const results = [];

  for (const sp of speakers) {
    const spec = CHANNELS_BY_KEY[sp.channel];
    if (!spec) continue;
    const measured = measureFromMlp(
      { xIn: sp.xIn, yIn: sp.yIn, zIn: sp.zIn },
      mlp,
      screenWall,
      earHeightIn
    );
    const issues = [];

    if (spec.group === 'sub') {
      results.push({ ...sp, spec, measured, issues });
      continue;
    }

    if (spec.range) {
      const [lo, hi] = spec.range;
      // Compare on the same side as the target so a mirrored speaker doesn't
      // read as a huge error.
      const az = measured.azimuth;
      if (az < lo || az > hi) {
        issues.push({
          level: Math.min(Math.abs(az - lo), Math.abs(az - hi)) > 15 ? 'error' : 'warn',
          text: `${Math.round(az)}° azimuth; target ${lo}° to ${hi}°`,
        });
      }
    }

    if (spec.elevationRange) {
      const [lo, hi] = spec.elevationRange;
      if (measured.elevation < lo || measured.elevation > hi) {
        issues.push({
          level: 'warn',
          text: `${Math.round(measured.elevation)}° elevation; Dolby wants ${lo}–${hi}°`,
        });
      }
    }

    results.push({ ...sp, spec, measured, issues });
  }

  const byChannel = Object.fromEntries(results.map((r) => [r.channel, r]));

  for (const [leftKey, rightKey] of MIRROR_PAIRS) {
    const left = byChannel[leftKey];
    const right = byChannel[rightKey];
    if (!left || !right) continue;

    const distanceDelta = Math.abs(left.measured.distanceIn - right.measured.distanceIn);
    if (distanceDelta > 6) {
      const nearer = left.measured.distanceIn < right.measured.distanceIn ? left : right;
      const farther = nearer === left ? right : left;
      nearer.issues.push({
        level: distanceDelta > 18 ? 'error' : 'warn',
        text: `${Math.round(distanceDelta)}" closer to the listener than ${farther.channel} — pulls the image to this side`,
      });
    }

    const angleDelta = Math.abs(Math.abs(left.measured.azimuth) - Math.abs(right.measured.azimuth));
    if (angleDelta > 5) {
      left.issues.push({
        level: 'warn',
        text: `${Math.round(angleDelta)}° off-axis from ${rightKey} — the pair isn't mirrored`,
      });
    }
  }

  // The front three carry dialogue and pans, so they should be close to
  // equidistant even though the AVR can compensate.
  const front = ['L', 'C', 'R'].map((k) => byChannel[k]).filter(Boolean);
  if (front.length === 3) {
    const dists = front.map((f) => f.measured.distanceIn);
    const spread = Math.max(...dists) - Math.min(...dists);
    if (spread > 12) {
      byChannel.C.issues.push({
        level: 'warn',
        text: `Front stage distances vary by ${Math.round(spread)}" — aim for an arc so L/C/R are near-equidistant`,
      });
    }
  }

  return results;
}

// Distance from a speaker to its nearest boundaries drives SBIR, the cancellation
// notch you get from the reflection off the wall behind it.
export function sbirNotchHz(distanceToWallIn) {
  if (!distanceToWallIn || distanceToWallIn <= 0) return null;
  const distanceFt = distanceToWallIn / 12;
  // First cancellation occurs at a quarter wavelength path difference.
  return Math.round(1130 / (4 * distanceFt));
}
