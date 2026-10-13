/* What each set piece is made of, and what the walker bumps into (pure, tested): its Blender model
   (art/assets/pieces.py), the parts that move (the turbine's rotor, the observatory's dome, the
   marina's launches), and its collision boxes. mapPieces.ts stands the models; this file keeps the
   numbers, so the colliders and the motion can be checked without a renderer.

   Boxes are in the piece's own frame (x right, z toward its front: the sea for a coastal piece, the
   plaza for an inland one), their heights above the piece's level ground. A low box is a floor the
   walker steps onto (the marina's steps, pad and deck; a cabana's deck): anything under the walker's
   knee, about 0.3, can be climbed. */
import { SEA_Y, swellLift } from "../mapGround";
import type { PiecePlan } from "../mapLayout";
import type { PieceKind } from "./kinds";

/** A collision box in a piece's frame: w across (x), d deep (z), h tall above its ground, its middle at (x, z), turned ry. */
export interface PieceLocalBox {
  w: number;
  d: number;
  h: number;
  x: number;
  z: number;
  ry?: number;
}

/** A collision box in the world: w by d, from y up h, turned ry about its middle (x, z). */
export interface PieceBox {
  w: number;
  h: number;
  d: number;
  x: number;
  y: number;
  z: number;
  ry: number;
}

export interface PieceTurn {
  /** Its model, built around its pivot. */
  model: string;
  /** The pivot in the piece's frame. */
  at: [number, number, number];
  /** Turning about the vertical (y) or about the way the piece faces (z). */
  axis: "y" | "z";
  /** Radians a second, and its angle under reduced motion. */
  speed: number;
  rest: number;
}

export interface PieceModel {
  model: string;
  boxes: PieceLocalBox[];
  turn?: PieceTurn;
  /** Boats moored alongside, in the piece's frame: where, and which way their bows point. */
  boats?: Array<{ x: number; z: number; yaw: number }>;
}

/** The marina's launch: its waterline is its origin; it bobs and rolls a little on the swell. */
export const BOAT = { model: "piece_marina_boat", sink: 0, bob: [0.06, 1.0] as const, roll: [0.04, 0.8] as const };

/** The marina's deck (its top above the piece's ground), how far it reaches, and its T-head. */
export const MARINA = { deck: 0.7, half: 1.6, length: 30, head: { half: 3.7, from: 30, to: 34 } };
/** The invisible rail along the marina's edges: how far above the deck it reaches. */
const RAIL = 1.0;

const row = (xs: number[], box: (x: number) => PieceLocalBox) => xs.map(box);
const both = (box: (s: number) => PieceLocalBox) => [box(-1), box(1)];
const HUTS = [-9.7, -6.1, -2.5, 1.1, 4.7];

