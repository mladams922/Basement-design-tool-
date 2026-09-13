import { useState } from 'react';
import { axialModes } from '../calculators.js';

function ModeList({ label, freqs }) {
  return (
    <div className="mode-col">
      <h4>{label}</h4>
      <ul>
        {freqs.map((m) => (
          <li key={m.n}>
            {m.n}× — {m.freqHz} Hz
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Acoustics() {
  const [length, setLength] = useState(20);
  const [width, setWidth] = useState(14);
  const [height, setHeight] = useState(8);

  const lengthModes = axialModes(length);
  const widthModes = axialModes(width);
  const heightModes = axialModes(height);

  const ratio = (length / width).toFixed(2);
  const flaggedRatios = ['1.00', '1.50', '2.00'];

  return (
    <div className="page">
      <h1>Acoustics &amp; Room Treatment</h1>

      <div className="card">
        <h2>Room Mode Calculator</h2>
        <p className="muted">
          Rectangular rooms build up resonances ("room modes") at frequencies related to their dimensions.
          Overlapping modes across dimensions cause uneven bass.
        </p>
        <div className="dims-row">
          <label>
            Length (ft)
            <input type="number" value={length} onChange={(e) => setLength(Number(e.target.value))} />
          </label>
          <label>
            Width (ft)
            <input type="number" value={width} onChange={(e) => setWidth(Number(e.target.value))} />
          </label>
          <label>
            Height (ft)
            <input type="number" value={height} onChange={(e) => setHeight(Number(e.target.value))} />
          </label>
        </div>
        <div className="modes-grid">
          <ModeList label="Length axis" freqs={lengthModes} />
          <ModeList label="Width axis" freqs={widthModes} />
          <ModeList label="Height axis" freqs={heightModes} />
        </div>
        <div className="calc-note">
          Length:Width ratio is {ratio}:1.{' '}
          {flaggedRatios.includes(ratio)
            ? 'This ratio is known to concentrate modes at the same frequencies — consider asymmetric seating/speaker placement or extra bass trapping.'
            : 'Non-integer ratios like this tend to spread room modes out more evenly, which is good for bass response.'}
        </div>
      </div>

      <div className="card">
        <h2>Treatment Placement Checklist</h2>
        <ul className="tips-list">
          <li>
            <strong>First reflection points</strong> — have someone slide a mirror along the side walls and ceiling
            between you and each speaker; anywhere you can see the speaker in the mirror is a reflection point worth
            treating with an absorption panel.
          </li>
          <li>
            <strong>Corner bass traps</strong> — low frequencies build up in room corners (especially where wall
            meets ceiling). Floor-to-ceiling corner traps behind/beside the screen wall help the most.
          </li>
          <li>
            <strong>Front wall</strong> — absorb around and behind the screen/speakers to tighten imaging.
          </li>
          <li>
            <strong>Rear wall</strong> — diffusion (rather than pure absorption) on the back wall keeps the room from
            sounding "dead" while still controlling slap echo.
          </li>
          <li>
            <strong>Ceiling cloud</strong> — a broadband absorber above the main listening position tames ceiling
            bounce, especially useful with concrete or exposed joists.
          </li>
          <li>
            <strong>Decoupling</strong> — isolate drywall from joists/studs with resilient channel or clips if noise
            transfer to the rest of the house is a concern.
          </li>
          <li>
            <strong>Basement specifics</strong> — address moisture/vapor barriers, HVAC duct noise, and sump pump
            noise before finishing walls; acoustic treatment can't fix a damp or noisy room.
          </li>
        </ul>
        <p className="calc-note">
          This is general guidance, not an engineering assessment — for structural, electrical, moisture, or egress
          questions, consult a licensed professional.
        </p>
      </div>
    </div>
  );
}
