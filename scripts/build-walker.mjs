// Build the walker (public/island/geometries/walker.bin): the island's skinned figure, drawn with the
// palette's rows and a headset. It keeps the figure's skeleton and clips (walker-bones.bin and the
// walker-*.bin animations are the figure's own), so only its look changes:
//   - the hat and its band go, and the crown and the back of the head become hair;
//   - the shirt becomes a graphite top with sleeves to the wrist, the shorts and legs joggers, the
//     shoes white sneakers; skin keeps its flag (the shader picks a skin tone per explorer);
//   - the headset (art/assets/walker.py, built in Blender) is skinned whole to the head bone.
// Colors are set per face and vertices are split where faces of two colors meet, so none blends.
//
//   npm run art:walker
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import draco3d from "draco3d";
import { decodeBin, encodeMesh, findBlender } from "./build-art.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const GEO = path.join(ROOT, "public", "island", "geometries");
/** The figure the walker is drawn from, and its skeleton and clips (not shipped). */
const SRC = path.join(ROOT, "art", "source");
const PALETTE = JSON.parse(fs.readFileSync(path.join(ROOT, "src", "island", "palette.json"), "utf8"));
const row = (name) => {
  const i = PALETTE.ramps.findIndex((r) => r.name === name);
  if (i < 0) throw new Error(`palette.json has no ramp ${name}`);
  return PALETTE.baseRow + i;
};
const HEAD_BONE = 14;
/** The figure's bones (walker-bones.bin): each arm from shoulder to forearm, its hand; each leg from hip to shin, its foot. */
const ARM_BONES = new Set([12, 10, 9, 21, 19, 20]);
const LEG_BONES = new Set([3, 0, 1, 6, 15, 16]);

async function decodeSkinned(file, dm) {
  const buf = fs.readFileSync(path.join(SRC, file));
  const headerLength = parseInt(buf.subarray(0, 10).toString("latin1"), 10);
  const header = JSON.parse(buf.subarray(10, 10 + headerLength).toString("utf8"));
  const payload = buf.subarray(10 + headerLength);
  const decoder = new dm.Decoder();
  const db = new dm.DecoderBuffer();
  db.Init(new Int8Array(payload.buffer, payload.byteOffset, payload.byteLength), payload.length);
  const mesh = new dm.Mesh();
  if (!decoder.DecodeBufferToMesh(db, mesh).ok()) throw new Error(`${file}: decode failed`);
  const n = mesh.num_points();
  const attrs = {};
  header.attributes.forEach(([name, type], id) => {
    const att = decoder.GetAttributeByUniqueId(mesh, id);
    const size = att.num_components();
    const arr = type === 4 ? new dm.DracoUInt16Array() : new dm.DracoFloat32Array();
    if (type === 4) decoder.GetAttributeUInt16ForAllPoints(mesh, att, arr);
    else decoder.GetAttributeFloatForAllPoints(mesh, att, arr);
    const out = new Array(n * size);
    for (let i = 0; i < n * size; i++) out[i] = arr.GetValue(i);
    attrs[name] = { size, type, data: out };
  });
  const faces = [];
  const ia = new dm.DracoInt32Array();
  for (let f = 0; f < mesh.num_faces(); f++) {
    decoder.GetFaceFromMesh(mesh, f, ia);
    faces.push([ia.GetValue(0), ia.GetValue(1), ia.GetValue(2)]);
  }
  return { header, n, attrs, faces };
}

/** The walker's color for a vertex of the figure, as [row, flag], or null to drop it (the hat). `bone` is the bone that moves it most. */
function recolor(x, y, z, r, f, bone) {
  if (r === 75 && f === 0) return null; // the hat
  if (f === 2 && y > 1.25) return null; // the hat's band
  if (r === 74 && f === 0) return [row("graphite"), 0]; // shirt -> top
  if (f === 2) return [row("steel"), 0]; // shorts -> joggers
  if (f === 1) {
    if ((y > 1.43 && z < 0.11) || (y > 1.36 && z < -0.02)) return [row("hair"), 0]; // crown, back of head
    if (LEG_BONES.has(bone)) return [row("steel"), 0]; // legs -> joggers, to the ankle
    if (ARM_BONES.has(bone)) return [row("graphite"), 0]; // arms -> sleeves, to the wrist
    return [row("skin1"), 1]; // skin: the shader picks the tone per explorer
  }
  if (r === 78 && f === 0) return [row("white"), 0]; // shoes -> sneakers
  if (r === 76) return [row("hair"), 0];
  if (r === 77) return [row("eye"), 0];
  return [r, f];
}

