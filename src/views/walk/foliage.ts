/* The walk world's plants and rocks, faceted and toon lit: broad crowns of a few faceted clumps,
   tall pines with their crowns high on a bare trunk, palms with a star of drooping fronds, shrubs,
   flowering shrubs and rocks. Each kind is one small merged, vertex-colored geometry (instanced per
   tile by world.ts, so the cameras cull whole tiles), drawn flat shaded by the toon material, which
   gives each facet its two-tone light. Low poly on purpose. Each kind also has a far version: a tile
   of plants far from the camera, deep in the haze, swaps to it (world.ts), at a fraction of the
   triangles. */
import * as THREE from "three";
import { mix, type ScenePalette } from "./palette";
import { merge, paint } from "./util";

export type FoliageKind = "oak" | "pine" | "palm" | "cypress" | "shrub" | "flowers" | "rock";

export const FOLIAGE_KINDS: readonly FoliageKind[] = ["oak", "pine", "palm", "cypress", "shrub", "flowers", "rock"];

/** How far each kind sways in the wind (world units at a height of 4; see src/three/toon.ts). */
export const FOLIAGE_WIND: Record<FoliageKind, number> = { oak: 0.09, pine: 0.06, palm: 0.13, cypress: 0.05, shrub: 0.05, flowers: 0.05, rock: 0 };

/** Collision radius, height (for the follow camera) and crown radius per unit of scale. */
export const FOLIAGE_BODY: Record<FoliageKind, { r: number; h: number; crown: number }> = {
  oak: { r: 0.45, h: 4.4, crown: 1.9 },
  pine: { r: 0.35, h: 6.4, crown: 1.4 },
  palm: { r: 0.4, h: 5.2, crown: 1.7 },
  cypress: { r: 0.4, h: 7.2, crown: 1.1 },
  shrub: { r: 0.65, h: 1.1, crown: 0 },
  flowers: { r: 0.65, h: 1.1, crown: 0 },
  rock: { r: 0.75, h: 0.7, crown: 0 },
};

/** A faceted clump: an icosahedron, squashed and placed. */
function clump(r: number, x: number, y: number, z: number, sy: number, color: THREE.Color): THREE.BufferGeometry {
  return paint(new THREE.IcosahedronGeometry(r, 0).scale(1, sy, 1).translate(x, y, z), color);
}

/** A kind's far version: the same silhouette and colors in a clump or two. */
export function foliageFarGeometry(kind: FoliageKind, p: ScenePalette): THREE.BufferGeometry {
  const leaf = p.tree;
  switch (kind) {
    case "oak":
      return merge([paint(new THREE.CylinderGeometry(0.2, 0.32, 2.2, 4).translate(0, 1.1, 0), p.trunk), clump(1.75, 0.1, 3.1, 0, 0.72, leaf), clump(1.1, -0.9, 2.9, -0.2, 0.7, mix(leaf, p.grassTip, 0.32))]);
    case "pine":
      return merge([paint(new THREE.CylinderGeometry(0.13, 0.22, 5.0, 4).translate(0, 2.5, 0), mix(p.trunk, p.rock, 0.25)), clump(1.15, 0, 5.3, 0, 0.75, p.treeDark)]);
    case "palm": {
      const parts = [paint(new THREE.CylinderGeometry(0.17, 0.23, 4.6, 4).translate(0.12, 2.3, 0), p.palmTrunk)];
      for (let i = 0; i < 5; i++) {
        const blade = new THREE.ConeGeometry(0.5, 2.5, 3).scale(1, 1, 0.2).translate(0, 1.25, 0).rotateZ(-1.05).rotateY((i / 5) * Math.PI * 2);
        parts.push(paint(blade.translate(0.18, 4.65, 0), p.palm));
      }
      return merge(parts);
    }
    case "cypress":
      return merge([paint(new THREE.CylinderGeometry(0.1, 0.16, 1.0, 4).translate(0, 0.5, 0), p.trunk), clump(0.8, 0, 3.4, 0, 2.5, p.treeDark)]);
    case "shrub":
    case "flowers":
      return merge([clump(1.05, 0.15, 0.48, 0, 0.62, mix(leaf, p.grass, kind === "flowers" ? 0.2 : 0.4))]);
    case "rock":
    default:
      return foliageGeometry("rock", p);
  }
}

