// @ts-nocheck
/* The records the island is built from: the site's own (src/data/catalog.ts), or, in development builds
   only, a generated stand-in for trying the island at other sizes:

     ?synthetic=13x540      13 districts, 540 companies in all, one district holding 45% of them
     ?synthetic=36x224      36 districts, 224 companies, evenly
     ?synthetic=4x46,18     4 districts, 46 companies, and 18 people

   The stand-ins are placeholders ("Company 12"), never shipped and never mistaken for a site's records. */
import { COMPANIES, DISTRICTS, PEOPLE } from '../data/catalog';

const HUES = [4, 28, 48, 88, 140, 172, 196, 214, 236, 262, 290, 320];
const ICONS = ['leaf', 'heart-pulse', 'cpu', 'sparkles', 'shopping-bag', 'landmark', 'anchor', 'film', 'graduation-cap', 'rocket', 'globe', 'brain'];

function hsl(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function synthetic(spec: string) {
  const [dc, rest] = spec.split('x');
  const [cc, pc] = (rest ?? '').split(',');
  const nd = Math.max(1, Math.min(40, parseInt(dc, 10) || 6));
  const nc = Math.max(0, Math.min(2000, parseInt(cc, 10) || 30));
  const np = Math.max(0, Math.min(200, parseInt(pc ?? '6', 10) || 0));
  const districts = Array.from({ length: nd }, (_, i) => ({
    slug: `d${i + 1}`,
    label: `District ${i + 1}`,
    short: `D${i + 1}`,
    color: hsl(HUES[i % HUES.length] + Math.floor(i / HUES.length) * 9, 0.62, i % 2 ? 0.46 : 0.42),
    icon: ICONS[i % ICONS.length],
    industries: [],
  }));
  // Uneven like a real catalog: the first district takes the lion's share when there are many companies.
  const share = nc > 200 ? 0.45 : 0;
  const counts = districts.map(() => 0);
  const big = Math.round(nc * share);
  counts[0] = big;
  for (let k = 0; k < nc - big; k++) counts[(k % (nd - (share ? 1 : 0))) + (share ? 1 : 0)]++;
  const companies = [];
  districts.forEach((d, i) => {
    for (let k = 0; k < counts[i]; k++) {
      const n = companies.length + 1;
      companies.push({ slug: `company-${n}`, name: `Company ${n}`, district: d.slug, secondaryDistricts: [], services: [], servesIndustries: [], tags: [], keywords: [] });
    }
  });
  const people = Array.from({ length: np }, (_, i) => ({ slug: `person-${i + 1}`, name: `Person ${i + 1}`, title: '' }));
  return { districts, companies, people };
}

let cached: { districts: any[]; companies: any[]; people: any[] } | null = null;

/** The districts, companies and people the island shows. */
export function islandCatalog() {
  if (cached) return cached;
  const spec = import.meta.env.DEV && typeof location !== 'undefined' ? new URLSearchParams(location.search).get('synthetic') : null;
  cached = spec ? synthetic(spec) : { districts: DISTRICTS, companies: COMPANIES, people: PEOPLE };
  return cached;
}