export const PIECE_MODELS: Record<PieceKind, PieceModel> = {
  beacon: {
    model: "piece_beacon",
    boxes: [
      { w: 4.1, d: 4.1, h: 16.3, x: 0, z: 0 },
      { w: 2.0, d: 1.0, h: 3.1, x: 0, z: -2.1 },
    ],
  },
  marina: {
    model: "piece_marina",
    boxes: [
      // Two steps up from the land, the shore pad, the deck and the T-head.
      { w: 2.6, d: 0.45, h: 0.22, x: 0, z: -2.625 },
      { w: 2.6, d: 0.45, h: 0.43, x: 0, z: -2.175 },
      { w: 5.0, d: 1.8, h: 0.65, x: 0, z: -1.05 },
      { w: MARINA.half * 2, d: MARINA.length + 1, h: MARINA.deck, x: 0, z: (MARINA.length - 1) / 2 },
      { w: MARINA.head.half * 2, d: 4.0, h: MARINA.deck, x: 0, z: 32 },
      // The rails that keep the walker on the deck.
      ...both((s) => ({ w: 0.2, d: MARINA.length + 0.15, h: MARINA.deck + RAIL, x: s * (MARINA.half + 0.1), z: (MARINA.length - 0.15) / 2 })),
      ...both((s) => ({ w: 0.2, d: 4.2, h: MARINA.deck + RAIL, x: s * (MARINA.head.half + 0.1), z: 32 })),
      ...both((s) => ({ w: 2.1, d: 0.2, h: MARINA.deck + RAIL, x: s * 2.75, z: MARINA.head.from - 0.1 })),
      { w: MARINA.head.half * 2 + 0.4, d: 0.2, h: MARINA.deck + RAIL, x: 0, z: MARINA.head.to + 0.1 },
      // The kiosk, the charging post and the end beacons.
      { w: 0.7, d: 0.5, h: 2.4, x: 2.0, z: -1.15 },
      { w: 0.3, d: 0.3, h: 1.8, x: 1.2, z: 18 },
      ...both((s) => ({ w: 0.3, d: 0.3, h: 2.25, x: s * 3.3, z: 33.6 })),
    ],
    boats: [
      { x: 2.6, z: 18, yaw: 0 },
      { x: -2.6, z: 25, yaw: Math.PI },
    ],
  },
  beach: {
    model: "piece_beach",
    boxes: [
      ...[[-4.7, -1.05], [0, 0.35], [4.7, -1.05]].map(([x, z]) => ({ w: 2.0, d: 2.1, h: 0.95, x, z })),
      ...[[-4.7, -1.1], [0, 0.3], [4.7, -1.1]].map(([x, z]) => ({ w: 0.3, d: 0.3, h: 2.8, x, z })),
      { w: 0.3, d: 0.3, h: 2.6, x: 6.95, z: -2.95 },
      ...both((s) => ({ w: 0.2, d: 0.2, h: 0.6, x: s * 2.35, z: -2.6 })),
    ],
  },
  cabanas: {
    model: "piece_cabanas",
    boxes: [
      ...row(HUTS, (x) => ({ w: 3.2, d: 2.4, h: 3.0, x, z: -2.7 })),
      ...row(HUTS, (x) => ({ w: 3.2, d: 3.8, h: 0.22, x, z: -2.25 })),
      ...row(HUTS, (x) => ({ w: 1.3, d: 0.5, h: 0.65, x: x + 0.5, z: -0.7 })),
      // The lifeguard tower's legs, its stair and the rescue board.
      ...[9.45, 11.35].flatMap((x) => [-1.85, 0.05].map((z) => ({ w: 0.3, d: 0.3, h: 3.1, x, z }))),
      { w: 1.0, d: 2.8, h: 3.2, x: 10.85, z: -2.72 },
      { w: 0.6, d: 0.4, h: 1.9, x: 9.95, z: 0.35 },
    ],
  },
  boathouse: {
    model: "piece_boathouse",
    boxes: [
      { w: 9.2, d: 6.8, h: 0.5, x: 0, z: -1.6 },
      { w: 7.4, d: 4.8, h: 6.4, x: 0, z: -2.4 },
      { w: 0.4, d: 0.5, h: 4.8, x: 3.85, z: -0.15 },
      { w: 0.6, d: 1.8, h: 2.8, x: -4.05, z: -1.45 },
    ],
  },
  turbine: {
    model: "piece_turbine",
    boxes: [
      { w: 1.7, d: 1.7, h: 18.5, x: 0, z: 0 },
      { w: 1.3, d: 0.8, h: 2.9, x: 0, z: 0.8 },
    ],
    turn: { model: "piece_turbine_rotor", at: [0, 15.9, 1.45], axis: "z", speed: 0.6, rest: 0.4 },
  },
  farm: {
    model: "piece_vertical_farm",
    boxes: [{ w: 4.8, d: 4.8, h: 10.9, x: -4.3, z: -0.8 }, ...row([0.4, 2.35, 4.3, 6.25], (x) => ({ w: 1.25, d: 5.4, h: 1.1, x, z: -0.3 }))],
  },
  pods: {
    model: "piece_pods",
    boxes: [
      { w: 2.4, d: 2.6, h: 3.5, x: -3.92, z: -2.08, ry: 1.082 },
      { w: 2.4, d: 2.6, h: 3.5, x: 0, z: -4.44 },
      { w: 2.4, d: 2.6, h: 3.5, x: 3.92, z: -2.08, ry: -1.082 },
      { w: 2.1, d: 2.1, h: 0.45, x: 0, z: 0 },
    ],
  },
  datacenter: {
    model: "piece_datacenter",
    boxes: [{ w: 4.1, d: 4.3, h: 7.2, x: 0, z: 0.12 }],
  },
  solar: {
    model: "piece_solar_field",
    boxes: [...row([4.8, 1.6, -1.6, -4.8], (z) => ({ w: 12.1, d: 1.8, h: 1.75, x: 0, z })), { w: 1.3, d: 0.9, h: 1.75, x: 7.5, z: 0 }],
  },
  observatory: {
    model: "piece_observatory",
    boxes: [
      { w: 5.2, d: 5.5, h: 6.6, x: 0, z: 0.15 },
      { w: 1.8, d: 0.55, h: 0.5, x: 2.3, z: 4.1 },
    ],
    turn: { model: "piece_observatory_dome", at: [0, 4.22, 0], axis: "y", speed: 0.05, rest: 0 },
  },
  greenhouse: {
    model: "piece_greenhouse",
    boxes: [
      { w: 8.8, d: 5.0, h: 4.2, x: 0, z: 0 },
      { w: 1.15, d: 1.15, h: 1.95, x: 5.25, z: -1.1 },
    ],
  },
};

