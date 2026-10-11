/* Life in the world: gulls circling over the coast, butterflies over the meadows, drifting motes
   of pollen around the walker (fireflies by moonlight), a hot-air balloon crossing the sky, and a
   cat that sits on a yard wall, wanders the village and slips away when you come near.

   Everything is built from a handful of tiny meshes (gulls and butterflies are instanced), moved
   from the CPU a few hundred matrices a frame at the most, never a React state. Under reduced
   motion the animals hold still and the balloon hangs where it is. The cat and the balloon are the
   only things with more than a few triangles. */
import * as THREE from "three";
import { VILLAGE, hashString, seededRandom, type WorldLayout } from "../../data/layout";
import { cpuCanvas } from "../../three/cpuCanvas";
import { toonMaterial, type ToonShared } from "../../three/toon";
import { ball, bar, blend, box, cyl, tone, type Part } from "./kit";
import type { ScenePalette } from "./palette";
import type { Terrain } from "./terrain";
import { clamp, lerpAngle, merge, paint } from "./util";

export interface Life {
  group: THREE.Group;
  update(time: number, dt: number, reduced: boolean, walker: { x: number; z: number }): void;
  dispose(): void;
}

type Own = <T extends { dispose(): void }>(x: T) => T;

const TAU = Math.PI * 2;

/** A soft round sprite for the motes (CPU canvas). */
function moteTexture(): THREE.CanvasTexture {
  const [cv, ctx] = cpuCanvas(32, 32);
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.4, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A flat wing: a triangle fan from the body outward along +x (or -x), with a little chord. */
function wingGeometry(side: 1 | -1, len: number, chord: number, lift = 0): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const pts = [0, 0, chord * 0.5, 0, 0, -chord * 0.5, side * len, lift, -chord * 0.15, 0, 0, chord * 0.5, side * len, lift, -chord * 0.15, side * len * 0.8, lift * 0.8, chord * 0.4];
  g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  g.computeVertexNormals();
  return g;
}

function balloonParts(p: ScenePalette): Part[] {
  const colors = [p.awning, blend(p.cloud, p.wallCream, 0.4), p.flag, blend(p.shutter, p.cloud, 0.2), p.roofRose, blend(p.cloud, p.wallCream, 0.4)];
  const parts: Part[] = [];
  const gores = 12;
  const r = 6;
  for (let i = 0; i < gores; i++) {
    const g = new THREE.SphereGeometry(r, 3, 10, (i / gores) * TAU, TAU / gores, 0, Math.PI * 0.78).scale(1, 1.18, 1).translate(0, 14.5, 0);
    parts.push(paint(g, colors[i % colors.length]));
  }
  // The skirt, the burner, the ropes and the basket.
  parts.push(cyl(2.2, 4.6, 2.2, 12, 0, 7.4, 0, tone(p.roofSlate, 0.9)), box(2.0, 1.4, 2.0, 0, 0.0, 0, blend(p.trunk, p.wallCream, 0.2)), box(2.2, 0.16, 2.2, 0, 1.4, 0, tone(p.trunk, 0.8)), ball(0.45, 0, 5.4, 0, p.flag));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(bar(new THREE.Vector3(sx * 0.95, 1.4, sz * 0.95), new THREE.Vector3(sx * 2.0, 7.6, sz * 2.0), 0.07, tone(p.trunk, 0.7)));
  return parts;
}

function catParts(fur: THREE.Color, p: ScenePalette): { body: Part[]; tail: Part[] } {
  const dark = tone(fur, 0.7);
  const light = blend(fur, p.cloud, 0.55);
  const body: Part[] = [
    paint(new THREE.IcosahedronGeometry(0.34, 1).scale(0.9, 0.78, 1.5).translate(0, 0.38, 0), fur),
    paint(new THREE.IcosahedronGeometry(0.24, 1).translate(0, 0.62, 0.52), fur),
    paint(new THREE.ConeGeometry(0.09, 0.2, 4).translate(-0.13, 0.9, 0.5), dark),
    paint(new THREE.ConeGeometry(0.09, 0.2, 4).translate(0.13, 0.9, 0.5), dark),
    ball(0.07, -0.09, 0.66, 0.73, p.tree, 1.2),
    ball(0.07, 0.09, 0.66, 0.73, p.tree, 1.2),
    ball(0.05, 0, 0.58, 0.77, tone(p.roofRose, 0.9)),
    paint(new THREE.IcosahedronGeometry(0.2, 0).scale(1, 0.8, 1.1).translate(0, 0.28, 0.38), light),
  ];
  for (const sx of [-1, 1]) for (const z of [-0.3, 0.35]) body.push(box(0.12, 0.28, 0.14, sx * 0.17, 0.02, z, z > 0 ? light : fur));
  for (let i = 0; i < 3; i++) body.push(box(0.4, 0.02, 0.02, 0, 0.6 + i * 0.035, 0.74, light));
  const tail: Part[] = [];
  let prev = new THREE.Vector3(0, 0.45, -0.45);
  for (let i = 1; i <= 4; i++) {
    const t = i / 4;
    const next = new THREE.Vector3(0, 0.45 + 0.65 * Math.sin(t * 1.5), -0.45 - 0.4 * t - 0.15 * Math.sin(t * 1.5));
    tail.push(bar(prev, next, 0.1 - t * 0.02, i === 4 ? dark : fur));
    prev = next;
  }
  return { body, tail };
}

