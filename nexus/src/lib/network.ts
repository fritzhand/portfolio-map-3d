/* The network as the Nexus shows it, read from a snapshot (nexus/public/network.json, or the
   sample with ?sample).

   The snapshot is built and checked by scripts/build-network.mjs, and it is checked again here,
   with the protocol's own checks: a world is shown only when its manifest validates, belongs to
   its registry entry and links back to the Nexus (federation/validate.ts verifyInstance).

   - "verified" instances are worlds. (The build also checked what needs the network: the page's
     meta tag and the publisher's proof of ownership, recorded as `proof`.)
   - "unreachable" instances that still have a last good manifest are worlds too, dimmed and
     marked "Not reachable at last check".
   - Everything else (invalid, no backlink, unconfirmed by its publisher, never read) is never a
     world. It appears in the network list with its problem in plain words.

   Pure functions, unit-tested. */
import { PROTOCOL, onThisDeployment, type InstanceStatus, type Manifest, type OwnerProof, type RegistryEntry } from "../../../federation/protocol.ts";
import { validateRegistryEntry, verifyInstance } from "../../../federation/validate.ts";
import { layoutWorlds, type Placement } from "./layout.ts";

export interface World {
  id: string;
  name: string;
  url: string;
  tagline: string | null;
  accent: string;
  status: "verified" | "unreachable";
  /** When the manifest was last read, YYYY-MM-DD, or null. */
  checked: string | null;
  joined: string;
  /** Who publishes the map (often the same organization as `name`). */
  publisher: Manifest["publisher"];
  /** How the publisher vouched for it, as the build recorded it; null if the snapshot does not say. */
  proof: OwnerProof | null;
  /** A path under the Nexus (e.g. "instances/acme.png"), or null: the badge shows initials. */
  logo: string | null;
  manifest: Manifest;
  placement: Placement;
}

export interface Listed {
  id: string;
  name: string;
  url: string;
  status: InstanceStatus;
  checked: string | null;
  /** Why it is not a world, in plain words (empty for worlds). */
  problems: string[];
  logo: string | null;
  world: World | null;
}

export interface NetworkModel {
  generated: string | null;
  /** The worlds, by name. */
  worlds: World[];
  byId: Map<string, World>;
  /** Every listed instance: verified worlds, then unreachable worlds, then the rest; each by name. */
  listed: Listed[];
  /** Companies across all worlds. */
  companies: number;
}

export class SnapshotError extends Error {}

const STATUSES: readonly InstanceStatus[] = ["verified", "unreachable", "invalid", "no-backlink", "unconfirmed"];
const PROOFS: readonly OwnerProof[] = ["domain", "dns", "link", "maintainer"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const LOGO_PATH = /^[A-Za-z0-9][A-Za-z0-9._\-/]*\.(?:png|webp|jpe?g|svg|avif|gif)$/i;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** A logo path the Nexus may load: relative, under its own origin, an image. Anything else is null. */
export function safeLogoPath(p: unknown): string | null {
  if (typeof p !== "string" || p.length > 200) return null;
  if (p.includes("..") || p.includes("//") || p.includes("\\") || !LOGO_PATH.test(p)) return null;
  return p;
}

function plainProblems(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((p): p is string => typeof p === "string" && !!p.trim()).map((p) => (p.length > 300 ? `${p.slice(0, 297)}…` : p));
}

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name, "en", { sensitivity: "base", numeric: true });