/** A point in a piece's frame, in the world. */
export function pieceToWorld(p: Pick<PiecePlan, "x" | "z" | "facing">, lx: number, lz: number): { x: number; z: number } {
  const c = Math.cos(p.facing);
  const s = Math.sin(p.facing);
  return { x: p.x + lx * c + lz * s, z: p.z - lx * s + lz * c };
}

/** A world point in a piece's frame. */
export function worldToPiece(p: Pick<PiecePlan, "x" | "z" | "facing">, x: number, z: number): { x: number; z: number } {
  const c = Math.cos(p.facing);
  const s = Math.sin(p.facing);
  const dx = x - p.x;
  const dz = z - p.z;
  return { x: dx * c - dz * s, z: dx * s + dz * c };
}

/**
 * Every piece's collision boxes in the world. A box stands from below the lower of the piece's ground
 * and the ground under its middle (the marina's deck reaches down to the seabed) up to its height
 * above the piece's ground.
 */
export function pieceColliders(pieces: readonly PiecePlan[], groundY: (x: number, z: number) => number): PieceBox[] {
  const out: PieceBox[] = [];
  for (const p of pieces) {
    const y = groundY(p.x, p.z);
    for (const b of PIECE_MODELS[p.kind].boxes) {
      const c = pieceToWorld(p, b.x, b.z);
      const base = Math.min(y, groundY(c.x, c.z)) - 0.3;
      out.push({ w: b.w, d: b.d, h: y + b.h - base, x: c.x, y: base, z: c.z, ry: p.facing + (b.ry ?? 0) });
    }
  }
  return out;
}

/** Whether (x, z) is on a marina's deck, where the walker may go past the island's edge. */
export function onMarina(pieces: readonly PiecePlan[], x: number, z: number): boolean {
  for (const p of pieces) {
    if (p.kind !== "marina") continue;
    const l = worldToPiece(p, x, z);
    if (Math.abs(l.x) <= MARINA.half && l.z >= -3 && l.z <= MARINA.head.from) return true;
    if (Math.abs(l.x) <= MARINA.head.half && l.z >= MARINA.head.from && l.z <= MARINA.head.to) return true;
  }
  return false;
}

/** A moored boat's height and roll at `time`: on the swell, and bobbing a little unless motion is reduced. */
export function boatFloat(time: number, phase: number, still: boolean): { y: number; roll: number } {
  const bob = still ? 0 : Math.sin(time * BOAT.bob[1] + phase) * BOAT.bob[0];
  return { y: SEA_Y + swellLift(time) - BOAT.sink + bob, roll: still ? 0 : Math.sin(time * BOAT.roll[1] + phase) * BOAT.roll[0] };
}
