import { useEffect, useRef, useState } from 'react';
import { polygonEdges, offsetPolygon, bbox } from '../geometry.js';

// Three.js is a heavy dependency, so it's only pulled in when this view opens.
let threePromise = null;
function loadThree() {
  if (!threePromise) {
    threePromise = Promise.all([
      import('three'),
      import('three/examples/jsm/controls/OrbitControls.js'),
    ]).then(([THREE, controls]) => ({ THREE, OrbitControls: controls.OrbitControls }));
  }
  return threePromise;
}

const FT = 12; // plan units are inches; the 3D scene works in feet

export default function Preview3D({ plan, computedRooms }) {
  const mountRef = useRef(null);
  const stateRef = useRef(null);
  const [error, setError] = useState(null);
  const [ready, setReady] = useState(false);

  // Set up renderer / camera / controls once.
  useEffect(() => {
    let disposed = false;
    const mount = mountRef.current;
    if (!mount) return undefined;

    loadThree()
      .then(({ THREE, OrbitControls }) => {
        if (disposed || !mountRef.current) return;
        const width = mount.clientWidth || 800;
        const height = mount.clientHeight || 500;

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(width, height);
        renderer.setClearColor(0x0b0b10);
        mount.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        scene.fog = new THREE.Fog(0x0b0b10, 60, 220);

        const camera = new THREE.PerspectiveCamera(50, width / height, 0.5, 1000);
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.maxPolarAngle = Math.PI / 2.05;

        scene.add(new THREE.AmbientLight(0xffffff, 0.55));
        const hemi = new THREE.HemisphereLight(0xbcd8ff, 0x2a2a35, 0.7);
        scene.add(hemi);
        const dir = new THREE.DirectionalLight(0xffffff, 0.8);
        dir.position.set(40, 60, 20);
        scene.add(dir);

        const content = new THREE.Group();
        scene.add(content);

        let raf = 0;
        const animate = () => {
          raf = requestAnimationFrame(animate);
          controls.update();
          renderer.render(scene, camera);
        };
        animate();

        const ro = new ResizeObserver(() => {
          const w = mount.clientWidth;
          const h = mount.clientHeight;
          if (!w || !h) return;
          renderer.setSize(w, h);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
        });
        ro.observe(mount);

        stateRef.current = { THREE, renderer, scene, camera, controls, content, ro, raf, framed: false };
        setReady(true);
      })
      .catch((e) => setError(e.message || 'Failed to load 3D view'));

    return () => {
      disposed = true;
      const s = stateRef.current;
      if (s) {
        cancelAnimationFrame(s.raf);
        s.ro.disconnect();
        s.controls.dispose();
        s.renderer.dispose();
        if (s.renderer.domElement.parentNode) {
          s.renderer.domElement.parentNode.removeChild(s.renderer.domElement);
        }
        stateRef.current = null;
      }
    };
  }, []);

  // Rebuild geometry whenever the plan changes.
  useEffect(() => {
    const s = stateRef.current;
    if (!s || !ready || !plan) return;
    const { THREE, content } = s;

    while (content.children.length) {
      const child = content.children.pop();
      child.traverse?.((n) => {
        n.geometry?.dispose?.();
        if (Array.isArray(n.material)) n.material.forEach((m) => m.dispose());
        else n.material?.dispose?.();
      });
    }

    const shell = plan.design.shellPoints;
    const box = bbox(shell);
    const cx = (box.minX + box.maxX) / 2 / FT;
    const cz = (box.minY + box.maxY) / 2 / FT;
    const defaultCeiling = plan.design.defaultCeilingHeightIn;

    const addBox = (w, h, d, x, y, z, rotY, color, opts = {}) => {
      const geom = new THREE.BoxGeometry(w, h, d);
      const mat = new THREE.MeshLambertMaterial({
        color,
        transparent: opts.opacity != null,
        opacity: opts.opacity ?? 1,
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(x - cx, y, z - cz);
      if (rotY) mesh.rotation.y = rotY;
      content.add(mesh);
      return mesh;
    };

    // Floor slab
    const floorShape = new THREE.Shape(
      shell.map((p) => new THREE.Vector2(p.xIn / FT, p.yIn / FT))
    );
    const floorGeom = new THREE.ShapeGeometry(floorShape);
    const floor = new THREE.Mesh(
      floorGeom,
      new THREE.MeshLambertMaterial({ color: 0x1c2333, side: THREE.DoubleSide })
    );
    floor.rotation.x = Math.PI / 2;
    floor.position.set(-cx, 0, -cz);
    // ShapeGeometry is built in XY; after rotating into XZ, Z needs flipping.
    floor.scale.z = -1;
    content.add(floor);

    // Room colour patches
    for (const room of computedRooms) {
      if (room.missing) continue;
      const color = new THREE.Color(room.color);
      for (const r of room.rects) {
        const mesh = addBox(
          r.widthIn / FT,
          0.05,
          r.heightIn / FT,
          (r.xIn + r.widthIn / 2) / FT,
          0.03,
          (r.yIn + r.heightIn / 2) / FT,
          0,
          color,
          { opacity: 0.55 }
        );
        mesh.material.opacity = 0.55;
      }
    }

    // Walls, split around their openings
    const buildWall = (x1, y1, x2, y2, thicknessIn, heightIn, openings, color, extend) => {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy);
      if (len < 0.5) return;
      const ux = dx / len;
      const uy = dy / len;
      const rotY = -Math.atan2(dy, dx);

      const sorted = [...openings].sort((a, b) => a.offsetIn - b.offsetIn);
      const pieces = [];
      let cursor = 0;
      for (const op of sorted) {
        const start = Math.max(0, Math.min(len, op.offsetIn));
        const end = Math.max(0, Math.min(len, op.offsetIn + op.widthIn));
        if (start > cursor) pieces.push({ a: cursor, b: start, yBottom: 0, yTop: heightIn });
        const head = op.sillIn + op.heightIn;
        if (op.sillIn > 0) pieces.push({ a: start, b: end, yBottom: 0, yTop: op.sillIn });
        if (head < heightIn) pieces.push({ a: start, b: end, yBottom: head, yTop: heightIn });
        cursor = Math.max(cursor, end);
      }
      if (cursor < len) pieces.push({ a: cursor, b: len, yBottom: 0, yTop: heightIn });

      for (const piece of pieces) {
        let a = piece.a;
        let b = piece.b;
        // Overlap corners slightly so exterior walls meet cleanly.
        if (extend) {
          if (a === 0) a -= thicknessIn;
          if (b === len) b += thicknessIn;
        }
        const segLen = b - a;
        if (segLen <= 0.1) continue;
        const mid = (a + b) / 2;
        const px = x1 + ux * mid;
        const py = y1 + uy * mid;
        addBox(
          segLen / FT,
          (piece.yTop - piece.yBottom) / FT,
          thicknessIn / FT,
          px / FT,
          (piece.yBottom + (piece.yTop - piece.yBottom) / 2) / FT,
          py / FT,
          rotY,
          color
        );
      }
    };

    // Exterior walls sit outside the shell line, which is the interior face.
    const outer = offsetPolygon(shell, plan.design.extWallThicknessIn);
    polygonEdges(shell).forEach((edge, i) => {
      const o1 = outer[i];
      const o2 = outer[(i + 1) % outer.length];
      const midInnerX = (edge.x1In + edge.x2In) / 2;
      const midInnerY = (edge.y1In + edge.y2In) / 2;
      const midOuterX = (o1.xIn + o2.xIn) / 2;
      const midOuterY = (o1.yIn + o2.yIn) / 2;
      const centerX = (midInnerX + midOuterX) / 2;
      const centerY = (midInnerY + midOuterY) / 2;
      const offX = centerX - midInnerX;
      const offY = centerY - midInnerY;
      const ops = plan.openings.filter((op) => op.hostType === 'shell' && op.hostId === edge.index);
      buildWall(
        edge.x1In + offX,
        edge.y1In + offY,
        edge.x2In + offX,
        edge.y2In + offY,
        plan.design.extWallThicknessIn,
        defaultCeiling,
        ops,
        0x6b7280,
        true
      );
    });

    for (const wall of plan.walls) {
      const ops = plan.openings.filter((op) => op.hostType === 'wall' && op.hostId === wall.id);
      buildWall(
        wall.x1In,
        wall.y1In,
        wall.x2In,
        wall.y2In,
        wall.thicknessIn,
        wall.heightIn || defaultCeiling,
        ops,
        0x8b95a5,
        false
      );
    }

    // Objects
    for (const obj of plan.objects) {
      addBox(
        obj.widthIn / FT,
        Math.max(obj.heightIn, 1) / FT,
        obj.depthIn / FT,
        obj.cxIn / FT,
        (obj.elevationIn + Math.max(obj.heightIn, 1) / 2) / FT,
        obj.cyIn / FT,
        (-obj.rotationDeg * Math.PI) / 180,
        new THREE.Color(obj.color)
      );
    }

    if (!s.framed) {
      const span = Math.max(box.width, box.height) / FT;
      s.camera.position.set(span * 0.75, span * 0.85, span * 1.05);
      s.controls.target.set(0, 3, 0);
      s.controls.update();
      s.framed = true;
    }
  }, [plan, computedRooms, ready]);

  if (error) {
    return <div className="loading">3D preview unavailable: {error}</div>;
  }

  return (
    <div className="preview3d" ref={mountRef}>
      {!ready && <div className="loading">Loading 3D…</div>}
    </div>
  );
}
