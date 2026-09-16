import { formatFtIn, formatArea } from './units.js';
import { cableLength, CABLE_TYPES_BY_KEY } from './cables.js';
import { PRESETS_BY_KEY, ROOM_TYPES_BY_KEY } from './objectLibrary.js';

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Give the browser a moment to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function slugify(name) {
  return (name || 'design').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// --- JSON backup ---------------------------------------------------------

export function exportJSON(plan) {
  const payload = {
    format: 'basement-theater-design',
    version: 1,
    exportedAt: new Date().toISOString(),
    design: plan.design,
    walls: plan.walls,
    openings: plan.openings,
    rooms: plan.rooms,
    objects: plan.objects,
    cables: plan.cables || [],
  };
  download(
    new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
    `${slugify(plan.design.name)}.json`
  );
}

export function parseImportedJSON(text) {
  const data = JSON.parse(text);
  if (data.format !== 'basement-theater-design') {
    throw new Error('That file is not a basement design export.');
  }
  return data;
}

// --- CSV -----------------------------------------------------------------

function toCsv(rows) {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const value = cell == null ? '' : String(cell);
          return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
        })
        .join(',')
    )
    .join('\n');
}

export function exportCablesCSV(plan, ceilingHeightIn) {
  const rows = [['Run', 'Type', 'From', 'To', 'Horizontal', 'Vertical', 'Slack %', 'Total ft', 'Notes']];
  for (const cable of plan.cables || []) {
    const length = cableLength(cable, plan.objects, ceilingHeightIn);
    if (!length) continue;
    const from = plan.objects.find((o) => o.id === cable.fromObjectId);
    const to = plan.objects.find((o) => o.id === cable.toObjectId);
    rows.push([
      cable.label || `${from?.label} → ${to?.label}`,
      CABLE_TYPES_BY_KEY[cable.type]?.label || cable.type,
      from?.label || '',
      to?.label || '',
      formatFtIn(length.horizontalIn),
      formatFtIn(length.verticalIn),
      cable.slackPct ?? 15,
      length.totalFt.toFixed(1),
      cable.notes || '',
    ]);
  }
  download(new Blob([toCsv(rows)], { type: 'text/csv' }), `${slugify(plan.design.name)}-cable-runs.csv`);
}

export function exportObjectsCSV(plan, computedRooms) {
  const roomName = (xIn, yIn) => {
    const room = computedRooms.find((r) => {
      if (!r.rects) return false;
      return r.rects.some(
        (rect) =>
          xIn >= rect.xIn &&
          xIn <= rect.xIn + rect.widthIn &&
          yIn >= rect.yIn &&
          yIn <= rect.yIn + rect.heightIn
      );
    });
    return room?.name || '';
  };

  const rows = [['Item', 'Category', 'Type', 'Room', 'Width', 'Depth', 'Height', 'Off floor', 'Rotation']];
  for (const obj of plan.objects) {
    rows.push([
      obj.label,
      obj.category,
      PRESETS_BY_KEY[obj.type]?.label || obj.type,
      roomName(obj.cxIn, obj.cyIn),
      formatFtIn(obj.widthIn),
      formatFtIn(obj.depthIn),
      formatFtIn(obj.heightIn),
      formatFtIn(obj.elevationIn),
      `${Math.round(obj.rotationDeg)}°`,
    ]);
  }
  download(new Blob([toCsv(rows)], { type: 'text/csv' }), `${slugify(plan.design.name)}-objects.csv`);
}

export function exportEquipmentCSV(equipment, rooms) {
  const roomName = (id) => rooms.find((r) => r.id === id)?.name || '';
  const rows = [['Item', 'Model', 'Category', 'Room', 'Qty', 'Unit price', 'Line total', 'Status', 'Priority', 'Link', 'Notes']];
  for (const item of equipment) {
    const qty = item.quantity || 1;
    rows.push([
      item.name,
      item.model || '',
      item.category,
      roomName(item.roomId),
      qty,
      (item.priceCents / 100).toFixed(2),
      ((item.priceCents * qty) / 100).toFixed(2),
      item.status,
      item.priority || '',
      item.vendorUrl || '',
      item.notes || '',
    ]);
  }
  download(new Blob([toCsv(rows)], { type: 'text/csv' }), 'equipment-list.csv');
}

