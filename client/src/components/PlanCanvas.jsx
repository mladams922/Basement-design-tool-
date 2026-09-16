import { wallPolygon, offsetPolygon, objectCorners, polygonEdges, projectOnSegment } from '../geometry.js';
import { formatFtIn, formatArea } from '../units.js';
import { ROOM_TYPES_BY_KEY } from '../objectLibrary.js';
import { cablePath, cableLength, CABLE_TYPES_BY_KEY } from '../cables.js';

function pointsAttr(points) {
  return points.map((p) => `${p.xIn},${p.yIn}`).join(' ');
}

// Where an opening sits in world space, given its host wall or shell edge.
export function openingGeometry(opening, plan) {
  let x1;
  let y1;
  let x2;
  let y2;
  let thickness;

  if (opening.hostType === 'shell') {
    const edges = polygonEdges(plan.design.shellPoints);
    const edge = edges[opening.hostId];
    if (!edge) return null;
    x1 = edge.x1In;
    y1 = edge.y1In;
    x2 = edge.x2In;
    y2 = edge.y2In;
    thickness = plan.design.extWallThicknessIn;
  } else {
    const wall = plan.walls.find((w) => w.id === opening.hostId);
    if (!wall) return null;
    x1 = wall.x1In;
    y1 = wall.y1In;
    x2 = wall.x2In;
    y2 = wall.y2In;
    thickness = wall.thicknessIn;
  }

  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  // Shell edges are the interior face, so the wall body sits outside the line.
  const nx = -uy;
  const ny = ux;

  const start = Math.max(0, Math.min(len - opening.widthIn, opening.offsetIn));
  const sx = x1 + ux * start;
  const sy = y1 + uy * start;
  const ex = sx + ux * opening.widthIn;
  const ey = sy + uy * opening.widthIn;

  return { sx, sy, ex, ey, ux, uy, nx, ny, thickness, len, hostLength: len, x1, y1, x2, y2 };
}

