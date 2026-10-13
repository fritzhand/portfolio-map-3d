/* Wayfinding: a fingerpost where each road leaves the plaza (an arm along the road to the area it
   leads to, with the time it takes to walk there, and an arm back to the hub), and a "Walking times"
   board beside the spawn that lists every area with an arrow toward it and its walking time, so an
   arrival knows at once what is where and how far.

   fingerposts() and directoryFor() decide where they stand and what they say from the layout alone
   (pure: wayfinding.test.ts). The posts and the board are faceted parts (kit.ts) in the village's
   style; their words are painted labels (labelTexture), unlit like the arches' signs, and the arrows
   and color dots are unlit too, so they read the same in any light. */
import * as THREE from "three";
import { PLAZA_RADIUS, ROAD_WIDTH, WALK_SPEED, type AreaSlug, type WorldLayout } from "../../data/layout";
import { labelTexture } from "../../three/logoTexture";
import { blend, box, cyl, gable, tone, type Part } from "./kit";
import type { ScenePalette } from "./palette";
import { merge, paint, withNearFade } from "./util";
import type { AreaLook, BoxCollider, Collider } from "./world";

/** How far in from the plaza's edge a fingerpost stands, and how far beside the road. */
const POST_IN = 1.6;
const POST_ASIDE = ROAD_WIDTH / 2 + 1.5;
/** The fingerposts' arms: the district's at this height, the hub's below it. */
const ARM_Y = [2.55, 2.0] as const;
const ARM_H = 0.42;

/** Where the road to a disc leaves the plaza, and where the area begins (its entry arch). */
function road(disc: WorldLayout["discs"][number]): { ux: number; uz: number; mouth: number; entry: number } {
  return { ux: Math.cos(disc.angle), uz: Math.sin(disc.angle), mouth: PLAZA_RADIUS, entry: Math.hypot(disc.x, disc.z) - disc.r + 0.2 };
}

/**
 * Seconds on foot from (x, z) to an area's entry: to the mouth of its road on the plaza, then along
 * the road, at walking pace, rounded to 5 seconds (at least 5).
 */
export function walkSeconds(layout: WorldLayout, slug: AreaSlug, x: number, z: number): number {
  const disc = layout.discs.find((d) => d.slug === slug);
  if (!disc) return 0;
  const r = road(disc);
  // Already out on the road: what is left of it. Anywhere else: across the plaza to the road, then along it.
  const along = x * r.ux + z * r.uz;
  const aside = Math.abs(-x * r.uz + z * r.ux);
  const meters = along >= r.mouth && aside <= ROAD_WIDTH ? Math.max(0, r.entry - along) : Math.hypot(x - r.ux * r.mouth, z - r.uz * r.mouth) + (r.entry - r.mouth);
  return Math.max(5, Math.round(meters / WALK_SPEED / 5) * 5);
}

export interface Arm {
  /** The area the arm points to, or null for the hub. */
  slug: AreaSlug | null;
  /** The arm's direction in the ground plane (radians from +x toward +z). */
  heading: number;
  /** Walking seconds to the area (null on the hub's arm). */
  seconds: number | null;
}

export interface Fingerpost {
  x: number;
  z: number;
  arms: Arm[];
}

/** One fingerpost where each area's road leaves the plaza, beside the road: an arm out along it, an arm back to the hub. */
export function fingerposts(layout: WorldLayout): Fingerpost[] {
  return layout.discs.map((disc) => {
    const r = road(disc);
    const along = PLAZA_RADIUS - POST_IN;
    // Beside the road on its counter-clockwise side.
    const x = r.ux * along - r.uz * POST_ASIDE;
    const z = r.uz * along + r.ux * POST_ASIDE;
    return {
      x,
      z,
      arms: [
        { slug: disc.slug, heading: disc.angle, seconds: walkSeconds(layout, disc.slug, x, z) },
        { slug: null, heading: Math.atan2(-z, -x), seconds: null },
      ],
    };
  });
}

export interface DirectoryRow {
  slug: AreaSlug;
  seconds: number;
  /** Where the area lies for someone reading the board: 0 straight ahead (through the board), positive to the right. */
  bearing: number;
}

export interface Directory {
  x: number;
  z: number;
  /** three.js rotation.y: the board's face (+z) toward the arriving walker. */
  yaw: number;
  rows: DirectoryRow[];
}

/**
 * The board's place: ahead of the spawn and to its left, turned toward it, clear of the walk to the
 * hub, and near enough the middle of the arrival's view to be in it on a phone held upright too.
 */
export const DIRECTORY_AT = { ahead: 9.5, left: 3.9 } as const;

