/* Deep links: ?view=walk&company=<company>&person=<person>&district=<district>&need=<service>&for=<industry>&q=<text>
   plus globe=people (the people globe) and list=people (the list's people tab).
   Read once at boot; written (replaceState) whenever the shareable state changes. Parsing and
   writing are pure functions over a query string, so they are unit-tested without a browser. */
import { personBySlug, districtBySlug, industryLabel, companyBySlug, serviceLabel } from "../data/catalog";
import type { DistrictSlug } from "../data/types";
import { useStore, type Roster, type View } from "./store";

const VIEWS: View[] = ["mindmap", "walk", "list"];

/** A deep link, every value checked against the catalog (anything unknown is null). */
export interface UrlState {
  view: View | null;
  company: string | null;
  person: string | null;
  district: DistrictSlug | null;
  need: string | null;
  forIndustry: string | null;
  query: string | null;
  /** "people" from ?globe=people or ?list=people. */
  roster: Roster | null;
}

export function parseUrl(search: string): UrlState {
  const p = new URLSearchParams(search);
  const view = p.get("view") as View | null;
  const m = p.get("company");
  const person = p.get("person");
  const d = p.get("district") as DistrictSlug | null;
  const need = p.get("need");
  const forInd = p.get("for");
  const q = p.get("q");
  return {
    view: view && VIEWS.includes(view) ? view : null,
    company: m && companyBySlug.has(m) ? m : null,
    person: person && personBySlug.has(person) ? person : null,
    district: d && districtBySlug.has(d) ? d : null,
    need: need && serviceLabel.has(need) ? need : null,
    forIndustry: forInd && industryLabel.has(forInd) ? forInd : null,
    query: q ? q.slice(0, 80) : null,
    roster: p.get("globe") === "people" || p.get("list") === "people" ? "people" : null,
  };
}

/**
 * Applies a deep link to the store. The roster and the person come after the company: a link that
 * names the people globe and a company opens the people globe with the company set aside for the
 * companies globe, and a link that names a person opens that person (in any view). The search text
 * comes last, so it stays on the globe the link opens.
 */
export function applyUrlState(u: UrlState): void {
  const s = useStore.getState();
  if (u.view) s.setView(u.view);
  if (u.district) s.focusOn(u.district, { fly: !u.company });
  if (u.company) s.select(u.company, { fly: true });
  if (u.need || u.forIndustry) {
    s.setFinder({ service: u.need, industry: u.forIndustry });
    s.openPanel("finder");
  }
  if (u.roster) s.setRoster(u.roster);
  if (u.person) s.selectPerson(u.person, { fly: true });
  // Last: the search text belongs to the globe the link opens (switching globes sets it aside).
  if (u.query) s.setQuery(u.query);
}

export function readUrlState(): void {
  applyUrlState(parseUrl(window.location.search));
}

type Shareable = Pick<ReturnType<typeof useStore.getState>, "view" | "roster" | "selected" | "person" | "focusDistrict" | "panel" | "finder" | "query">;

/** The query string (without "?") for the shareable state; `current` keeps the switches that are not app state. */
export function urlSearch(s: Shareable, current: string): string {
  const p = new URLSearchParams();
  if (s.view !== "mindmap") p.set("view", s.view);
  if (s.roster === "people" && s.view === "mindmap") p.set("globe", "people");
  if (s.roster === "people" && s.view === "list") p.set("list", "people");
  if (s.selected) p.set("company", s.selected);
  if (s.person) p.set("person", s.person);
  if (s.focusDistrict) p.set("district", s.focusDistrict);
  if (s.panel === "finder") {
    if (s.finder.service) p.set("need", s.finder.service);
    if (s.finder.industry) p.set("for", s.finder.industry);
  }
  if (s.query.trim()) p.set("q", s.query.trim());
  // Keep switches that aren't app state (?live=local for multiplayer tests, ?diag for the graphics
  // check, ?kit for the walk world's model gallery, ?debug for the in-app scene probe).
  const cur = new URLSearchParams(current);
  const live = cur.get("live");
  if (live) p.set("live", live);
  if (cur.has("diag")) p.set("diag", "");
  if (cur.has("kit")) p.set("kit", cur.get("kit") ?? "");
  if (cur.has("debug")) p.set("debug", "");
  // ?at=x,z[,heading[,distance]] starts the walk world's walker somewhere (development builds only; src/views/walk/engine.ts).
  if (import.meta.env.DEV && cur.has("at")) p.set("at", cur.get("at") ?? "");
  return p.toString();
}

export function syncUrl(): () => void {
  return useStore.subscribe((s) => {
    const qs = urlSearch(s, window.location.search);
    const url = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
    if (url !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, "", url);
  });
}