// --- Plan image / PDF ----------------------------------------------------

// Serializes the live SVG, inlining the computed styles the browser applied
// via the stylesheet so the exported file looks like what's on screen.
function serializeSvg(svgElement, { background = '#0f1420' } = {}) {
  const clone = svgElement.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

  const viewBox = svgElement.getAttribute('viewBox').split(/\s+/).map(Number);
  clone.setAttribute('width', viewBox[2]);
  clone.setAttribute('height', viewBox[3]);

  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('x', viewBox[0]);
  bg.setAttribute('y', viewBox[1]);
  bg.setAttribute('width', viewBox[2]);
  bg.setAttribute('height', viewBox[3]);
  bg.setAttribute('fill', background);
  clone.insertBefore(bg, clone.firstChild);

  return new XMLSerializer().serializeToString(clone);
}

async function svgToCanvas(svgElement, scale = 2) {
  const source = serializeSvg(svgElement);
  const viewBox = svgElement.getAttribute('viewBox').split(/\s+/).map(Number);
  const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not render the plan image.'));
      img.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewBox[2] * scale);
    canvas.height = Math.round(viewBox[3] * scale);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function exportPlanPNG(svgElement, name) {
  const canvas = await svgToCanvas(svgElement, 2);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  download(blob, `${slugify(name)}-plan.png`);
}

// Opens a print-ready page. The browser's own "Save as PDF" handles the rest,
// which avoids bundling a PDF library for a once-in-a-while export.
export async function exportPlanPDF(svgElement, plan, computedRooms) {
  const canvas = await svgToCanvas(svgElement, 2);
  const dataUrl = canvas.toDataURL('image/png');
  const win = window.open('', '_blank');
  if (!win) {
    throw new Error('Your browser blocked the print window — allow pop-ups for this site.');
  }

  const totalArea = computedRooms.reduce((sum, r) => sum + r.areaSqIn, 0);
  const roomRows = computedRooms
    .map(
      (r) => `<tr><td>${escapeHtml(r.name)}</td><td>${
        ROOM_TYPES_BY_KEY[r.type]?.label || r.type
      }</td><td>${r.missing ? '—' : formatArea(r.areaSqIn)}</td><td>${formatFtIn(
        r.ceilingHeightIn || plan.design.defaultCeilingHeightIn
      )}</td></tr>`
    )
    .join('');

  win.document.write(`<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(plan.design.name)}</title>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; margin: 24px; color: #111; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .meta { color: #555; font-size: 12px; margin-bottom: 16px; }
  img { width: 100%; border: 1px solid #ccc; }
  table { border-collapse: collapse; margin-top: 16px; width: 100%; font-size: 12px; }
  th, td { border: 1px solid #ccc; padding: 4px 8px; text-align: left; }
  th { background: #f2f2f2; }
  @media print { .no-print { display: none; } }
</style></head>
<body>
  <h1>${escapeHtml(plan.design.name)}</h1>
  <div class="meta">
    ${computedRooms.length} rooms · ${formatArea(totalArea)} finished ·
    default ceiling ${formatFtIn(plan.design.defaultCeilingHeightIn)} ·
    exported ${new Date().toLocaleDateString()}
  </div>
  <img src="${dataUrl}" />
  <table>
    <thead><tr><th>Room</th><th>Purpose</th><th>Area</th><th>Ceiling</th></tr></thead>
    <tbody>${roomRows}</tbody>
  </table>
  <p class="no-print"><button onclick="window.print()">Print / Save as PDF</button></p>
  <script>window.addEventListener('load', () => setTimeout(() => window.print(), 300));<\/script>
</body></html>`);
  win.document.close();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[c]);
}