async function main() {
  const dm = await draco3d.createDecoderModule({});
  const em = await draco3d.createEncoderModule({});
  const src = await decodeSkinned("kid.bin", dm);
  const A = src.attrs;
  const P = A.position.data, N = A.normal.data, CI = A.colorInfo.data, SI = A.skinIndex.data, SW = A.skinWeight.data;

  // Per face: the most common color among its corners; faces touching the hat go.
  const out = { pos: [], nor: [], ci: [], si: [], sw: [], index: [] };
  const split = new Map();
  const vertexOf = (v, rowFlag) => {
    const key = `${v}|${rowFlag[0]}|${rowFlag[1]}`;
    let k = split.get(key);
    if (k === undefined) {
      k = out.pos.length / 3;
      split.set(key, k);
      out.pos.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
      out.nor.push(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]);
      out.ci.push(rowFlag[0], rowFlag[1]);
      out.si.push(SI[v * 4], SI[v * 4 + 1], SI[v * 4 + 2], SI[v * 4 + 3]);
      out.sw.push(SW[v * 4], SW[v * 4 + 1], SW[v * 4 + 2], SW[v * 4 + 3]);
    }
    return k;
  };
  let dropped = 0;
  for (const face of src.faces) {
    const boneOf = (v) => {
      let best = 0;
      for (let k = 1; k < 4; k++) if (SW[v * 4 + k] > SW[v * 4 + best]) best = k;
      return SI[v * 4 + best];
    };
    const cs = face.map((v) => recolor(P[v * 3], P[v * 3 + 1], P[v * 3 + 2], Math.round(CI[v * 2]), Math.round(CI[v * 2 + 1]), boneOf(v)));
    if (cs.some((c) => c === null)) {
      dropped++;
      continue;
    }
    const tally = new Map();
    for (const c of cs) tally.set(c.join(","), (tally.get(c.join(",")) ?? 0) + 1);
    const best = [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0].split(",").map(Number);
    for (const v of face) out.index.push(vertexOf(v, best));
  }

  // The headset, built in Blender, skinned whole to the head bone.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "island-walker-"));
  execFileSync(findBlender(), ["--background", "--factory-startup", "--python-exit-code", "1", "--python", path.join(ROOT, "art", "build.py"), "--", tmp, "walker_headset"], { stdio: ["ignore", "ignore", "inherit"] });
  const hs = JSON.parse(fs.readFileSync(path.join(tmp, "walker_headset.json"), "utf8"));
  fs.rmSync(tmp, { recursive: true, force: true });
  const base = out.pos.length / 3;
  const [hp, hn, hc] = hs.attributes.map((a) => a[2]);
  for (let i = 0; i < hp.length / 3; i++) {
    out.pos.push(hp[i * 3], hp[i * 3 + 1], hp[i * 3 + 2]);
    out.nor.push(hn[i * 3], hn[i * 3 + 1], hn[i * 3 + 2]);
    out.ci.push(hc[i * 2], hc[i * 2 + 1]);
    out.si.push(HEAD_BONE, 0, 0, 0);
    out.sw.push(1, 0, 0, 0);
  }
  for (const k of hs.index) out.index.push(base + k);

  const doc = {
    type: 0,
    attributes: [["skinIndex", 4, out.si, "u16"], ["skinWeight", 4, out.sw], ["position", 3, out.pos], ["normal", 3, out.nor], ["colorInfo", 2, out.ci]],
    index: out.index,
  };
  const bin = await encodeMesh(doc, em);
  const back = await decodeBin(bin, dm);
  fs.writeFileSync(path.join(GEO, "walker.bin"), bin);
  // The figure's skeleton and clips, under the walker's name.
  for (const [from, to] of [["kid-bones.bin", "walker-bones.bin"], ["kid-idle.bin", "walker-idle.bin"], ["kid-run.bin", "walker-run.bin"], ["kid-air.bin", "walker-air.bin"], ["kid-bored.bin", "walker-bored.bin"]]) {
    fs.copyFileSync(path.join(SRC, from), path.join(GEO, to));
  }
  console.log(`public/island/geometries/walker.bin  ${bin.length} B  ${back.triangles} tris (${dropped} hat faces dropped, headset ${hs.index.length / 3} tris)  rows ${back.rows.join(",")}`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