function ObjectShape({ obj, upp }) {
  const w = obj.widthIn;
  const d = obj.depthIn;
  const hw = w / 2;
  const hd = d / 2;
  const stroke = Math.max(0.5, 1.2 * upp);
  const preset = obj.type;

  const common = {
    fill: obj.color,
    stroke: 'rgba(255,255,255,0.45)',
    strokeWidth: stroke,
  };

  switch (obj.shape || shapeFor(preset)) {
    case 'circle':
      return <ellipse cx={0} cy={0} rx={hw} ry={hd} {...common} />;

    case 'stairs': {
      const treads = Math.max(2, Number(obj.meta?.treads) || 12);
      const step = d / treads;
      const lines = [];
      for (let i = 1; i < treads; i++) {
        const y = -hd + i * step;
        lines.push(
          <line key={i} x1={-hw} y1={y} x2={hw} y2={y} stroke="rgba(255,255,255,0.35)" strokeWidth={stroke} />
        );
      }
      return (
        <g>
          <rect x={-hw} y={-hd} width={w} height={d} {...common} />
          {lines}
          <path
            d={`M 0 ${hd - step} L 0 ${-hd + step} M ${-w * 0.12} ${-hd + step * 1.8} L 0 ${-hd + step} L ${w * 0.12} ${-hd + step * 1.8}`}
            stroke="#fbbf24"
            strokeWidth={stroke * 1.6}
            fill="none"
          />
        </g>
      );
    }

    case 'rack': {
      const slots = 6;
      const step = d / slots;
      return (
        <g>
          <rect x={-hw} y={-hd} width={w} height={d} {...common} />
          {Array.from({ length: slots - 1 }, (_, i) => (
            <line
              key={i}
              x1={-hw + 2}
              y1={-hd + (i + 1) * step}
              x2={hw - 2}
              y2={-hd + (i + 1) * step}
              stroke="rgba(255,255,255,0.25)"
              strokeWidth={stroke}
            />
          ))}
          <line x1={-hw} y1={-hd} x2={hw} y2={-hd} stroke="#38bdf8" strokeWidth={stroke * 2.5} />
        </g>
      );
    }

    case 'speaker':
      return (
        <g>
          <rect x={-hw} y={-hd} width={w} height={d} {...common} />
          <circle cx={0} cy={0} r={Math.min(hw, hd) * 0.55} fill="rgba(0,0,0,0.5)" />
          <circle cx={0} cy={0} r={Math.min(hw, hd) * 0.2} fill="rgba(255,255,255,0.5)" />
        </g>
      );

    case 'light':
      return (
        <g>
          <circle cx={0} cy={0} r={Math.min(hw, hd)} fill={obj.color} opacity={0.55} />
          <circle cx={0} cy={0} r={Math.min(hw, hd)} fill="none" stroke={obj.color} strokeWidth={stroke} />
          <path
            d={`M ${-hw} 0 L ${hw} 0 M 0 ${-hd} L 0 ${hd}`}
            stroke="rgba(0,0,0,0.5)"
            strokeWidth={stroke}
          />
        </g>
      );

    case 'sofa':
      return (
        <g>
          <rect x={-hw} y={-hd} width={w} height={d} rx={Math.min(3, w * 0.05)} {...common} />
          <rect x={-hw} y={-hd} width={w} height={d * 0.22} fill="rgba(0,0,0,0.35)" />
          <rect x={-hw} y={-hd} width={w * 0.1} height={d} fill="rgba(0,0,0,0.2)" />
          <rect x={hw - w * 0.1} y={-hd} width={w * 0.1} height={d} fill="rgba(0,0,0,0.2)" />
        </g>
      );

    case 'bar':
      return (
        <g>
          <rect x={-hw} y={-hd} width={w} height={d} {...common} />
          <rect x={-hw} y={-hd} width={w} height={d * 0.3} fill="rgba(255,255,255,0.18)" />
        </g>
      );

    case 'screen':
      return (
        <g>
          <rect x={-hw} y={-hd} width={w} height={d} {...common} />
          <line x1={-hw} y1={0} x2={hw} y2={0} stroke="#e2e8f0" strokeWidth={stroke * 2} />
        </g>
      );

    default:
      return <rect x={-hw} y={-hd} width={w} height={d} {...common} />;
  }
}

function shapeFor() {
  return 'rect';
}

function RackClearance({ obj, upp }) {
  const front = Number(obj.meta?.frontClearanceIn) || 0;
  const rear = Number(obj.meta?.rearClearanceIn) || 0;
  if (!front && !rear) return null;
  const hw = obj.widthIn / 2;
  const hd = obj.depthIn / 2;
  return (
    <g pointerEvents="none">
      {front > 0 && (
        <rect
          x={-hw}
          y={-hd - front}
          width={obj.widthIn}
          height={front}
          fill="url(#clearanceHatch)"
          stroke="#38bdf8"
          strokeDasharray={`${4 * upp} ${3 * upp}`}
          strokeWidth={Math.max(0.4, upp)}
          opacity={0.75}
        />
      )}
      {rear > 0 && (
        <rect
          x={-hw}
          y={hd}
          width={obj.widthIn}
          height={rear}
          fill="url(#clearanceHatch)"
          stroke="#f59e0b"
          strokeDasharray={`${4 * upp} ${3 * upp}`}
          strokeWidth={Math.max(0.4, upp)}
          opacity={0.75}
        />
      )}
    </g>
  );
}

