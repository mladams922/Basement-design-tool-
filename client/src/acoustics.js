// Low-frequency room acoustics. Distances are in feet here (the speed of
// sound is 1130 ft/s), so callers convert from the plan's inches.

const C_FT_S = 1130;

export function modeFrequency(nx, ny, nz, Lx, Ly, Lz) {
  return (C_FT_S / 2) * Math.sqrt((nx / Lx) ** 2 + (ny / Ly) ** 2 + (nz / Lz) ** 2);
}

export function modeType(nx, ny, nz) {
  const nonZero = [nx, ny, nz].filter((n) => n > 0).length;
  if (nonZero === 1) return 'axial';
  if (nonZero === 2) return 'tangential';
  return 'oblique';
}

export function roomModes(Lx, Ly, Lz, { maxOrder = 4, maxFreq = 300 } = {}) {
  const modes = [];
  for (let nx = 0; nx <= maxOrder; nx++) {
    for (let ny = 0; ny <= maxOrder; ny++) {
      for (let nz = 0; nz <= maxOrder; nz++) {
        if (nx === 0 && ny === 0 && nz === 0) continue;
        const f = modeFrequency(nx, ny, nz, Lx, Ly, Lz);
        if (f > maxFreq) continue;
        modes.push({ nx, ny, nz, f, type: modeType(nx, ny, nz) });
      }
    }
  }
  return modes.sort((a, b) => a.f - b.f);
}

// Below the Schroeder frequency the room behaves modally rather than
// statistically; above it, treatment is about reflections instead of modes.
export function schroederFrequency(volumeFt3, rt60 = 0.35) {
  const volumeM3 = volumeFt3 * 0.0283168;
  if (volumeM3 <= 0) return 0;
  return 2000 * Math.sqrt(rt60 / volumeM3);
}

// Bonello: the number of modes in each third-octave band should not decrease
// as frequency rises, otherwise isolated modes stick out audibly.
export function bonelloBands(modes, { from = 16, to = 200 } = {}) {
  const bands = [];
  let lower = from;
  while (lower < to) {
    const upper = lower * Math.pow(2, 1 / 3);
    const count = modes.filter((m) => m.f >= lower && m.f < upper).length;
    bands.push({ lower, upper, center: Math.sqrt(lower * upper), count });
    lower = upper;
  }
  for (let i = 1; i < bands.length; i++) {
    // A drop is only a real problem when the previous band isn't already dense.
    bands[i].fails = bands[i].count < bands[i - 1].count && bands[i - 1].count < 5;
  }
  return bands;
}

// Steady-state pressure from a modal summation in a rigid rectangular room.
// Good enough to show where nulls land and how they move with the sub, which
// is the decision this drives — it is not a substitute for measuring.
function modeShape(n, L, x) {
  return Math.cos((n * Math.PI * x) / L);
}

export function modalField({
  Lx,
  Ly,
  Lz,
  sources,
  points,
  zFt,
  freqs = [25, 32, 40, 50, 63, 80],
  maxOrder = 6,
  q = 12,
}) {
  // Precompute the mode set once; it's independent of source and receiver.
  const modes = [];
  for (let nx = 0; nx <= maxOrder; nx++) {
    for (let ny = 0; ny <= maxOrder; ny++) {
      for (let nz = 0; nz <= 2; nz++) {
        const kn = Math.PI * Math.sqrt((nx / Lx) ** 2 + (ny / Ly) ** 2 + (nz / Lz) ** 2);
        if (kn === 0) continue;
        modes.push({ nx, ny, nz, kn });
      }
    }
  }

  // Source term per mode, summed over all subs.
  const sourceTerms = modes.map((m) => {
    let sum = 0;
    for (const s of sources) {
      sum +=
        modeShape(m.nx, Lx, s.xFt) * modeShape(m.ny, Ly, s.yFt) * modeShape(m.nz, Lz, s.zFt);
    }
    return sum;
  });

  const result = new Float32Array(points.length);

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    let totalPower = 0;

    for (const f of freqs) {
      const k = (2 * Math.PI * f) / C_FT_S;
      let re = 0;
      let im = 0;
      for (let mi = 0; mi < modes.length; mi++) {
        const m = modes[mi];
        const src = sourceTerms[mi];
        if (src === 0) continue;
        const shape =
          src *
          modeShape(m.nx, Lx, p.xFt) *
          modeShape(m.ny, Ly, p.yFt) *
          modeShape(m.nz, Lz, zFt);
        if (shape === 0) continue;
        // 1 / ((k^2 - kn^2) + i * k*kn/Q)
        const a = k * k - m.kn * m.kn;
        const b = (k * m.kn) / q;
        const denom = a * a + b * b;
        re += (shape * a) / denom;
        im += (-shape * b) / denom;
      }
      totalPower += re * re + im * im;
    }

    result[i] = 10 * Math.log10(totalPower / freqs.length + 1e-12);
  }

  return result;
}

// Evaluates candidate subwoofer positions by how consistent the bass is across
// the seats — the metric that actually matters for a multi-row theater.
// Each candidate is scored as the complete arrangement it describes, so a
// two-sub option is judged with both subs running.
export function rankSubPositions({ Lx, Ly, Lz, seats, zFt, candidates, freqs }) {
  const scored = candidates.map((candidate) => {
    const sources = candidate.positions;
    const field = modalField({ Lx, Ly, Lz, sources, points: seats, zFt, freqs });
    const values = Array.from(field);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
    const spread = Math.max(...values) - Math.min(...values);
    return {
      ...candidate,
      meanDb: mean,
      stdDevDb: Math.sqrt(variance),
      seatSpreadDb: spread,
      subCount: sources.length,
    };
  });
  return scored.sort((a, b) => a.seatSpreadDb - b.seatSpreadDb);
}

