import { useState } from 'react';
import {
  viewingAngleDeg,
  screenWidthFromDiagonal,
  recommendedDistanceRangeIn,
  throwDistanceIn,
  screenWidthFromThrow,
  SPEAKER_ANGLES_5_1,
  SPEAKER_ANGLES_7_1,
  riserHeightIn,
} from '../calculators.js';

function ftin(inches) {
  const sign = inches < 0 ? '-' : '';
  inches = Math.round(Math.abs(inches));
  const ft = Math.floor(inches / 12);
  const inch = inches % 12;
  return `${sign}${ft}'${inch}"`;
}

function Card({ title, children }) {
  return (
    <div className="card calc-card">
      <h2>{title}</h2>
      {children}
    </div>
  );
}

function ScreenSizeCalculator() {
  const [diagonal, setDiagonal] = useState(110);
  const [aspect, setAspect] = useState(16 / 9);
  const [distanceFt, setDistanceFt] = useState(12);

  const { widthIn } = screenWidthFromDiagonal(diagonal, aspect);
  const distanceIn = distanceFt * 12;
  const angle = viewingAngleDeg(widthIn, distanceIn);
  const { minDistanceIn, maxDistanceIn } = recommendedDistanceRangeIn(widthIn);

  let verdict = 'Good balance of immersion and comfort.';
  if (angle > 40) verdict = 'Very immersive — near THX max angle. Great for movies, can feel large for everyday viewing.';
  if (angle < 26) verdict = 'Conservative angle — you could likely go bigger or sit closer.';

  return (
    <Card title="Screen Size vs. Seating Distance">
      <label>
        Screen diagonal (in)
        <input type="number" value={diagonal} onChange={(e) => setDiagonal(Number(e.target.value))} />
      </label>
      <label>
        Aspect ratio
        <select value={aspect} onChange={(e) => setAspect(Number(e.target.value))}>
          <option value={16 / 9}>16:9</option>
          <option value={2.35}>2.35:1 (Scope)</option>
          <option value={4 / 3}>4:3</option>
        </select>
      </label>
      <label>
        Seating distance (ft)
        <input type="number" value={distanceFt} onChange={(e) => setDistanceFt(Number(e.target.value))} />
      </label>
      <div className="calc-result">
        <div>
          Screen width: <strong>{widthIn.toFixed(0)}"</strong>
        </div>
        <div>
          Viewing angle: <strong>{angle.toFixed(1)}°</strong>
        </div>
        <div>
          Recommended distance range:{' '}
          <strong>
            {ftin(minDistanceIn)} – {ftin(maxDistanceIn)}
          </strong>
        </div>
        <div className="calc-note">{verdict}</div>
      </div>
    </Card>
  );
}

function ProjectorThrowCalculator() {
  const [mode, setMode] = useState('distance');
  const [throwRatio, setThrowRatio] = useState(1.5);
  const [screenWidthIn, setScreenWidthIn] = useState(120);
  const [throwFt, setThrowFt] = useState(15);

  return (
    <Card title="Projector Throw Distance">
      <label>
        Throw ratio (from projector spec sheet)
        <input type="number" step="0.05" value={throwRatio} onChange={(e) => setThrowRatio(Number(e.target.value))} />
      </label>
      <div className="toggle-row">
        <button className={mode === 'distance' ? 'active' : ''} onClick={() => setMode('distance')}>
          I know screen size
        </button>
        <button className={mode === 'screen' ? 'active' : ''} onClick={() => setMode('screen')}>
          I know mounting distance
        </button>
      </div>
      {mode === 'distance' ? (
        <>
          <label>
            Screen width (in)
            <input type="number" value={screenWidthIn} onChange={(e) => setScreenWidthIn(Number(e.target.value))} />
          </label>
          <div className="calc-result">
            Mount the projector <strong>{ftin(throwDistanceIn(throwRatio, screenWidthIn))}</strong> from the screen.
          </div>
        </>
      ) : (
        <>
          <label>
            Available mounting distance (ft)
            <input type="number" value={throwFt} onChange={(e) => setThrowFt(Number(e.target.value))} />
          </label>
          <div className="calc-result">
            Your screen should be about <strong>{screenWidthFromThrow(throwFt * 12, throwRatio).toFixed(0)}"</strong>{' '}
            wide.
          </div>
        </>
      )}
    </Card>
  );
}

function SpeakerLayoutCalculator() {
  const [format, setFormat] = useState('5.1');
  const [radiusFt, setRadiusFt] = useState(10);
  const angles = format === '5.1' ? SPEAKER_ANGLES_5_1 : SPEAKER_ANGLES_7_1;

  return (
    <Card title="Speaker Placement Angles">
      <label>
        Format
        <select value={format} onChange={(e) => setFormat(e.target.value)}>
          <option value="5.1">5.1</option>
          <option value="7.1">7.1</option>
        </select>
      </label>
      <label>
        Distance from main listening position (ft)
        <input type="number" value={radiusFt} onChange={(e) => setRadiusFt(Number(e.target.value))} />
      </label>
      <table className="calc-table">
        <thead>
          <tr>
            <th>Speaker</th>
            <th>Angle from center</th>
          </tr>
        </thead>
        <tbody>
          {angles.map((a) => (
            <tr key={a.name}>
              <td>{a.name}</td>
              <td>{a.angleDeg}°</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="calc-note">
        Angles are measured from the main listening position, 0° facing the screen, at roughly {radiusFt} ft radius.
        Aim tweeters at seated ear height for the main listening position.
      </div>
    </Card>
  );
}

function RiserCalculator() {
  const [clearance, setClearance] = useState(4);
  const [distanceFt, setDistanceFt] = useState(10);
  const [spacingFt, setSpacingFt] = useState(4);

  const heightIn = riserHeightIn(clearance, distanceFt * 12, spacingFt * 12);

  return (
    <Card title="Riser Height Estimator">
      <label>
        Distance from front row to screen (ft)
        <input type="number" value={distanceFt} onChange={(e) => setDistanceFt(Number(e.target.value))} />
      </label>
      <label>
        Row spacing (ft)
        <input type="number" value={spacingFt} onChange={(e) => setSpacingFt(Number(e.target.value))} />
      </label>
      <label>
        Desired clearance over the head in front (in)
        <input type="number" value={clearance} onChange={(e) => setClearance(Number(e.target.value))} />
      </label>
      <div className="calc-result">
        Suggested riser height: <strong>{heightIn.toFixed(1)}"</strong>
      </div>
      <div className="calc-note">
        Estimate only — assumes similar seated eye heights row to row. Most home risers run 6"–10". Confirm
        structural support and local code (railings, egress) before building.
      </div>
    </Card>
  );
}

export default function Calculators() {
  return (
    <div className="page">
      <h1>Theater Math</h1>
      <p className="muted">Quick calculators for the most common home theater sizing questions.</p>
      <div className="calc-grid">
        <ScreenSizeCalculator />
        <ProjectorThrowCalculator />
        <SpeakerLayoutCalculator />
        <RiserCalculator />
      </div>
    </div>
  );
}
