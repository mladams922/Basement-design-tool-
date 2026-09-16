// 2D geometry for the floor plan. All coordinates are inches, x to the right
// and y downward (screen orientation), so "clockwise on screen" is a positive
// signed area here.

export function signedArea(points) {
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    a += p.xIn * q.yIn - q.xIn * p.yIn;
  }
  return a / 2;
}

export function polygonArea(points) {
  return Math.abs(signedArea(points));
}

export function polygonCentroid(points) {
  let cx = 0;
  let cy = 0;
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    const cross = p.xIn * q.yIn - q.xIn * p.yIn;
    a += cross;
    cx += (p.xIn + q.xIn) * cross;
    cy += (p.yIn + q.yIn) * cross;
  }
  a /= 2;
  if (Math.abs(a) < 1e-9) return { xIn: points[0].xIn, yIn: points[0].yIn };
  return { xIn: cx / (6 * a), yIn: cy / (6 * a) };
}

export function pointInPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].xIn;
    const yi = points[i].yIn;
    const xj = points[j].xIn;
    const yj = points[j].yIn;
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function bbox(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.xIn < minX) minX = p.xIn;
    if (p.yIn < minY) minY = p.yIn;
    if (p.xIn > maxX) maxX = p.xIn;
    if (p.yIn > maxY) maxY = p.yIn;
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

export function rotatePoint(x, y, cx, cy, deg) {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = x - cx;
  const dy = y - cy;
  return { xIn: cx + dx * cos - dy * sin, yIn: cy + dx * sin + dy * cos };
}

// Corner points of a placed object, honoring its rotation.
export function objectCorners(obj) {
  const hw = obj.widthIn / 2;
  const hd = obj.depthIn / 2;
  const raw = [
    { xIn: obj.cxIn - hw, yIn: obj.cyIn - hd },
    { xIn: obj.cxIn + hw, yIn: obj.cyIn - hd },
    { xIn: obj.cxIn + hw, yIn: obj.cyIn + hd },
    { xIn: obj.cxIn - hw, yIn: obj.cyIn + hd },
  ];
  if (!obj.rotationDeg) return raw;
  return raw.map((p) => rotatePoint(p.xIn, p.yIn, obj.cxIn, obj.cyIn, obj.rotationDeg));
}

export function segmentLength(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

// A wall is a thick line segment; this returns it as a rectangle.
export function wallPolygon(wall) {
  const dx = wall.x2In - wall.x1In;
  const dy = wall.y2In - wall.y1In;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return [];
  const half = wall.thicknessIn / 2;
  const nx = (-dy / len) * half;
  const ny = (dx / len) * half;
  return [
    { xIn: wall.x1In + nx, yIn: wall.y1In + ny },
    { xIn: wall.x2In + nx, yIn: wall.y2In + ny },
    { xIn: wall.x2In - nx, yIn: wall.y2In - ny },
    { xIn: wall.x1In - nx, yIn: wall.y1In - ny },
  ];
}

function lineIntersection(p1, d1, p2, d2) {
  const denom = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((p2.x - p1.x) * d2.y - (p2.y - p1.y) * d2.x) / denom;
  return { xIn: p1.x + d1.x * t, yIn: p1.y + d1.y * t };
}

// Offsets a closed polygon outward by `dist` (negative shrinks it). Used to
// draw exterior walls outward from the shell, which is the interior face.
export function offsetPolygon(points, dist) {
  const n = points.length;
  if (n < 3) return points;
  const orientation = signedArea(points) > 0 ? 1 : -1;
  const edges = [];

  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    const dx = b.xIn - a.xIn;
    const dy = b.yIn - a.yIn;
    const len = Math.hypot(dx, dy) || 1;
    const nx = ((dy / len) * dist) / orientation;
    const ny = ((-dx / len) * dist) / orientation;
    edges.push({
      p: { x: a.xIn + nx, y: a.yIn + ny },
      d: { x: dx, y: dy },
    });
  }

  const result = [];
  for (let i = 0; i < n; i++) {
    const prev = edges[(i - 1 + n) % n];
    const curr = edges[i];
    const hit = lineIntersection(prev.p, prev.d, curr.p, curr.d);
    result.push(hit || { xIn: curr.p.x, yIn: curr.p.y });
  }
  return result;
}

export function polygonEdges(points) {
  return points.map((p, i) => {
    const q = points[(i + 1) % points.length];
    return {
      index: i,
      x1In: p.xIn,
      y1In: p.yIn,
      x2In: q.xIn,
      y2In: q.yIn,
      lengthIn: segmentLength(p.xIn, p.yIn, q.xIn, q.yIn),
    };
  });
}

// Projection of a point onto a segment, clamped to the segment.
export function projectOnSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-9) return { xIn: x1, yIn: y1, t: 0, distance: Math.hypot(px - x1, py - y1) };
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const xIn = x1 + dx * t;
  const yIn = y1 + dy * t;
  return { xIn, yIn, t, distance: Math.hypot(px - xIn, py - yIn) };
}

export function snap(value, step) {
  if (!step) return value;
  return Math.round(value / step) * step;
}

// --- Room detection -------------------------------------------------------
// Walls are rasterized into a grid and rooms are found by flood-filling from a
// seed point the user clicked. Openings are deliberately treated as solid: a
// doorway shouldn't merge two rooms into one region.