// Standard candidate placements, in feet from the room's front-left corner.
export function subCandidates(Lx, Ly, Lz, inset = 1.5) {
  return [
    {
      key: 'front-corners',
      label: 'Both front corners',
      positions: [
        { xFt: inset, yFt: inset, zFt: 1 },
        { xFt: Lx - inset, yFt: inset, zFt: 1 },
      ],
    },
    {
      key: 'opposite-corners',
      label: 'Diagonally opposite corners',
      positions: [
        { xFt: inset, yFt: inset, zFt: 1 },
        { xFt: Lx - inset, yFt: Ly - inset, zFt: 1 },
      ],
    },
    {
      key: 'midwall-sides',
      label: 'Side wall midpoints',
      positions: [
        { xFt: inset, yFt: Ly / 2, zFt: 1 },
        { xFt: Lx - inset, yFt: Ly / 2, zFt: 1 },
      ],
    },
    {
      key: 'midwall-front-back',
      label: 'Front and back wall midpoints',
      positions: [
        { xFt: Lx / 2, yFt: inset, zFt: 1 },
        { xFt: Lx / 2, yFt: Ly - inset, zFt: 1 },
      ],
    },
    {
      key: 'front-left',
      label: 'Single sub, front-left corner',
      positions: [{ xFt: inset, yFt: inset, zFt: 1 }],
    },
    {
      key: 'front-mid',
      label: 'Single sub, front wall centre',
      positions: [{ xFt: Lx / 2, yFt: inset, zFt: 1 }],
    },
    {
      key: 'quarter-points',
      label: 'Side walls at ¼ and ¾ depth',
      positions: [
        { xFt: inset, yFt: Ly / 4, zFt: 1 },
        { xFt: Lx - inset, yFt: (Ly * 3) / 4, zFt: 1 },
      ],
    },
  ];
}

// Mirror-image first reflection points. Returns the spot on each surface where
// a panel would intercept the first bounce from that speaker to the listener.
export function firstReflections({ speaker, listener, box, ceilingFt, floorFt = 0 }) {
  const points = [];
  const walls = [
    { key: 'left', axis: 'x', value: box.minX, label: 'Left wall' },
    { key: 'right', axis: 'x', value: box.maxX, label: 'Right wall' },
    { key: 'front', axis: 'y', value: box.minY, label: 'Front wall' },
    { key: 'back', axis: 'y', value: box.maxY, label: 'Back wall' },
  ];

  for (const wall of walls) {
    const mirrored =
      wall.axis === 'x'
        ? { xIn: 2 * wall.value - speaker.xIn, yIn: speaker.yIn }
        : { xIn: speaker.xIn, yIn: 2 * wall.value - speaker.yIn };

    const dx = listener.xIn - mirrored.xIn;
    const dy = listener.yIn - mirrored.yIn;
    const denom = wall.axis === 'x' ? dx : dy;
    if (Math.abs(denom) < 1e-6) continue;
    const t =
      wall.axis === 'x' ? (wall.value - mirrored.xIn) / dx : (wall.value - mirrored.yIn) / dy;
    if (t < 0 || t > 1) continue;

    const point = { xIn: mirrored.xIn + dx * t, yIn: mirrored.yIn + dy * t };
    // Only counts if the bounce actually lands on the wall segment.
    const withinX = point.xIn >= box.minX - 1 && point.xIn <= box.maxX + 1;
    const withinY = point.yIn >= box.minY - 1 && point.yIn <= box.maxY + 1;
    if (!withinX || !withinY) continue;

    points.push({ surface: wall.key, label: wall.label, ...point });
  }

  // Ceiling and floor bounces land somewhere along the speaker-to-listener line.
  const speakerZ = speaker.zIn ?? 40;
  const listenerZ = listener.zIn ?? 42;
  const ceilingIn = ceilingFt;
  const ceilRise = ceilingIn - speakerZ + (ceilingIn - listenerZ);
  if (ceilRise > 0) {
    const t = (ceilingIn - speakerZ) / ceilRise;
    points.push({
      surface: 'ceiling',
      label: 'Ceiling',
      xIn: speaker.xIn + (listener.xIn - speaker.xIn) * t,
      yIn: speaker.yIn + (listener.yIn - speaker.yIn) * t,
    });
  }
  const floorDrop = speakerZ - floorFt + (listenerZ - floorFt);
  if (floorDrop > 0) {
    const t = (speakerZ - floorFt) / floorDrop;
    points.push({
      surface: 'floor',
      label: 'Floor',
      xIn: speaker.xIn + (listener.xIn - speaker.xIn) * t,
      yIn: speaker.yIn + (listener.yIn - speaker.yIn) * t,
    });
  }

  return points;
}

// Rough reverberation estimate so the Schroeder frequency isn't a pure guess.
export function estimateRt60(volumeFt3, surfaceFt2, averageAbsorption = 0.18) {
  const sabins = surfaceFt2 * averageAbsorption;
  if (sabins <= 0) return 0.5;
  return (0.049 * volumeFt3) / sabins;
}