export function foliageGeometry(kind: FoliageKind, p: ScenePalette): THREE.BufferGeometry {
  const trunk = p.trunk;
  const leaf = p.tree;
  const leafDark = p.treeDark;
  const leafLight = mix(p.tree, p.grassTip, 0.32);
  switch (kind) {
    case "oak": {
      // A short trunk forking into a broad, low crown of five clumps.
      const parts = [
        paint(new THREE.CylinderGeometry(0.2, 0.32, 2.0, 5).translate(0, 1.0, 0), trunk),
        paint(new THREE.CylinderGeometry(0.08, 0.14, 1.3, 4).rotateZ(0.7).translate(0.42, 2.15, 0), trunk),
        paint(new THREE.CylinderGeometry(0.08, 0.14, 1.2, 4).rotateZ(-0.75).rotateY(0.9).translate(-0.3, 2.1, 0.25), trunk),
        clump(1.45, 0, 3.15, 0, 0.78, leaf),
        clump(1.05, 1.15, 2.75, 0.2, 0.75, leafDark),
        clump(1.0, -1.05, 2.8, -0.35, 0.72, leafLight),
        clump(0.95, 0.2, 2.65, 1.05, 0.74, leaf),
        clump(0.85, -0.35, 3.75, -0.2, 0.7, leafLight),
      ];
      return merge(parts);
    }
    case "pine": {
      // A tall bare trunk, a short limb, the crown high up in dark clumps.
      const parts = [
        paint(new THREE.CylinderGeometry(0.13, 0.22, 5.0, 5).translate(0, 2.5, 0), mix(trunk, p.rock, 0.25)),
        paint(new THREE.CylinderGeometry(0.05, 0.07, 0.9, 3).rotateZ(1.0).translate(0.35, 4.3, 0), trunk),
        clump(0.95, 0, 5.35, 0, 0.7, leafDark),
        clump(0.75, 0.55, 4.85, 0.25, 0.65, mix(leafDark, leaf, 0.35)),
        clump(0.7, -0.5, 4.95, -0.3, 0.65, leafDark),
        clump(0.55, 0.05, 6.0, 0.1, 0.7, mix(leafDark, leaf, 0.5)),
      ];
      return merge(parts);
    }
    case "palm": {
      // A ringed, gently leaning trunk and a star of drooping fronds.
      const parts: THREE.BufferGeometry[] = [];
      let x = 0;
      for (let i = 0; i < 4; i++) {
        // Open-ended: the segments stack, so their caps would never show.
        const seg = new THREE.CylinderGeometry(0.19 - i * 0.012, 0.23 - i * 0.012, 1.18, 5, 1, true);
        seg.rotateZ(-0.05 * i);
        seg.translate(x, 0.59 + i * 1.15, 0);
        x += 0.06 * i;
        parts.push(paint(seg, i % 2 ? mix(p.palmTrunk, p.sand, 0.25) : p.palmTrunk));
      }
      const top = new THREE.Vector3(x, 4.65, 0);
      const fronds = 9;
      for (let i = 0; i < fronds; i++) {
        const a = (i / fronds) * Math.PI * 2;
        const droop = 0.95 + (i % 3) * 0.22;
        // A leaf blade: a flat cone, its root at the crown, leaning out and down.
        const blade = new THREE.ConeGeometry(0.42, 2.5, 4);
        blade.scale(1, 1, 0.18);
        blade.translate(0, 1.25, 0);
        blade.rotateZ(-droop);
        blade.rotateY(a);
        blade.translate(top.x, top.y, top.z);
        parts.push(paint(blade, i % 2 ? p.palm : mix(p.palm, leafDark, 0.45)));
      }
      parts.push(paint(new THREE.IcosahedronGeometry(0.34, 0).translate(top.x, top.y - 0.05, 0), mix(p.palmTrunk, leafDark, 0.4)));
      return merge(parts);
    }
    case "cypress": {
      // A tall, narrow flame of dark foliage: stacked faceted clumps on a short bare trunk.
      const dark = mix(leafDark, p.ink, 0.12);
      return merge([
        paint(new THREE.CylinderGeometry(0.1, 0.17, 1.2, 5).translate(0, 0.6, 0), trunk),
        clump(0.74, 0, 2.0, 0, 1.2, dark),
        clump(0.66, 0.05, 3.1, 0.04, 1.35, mix(dark, leaf, 0.22)),
        clump(0.54, -0.04, 4.2, -0.03, 1.45, dark),
        clump(0.4, 0.02, 5.2, 0.02, 1.55, mix(dark, leaf, 0.3)),
        clump(0.24, 0, 6.0, 0, 1.6, dark),
      ]);
    }
    case "shrub":
      return merge([
        clump(0.95, 0, 0.5, 0, 0.62, mix(leaf, p.grass, 0.35)),
        clump(0.7, 0.62, 0.42, 0.25, 0.6, mix(leaf, p.grass, 0.55)),
        clump(0.62, -0.55, 0.4, -0.2, 0.6, leaf),
      ]);
    case "flowers": {
      // A flowering shrub: the shrub with a few blossoms.
      const parts = [clump(0.92, 0, 0.5, 0, 0.62, mix(leaf, p.grass, 0.2)), clump(0.66, 0.6, 0.4, -0.25, 0.6, mix(leaf, p.grass, 0.4))];
      const spots: [number, number, number][] = [
        [0.35, 0.95, 0.45],
        [-0.45, 0.85, 0.3],
        [0.75, 0.72, -0.35],
        [0.05, 0.98, -0.5],
        [-0.25, 0.7, 0.7],
      ];
      for (const [bx, by, bz] of spots) parts.push(paint(new THREE.TetrahedronGeometry(0.2).translate(bx, by, bz), p.bloom));
      return merge(parts);
    }
    case "rock":
    default:
      return merge([paint(new THREE.DodecahedronGeometry(0.85, 0).scale(1.3, 0.72, 1).translate(0, 0.3, 0), p.rock)]);
  }
}
