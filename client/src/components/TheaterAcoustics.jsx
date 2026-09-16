import { useMemo } from 'react';
import {
  roomModes,
  schroederFrequency,
  bonelloBands,
  estimateRt60,
  modalField,
  rankSubPositions,
  subCandidates,
  firstReflections,
} from '../acoustics.js';
import { formatFtIn } from '../units.js';

const HEATMAP_FREQS = [25, 32, 40, 50, 63, 80];
const RANKING_FREQS = [];
for (let f = 20; f <= 90; f += 2) RANKING_FREQS.push(f);

const GRID = 30;

function toFeet(box, ceilingHeightIn) {
  return {
    Lx: box.width / 12,
    Ly: box.height / 12,
    Lz: ceilingHeightIn / 12,
  };
}

// Plan inches -> feet from the room's top-left corner, which is the origin the
// modal maths uses.
function localFeet(box, xIn, yIn) {
  return { xFt: (xIn - box.minX) / 12, yFt: (yIn - box.minY) / 12 };
}

export function useBassField({ box, ceilingHeightIn, subs, earHeightIn, enabled }) {
  return useMemo(() => {
    if (!enabled || !box || !subs.length) return null;
    const { Lx, Ly, Lz } = toFeet(box, ceilingHeightIn);
    const sources = subs.map((s) => ({
      ...localFeet(box, s.xIn, s.yIn),
      zFt: Math.max(0.3, (s.zIn ?? 12) / 12),
    }));

    const points = [];
    const cellW = box.width / GRID;
    const cellH = box.height / GRID;
    for (let j = 0; j < GRID; j++) {
      for (let i = 0; i < GRID; i++) {
        const xIn = box.minX + (i + 0.5) * cellW;
        const yIn = box.minY + (j + 0.5) * cellH;
        points.push({ ...localFeet(box, xIn, yIn), xIn, yIn });
      }
    }

    const field = modalField({
      Lx,
      Ly,
      Lz,
      sources,
      points,
      zFt: earHeightIn / 12,
      freqs: HEATMAP_FREQS,
    });

    let sum = 0;
    for (let i = 0; i < field.length; i++) sum += field[i];
    const mean = sum / field.length;

    return {
      cells: points.map((p, i) => ({
        xIn: p.xIn - cellW / 2,
        yIn: p.yIn - cellH / 2,
        widthIn: cellW,
        heightIn: cellH,
        db: field[i] - mean,
      })),
    };
  }, [box, ceilingHeightIn, subs, earHeightIn, enabled]);
}

function heatColor(db) {
  // Diverging: blue where the bass drops out, red where it piles up.
  const clamped = Math.max(-12, Math.min(12, db));
  const t = Math.abs(clamped) / 12;
  const alpha = 0.12 + t * 0.55;
  return clamped < 0 ? `rgba(56,120,255,${alpha})` : `rgba(255,86,56,${alpha})`;
}

export function BassHeatmap({ field, upp }) {
  if (!field) return null;
  return (
    <g pointerEvents="none">
      {field.cells.map((c, i) => (
        <rect
          key={i}
          x={c.xIn}
          y={c.yIn}
          width={c.widthIn + 0.5}
          height={c.heightIn + 0.5}
          fill={heatColor(c.db)}
        />
      ))}
    </g>
  );
}

export function ReflectionOverlay({ points, upp }) {
  if (!points?.length) return null;
  const r = 7 * upp;
  return (
    <g pointerEvents="none">
      {points.map((p, i) => (
        <g key={i}>
          <circle
            cx={p.xIn}
            cy={p.yIn}
            r={r}
            fill="rgba(56,189,248,0.25)"
            stroke="#38bdf8"
            strokeWidth={Math.max(0.5, upp)}
          />
          <text
            x={p.xIn}
            y={p.yIn + r * 2}
            fill="#7dd3fc"
            fontSize={9 * upp}
            textAnchor="middle"
            style={{ paintOrder: 'stroke', stroke: '#0f172a', strokeWidth: 3 * upp }}
          >
            {p.channel}
          </text>
        </g>
      ))}
    </g>
  );
}

export function useReflectionPoints({ box, ceilingHeightIn, speakers, mlp, earHeightIn, enabled }) {
  return useMemo(() => {
    if (!enabled || !box || !mlp) return [];
    // Only the ear-level channels produce reflections worth panelling.
    return speakers
      .filter((s) => ['L', 'C', 'R', 'LW', 'RW'].includes(s.channel))
      .flatMap((s) =>
        firstReflections({
          speaker: { xIn: s.xIn, yIn: s.yIn, zIn: s.zIn },
          listener: { xIn: mlp.xIn, yIn: mlp.yIn, zIn: earHeightIn },
          box,
          ceilingFt: ceilingHeightIn,
        })
          .filter((p) => p.surface !== 'front' && p.surface !== 'back' && p.surface !== 'floor')
          .map((p) => ({ ...p, channel: s.channel }))
      );
  }, [box, ceilingHeightIn, speakers, mlp, earHeightIn, enabled]);
}

