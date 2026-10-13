// Build the island's assets: run Blender headless on art/build.py, then encode each exported mesh as
// the engine's .bin (a 10-byte NUL-padded ASCII header length, a JSON header, a Draco payload) into
// public/island/geometries/. The .bin files are committed, so a map builds without Blender.
//
//   npm run art                      every asset
//   npm run art -- totem gateway     some of them
//   BLENDER=/path/to/blender npm run art
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import draco3d from "draco3d";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, "public", "island", "geometries");

export function findBlender() {
  const candidates = [process.env.BLENDER, "blender", "/Applications/Blender.app/Contents/MacOS/Blender", "/usr/bin/blender", "/snap/bin/blender"].filter(Boolean);
  for (const c of candidates) {
    try {
      execFileSync(c, ["--version"], { stdio: "ignore" });
      return c;
    } catch {
      /* try the next one */
    }
  }
  throw new Error("Blender not found: install it or set BLENDER=/path/to/blender");
}

/** Header type ids index [Int8, Uint8, Uint8Clamped, Int16, Uint16, Int32, Uint32, Float32, Float64]. */
const FLOAT32 = 7;

/** Encode an exported mesh (art/build.py's JSON) as a .bin buffer. */
export async function encodeMesh(doc, encoderModule) {
  const em = encoderModule ?? (await draco3d.createEncoderModule({}));
  const SEMANTIC = { position: em.POSITION, normal: em.NORMAL, colorInfo: em.COLOR, uv: em.TEX_COORD };
  const builder = new em.MeshBuilder();
  const mesh = new em.Mesh();
  const count = doc.attributes[0][2].length / doc.attributes[0][1];
  builder.AddFacesToMesh(mesh, doc.index.length / 3, new Uint32Array(doc.index));
  const attributes = [];
  for (const [name, size, values, kind] of doc.attributes) {
    if (values.length !== count * size) throw new Error(`${name}: ${values.length} values for ${count} points`);
    if (kind === "u16") {
      builder.AddUInt16Attribute(mesh, em.GENERIC, count, size, new Uint16Array(values));
      attributes.push([name, 4]);
    } else {
      builder.AddFloatAttributeToMesh(mesh, SEMANTIC[name] ?? em.GENERIC, count, size, new Float32Array(values));
      attributes.push([name, FLOAT32]);
    }
  }
  const encoder = new em.Encoder();
  encoder.SetAttributeQuantization(em.POSITION, 14);
  encoder.SetAttributeQuantization(em.NORMAL, 10);
  encoder.SetAttributeQuantization(em.COLOR, 12); // colorInfo: palette rows up to 483 stay exact
  encoder.SetAttributeQuantization(em.TEX_COORD, 14);
  encoder.SetAttributeQuantization(em.GENERIC, 12);
  encoder.SetSpeedOptions(0, 0);
  const out = new em.DracoInt8Array();
  const length = encoder.EncodeMeshToDracoBuffer(mesh, out);
  if (!length) throw new Error("Draco encoding failed");
  const payload = Buffer.alloc(length);
  for (let i = 0; i < length; i++) payload[i] = out.GetValue(i) & 255;
  em.destroy(out);
  em.destroy(encoder);
  em.destroy(mesh);
  em.destroy(builder);
  const header = { type: 0, attributes };
  if (doc.userData) header.userData = doc.userData;
  const json = Buffer.from(JSON.stringify(header), "utf8");
  const lengthField = Buffer.alloc(10);
  lengthField.write(String(json.length), 0, "latin1");
  return Buffer.concat([lengthField, json, payload]);
}

/** Decode a .bin's header and Draco mesh (for checks): counts and colorInfo rows. */
export async function decodeBin(buf, decoderModule) {
  const dm = decoderModule ?? (await draco3d.createDecoderModule({}));
  const headerLength = parseInt(buf.subarray(0, 10).toString("latin1"), 10);
  const header = JSON.parse(buf.subarray(10, 10 + headerLength).toString("utf8"));
  const payload = buf.subarray(10 + headerLength);
  const decoder = new dm.Decoder();
  const db = new dm.DecoderBuffer();
  db.Init(new Int8Array(payload.buffer, payload.byteOffset, payload.byteLength), payload.length);
  const mesh = new dm.Mesh();
  const status = decoder.DecodeBufferToMesh(db, mesh);
  if (!status.ok()) throw new Error(status.error_msg());
  const info = { header, vertices: mesh.num_points(), triangles: mesh.num_faces(), rows: [] };
  const ci = header.attributes.findIndex(([n]) => n === "colorInfo");
  if (ci >= 0) {
    const att = decoder.GetAttributeByUniqueId(mesh, ci);
    const arr = new dm.DracoFloat32Array();
    decoder.GetAttributeFloatForAllPoints(mesh, att, arr);
    const rows = new Set();
    for (let i = 0; i < info.vertices; i++) rows.add(Math.round(arr.GetValue(i * 2) * 100) / 100);
    info.rows = [...rows].sort((a, b) => a - b);
    dm.destroy(arr);
  }
  dm.destroy(mesh);
  dm.destroy(db);
  dm.destroy(decoder);
  return info;
}

async function main() {
  const names = process.argv.slice(2);
  const blender = findBlender();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "island-art-"));
  execFileSync(blender, ["--background", "--factory-startup", "--python-exit-code", "1", "--python", path.join(ROOT, "art", "build.py"), "--", tmp, ...names], { stdio: ["ignore", "inherit", "inherit"] });
  const em = await draco3d.createEncoderModule({});
  const dm = await draco3d.createDecoderModule({});
  fs.mkdirSync(OUT, { recursive: true });
  const files = fs.readdirSync(tmp).filter((f) => f.endsWith(".json") && !f.startsWith("_")).sort();
  for (const f of files) {
    const doc = JSON.parse(fs.readFileSync(path.join(tmp, f), "utf8"));
    const bin = await encodeMesh(doc, em);
    const back = await decodeBin(bin, dm);
    if (back.triangles !== doc.index.length / 3) throw new Error(`${f}: ${back.triangles} triangles back, ${doc.index.length / 3} in`);
    const want = [...new Set(doc.attributes[2][2].filter((_, i) => i % 2 === 0))].sort((a, b) => a - b);
    const got = back.rows;
    if (want.length !== got.length || want.some((r, i) => Math.abs(r - got[i]) > 0.05)) throw new Error(`${f}: palette rows ${got} back, ${want} in`);
    const out = path.join(OUT, f.replace(/\.json$/, ".bin"));
    fs.writeFileSync(out, bin);
    console.log(`${path.relative(ROOT, out)}  ${bin.length} B  ${back.triangles} tris  rows ${got.join(",")}`);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => {
    console.error(err.message ?? err);
    process.exit(1);
  });
}