/** The "Walking times" board beside the spawn: every area, from the reader's left to right. */
export function directoryFor(layout: WorldLayout): Directory {
  const s = layout.spawn;
  // The walker faces (sin f, cos f); with y up, their left is (cos f, -sin f).
  const fx = Math.sin(s.facing);
  const fz = Math.cos(s.facing);
  const lx = fz;
  const lz = -fx;
  const x = s.x + fx * DIRECTORY_AT.ahead + lx * DIRECTORY_AT.left;
  const z = s.z + fz * DIRECTORY_AT.ahead + lz * DIRECTORY_AT.left;
  const yaw = Math.atan2(s.x - x, s.z - z);
  // Someone reading the board looks through it: their forward is the board's back (-z), their right its +x.
  const ax = -Math.sin(yaw);
  const az = -Math.cos(yaw);
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);
  const rows = layout.discs.map((disc) => {
    const dx = disc.x - x;
    const dz = disc.z - z;
    return { slug: disc.slug, seconds: walkSeconds(layout, disc.slug, x, z), bearing: Math.atan2(dx * rx + dz * rz, dx * ax + dz * az) };
  });
  rows.sort((a, b) => a.bearing - b.bearing);
  return { x, z, yaw, rows };
}

/** "12 s", the way the signs say it. */
export const secondsText = (s: number) => `${s} s`;

/* ------------------------------------------------------------------ the builder */

type Own = <T extends { dispose(): void }>(x: T) => T;

export interface Wayfinding {
  group: THREE.Group;
  colliders: Collider[];
  boxes: BoxCollider[];
}

/** A flat arrow pointing up (+y) in the board's plane, centered at the origin. */
function arrow(color: THREE.Color): Part[] {
  const head = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.15, 0.02, 0), new THREE.Vector3(0.15, 0.02, 0), new THREE.Vector3(0, 0.18, 0)]);
  head.computeVertexNormals();
  return [paint(head, color), paint(new THREE.BoxGeometry(0.08, 0.2, 0.01).translate(0, -0.08, 0), color)];
}

