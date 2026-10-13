/* The explorer: a small low-poly walker (~1.8 units tall) built from an
   AvatarSpec — body (shirt) color, accent, skin tone, one of six hats and
   one of four pieces of gear. The local player and every live explorer use
   this one builder, so two visitors with different specs look clearly
   different, and the same spec always looks the same everywhere.

   Each limb segment is one merged mesh, with one shared material.
   Faces +z at heading 0; heading is rotation.y. */
import * as THREE from "three";
import type { AvatarSpec, Gear, Hat } from "../../live/identity";
import { merge, paint } from "./util";

export interface Avatar {
  root: THREE.Group;
  spec: AvatarSpec;
  /** Advance the walk cycle / idle breathing. speed01: 0 idle, 1 walk, >1 run. */
  animate(dt: number, time: number, speed01: number, reducedMotion: boolean): void;
  dispose(): void;
}

const INK = new THREE.Color("#1d1f24");
const STRAW = new THREE.Color("#e6c67a");
const WHITE = new THREE.Color("#ffffff");
/** Hair and trousers are not broadcast: they are derived from the spec, so every viewer draws the same explorer. */
const HAIR = ["#2b1d16", "#3a2a20", "#6b3e22", "#a0522d", "#d8b46a", "#8c8c8c"].map((h) => new THREE.Color(h));
const TROUSERS = ["#8a6fb8", "#4a6fa5", "#c9b48f", "#5b8a72", "#c46b5a", "#6d6a9c"].map((h) => new THREE.Color(h));