export default function PlanCanvas({
  plan,
  computedRooms,
  view,
  upp,
  selection,
  draft,
  layers,
  svgRef,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onWheel,
  onContextMenu,
  children,
}) {
  const { design, walls, openings, objects } = plan;
  const ceilingHeightIn = design.defaultCeilingHeightIn;
  const shell = design.shellPoints;
  const outer = offsetPolygon(shell, design.extWallThicknessIn);
  const shellEdges = polygonEdges(shell);

  const font = 12 * upp;
  const thinStroke = Math.max(0.4, 1 * upp);

  const isSelected = (kind, id) => selection && selection.kind === kind && selection.id === id;

  return (
    <svg
      ref={svgRef}
      className="plan-svg"
      viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onWheel={onWheel}
      onContextMenu={onContextMenu}
    >
      <defs>
        <pattern id="minorGrid" width="12" height="12" patternUnits="userSpaceOnUse">
          <path d="M 12 0 L 0 0 0 12" fill="none" stroke="#1e293b" strokeWidth={thinStroke} />
        </pattern>
        <pattern id="majorGrid" width="60" height="60" patternUnits="userSpaceOnUse">
          <rect width="60" height="60" fill="url(#minorGrid)" />
          <path d="M 60 0 L 0 0 0 60" fill="none" stroke="#334155" strokeWidth={thinStroke * 1.6} />
        </pattern>
        <pattern id="clearanceHatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="8" height="8" fill="rgba(56,189,248,0.07)" />
          <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(56,189,248,0.35)" strokeWidth="1.5" />
        </pattern>
      </defs>

      <rect
        x={view.x}
        y={view.y}
        width={view.w}
        height={view.h}
        fill="url(#majorGrid)"
        data-kind="canvas"
      />

      {/* Room fills */}
      {layers.rooms &&
        computedRooms.map((room) => (
          <g key={room.id} data-kind="room" data-id={room.id}>
            {room.rects.map((r, i) => (
              <rect
                key={i}
                x={r.xIn}
                y={r.yIn}
                width={r.widthIn}
                height={r.heightIn}
                fill={room.color}
                opacity={isSelected('room', room.id) ? 0.45 : 0.25}
              />
            ))}
          </g>
        ))}

      {/* Exterior wall band */}
      <path
        d={`M ${outer.map((p) => `${p.xIn} ${p.yIn}`).join(' L ')} Z M ${shell
          .map((p) => `${p.xIn} ${p.yIn}`)
          .join(' L ')} Z`}
        fillRule="evenodd"
        fill="#475569"
        stroke="#94a3b8"
        strokeWidth={thinStroke}
        data-kind="shell"
      />

      {/* Interior walls */}
      {walls.map((wall) => (
        <polygon
          key={wall.id}
          points={pointsAttr(wallPolygon(wall))}
          fill={isSelected('wall', wall.id) ? '#94a3b8' : '#64748b'}
          stroke={isSelected('wall', wall.id) ? '#facc15' : '#94a3b8'}
          strokeWidth={isSelected('wall', wall.id) ? 2 * upp : thinStroke}
          data-kind="wall"
          data-id={wall.id}
        />
      ))}

      {/* Openings punch through the walls drawn above */}
      {openings.map((op) => {
        const g = openingGeometry(op, plan);
        if (!g) return null;
        const t = g.thickness;
        const quad = [
          { xIn: g.sx - g.nx * t, yIn: g.sy - g.ny * t },
          { xIn: g.ex - g.nx * t, yIn: g.ey - g.ny * t },
          { xIn: g.ex + g.nx * t, yIn: g.ey + g.ny * t },
          { xIn: g.sx + g.nx * t, yIn: g.sy + g.ny * t },
        ];
        const selected = isSelected('opening', op.id);
        return (
          <g key={op.id} data-kind="opening" data-id={op.id}>
            <polygon points={pointsAttr(quad)} fill="#0f1420" />
            {op.type === 'door' && (
              <path
                d={`M ${g.sx} ${g.sy} L ${g.sx + g.nx * op.widthIn} ${g.sy + g.ny * op.widthIn} A ${op.widthIn} ${op.widthIn} 0 0 1 ${g.ex} ${g.ey}`}
                fill="none"
                stroke={selected ? '#facc15' : '#22d3ee'}
                strokeWidth={Math.max(0.5, 1.2 * upp)}
              />
            )}
            {op.type === 'window' && (
              <line
                x1={g.sx}
                y1={g.sy}
                x2={g.ex}
                y2={g.ey}
                stroke={selected ? '#facc15' : '#7dd3fc'}
                strokeWidth={Math.max(1, 2.5 * upp)}
              />
            )}
            {op.type === 'cased' && (
              <line
                x1={g.sx}
                y1={g.sy}
                x2={g.ex}
                y2={g.ey}
                stroke={selected ? '#facc15' : '#4ade80'}
                strokeWidth={Math.max(1, 2 * upp)}
                strokeDasharray={`${5 * upp} ${3 * upp}`}
              />
            )}
            <polygon points={pointsAttr(quad)} fill="transparent" />
          </g>
        );
      })}

      {/* Low-voltage cable runs */}
      {layers.cables !== false &&
        (plan.cables || []).map((cable) => {
          const path = cablePath(cable, objects);
          if (!path) return null;
          const spec = CABLE_TYPES_BY_KEY[cable.type] || {};
          const selected = isSelected('cable', cable.id);
          const mid = path[Math.floor(path.length / 2)];
          const length = cableLength(cable, objects, ceilingHeightIn);
          return (
            <g key={`cable-${cable.id}`}>
              <polyline
                points={pointsAttr(path)}
                fill="none"
                stroke={selected ? '#facc15' : spec.color || '#94a3b8'}
                strokeWidth={selected ? 3 * upp : 2 * upp}
                strokeDasharray={`${8 * upp} ${4 * upp}`}
                strokeLinejoin="round"
                data-kind="cable"
                data-id={cable.id}
                style={{ cursor: 'pointer' }}
              />
              {layers.labels && length && (
                <text
                  x={mid.xIn}
                  y={mid.yIn - 4 * upp}
                  fill={spec.color || '#94a3b8'}
                  fontSize={font * 0.8}
                  textAnchor="middle"
                  pointerEvents="none"
                  style={{ paintOrder: 'stroke', stroke: '#0f172a', strokeWidth: 3 * upp }}
                >
                  {spec.label} {length.totalFt.toFixed(0)}'
                </text>
              )}
              {selected &&
                (cable.waypoints || []).map((wp, i) => (
                  <circle
                    key={i}
                    cx={wp.xIn}
                    cy={wp.yIn}
                    r={5 * upp}
                    fill="#facc15"
                    data-kind="cableWaypoint"
                    data-id={cable.id}
                    data-index={i}
                    style={{ cursor: 'move' }}
                  />
                ))}
            </g>
          );
        })}

      {/* Objects */}
      {objects.map((obj) => {
        const visible = layers[obj.category] !== false;
        if (!visible) return null;
        const selected = isSelected('object', obj.id);
        return (
          <g key={obj.id} transform={`translate(${obj.cxIn} ${obj.cyIn}) rotate(${obj.rotationDeg})`}>
            {layers.clearances && <RackClearance obj={obj} upp={upp} />}
            <g data-kind="object" data-id={obj.id} style={{ cursor: 'move' }}>
              <ObjectShape obj={obj} upp={upp} />
            </g>
            {selected && (
              <>
                <rect
                  x={-obj.widthIn / 2}
                  y={-obj.depthIn / 2}
                  width={obj.widthIn}
                  height={obj.depthIn}
                  fill="none"
                  stroke="#facc15"
                  strokeWidth={2 * upp}
                  pointerEvents="none"
                />
                <circle
                  cx={obj.widthIn / 2}
                  cy={obj.depthIn / 2}
                  r={5 * upp}
                  fill="#facc15"
                  data-kind="resize"
                  data-id={obj.id}
                  style={{ cursor: 'nwse-resize' }}
                />
                <line
                  x1={0}
                  y1={-obj.depthIn / 2}
                  x2={0}
                  y2={-obj.depthIn / 2 - 18 * upp}
                  stroke="#facc15"
                  strokeWidth={1.5 * upp}
                  pointerEvents="none"
                />
                <circle
                  cx={0}
                  cy={-obj.depthIn / 2 - 18 * upp}
                  r={5 * upp}
                  fill="#22d3ee"
                  data-kind="rotate"
                  data-id={obj.id}
                  style={{ cursor: 'grab' }}
                />
              </>
            )}
          </g>
        );
      })}

      {/* Wall endpoint handles for the selected wall */}
      {walls
        .filter((w) => isSelected('wall', w.id))
        .map((w) => (
          <g key={`h-${w.id}`}>
            <circle
              cx={w.x1In}
              cy={w.y1In}
              r={5 * upp}
              fill="#facc15"
              data-kind="wallEnd"
              data-id={w.id}
              data-end="1"
            />
            <circle
              cx={w.x2In}
              cy={w.y2In}
              r={5 * upp}
              fill="#facc15"
              data-kind="wallEnd"
              data-id={w.id}
              data-end="2"
            />
          </g>
        ))}

      {/* Shell edges: draggable, with live dimensions */}
      {layers.dimensions &&
        shellEdges.map((edge) => {
          const mx = (edge.x1In + edge.x2In) / 2;
          const my = (edge.y1In + edge.y2In) / 2;
          const dx = edge.x2In - edge.x1In;
          const dy = edge.y2In - edge.y1In;
          const len = Math.hypot(dx, dy) || 1;
          const offset = 14 * upp;
          const nx = (-dy / len) * offset;
          const ny = (dx / len) * offset;
          return (
            <g key={`edge-${edge.index}`}>
              <line
                x1={edge.x1In}
                y1={edge.y1In}
                x2={edge.x2In}
                y2={edge.y2In}
                stroke="transparent"
                strokeWidth={10 * upp}
                data-kind="shellEdge"
                data-id={edge.index}
                style={{ cursor: 'move' }}
              />
              <text
                x={mx - nx}
                y={my - ny}
                fill="#cbd5e1"
                fontSize={font}
                textAnchor="middle"
                dominantBaseline="middle"
                pointerEvents="none"
              >
                {formatFtIn(edge.lengthIn)}
              </text>
            </g>
          );
        })}

      {/* Shell vertices */}
      {shell.map((p, i) => (
        <circle
          key={`v-${i}`}
          cx={p.xIn}
          cy={p.yIn}
          r={4.5 * upp}
          fill={isSelected('shellVertex', i) ? '#facc15' : '#0ea5e9'}
          stroke="#0f172a"
          strokeWidth={upp}
          data-kind="shellVertex"
          data-id={i}
          style={{ cursor: 'grab' }}
        />
      ))}

      {/* Room labels */}
      {layers.rooms &&
        computedRooms.map((room) => (
          <g
            key={`label-${room.id}`}
            data-kind="roomLabel"
            data-id={room.id}
            style={{ cursor: 'move' }}
          >
            <text
              x={room.labelPoint.xIn}
              y={room.labelPoint.yIn - font * 0.3}
              fill="#f8fafc"
              fontSize={font * 1.15}
              fontWeight="600"
              textAnchor="middle"
              style={{ paintOrder: 'stroke', stroke: '#0f172a', strokeWidth: 3 * upp }}
            >
              {room.name}
            </text>
            <text
              x={room.labelPoint.xIn}
              y={room.labelPoint.yIn + font}
              fill="#cbd5e1"
              fontSize={font * 0.9}
              textAnchor="middle"
              style={{ paintOrder: 'stroke', stroke: '#0f172a', strokeWidth: 3 * upp }}
            >
              {room.missing ? 'not enclosed' : formatArea(room.areaSqIn)}
            </text>
          </g>
        ))}

      {/* Object labels */}
      {layers.labels &&
        objects.map((obj) => {
          if (layers[obj.category] === false) return null;
          return (
            <text
              key={`ol-${obj.id}`}
              x={obj.cxIn}
              y={obj.cyIn + obj.depthIn / 2 + font}
              fill="#e2e8f0"
              fontSize={font * 0.8}
              textAnchor="middle"
              pointerEvents="none"
              style={{ paintOrder: 'stroke', stroke: '#0f172a', strokeWidth: 2.5 * upp }}
            >
              {obj.label}
            </text>
          );
        })}

      {/* In-progress drawing */}
      {draft && draft.kind === 'shell' && draft.points.length > 0 && (
        <g pointerEvents="none">
          <polyline
            points={pointsAttr([...draft.points, draft.cursor].filter(Boolean))}
            fill="rgba(14,165,233,0.12)"
            stroke="#0ea5e9"
            strokeWidth={2 * upp}
            strokeDasharray={`${6 * upp} ${4 * upp}`}
          />
          {draft.points.map((p, i) => (
            <circle key={i} cx={p.xIn} cy={p.yIn} r={4 * upp} fill="#0ea5e9" />
          ))}
          {draft.cursor && draft.points.length > 0 && (
            <text
              x={(draft.points[draft.points.length - 1].xIn + draft.cursor.xIn) / 2}
              y={(draft.points[draft.points.length - 1].yIn + draft.cursor.yIn) / 2 - font}
              fill="#38bdf8"
              fontSize={font}
              textAnchor="middle"
            >
              {formatFtIn(
                Math.hypot(
                  draft.cursor.xIn - draft.points[draft.points.length - 1].xIn,
                  draft.cursor.yIn - draft.points[draft.points.length - 1].yIn
                )
              )}
            </text>
          )}
        </g>
      )}

      {draft && draft.kind === 'wall' && draft.start && draft.cursor && (
        <g pointerEvents="none">
          <line
            x1={draft.start.xIn}
            y1={draft.start.yIn}
            x2={draft.cursor.xIn}
            y2={draft.cursor.yIn}
            stroke="#facc15"
            strokeWidth={draft.thicknessIn || 4.5}
            opacity={0.6}
          />
          <text
            x={(draft.start.xIn + draft.cursor.xIn) / 2}
            y={(draft.start.yIn + draft.cursor.yIn) / 2 - font}
            fill="#facc15"
            fontSize={font}
            textAnchor="middle"
          >
            {formatFtIn(
              Math.hypot(draft.cursor.xIn - draft.start.xIn, draft.cursor.yIn - draft.start.yIn)
            )}
          </text>
        </g>
      )}

      {draft && draft.kind === 'measure' && draft.start && draft.cursor && (
        <g pointerEvents="none">
          <line
            x1={draft.start.xIn}
            y1={draft.start.yIn}
            x2={draft.cursor.xIn}
            y2={draft.cursor.yIn}
            stroke="#22d3ee"
            strokeWidth={1.5 * upp}
            strokeDasharray={`${5 * upp} ${3 * upp}`}
          />
          <text
            x={(draft.start.xIn + draft.cursor.xIn) / 2}
            y={(draft.start.yIn + draft.cursor.yIn) / 2 - font}
            fill="#22d3ee"
            fontSize={font * 1.1}
            textAnchor="middle"
            style={{ paintOrder: 'stroke', stroke: '#0f172a', strokeWidth: 3 * upp }}
          >
            {formatFtIn(
              Math.hypot(draft.cursor.xIn - draft.start.xIn, draft.cursor.yIn - draft.start.yIn),
              { fractions: true }
            )}
          </text>
        </g>
      )}

      {children}

      {draft && draft.kind === 'object' && draft.cursor && draft.preset && (
        <g
          pointerEvents="none"
          transform={`translate(${draft.cursor.xIn} ${draft.cursor.yIn})`}
          opacity={0.6}
        >
          <rect
            x={-draft.preset.widthIn / 2}
            y={-draft.preset.depthIn / 2}
            width={draft.preset.widthIn}
            height={draft.preset.depthIn}
            fill={draft.preset.color}
            stroke="#facc15"
            strokeWidth={1.5 * upp}
          />
        </g>
      )}
    </svg>
  );
}