export function buildWayfinding(
  layout: WorldLayout,
  areas: readonly AreaLook[],
  hubLabel: string,
  p: ScenePalette,
  own: Own,
  materials: { prop: () => THREE.Material; nearFade: { value: THREE.Vector2 } },
): Wayfinding {
  const group = new THREE.Group();
  group.name = "wayfinding";
  const colliders: Collider[] = [];
  const boxes: BoxCollider[] = [];
  const bySlug = new Map(areas.map((a) => [a.slug, a]));
  const wood = p.trunk;
  const cream = blend(p.wallCream, p.cloud, 0.55);
  const ink = new THREE.Color(p.css.ink);
  const solid: Part[] = [];
  const unlit: Part[] = [];
  const m4 = new THREE.Matrix4();
  const stand = (into: Part[], parts: Part[], x: number, y: number, z: number, yaw: number) => {
    m4.makeRotationY(yaw).setPosition(x, y, z);
    for (const g of parts) into.push(g.applyMatrix4(m4));
  };
  // One material per label (each has its own texture); labels with the same words share one.
  const labelMats = new Map<string, { mat: THREE.Material; aspect: number }>();
  const labelFor = (text: string, size = 52) => {
    const key = `${size}|${text}`;
    let hit = labelMats.get(key);
    if (!hit) {
      const l = labelTexture(text, { color: p.css.ink, size, weight: 700, padX: 18 });
      own(l.texture); // cached as bytes; disposing frees this renderer's copy only
      hit = { mat: own(withNearFade(new THREE.MeshBasicMaterial({ map: l.texture, transparent: true, toneMapped: false }), materials.nearFade)), aspect: l.aspect };
      labelMats.set(key, hit);
    }
    return hit;
  };
  const plane = (w: number, h: number) => own(new THREE.PlaneGeometry(w, h));
  const text = (label: { mat: THREE.Material; aspect: number }, h: number, matrix: THREE.Matrix4) => {
    const m = new THREE.Mesh(plane(h * label.aspect, h), label.mat);
    m.applyMatrix4(matrix);
    m.renderOrder = 2;
    group.add(m);
    return m;
  };

  /* ---------------- fingerposts ---------------- */
  for (const post of fingerposts(layout)) {
    stand(solid, [cyl(0.09, 0.12, 3.15, 6, 0, 0, 0, tone(wood, 0.85)), cyl(0.2, 0.24, 0.14, 6, 0, 0, 0, tone(wood, 0.6)), cyl(0.0, 0.16, 0.3, 6, 0, 3.15, 0, tone(wood, 0.7))], post.x, 0, post.z, 0);
    colliders.push({ x: post.x, z: post.z, r: 0.3, h: 3.4 });
    post.arms.forEach((arm, i) => {
      const area = arm.slug ? bySlug.get(arm.slug) : null;
      if (arm.slug && !area) return;
      const words = area ? `${area.short}  ${secondsText(arm.seconds ?? 0)}` : hubLabel;
      const label = labelFor(words, 52);
      const textW = ARM_H * 0.78 * label.aspect;
      const len = textW + 0.55;
      const color = area ? new THREE.Color(area.color) : tone(wood, 0.9);
      // The arm, in its own frame along +x from the post: a cream board with a pointed tip in the area's color.
      const parts: Part[] = [box(len, ARM_H, 0.08, 0.12 + len / 2, -ARM_H / 2, 0, cream)];
      const tip = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0.12 + len, ARM_H / 2, 0.05),
        new THREE.Vector3(0.12 + len, -ARM_H / 2, 0.05),
        new THREE.Vector3(0.12 + len + 0.3, 0, 0.05),
        // The back face, wound the other way so it faces -z.
        new THREE.Vector3(0.12 + len, -ARM_H / 2, -0.05),
        new THREE.Vector3(0.12 + len, ARM_H / 2, -0.05),
        new THREE.Vector3(0.12 + len + 0.3, 0, -0.05),
      ]);
      tip.computeVertexNormals();
      parts.push(paint(tip, color), box(0.14, ARM_H, 0.1, 0.12 + len - 0.07, -ARM_H / 2, 0, color));
      const yaw = Math.atan2(-Math.sin(arm.heading), Math.cos(arm.heading));
      stand(solid, parts, post.x, ARM_Y[i], post.z, yaw);
      // The words on both faces, each reading the right way round.
      for (const side of [1, -1]) {
        const m = new THREE.Matrix4()
          .makeRotationY(yaw)
          .setPosition(post.x, ARM_Y[i], post.z)
          .multiply(new THREE.Matrix4().makeTranslation(0.12 + (len - 0.14) / 2, 0, side * 0.045))
          .multiply(new THREE.Matrix4().makeRotationY(side > 0 ? 0 : Math.PI));
        text(label, ARM_H * 0.78, m);
      }
    });
  }

  /* ---------------- the "Walking times" board ---------------- */
  {
    const dir = directoryFor(layout);
    const rows = dir.rows.filter((r) => bySlug.has(r.slug));
    const rowH = 0.44;
    const width = 3.2;
    const bottom = 0.9;
    const titleH = 0.58;
    const height = titleH + rows.length * rowH + 0.36;
    const parts: Part[] = [];
    for (const x of [-width / 2 - 0.12, width / 2 + 0.12]) parts.push(box(0.2, bottom + height + 0.25, 0.2, x, 0, -0.05, tone(wood, 0.85)));
    parts.push(box(width + 0.36, height + 0.2, 0.14, 0, bottom - 0.1, -0.08, tone(wood, 0.75)));
    parts.push(gable(0.75, width + 0.9, 0.42, 0, bottom + height + 0.22, -0.05, p.roofSlate, tone(wood, 0.8), { ridgeX: true, overhang: 0.12 }));
    stand(solid, parts, dir.x, 0, dir.z, dir.yaw);
    // The face is a painted sign: unlit, like the arches', so it reads the same in any light.
    const face = [box(width, height, 0.06, 0, bottom, 0.02, blend(p.wallCream, p.cloud, 0.7))];
    stand(unlit, face, dir.x, 0, dir.z, dir.yaw);
    boxes.push({ x: dir.x, z: dir.z, hx: width / 2 + 0.35, hz: 0.3, rot: dir.yaw, h: bottom + height + 0.7 });
    const at = (lx: number, ly: number, lz: number, spin = 0) =>
      new THREE.Matrix4().makeRotationY(dir.yaw).setPosition(dir.x, 0, dir.z).multiply(new THREE.Matrix4().makeTranslation(lx, ly, lz)).multiply(new THREE.Matrix4().makeRotationZ(spin));
    const top = bottom + height;
    text(labelFor("Walking times", 60), titleH * 0.72, at(0, top - titleH / 2 - 0.08, 0.07));
    rows.forEach((row, i) => {
      const area = bySlug.get(row.slug)!;
      const y = top - titleH - 0.1 - rowH * (i + 0.5);
      const label = labelFor(`${area.short}  ${secondsText(row.seconds)}`, 52);
      const h = rowH * 0.68;
      const w = h * label.aspect;
      const left = -width / 2 + 0.95;
      text(label, h, at(left + w / 2, y, 0.07));
      // The arrow toward the area, turned from "straight ahead" (up) by its bearing; then its color.
      const a = arrow(ink);
      for (const g of a) g.applyMatrix4(at(-width / 2 + 0.3, y, 0.07, -row.bearing));
      unlit.push(...a);
      unlit.push(paint(new THREE.CylinderGeometry(0.115, 0.115, 0.02, 14).rotateX(Math.PI / 2).applyMatrix4(at(-width / 2 + 0.68, y, 0.065)), new THREE.Color(area.color)));
    });
  }

  if (solid.length) {
    const mesh = new THREE.Mesh(own(merge(solid)), own(materials.prop()));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  if (unlit.length) {
    const mesh = new THREE.Mesh(own(merge(unlit)), own(withNearFade(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: THREE.DoubleSide }), materials.nearFade)));
    mesh.renderOrder = 2;
    group.add(mesh);
  }
  return { group, colliders, boxes };
}
