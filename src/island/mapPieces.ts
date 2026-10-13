// @ts-nocheck
/* The island's set pieces, stood where the plan puts them (mapLayout.ts, plan.pieces): each kind's
   Blender model (art/assets/pieces.py) on the level pad the ground keeps for it
   (mapGround.islandHeight), in the colors of the district nearest it. What turns (the turbine's rotor,
   the observatory's dome) turns on its own mesh, and the marina's launches ride the sea's own swell
   (swellLift), so they float on the water the sea shader draws; under reduced motion the rotor and the
   dome hold still and the launches only rise and fall with the sea. The numbers (models, colliders,
   motion) are in pieces/models.ts, tested. */
import { Group, Mesh } from 'three';
import { hashString, seededRandom } from '../data/layout';
import { loadModel, placeModel, type Placement } from './campus';
import type { MapPlan } from './mapLayout';
import { BOAT, PIECE_MODELS, boatFloat, pieceColliders, pieceToWorld, type PieceBox } from './pieces/models';
import { phongMaterial } from './scene/materials';

export interface PiecesBuild {
  /** What a click stops at. */
  meshes: any[];
  colliders: PieceBox[];
  /** Turn the rotor and the dome, and float the launches, at `time` (seconds). */
  update(time: number): void;
}

export async function buildPieces(
  scene: any,
  plan: Pick<MapPlan, 'pieces'>,
  groundY: (x: number, z: number) => number,
  accentAt: (x: number, z: number) => number,
  still: boolean,
): Promise<PiecesBuild> {
  const rand = seededRandom(hashString('island-pieces'));
  const byModel = new Map<string, Placement[]>();
  for (const p of plan.pieces) {
    const name = PIECE_MODELS[p.kind].model;
    if (!byModel.has(name)) byModel.set(name, []);
    byModel.get(name).push({ x: p.x, z: p.z, facing: p.facing, accent: accentAt(p.x, p.z) });
  }
  const placed = await Promise.all([...byModel].map(([name, list]) => placeModel(scene, name, list, groundY, null)));
  const meshes = placed.filter(Boolean).map((p) => p.mesh);
  const movers: Array<(t: number) => void> = [];

  for (const p of plan.pieces) {
    const spec = PIECE_MODELS[p.kind];
    const material = spec.turn || spec.boats ? phongMaterial({ accentBase: accentAt(p.x, p.z) }) : null;
    if (spec.turn) {
      const { model, at, axis, speed, rest } = spec.turn;
      const holder = new Group();
      holder.position.set(p.x, groundY(p.x, p.z), p.z);
      holder.rotation.y = p.facing;
      const part = new Mesh(await loadModel(model), material);
      part.name = 'turns';
      part.position.set(at[0], at[1], at[2]);
      part.castShadow = true;
      part.receiveShadow = true;
      part.rotation[axis] = rest;
      holder.add(part);
      scene.add(holder);
      meshes.push(part);
      const phase = rand() * 6;
      if (!still) movers.push((t) => (part.rotation[axis] = rest + t * speed + phase));
    }
    if (spec.boats?.length) {
      const hull = await loadModel(BOAT.model);
      for (const b of spec.boats) {
        const boat = new Mesh(hull, material);
        boat.name = 'boat';
        boat.castShadow = true;
        boat.receiveShadow = true;
        const w = pieceToWorld(p, b.x, b.z);
        boat.position.set(w.x, 0, w.z);
        boat.rotation.order = 'YXZ';
        boat.rotation.y = p.facing + b.yaw;
        scene.add(boat);
        meshes.push(boat);
        const phase = rand() * 6;
        const float = (t: number) => {
          const f = boatFloat(t, phase, still);
          boat.position.y = f.y;
          boat.rotation.z = f.roll;
        };
        float(0);
        movers.push(float);
      }
    }
  }

  return {
    meshes,
    colliders: pieceColliders(plan.pieces, groundY),
    update(time) {
      for (const m of movers) m(time);
    },
  };
}