export function AcousticsPanel({ box, ceilingHeightIn, earHeightIn, subs, seats, onApplySubs }) {
  const { Lx, Ly, Lz } = toFeet(box, ceilingHeightIn);

  const summary = useMemo(() => {
    const modes = roomModes(Lx, Ly, Lz, { maxOrder: 4, maxFreq: 200 });
    const volume = Lx * Ly * Lz;
    const surface = 2 * (Lx * Ly + Lx * Lz + Ly * Lz);
    const rt60 = estimateRt60(volume, surface);
    const schroeder = schroederFrequency(volume, rt60);
    const bands = bonelloBands(modes);
    const axial = modes.filter((m) => m.type === 'axial');
    // Modes within 5% of each other pile up and sound like one big resonance.
    const clustered = [];
    for (let i = 1; i < axial.length; i++) {
      if (Math.abs(axial[i].f - axial[i - 1].f) / axial[i].f < 0.05) {
        clustered.push([axial[i - 1], axial[i]]);
      }
    }
    return { modes, axial, volume, rt60, schroeder, bands, clustered };
  }, [Lx, Ly, Lz]);

  const ranking = useMemo(() => {
    if (!seats.length) return [];
    return rankSubPositions({
      Lx,
      Ly,
      Lz,
      seats: seats.map((s) => localFeet(box, s.xIn, s.yIn)),
      zFt: earHeightIn / 12,
      candidates: subCandidates(Lx, Ly, Lz),
      freqs: RANKING_FREQS,
    });
  }, [Lx, Ly, Lz, seats, box, earHeightIn]);

  const currentSpread = useMemo(() => {
    if (!subs.length || !seats.length) return null;
    const field = modalField({
      Lx,
      Ly,
      Lz,
      sources: subs.map((s) => ({
        ...localFeet(box, s.xIn, s.yIn),
        zFt: Math.max(0.3, (s.zIn ?? 12) / 12),
      })),
      points: seats.map((s) => localFeet(box, s.xIn, s.yIn)),
      zFt: earHeightIn / 12,
      freqs: RANKING_FREQS,
    });
    const values = Array.from(field);
    return Math.max(...values) - Math.min(...values);
  }, [Lx, Ly, Lz, subs, seats, box, earHeightIn]);

  const ratio = (Math.max(Lx, Ly) / Math.min(Lx, Ly)).toFixed(2);

  return (
    <>
      <div className="readout">
        {Lx.toFixed(1)} × {Ly.toFixed(1)} × {Lz.toFixed(1)} ft · {Math.round(summary.volume)} ft³
        <br />
        Modal below ~{Math.round(summary.schroeder)} Hz (estimated RT60{' '}
        {summary.rt60.toFixed(2)} s)
      </div>

      <h4>Axial modes</h4>
      <ul className="mode-inline">
        {summary.axial.slice(0, 8).map((m) => (
          <li key={`${m.nx}${m.ny}${m.nz}`}>
            {Math.round(m.f)} Hz
            <span>
              {m.nx ? 'W' : m.ny ? 'L' : 'H'}
              {Math.max(m.nx, m.ny, m.nz)}
            </span>
          </li>
        ))}
      </ul>

      {summary.clustered.length > 0 && (
        <div className="verdict warn">
          Axial modes pile up near{' '}
          {summary.clustered.map((c) => `${Math.round(c[0].f)} Hz`).join(', ')} — expect a strong
          resonance there. Bass traps and careful sub/seat placement help most.
        </div>
      )}
      {Number(ratio) > 1.9 && Number(ratio) < 2.1 && (
        <div className="verdict warn">
          The room is close to a 2:1 ratio, which stacks length and width modes on the same
          frequencies. Asymmetric seating and extra trapping are worth planning for.
        </div>
      )}

      <h4>Subwoofer placement</h4>
      {currentSpread != null && (
        <div className={`verdict ${currentSpread < 4 ? 'good' : currentSpread < 7 ? 'warn' : 'error'}`}>
          Your current {subs.length} sub{subs.length === 1 ? '' : 's'}{' '}
          {subs.length === 1 ? 'gives' : 'give'} about {currentSpread.toFixed(1)} dB of
          seat-to-seat variation across 20–90 Hz.
          {currentSpread >= 7 && ' Some seats will have noticeably weaker bass than others.'}
        </div>
      )}
      {!subs.length && (
        <p className="calc-note">Place at least one subwoofer to model the bass response.</p>
      )}

      {ranking.length > 0 && (
        <>
          <p className="calc-note">
            Modeled seat-to-seat variation for standard placements, best first. Lower is more
            consistent bass between seats. This is a rigid-wall model — use it to choose what to
            try, then confirm by measuring.
          </p>
          <ul className="sub-ranking">
            {ranking.slice(0, 5).map((r) => (
              <li key={r.key}>
                <button onClick={() => onApplySubs(r)}>
                  <span className="palette-label">{r.label}</span>
                  <span className="palette-dims">
                    {r.subCount} sub{r.subCount === 1 ? '' : 's'} · {r.seatSpreadDb.toFixed(1)} dB
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