export function buildGrid(shellPoints, walls, cellIn = 3) {
  const box = bbox(shellPoints);
  const originX = box.minX;
  const originY = box.minY;
  const w = Math.max(1, Math.ceil(box.width / cellIn));
  const h = Math.max(1, Math.ceil(box.height / cellIn));
  const blocked = new Uint8Array(w * h);

  for (let gy = 0; gy < h; gy++) {
    const cy = originY + (gy + 0.5) * cellIn;
    for (let gx = 0; gx < w; gx++) {
      const cx = originX + (gx + 0.5) * cellIn;
      if (!pointInPolygon(cx, cy, shellPoints)) blocked[gy * w + gx] = 1;
    }
  }

  for (const wall of walls) {
    const poly = wallPolygon(wall);
    if (!poly.length) continue;
    const wb = bbox(poly);
    const gx0 = Math.max(0, Math.floor((wb.minX - originX) / cellIn));
    const gx1 = Math.min(w - 1, Math.ceil((wb.maxX - originX) / cellIn));
    const gy0 = Math.max(0, Math.floor((wb.minY - originY) / cellIn));
    const gy1 = Math.min(h - 1, Math.ceil((wb.maxY - originY) / cellIn));
    for (let gy = gy0; gy <= gy1; gy++) {
      const cy = originY + (gy + 0.5) * cellIn;
      for (let gx = gx0; gx <= gx1; gx++) {
        const cx = originX + (gx + 0.5) * cellIn;
        if (pointInPolygon(cx, cy, poly)) blocked[gy * w + gx] = 1;
      }
    }
  }

  return { w, h, cellIn, originX, originY, blocked };
}

export function floodFill(grid, seedXIn, seedYIn) {
  const gx = Math.floor((seedXIn - grid.originX) / grid.cellIn);
  const gy = Math.floor((seedYIn - grid.originY) / grid.cellIn);
  if (gx < 0 || gy < 0 || gx >= grid.w || gy >= grid.h) return null;
  if (grid.blocked[gy * grid.w + gx]) return null;

  const mask = new Uint8Array(grid.w * grid.h);
  const stack = [gy * grid.w + gx];
  mask[stack[0]] = 1;
  let count = 0;
  let sumX = 0;
  let sumY = 0;

  while (stack.length) {
    const idx = stack.pop();
    const y = Math.floor(idx / grid.w);
    const x = idx - y * grid.w;
    count++;
    sumX += x;
    sumY += y;

    if (x > 0) pushCell(idx - 1);
    if (x < grid.w - 1) pushCell(idx + 1);
    if (y > 0) pushCell(idx - grid.w);
    if (y < grid.h - 1) pushCell(idx + grid.w);
  }

  function pushCell(i) {
    if (mask[i] || grid.blocked[i]) return;
    mask[i] = 1;
    stack.push(i);
  }

  const areaSqIn = count * grid.cellIn * grid.cellIn;
  const centroid = {
    xIn: grid.originX + (sumX / count + 0.5) * grid.cellIn,
    yIn: grid.originY + (sumY / count + 0.5) * grid.cellIn,
  };
  return { mask, count, areaSqIn, centroid };
}

// Converts a cell mask into as few rectangles as possible for rendering:
// horizontal runs, merged vertically when they line up exactly.
export function maskToRects(grid, mask) {
  const rects = [];
  let openRuns = [];

  for (let gy = 0; gy < grid.h; gy++) {
    const runs = [];
    let start = -1;
    for (let gx = 0; gx <= grid.w; gx++) {
      const filled = gx < grid.w && mask[gy * grid.w + gx];
      if (filled && start === -1) start = gx;
      if (!filled && start !== -1) {
        runs.push({ x0: start, x1: gx });
        start = -1;
      }
    }

    const nextOpen = [];
    for (const run of runs) {
      const match = openRuns.find((o) => o.x0 === run.x0 && o.x1 === run.x1);
      if (match) {
        match.y1 = gy + 1;
        nextOpen.push(match);
        openRuns = openRuns.filter((o) => o !== match);
      } else {
        nextOpen.push({ x0: run.x0, x1: run.x1, y0: gy, y1: gy + 1 });
      }
    }
    for (const stale of openRuns) rects.push(stale);
    openRuns = nextOpen;
  }
  for (const remaining of openRuns) rects.push(remaining);

  return rects.map((r) => ({
    xIn: grid.originX + r.x0 * grid.cellIn,
    yIn: grid.originY + r.y0 * grid.cellIn,
    widthIn: (r.x1 - r.x0) * grid.cellIn,
    heightIn: (r.y1 - r.y0) * grid.cellIn,
  }));
}

// Best point inside the region to drop a label: the centroid when it actually
// falls inside, otherwise the middle of the widest run.
export function labelPoint(grid, mask, centroid) {
  const gx = Math.floor((centroid.xIn - grid.originX) / grid.cellIn);
  const gy = Math.floor((centroid.yIn - grid.originY) / grid.cellIn);
  if (gx >= 0 && gy >= 0 && gx < grid.w && gy < grid.h && mask[gy * grid.w + gx]) {
    return centroid;
  }

  let best = null;
  for (let y = 0; y < grid.h; y++) {
    let start = -1;
    for (let x = 0; x <= grid.w; x++) {
      const filled = x < grid.w && mask[y * grid.w + x];
      if (filled && start === -1) start = x;
      if (!filled && start !== -1) {
        const width = x - start;
        if (!best || width > best.width) best = { width, x0: start, x1: x, y };
        start = -1;
      }
    }
  }
  if (!best) return centroid;
  return {
    xIn: grid.originX + ((best.x0 + best.x1) / 2) * grid.cellIn,
    yIn: grid.originY + (best.y + 0.5) * grid.cellIn,
  };
}