/** The model for a snapshot. Throws SnapshotError when it is not a snapshot of this protocol. */
export function buildNetwork(snapshot: unknown): NetworkModel {
  if (!isObj(snapshot) || snapshot.protocol !== PROTOCOL || !Array.isArray(snapshot.instances)) {
    throw new SnapshotError(`The network list is not a ${PROTOCOL} snapshot.`);
  }
  const generated = typeof snapshot.generated === "string" && DATE.test(snapshot.generated) ? snapshot.generated : null;

  interface Raw {
    entry: RegistryEntry;
    status: InstanceStatus;
    checked: string | null;
    manifest: unknown;
    logo: string | null;
    proof: OwnerProof | null;
    problems: string[];
  }
  const raws: Raw[] = [];
  const seen = new Set<string>();
  for (const inst of snapshot.instances) {
    if (!isObj(inst) || validateRegistryEntry(inst.entry).length) continue;
    const entry = inst.entry as unknown as RegistryEntry;
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    raws.push({
      entry,
      status: STATUSES.includes(inst.status as InstanceStatus) ? (inst.status as InstanceStatus) : "invalid",
      checked: typeof inst.checked === "string" && DATE.test(inst.checked) ? inst.checked : null,
      manifest: inst.manifest ?? null,
      logo: safeLogoPath(inst.logoFile),
      proof: PROOFS.includes(inst.proof as OwnerProof) ? (inst.proof as OwnerProof) : null,
      problems: plainProblems(inst.problems),
    });
  }

  // Every registered instance keeps a slot, shown or not, so worlds never move when another drops out.
  const companiesOf = (m: unknown) => (isObj(m) && isObj(m.counts) && typeof m.counts.companies === "number" ? m.counts.companies : 0);
  const placements = new Map(layoutWorlds(raws.map((r) => ({ id: r.entry.id, joined: r.entry.joined, companies: companiesOf(r.manifest) }))).map((p) => [p.id, p]));

  const listed: Listed[] = [];
  for (const r of raws) {
    const base = { id: r.entry.id, name: r.entry.name, url: r.entry.url, checked: r.checked, logo: r.logo };
    if ((r.status === "verified" || r.status === "unreachable") && r.manifest) {
      const v = verifyInstance(r.entry, r.manifest);
      if (v.status === "verified") {
        const m = r.manifest as Manifest;
        const world: World = {
          id: r.entry.id,
          name: m.name,
          url: m.url,
          tagline: m.tagline,
          accent: m.accent,
          status: r.status,
          checked: r.checked,
          joined: r.entry.joined,
          publisher: m.publisher,
          proof: r.proof,
          logo: r.logo,
          manifest: m,
          placement: placements.get(r.entry.id)!,
        };
        listed.push({ ...base, name: m.name, status: r.status, problems: r.status === "unreachable" ? r.problems : [], world });
        continue;
      }
      listed.push({ ...base, status: v.status, problems: v.problems, world: null });
      continue;
    }
    const problems = r.problems.length ? r.problems : r.status === "verified" ? ["the snapshot holds no manifest for it"] : r.status === "unreachable" ? ["no manifest has been read yet"] : [];
    listed.push({ ...base, status: r.status === "verified" ? "invalid" : r.status, problems, world: null });
  }

  const rank = (l: Listed) => (l.world ? (l.world.status === "verified" ? 0 : 1) : 2);
  listed.sort((a, b) => rank(a) - rank(b) || byName(a, b));
  const worlds = listed.flatMap((l) => (l.world ? [l.world] : [])).sort(byName);
  return {
    generated,
    worlds,
    byId: new Map(worlds.map((w) => [w.id, w])),
    listed,
    companies: worlds.reduce((n, w) => n + w.manifest.counts.companies, 0),
  };
}

/**
 * The network as seen from the deployment at `here`: a map published on the Nexus's own site (the
 * example map) is linked on this deployment, so a preview of the Nexus opens the preview's own copy
 * of it rather than the live one. Seen from the Nexus's own site, nothing changes.
 */
export function servedFrom(model: NetworkModel, here: string): NetworkModel {
  const moved = new Map<World, World>();
  const world = (w: World) => {
    let m = moved.get(w);
    if (!m) moved.set(w, (m = { ...w, url: onThisDeployment(w.url, here) }));
    return m;
  };
  const worlds = model.worlds.map(world);
  return {
    ...model,
    worlds,
    byId: new Map(worlds.map((w) => [w.id, w])),
    listed: model.listed.map((l) => ({ ...l, url: onThisDeployment(l.url, here), world: l.world ? world(l.world) : null })),
  };
}

/** Plain words for an instance's status. */
export function statusText(status: InstanceStatus): string {
  switch (status) {
    case "verified":
      return "Verified";
    case "unreachable":
      return "Not reachable at last check";
    case "invalid":
      return "Not shown: its manifest does not pass the checks";
    case "no-backlink":
      return "Not shown: it does not link to the Nexus";
    case "unconfirmed":
      return "Not shown: its publisher has not confirmed it";
  }
}