export function buildLife(layout: WorldLayout, terrain: Terrain, p: ScenePalette, own: Own, toon: ToonShared, coarse: boolean): Life {
  const group = new THREE.Group();
  group.name = "life";
  const rand = seededRandom(hashString("walk-life"));
  const R = layout.islandRadius;
  const ground = (x: number, z: number) => Math.max(0, terrain.heightAt(x, z));
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const tmp = new THREE.Vector3();
  const updaters: ((time: number, dt: number, reduced: boolean, walker: { x: number; z: number }) => void)[] = [];

  /* ---------------- gulls ---------------- */
  {
    const n = coarse ? 7 : 12;
    const mat = own(new THREE.MeshBasicMaterial({ color: p.dark ? tone(p.cloud, 0.7) : WHITE_CREAM, side: THREE.DoubleSide, fog: true }));
    const wingL = new THREE.InstancedMesh(own(wingGeometry(-1, 1.5, 0.55, 0.1)), mat, n);
    const wingR = new THREE.InstancedMesh(own(wingGeometry(1, 1.5, 0.55, 0.1)), mat, n);
    const bodyGeo = own(new THREE.IcosahedronGeometry(0.28, 0).scale(0.7, 0.6, 1.8));
    const bodies = new THREE.InstancedMesh(bodyGeo, own(new THREE.MeshBasicMaterial({ color: blend(p.cloud, p.rock, 0.2), fog: true })), n);
    for (const m of [wingL, wingR, bodies]) {
      m.frustumCulled = false;
      group.add(m);
      own(m);
    }
    const birds = Array.from({ length: n }, () => ({
      r: R * (0.55 + rand() * 0.55),
      a: rand() * TAU,
      w: (rand() < 0.5 ? -1 : 1) * (0.03 + rand() * 0.04),
      h: 26 + rand() * 24,
      f: 2.2 + rand() * 1.6,
      ph: rand() * TAU,
    }));
    const base = new THREE.Matrix4();
    const roll = new THREE.Matrix4();
    const flapM = new THREE.Matrix4();
    updaters.push((time, _dt, reduced) => {
      const t = reduced ? 0 : time;
      birds.forEach((b, i) => {
        const a = b.a + t * b.w;
        pos.set(Math.cos(a) * b.r, b.h + Math.sin(t * 0.25 + b.ph) * 2.5, Math.sin(a) * b.r);
        // Heading along the circle; banking into the turn.
        const yaw = Math.atan2(-Math.sin(a) * Math.sign(b.w), Math.cos(a) * Math.sign(b.w)) + Math.PI / 2;
        const flap = reduced ? 0.25 : Math.sin(t * b.f * TAU * 0.5 + b.ph) * 0.55 + (Math.sin(t * 0.3 + b.ph) > 0.4 ? 0 : 0.15);
        const bank = -0.22 * Math.sign(b.w);
        e.set(0, yaw, 0);
        q.setFromEuler(e);
        base.compose(pos, q, one);
        bodies.setMatrixAt(i, base);
        roll.makeRotationZ(bank);
        wingL.setMatrixAt(i, m4.copy(base).multiply(roll).multiply(flapM.makeRotationZ(-flap)));
        wingR.setMatrixAt(i, m4.copy(base).multiply(roll).multiply(flapM.makeRotationZ(flap)));
      });
      for (const m of [wingL, wingR, bodies]) m.instanceMatrix.needsUpdate = true;
    });
  }

  /* ---------------- butterflies over the meadows ---------------- */
  {
    const n = coarse ? 22 : 40;
    const wingGeo = own(merge([paint(wingGeometry(-1, 0.28, 0.26, 0.08), WHITE_CREAM), paint(wingGeometry(1, 0.28, 0.26, 0.08), WHITE_CREAM)]));
    const mesh = new THREE.InstancedMesh(wingGeo, own(new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, vertexColors: false })), n);
    mesh.frustumCulled = false;
    const colors = [p.flag, p.awning, p.windowLight, p.roofRose, p.shutter, p.wallCream];
    const homes: { x: number; z: number; ph: number; sp: number; rr: number }[] = [];
    let guard = 0;
    while (homes.length < n && guard++ < n * 50) {
      const a = rand() * TAU;
      const r = VILLAGE.outer + 4 + rand() * (R - VILLAGE.outer - 22);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (terrain.heightAt(x, z) < -0.1) continue;
      homes.push({ x, z, ph: rand() * TAU, sp: 0.5 + rand() * 0.7, rr: 2 + rand() * 3.5 });
    }
    // A few over the village's yards too.
    for (let i = 0; i < Math.min(6, n); i++) {
      const a = rand() * TAU;
      homes[i] = { x: Math.cos(a) * (VILLAGE.houseInner - 1), z: Math.sin(a) * (VILLAGE.houseInner - 1), ph: rand() * TAU, sp: 0.6 + rand() * 0.5, rr: 3 };
    }
    homes.forEach((_, i) => mesh.setColorAt(i, colors[i % colors.length]));
    group.add(mesh);
    own(mesh);
    updaters.push((time, _dt, reduced) => {
      const t = reduced ? 0 : time;
      homes.forEach((h, i) => {
        const a = t * h.sp + h.ph;
        const x = h.x + Math.cos(a) * h.rr + Math.sin(a * 2.3) * 1.2;
        const z = h.z + Math.sin(a * 0.9) * h.rr + Math.cos(a * 1.7) * 1.2;
        const y = ground(x, z) + 1.3 + Math.sin(a * 1.6) * 0.6;
        const yaw = Math.atan2(-Math.sin(a) * h.rr, Math.cos(a) * h.rr);
        e.set(0.12, yaw, Math.sin(a * 3.1) * 0.2);
        q.setFromEuler(e);
        const flap = reduced ? 0.8 : 0.25 + Math.abs(Math.cos(t * 11 + h.ph)) * 0.75;
        mesh.setMatrixAt(i, m4.compose(pos.set(x, y, z), q, tmp.set(flap, 1, 1)));
      });
      mesh.instanceMatrix.needsUpdate = true;
    });
  }

  /* ---------------- motes around the walker: pollen by day, fireflies by night ---------------- */
  {
    const n = coarse ? 36 : 64;
    const span = 30;
    const geo = own(new THREE.BufferGeometry());
    const arr = new Float32Array(n * 3);
    geo.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    const tex = own(moteTexture());
    const mat = own(new THREE.PointsMaterial({ size: p.dark ? 0.5 : 0.3, map: tex, transparent: true, depthWrite: false, opacity: p.dark ? 0.95 : 0.7, color: p.dark ? p.flag : WHITE_CREAM, sizeAttenuation: true, fog: false }));
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    group.add(pts);
    const seeds = Array.from({ length: n }, () => ({ x: rand() * span, y: rand(), z: rand() * span, vx: (rand() - 0.5) * 0.5, vz: (rand() - 0.5) * 0.5, ph: rand() * TAU }));
    updaters.push((time, _dt, reduced, walker) => {
      const t = reduced ? 0 : time;
      const gy = ground(walker.x, walker.z);
      seeds.forEach((s, i) => {
        // Each mote lives in a box that follows the walker (wrapped), so the air around them is always dusted.
        const bx = s.x + t * (0.35 + s.vx) + Math.sin(t * 0.6 + s.ph) * 0.8;
        const bz = s.z + t * (0.2 + s.vz) + Math.cos(t * 0.5 + s.ph) * 0.8;
        const x = walker.x + ((((bx - walker.x) % span) + span + span / 2) % span) - span / 2;
        const z = walker.z + ((((bz - walker.z) % span) + span + span / 2) % span) - span / 2;
        arr[i * 3] = x;
        arr[i * 3 + 1] = gy + 0.5 + s.y * 6 + Math.sin(t * 0.8 + s.ph) * 0.5;
        arr[i * 3 + 2] = z;
      });
      geo.attributes.position.needsUpdate = true;
    });
  }

  /* ---------------- the hot-air balloon ---------------- */
  {
    const mat = own(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
    const mesh = new THREE.Mesh(own(merge(balloonParts(p))), mat);
    mesh.scale.setScalar(1.5);
    mesh.frustumCulled = false;
    group.add(mesh);
    const r = R * 0.62;
    const ph = rand() * TAU;
    updaters.push((time, _dt, reduced) => {
      const t = reduced ? 0 : time;
      const a = ph + t * 0.011;
      mesh.position.set(Math.cos(a) * r, 52 + Math.sin(t * 0.2) * 2.5, Math.sin(a) * r);
      mesh.rotation.y = t * 0.03;
    });
  }

  /* ---------------- the cat ---------------- */
  {
    const fur = blend(p.roofCoral, p.flag, 0.45);
    const parts = catParts(fur, p);
    const catMat = own(toonMaterial({ vertexColors: true, flatShading: true }, { shared: toon }));
    const bodyMesh = new THREE.Mesh(own(merge(parts.body)), catMat);
    const tailMesh = new THREE.Mesh(own(merge(parts.tail)), catMat);
    bodyMesh.castShadow = tailMesh.castShadow = true;
    const cat = new THREE.Group();
    cat.add(bodyMesh);
    tailMesh.position.set(0, 0, 0);
    cat.add(tailMesh);
    cat.scale.setScalar(1.15);
    group.add(cat);
    // Waypoints on the yards' edge and the street's shoulder.
    const way: { x: number; z: number }[] = [];
    const r0 = VILLAGE.houseInner - 1.0;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + rand() * 0.3;
      way.push({ x: Math.cos(a) * r0, z: Math.sin(a) * r0 });
    }
    const st = { x: way[0].x, z: way[0].z, heading: 0, target: 0, wait: 3, state: "sit" as "sit" | "walk" | "flee", sit: 1, phase: 0 };
    updaters.push((time, dt, reduced, walker) => {
      const near = Math.hypot(walker.x - st.x, walker.z - st.z);
      if (!reduced) {
        if (st.state !== "flee" && near < 3.4) {
          // Slip away from the walker to the waypoint farthest from them.
          let best = 0;
          let bd = -1;
          way.forEach((w, i) => {
            const d = Math.hypot(w.x - walker.x, w.z - walker.z);
            if (d > bd) {
              bd = d;
              best = i;
            }
          });
          st.target = best;
          st.state = "flee";
        }
        if (st.state === "sit") {
          st.wait -= dt;
          if (st.wait <= 0) {
            const c = way.map((w, i) => ({ i, d: Math.hypot(w.x - st.x, w.z - st.z) })).filter((o) => o.d > 3 && o.d < 26);
            st.target = (c.length ? c[Math.floor(rand() * c.length)] : { i: 0 }).i;
            st.state = "walk";
          }
        } else {
          const w = way[st.target];
          const dx = w.x - st.x;
          const dz = w.z - st.z;
          const d = Math.hypot(dx, dz);
          const speed = st.state === "flee" ? 5.2 : 1.3;
          if (d < 0.4) {
            st.state = "sit";
            st.wait = 5 + rand() * 9;
          } else {
            st.heading = lerpAngle(st.heading, Math.atan2(dx, dz), clamp(dt * 8, 0, 1));
            st.x += Math.sin(st.heading) * speed * dt;
            st.z += Math.cos(st.heading) * speed * dt;
            st.phase += dt * speed * 4.5;
          }
        }
      }
      const sitting = st.state === "sit";
      st.sit += ((sitting ? 1 : 0) - st.sit) * clamp(dt * 6, 0, 1);
      const bob = sitting || reduced ? 0 : Math.abs(Math.sin(st.phase)) * 0.06;
      cat.position.set(st.x, ground(st.x, st.z) + bob, st.z);
      cat.rotation.y = st.heading;
      // Sitting: the body tips up on its haunches; walking: level and long.
      bodyMesh.rotation.x = -0.45 * st.sit;
      bodyMesh.position.y = 0.12 * st.sit;
      tailMesh.rotation.y = reduced ? 0 : Math.sin(time * (sitting ? 1.3 : 3)) * (sitting ? 0.5 : 0.25);
      tailMesh.position.y = 0.1 * st.sit;
    });
  }

  return {
    group,
    update(time, dt, reduced, walker) {
      for (const u of updaters) u(time, dt, reduced, walker);
    },
    dispose() {},
  };
}

const WHITE_CREAM = new THREE.Color("#fff6e4");
