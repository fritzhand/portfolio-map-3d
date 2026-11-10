/* Search across the network (lib/search.ts): every word must match, short words only at a word
   start. Results are grouped by world; choosing one flies to its world and opens its panel,
   and each company also links straight into its map. */
import { useDeferredValue, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { instanceHref } from "../../../federation/protocol.ts";
import { plural } from "../lib/copy.ts";
import { searchNetwork, type SearchIndex } from "../lib/search.ts";
import { Close, External, SearchIcon } from "./Icons.tsx";
import { DistrictIcon, districtLabel } from "./DistrictIcon.tsx";
import { WorldIdentity } from "./WorldIdentity.tsx";
import "../styles/directory.css";

interface Props {
  index: SearchIndex;
  /** Open a world; `filter` prefills its panel's company filter. */
  onWorld: (id: string, filter?: string) => void;
  onCompany: (worldId: string, slug: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
}

export function NetworkSearch({ index, onWorld, onCompany, inputRef }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const deferred = useDeferredValue(query);
  const result = useMemo(() => searchNetwork(index, deferred), [index, deferred]);
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();
  const showing = open && !!query.trim();

  useEffect(() => {
    if (!showing) return;
    const away = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", away);
    return () => window.removeEventListener("pointerdown", away);
  }, [showing]);

  const summary = !deferred.trim()
    ? ""
    : result.totalCompanies || result.totalWorlds
      ? `${result.totalCompanies} ${plural(result.totalCompanies, "company", "companies")} in ${result.totalWorlds} ${plural(result.totalWorlds, "map", "maps")}`
      : "No matches";

  const focusables = () => Array.from(list.current?.querySelectorAll<HTMLElement>("button, a") ?? []);

  function onInputKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.stopPropagation();
      if (query) setQuery("");
      else inputRef.current?.blur();
      setOpen(false);
    } else if (e.key === "ArrowDown" && showing) {
      e.preventDefault();
      focusables()[0]?.focus();
    }
  }

  function onListKey(e: KeyboardEvent<HTMLDivElement>) {
    const items = focusables();
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      items[Math.min(items.length - 1, i + 1)]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (i <= 0) inputRef.current?.focus();
      else items[i - 1]?.focus();
    } else if (e.key === "Escape") {
      e.stopPropagation();
      setOpen(false);
      inputRef.current?.focus();
    }
  }

  const choose = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  return (
    <div className="search network-search" ref={box} role="search">
      <label className="sr-only" htmlFor={`${id}-q`}>
        Search companies and maps across the network
      </label>
      <SearchIcon size={18} className="search-icon" />
      <input
        ref={inputRef}
        id={`${id}-q`}
        className="search-input"
        type="search"
        placeholder="Search companies and maps"
        autoComplete="off"
        spellCheck={false}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onInputKey}
        aria-controls={`${id}-results`}
      />
      {query ? (
        <button
          type="button"
          className="search-clear"
          aria-label="Clear search"
          onClick={() => {
            setQuery("");
            inputRef.current?.focus();
          }}
        >
          <Close size={16} />
        </button>
      ) : null}
      <p className="sr-only" role="status">
        {open ? summary : ""}
      </p>
      <div id={`${id}-results`} className="search-results" ref={list} hidden={!showing} onKeyDown={onListKey}>
        {showing && !result.groups.length ? <p className="search-empty">No matches for &quot;{query.trim()}&quot;.</p> : null}
        {showing && result.groups.length ? <p className="search-summary">{summary}</p> : null}
        {showing
          ? result.groups.map((g) => {
              return (
                <section key={g.world.id} className="sr-group" aria-label={g.world.name}>
                  <button type="button" className="sr-world" onClick={choose(() => onWorld(g.world.id))}>
                    <WorldIdentity name={g.world.name} accent={g.world.accent} logo={g.world.logo} />
                  </button>
                  {g.companies.length ? (
                    <ul className="sr-companies">
                      {g.companies.map((c) => (
                        <li key={c.company.slug} className="sr-company">
                          <button type="button" className="sr-company-main" onClick={choose(() => onCompany(g.world.id, c.company.slug))}>
                            <span className="sr-company-name">{c.company.name}</span>
                            {c.district ? (
                              <span className="sr-category" title={c.district.label}>
                                <DistrictIcon label={c.district.label} size={16} />
                                <span aria-hidden="true">{districtLabel(c.district.label)}</span>
                                <span className="sr-only">{c.district.label}</span>
                              </span>
                            ) : null}
                          </button>
                          <a className="sr-open" href={instanceHref(g.world.url, c.company.slug)} aria-label={`Open ${c.company.name} in ${g.world.name}`} title={`Open in ${g.world.name}`}>
                            <External size={16} />
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {g.total > g.companies.length ? (
                    <button type="button" className="sr-more" onClick={choose(() => onWorld(g.world.id, query.trim()))}>
                      Show all {g.total} in {g.world.name}
                    </button>
                  ) : null}
                </section>
              );
            })
          : null}
      </div>
    </div>
  );
}