/** Small deterministic hash of the spec (FNV-1a). */
export function specHash(s: AvatarSpec, salt = 0): number {
  const str = `${s.body}|${s.accent}|${s.skin}|${s.hat}|${s.gear}|${salt}`;
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const c = (v: string | THREE.Color) => (typeof v === "string" ? new THREE.Color(v) : v.clone());
const mixc = (a: THREE.Color, b: THREE.Color, t: number) => a.clone().lerp(b, t);
/** Perceived lightness 0..1, to keep accents readable against the shirt. */
const luma = (k: THREE.Color) => 0.2126 * k.r + 0.7152 * k.g + 0.0722 * k.b;

type Part = THREE.BufferGeometry;
const at = (g: Part, x: number, y: number, z: number, color: THREE.Color): Part => paint(g.translate(x, y, z), color);

/** The lowest sole corner after hip and knee rotation, relative to the ground. */
function footHeight(hipAngle: number, kneeAngle: number): number {
  const angle = hipAngle + kneeAngle;
  const toeOrHeel = Math.sin(angle) >= 0 ? 0.225 : -0.095;
  return 0.76 - 0.36 * Math.cos(hipAngle) - 0.4 * Math.cos(angle) - toeOrHeel * Math.sin(angle);
}

/** The hat, in head-local coordinates (head center at the origin, skull radius 0.2). */
export function hatParts(hat: Hat, accent: THREE.Color, body: THREE.Color): Part[] {
  const dark = mixc(accent, INK, 0.28);
  // A hat the same lightness as the shirt still needs to read: trim it in a contrasting tone.
  const trim = Math.abs(luma(accent) - luma(body)) < 0.12 ? mixc(accent, luma(accent) > 0.5 ? INK : WHITE, 0.45) : dark;
  switch (hat) {
    case "cap": {
      const brim = new THREE.CylinderGeometry(0.15, 0.17, 0.03, 12, 1, false, -Math.PI / 2, Math.PI).scale(1.15, 1, 1.7);
      return [
        at(new THREE.SphereGeometry(0.218, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0.03, 0, accent),
        at(brim, 0, 0.05, 0.15, trim),
        at(new THREE.SphereGeometry(0.035, 6, 4), 0, 0.245, 0, trim),
      ];
    }
    case "straw": {
      // A wide, gently sagging brim, a rounded crown and a ribbon: a sun hat.
      const brim = new THREE.CylinderGeometry(0.5, 0.46, 0.03, 22, 1);
      const bp = brim.attributes.position;
      for (let i = 0; i < bp.count; i++) {
        const d = Math.hypot(bp.getX(i), bp.getZ(i));
        bp.setY(i, bp.getY(i) - Math.max(0, d - 0.28) * 0.28);
      }
      return [
        at(brim, 0, 0.11, 0, STRAW),
        at(new THREE.SphereGeometry(0.215, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.95, 1), 0, 0.1, 0, mixc(STRAW, WHITE, 0.12)),
        at(new THREE.CylinderGeometry(0.218, 0.226, 0.06, 14), 0, 0.15, 0, accent),
      ];
    }
    case "beanie":
      return [
        at(new THREE.SphereGeometry(0.224, 14, 9, 0, Math.PI * 2, 0, Math.PI * 0.56).scale(1, 1.18, 1), 0, 0.01, 0, accent),
        at(new THREE.TorusGeometry(0.208, 0.042, 6, 18).rotateX(Math.PI / 2), 0, 0.03, 0, trim),
        at(new THREE.IcosahedronGeometry(0.075, 1), 0, 0.29, 0, trim),
      ];
    case "bucket":
      return [
        at(new THREE.CylinderGeometry(0.175, 0.22, 0.17, 14), 0, 0.15, 0, accent),
        at(new THREE.CylinderGeometry(0.23, 0.34, 0.05, 18), 0, 0.055, 0, accent),
        at(new THREE.CylinderGeometry(0.222, 0.222, 0.045, 14), 0, 0.09, 0, trim),
      ];
    case "visor": {
      const brim = new THREE.CylinderGeometry(0.17, 0.19, 0.03, 12, 1, false, -Math.PI / 2, Math.PI).scale(1.2, 1, 1.9);
      return [at(new THREE.TorusGeometry(0.205, 0.03, 6, 20).rotateX(Math.PI / 2), 0, 0.07, 0, accent), at(brim, 0, 0.07, 0.16, accent)];
    }
    case "none":
    default:
      return [];
  }
}

/** Gear, in avatar coordinates (feet at y=0, facing +z). Torso surface is ~0.25 from the axis. */
export function gearParts(gear: Gear, accent: THREE.Color, body: THREE.Color): Part[] {
  const dark = mixc(accent, INK, 0.3);
  // Gear that matches the shirt would vanish; push it toward a contrasting tone.
  const tone = Math.abs(luma(accent) - luma(body)) < 0.12 ? mixc(accent, luma(accent) > 0.5 ? INK : WHITE, 0.4) : accent;
  switch (gear) {
    case "backpack":
      return [
        at(new THREE.BoxGeometry(0.36, 0.4, 0.18), 0, 1.08, -0.27, tone),
        at(new THREE.BoxGeometry(0.38, 0.13, 0.2), 0, 1.25, -0.27, dark),
        at(new THREE.BoxGeometry(0.24, 0.12, 0.05), 0, 0.98, -0.385, dark),
        at(new THREE.BoxGeometry(0.055, 0.46, 0.03), -0.12, 1.08, 0.225, dark),
        at(new THREE.BoxGeometry(0.055, 0.46, 0.03), 0.12, 1.08, 0.225, dark),
      ];
    case "satchel": {
      const front = new THREE.BoxGeometry(0.055, 0.66, 0.03).rotateZ(0.72);
      const back = new THREE.BoxGeometry(0.055, 0.66, 0.03).rotateZ(0.72);
      return [
        at(front, 0.02, 1.07, 0.225, dark),
        at(back, 0.02, 1.07, -0.225, dark),
        at(new THREE.BoxGeometry(0.14, 0.3, 0.34), 0.33, 0.93, 0.0, tone),
        at(new THREE.BoxGeometry(0.15, 0.1, 0.35), 0.33, 1.06, 0.0, dark),
      ];
    }
    case "scarf":
      return [
        at(new THREE.TorusGeometry(0.14, 0.05, 6, 16).rotateX(Math.PI / 2), 0, 1.35, 0, tone),
        at(new THREE.BoxGeometry(0.1, 0.3, 0.045).rotateZ(-0.12), 0.09, 1.18, 0.22, tone),
        at(new THREE.BoxGeometry(0.1, 0.26, 0.045).rotateX(-0.25), -0.05, 1.19, -0.23, dark),
      ];
    case "none":
    default:
      return [];
  }
}

export function buildAvatar(spec: AvatarSpec): Avatar {
  const root = new THREE.Group();
  root.name = "avatar";
  const body = c(spec.body);
  const accent = c(spec.accent);
  const skin = c(spec.skin);
  const shirtDark = mixc(body, INK, 0.25);
  const hair = HAIR[specHash(spec, 1) % HAIR.length].clone();
  // Shorts, and bare feet.
  let pants = TROUSERS[specHash(spec, 2) % TROUSERS.length].clone();
  if (Math.abs(luma(pants) - luma(body)) < 0.1) pants = mixc(pants, luma(body) > 0.5 ? INK : WHITE, 0.4);
  const shoes = mixc(skin, new THREE.Color("#7a4a30"), 0.18);
  // A stripe across the shirt in the accent (or a contrasting tone when the accent matches the shirt).
  const stripe = Math.abs(luma(accent) - luma(body)) < 0.1 ? mixc(body, luma(body) > 0.5 ? INK : WHITE, 0.55) : accent;
  // Explorers differ a little in height, too.
  const scale = 0.94 + (specHash(spec, 3) % 13) / 100;

  const geos: THREE.BufferGeometry[] = [];
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const meshOf = (parts: Part[]) => {
    const g = merge(parts);
    geos.push(g);
    const m = new THREE.Mesh(g, material);
    m.castShadow = true;
    return m;
  };

  // Shorter thighs, a knee pivot and boot soles give the stride a clear silhouette.
  const leg = (side: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(0.13 * side, 0.76, 0);
    pivot.add(meshOf([
      at(new THREE.CapsuleGeometry(0.125, 0.07, 2, 8), 0, -0.1, 0, pants),
      at(new THREE.CylinderGeometry(0.09, 0.088, 0.2, 8), 0, -0.26, 0, skin),
    ]));
    const knee = new THREE.Group();
    knee.position.y = -0.36;
    const sole = mixc(shoes, INK, 0.25);
    knee.add(meshOf([
      at(new THREE.SphereGeometry(0.088, 8, 6), 0, 0, 0, skin),
      at(new THREE.CylinderGeometry(0.084, 0.062, 0.26, 8), 0, -0.15, 0, skin),
      at(new THREE.BoxGeometry(0.17, 0.13, 0.3), 0, -0.335, 0.065, shoes),
      at(new THREE.BoxGeometry(0.18, 0.035, 0.31), 0, -0.3825, 0.065, sole),
    ]));
    pivot.add(knee);
    return { pivot, knee };
  };
  const { pivot: leftLeg, knee: leftKnee } = leg(-1);
  const { pivot: rightLeg, knee: rightKnee } = leg(1);

  const bodyGroup = new THREE.Group(); // everything above the hips bobs with the walk
  const hip = meshOf([
    at(new THREE.CylinderGeometry(0.23, 0.245, 0.2, 10).scale(1, 1, 0.8), 0, 0.77, 0, pants),
    // The shirt hangs loose over the shorts.
    at(new THREE.CylinderGeometry(0.255, 0.285, 0.17, 10).scale(1, 1, 0.8), 0, 0.88, 0, body),
  ]);

  // Chest (breathes): torso, collar and the gear.
  const chest = new THREE.Group();
  chest.position.y = 0.82;
  const chestParts = [
    at(new THREE.CylinderGeometry(0.28, 0.215, 0.52, 10).scale(1, 1, 0.78), 0, 1.07, 0, body),
    at(new THREE.CylinderGeometry(0.259, 0.252, 0.055, 10).scale(1, 1, 0.78), 0, 1.13, 0, stripe),
    at(new THREE.CylinderGeometry(0.085, 0.09, 0.13, 8), 0, 1.375, 0, skin),
    at(new THREE.CylinderGeometry(0.105, 0.15, 0.065, 10).scale(1, 1, 0.85), 0, 1.325, 0, shirtDark),
    ...gearParts(spec.gear, accent, body),
  ];
  for (const g of chestParts) g.translate(0, -0.82, 0);
  chest.add(meshOf(chestParts));

  // Arms: pivot at the shoulder.
  const arm = (side: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(0.29 * side, 1.285, 0);
    pivot.rotation.z = 0.065 * side;
    pivot.add(meshOf([
      at(new THREE.CapsuleGeometry(0.095, 0.15, 2, 8), 0, -0.12, 0, body),
      at(new THREE.CapsuleGeometry(0.068, 0.15, 2, 8).rotateX(-0.13), 0, -0.355, 0.025, skin),
      at(new THREE.SphereGeometry(0.076, 8, 6).scale(0.82, 1.05, 0.7), 0, -0.515, 0.047, skin),
    ]));
    return pivot;
  };
  const leftArm = arm(-1);
  const rightArm = arm(1);

  // Head: skull, hair, eyes, cheeks, hat.
  const head = new THREE.Group();
  head.position.y = 1.58;
  const blush = mixc(skin, new THREE.Color("#ff8a8a"), 0.35);
  const headParts = [
    at(new THREE.SphereGeometry(0.225, 12, 9).scale(1, 1, 0.94), 0, 0, 0, skin),
    at(new THREE.SphereGeometry(0.235, 12, 7, 0, Math.PI * 2, 0, Math.PI * 0.48).rotateX(-0.3), 0, 0.008, -0.012, hair),
    at(new THREE.SphereGeometry(0.045, 6, 4).scale(0.7, 1, 0.8), -0.22, -0.005, -0.005, skin),
    at(new THREE.SphereGeometry(0.045, 6, 4).scale(0.7, 1, 0.8), 0.22, -0.005, -0.005, skin),
    at(new THREE.SphereGeometry(0.022, 6, 4), -0.078, 0.025, 0.2, INK),
    at(new THREE.SphereGeometry(0.022, 6, 4), 0.078, 0.025, 0.2, INK),
    at(new THREE.SphereGeometry(0.035, 6, 4).scale(0.8, 1.1, 1.15), 0, -0.035, 0.216, skin),
    at(new THREE.SphereGeometry(0.03, 6, 4).scale(1.1, 0.65, 0.45), -0.12, -0.055, 0.18, blush),
    at(new THREE.SphereGeometry(0.03, 6, 4).scale(1.1, 0.65, 0.45), 0.12, -0.055, 0.18, blush),
    ...hatParts(spec.hat, accent, body).map((g) => g.scale(1.08, 1, 1.08)),
  ];
  head.add(meshOf(headParts));

  bodyGroup.add(hip, chest, leftArm, rightArm, head);

  // A soft blob shadow keeps the walker grounded even outside the shadow map.
  const blobMat = new THREE.MeshBasicMaterial({ color: INK, transparent: true, opacity: 0.22, depthWrite: false });
  const blobGeo = new THREE.CircleGeometry(0.38, 20).scale(1, 0.8, 1);
  geos.push(blobGeo);
  const blob = new THREE.Mesh(blobGeo, blobMat);
  blob.name = "avatar-shadow";
    blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.035;
  blob.renderOrder = 2;

  const figure = new THREE.Group();
  figure.scale.setScalar(scale);
  figure.add(leftLeg, rightLeg, bodyGroup);
  root.add(figure, blob);

  let phase = Math.random() * Math.PI * 2;
  let swingAmp = 0;
  const lookPhase = Math.random() * 10;
  const animate = (dt: number, time: number, speed01: number, reduced: boolean) => {
    if (reduced) {
      leftLeg.rotation.x = rightLeg.rotation.x = 0;
      leftKnee.rotation.x = rightKnee.rotation.x = 0;
      leftArm.rotation.x = rightArm.rotation.x = 0;
      bodyGroup.position.y = 0;
      bodyGroup.rotation.x = 0;
      chest.scale.set(1, 1, 1);
      head.rotation.y = 0;
      figure.position.y = 0;
      return;
    }
    const moving = speed01 > 0.02;
    const run = speed01 > 1.05;
    phase += dt * (run ? 13 : 9.5) * Math.max(0.35, Math.min(1, speed01));
    const targetAmp = moving ? (run ? 0.72 : 0.48) * Math.min(1, speed01 + 0.25) : 0;
    swingAmp += (targetAmp - swingAmp) * Math.min(1, dt * 12);
    const swing = Math.sin(phase) * swingAmp;
    leftLeg.rotation.x = swing;
    rightLeg.rotation.x = -swing;
    const kneeBend = (run ? 0.85 : 0.5) * Math.min(1, swingAmp / 0.48);
    leftKnee.rotation.x = Math.max(0, Math.sin(phase)) * kneeBend;
    rightKnee.rotation.x = Math.max(0, -Math.sin(phase)) * kneeBend;
    figure.position.y = -scale * Math.min(footHeight(swing, leftKnee.rotation.x), footHeight(-swing, rightKnee.rotation.x));
    leftArm.rotation.x = -swing * 0.9;
    rightArm.rotation.x = swing * 0.9;
    const breathe = Math.sin(time * 2.1 + lookPhase);
    bodyGroup.position.y = moving ? Math.abs(Math.sin(phase * 2)) * 0.025 * swingAmp : breathe * 0.008;
    const k = moving ? 0 : 1;
    chest.scale.set(1 + breathe * 0.014 * k, 1 + breathe * 0.024 * k, 1 + breathe * 0.014 * k);
    bodyGroup.rotation.x = run ? 0.12 : moving ? 0.04 : 0;
    head.rotation.y = moving ? head.rotation.y * 0.9 : Math.sin(time * 0.6 + lookPhase) * 0.2;
  };

  const dispose = () => {
    for (const g of geos) g.dispose();
    material.dispose();
    blobMat.dispose();
  };

  return { root, spec, animate, dispose };
}

/** A stable key for an avatar spec, to tell when a remote explorer changed their look. */
export function specKey(s: AvatarSpec): string {
  return `${s.body}|${s.accent}|${s.skin}|${s.hat}|${s.gear}`;
}
