/* The landing page: the framework, and the network it joins. Its hero is the live Nexus,
   drifting behind the headline; everything below is short, factual and in the third person. */
import { useEffect, useRef, type RefObject } from "react";
import { Briefcase, Building, CalendarDays, ChevronDown, FileSpreadsheet, Minus, Plus, Rocket, RotateCcw, type LucideIcon } from "lucide-react";
import { FRAMEWORK_REPO } from "../../../federation/protocol.ts";
import { AUDIENCES, HERO_WORDS, PROMO_VIDEO, WHITE_GLOVE, intakeHref, isPublicGitHubForm } from "../config.ts";
import { formatDate, plural } from "../lib/copy.ts";
import { LANDING, type Route } from "../lib/route.ts";
import { routeHref } from "../hooks/useRoute.ts";
import type { NetworkState } from "../hooks/useNetwork.ts";
import type { World } from "../lib/network.ts";
import type { EngineStatus } from "../hooks/useEngine.ts";
import type { NexusEngine } from "../three/engine.ts";
import { APPS, AppBadge } from "./AppMarks.tsx";
import { AudienceWord } from "./AudienceWord.tsx";
import { CodeBlock } from "./CodeBlock.tsx";
import { ArrowRight, Check, External, Mark } from "./Icons.tsx";
import { MusicButton } from "./MusicButton.tsx";
import { NetworkList } from "./NetworkList.tsx";
import { SceneHost } from "./SceneHost.tsx";
import { WorldIdentity } from "./WorldIdentity.tsx";

/** "fritzhand/portfolio-map-3d", from the repository's address. */
const REPO_PATH = new URL(FRAMEWORK_REPO).pathname.replace(/^\/|\/$/g, "");

/** The framework's example map, deployed next to the Nexus (a separate app). */
const EXAMPLE_MAP = `${import.meta.env.BASE_URL}example/`;

/** The guides and the network's terms, in the repository. */
const DOCS = `${FRAMEWORK_REPO}/tree/main/docs`;
const JOINING = `${FRAMEWORK_REPO}/blob/main/docs/network.md#joining`;
/** The local MCP server that lets an AI assistant build a map (mcp/). */
const MCP_GUIDE = `${FRAMEWORK_REPO}/blob/main/docs/mcp.md`;
/** How the builder imports companies from another app (import_companies, import_from_app). */
const FROM_APP_GUIDE = `${MCP_GUIDE}#from-another-app-a-crm-a-database-a-spreadsheet`;
const TERMS = `${FRAMEWORK_REPO}/blob/main/NETWORK.md`;

/** Each audience's icon, by its id in AUDIENCES; an audience without one shows none. */
const AUDIENCE_ICONS: Record<string, LucideIcon> = { accelerators: Rocket, funds: Briefcase, hubs: Building, events: CalendarDays };

/** Opens a service package's details (an audience card links to it). */
function openPackage(id: string) {
  const details = document.querySelector<HTMLDetailsElement>(`#package-${id} details`);
  if (details) details.open = true;
}

const START = `npx degit ${REPO_PATH} my-map
cd my-map && npm install
npm run dev`;

interface Props {
  route: Route;
  net: NetworkState;
  engine: NexusEngine | null;
  gl: EngineStatus;
  onEnter: (worldId?: string) => void;
  pickRef: RefObject<((id: string | null, district?: string) => void) | null>;
}

export function Landing({ route, net, engine, gl, onEnter, pickRef }: Props) {
  const hero = useRef<HTMLElement>(null);
  const text = useRef<HTMLDivElement>(null);
  const model = net.status === "ready" ? net.model : null;

  useEffect(() => {
    document.title = "The Nexus · company maps";
  }, []);

  // The universe fills the desktop hero; on narrow screens it sits above the copy.
  useEffect(() => {
    if (!engine) return;
    pickRef.current = (id) => {
      if (id) onEnter(id === "core" ? undefined : id);
    };
    engine.showHero();
    const h = hero.current;
    const t = text.current;
    if (!h || !t) return;
    const measure = () => {
      const hr = h.getBoundingClientRect();
      const tr = t.getBoundingClientRect();
      const wide = hr.width >= 900;
      const scale = wide ? Number.parseFloat(getComputedStyle(h).fontSize) / 16 : 1;
      engine.setInsets(wide ? { top: 96 * scale, right: 32 * scale, bottom: 144 * scale, left: Math.min(240 * scale, hr.width * 0.18) } : { top: 112, right: 12, bottom: Math.max(0, hr.bottom - tr.top + 16), left: 12 });
      engine.setHeroOverlay({ l: tr.left - hr.left - 16 * scale, t: tr.top - hr.top - 16 * scale, r: tr.right - hr.left + 16 * scale, b: tr.bottom - hr.top + 16 * scale });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(h);
    ro.observe(t);
    return () => {
      ro.disconnect();
      pickRef.current = null;
    };
  }, [engine, onEnter, pickRef]);

  const stat = !model
    ? ""
    : model.worlds.length
      ? `${model.worlds.length} ${plural(model.worlds.length, "map", "maps")} · ${model.companies.toLocaleString("en-US")} ${plural(model.companies, "company", "companies")}`
      : "No maps yet.";

  // A price of null reads "Quoted per organization": said once when it holds for every package.
  const quoted = WHITE_GLOVE.packages.every((p) => p.price === null);
  const intake = WHITE_GLOVE.intake;

  return (
    <>
      <a className="skip-link" href="#content">
        Skip to content
      </a>
      <header className="site-header">
        <div className="site-header-inner">
          <a className="brand" href={routeHref({ ...LANDING, sample: route.sample })} aria-label="The Nexus, home">
            <Mark size={28} className="brand-mark" />
            <span className="brand-name">The Nexus</span>
          </a>
          <nav className="site-nav" aria-label="Sections">
            {route.sample ? <span className="sample-badge">Sample data</span> : null}
            <a className="nav-link nav-optional" href="#network">
              Network
            </a>
            <a className="nav-link nav-optional" href="#built-for-you">
              Services
            </a>
            <a className="nav-link" href="#get-started">
              Get started
            </a>
            <a className="nav-link nav-github" href={FRAMEWORK_REPO}>
              GitHub
            </a>
          </nav>
        </div>
      </header>

      <main id="content" tabIndex={-1}>
        <section className="hero" ref={hero} aria-labelledby="hero-title">
          {gl === "unavailable" ? (
            <div className="hero-scene hero-fallback" aria-hidden="true" />
          ) : (
            <SceneHost engine={engine} className="hero-scene" interactive label="Company maps in 3D. Drag sideways to rotate. Select a planet to browse its companies, or use the map list below." />
          )}
          <div className="hero-scrim" aria-hidden="true" />
          <div className="hero-inner">
            <div className="hero-text" ref={text}>
              <h1 id="hero-title">
                <span>Explore the</span>{" "}
                <span>
                  <AudienceWord words={HERO_WORDS} /> universe.
                </span>
              </h1>
              <p className="lede">
                Choose a planet. Browse its companies.
              </p>
              <div className="cta-row">
                <button type="button" className="btn btn-orb btn-large" onClick={() => onEnter()}>
                  Browse maps <ArrowRight size={18} />
                </button>
                <a className="btn btn-outline btn-large" href="#get-started">
                  Get started
                </a>
              </div>
              <p className="hero-meta">
                <span className="hero-stat" aria-live="polite">
                  {stat}
                </span>
              </p>
            </div>
          </div>
          {gl === "ready" ? (
            <div className="hero-tools">
              <p className="hero-hint"><span className="hint-desktop">Drag to rotate</span><span className="hint-touch">Swipe sideways to rotate</span> · Select a planet</p>
              <div className="hero-controls" role="group" aria-label="Universe view">
                <button type="button" className="icon-btn" aria-label="Zoom in" onClick={() => engine?.zoom(0.8)}><Plus size={18} /></button>
                <button type="button" className="icon-btn" aria-label="Zoom out" onClick={() => engine?.zoom(1.25)}><Minus size={18} /></button>
                <button type="button" className="icon-btn" aria-label="Reset universe view" onClick={() => engine?.showHero()}><RotateCcw size={18} /></button>
              </div>
            </div>
          ) : null}
        </section>

        {PROMO_VIDEO ? (
          <section className="section" id="video" aria-labelledby="video-title">
            <div className="container">
              <h2 id="video-title">The network in {PROMO_VIDEO.seconds} seconds</h2>
              {/* preload="none": nothing is fetched until the visitor presses play. */}
              <video className="promo-video" controls playsInline preload="none" poster={PROMO_VIDEO.poster} aria-labelledby="video-title" aria-describedby="video-caption">
                <source src={PROMO_VIDEO.src} type="video/mp4" />
              </video>
              <p className="video-meta">
                <span id="video-caption">{PROMO_VIDEO.caption}</span>
                {PROMO_VIDEO.portrait ? (
                  <a className="text-link" href={PROMO_VIDEO.portrait}>
                    Vertical video <ArrowRight size={16} />
                  </a>
                ) : null}
              </p>
            </div>
          </section>
        ) : null}

        <section className="section" id="who" aria-labelledby="who-title">
          <div className="container">
            <h2 id="who-title">Who it's for</h2>
            <p className="section-lede">Any organization with companies to show: a program, a portfolio, a region or an event.</p>
            <ul className="audience-list">
              {AUDIENCES.map((a) => {
                const Icon = AUDIENCE_ICONS[a.id];
                // Only maps that are in the network now; a service only when it is offered.
                const shown = model ? a.examples.map((id) => model.byId.get(id)).filter((w): w is World => Boolean(w)) : [];
                const service = a.service ? WHITE_GLOVE.packages.find((p) => p.id === a.service) : undefined;
                return (
                  <li key={a.id} className="audience-card">
                    {Icon ? <Icon size={20} className="audience-icon" aria-hidden="true" /> : null}
                    <h3>{a.name}</h3>
                    <p>{a.summary}</p>
                    {shown.length ? (
                      <ul className="audience-examples" aria-label={`Maps for ${a.name.toLowerCase()}`}>
                        {shown.map((w) => (
                          <li key={w.id}>
                            {gl === "unavailable" ? (
                              <a className="world-pill-button" href={w.url}>
                                <WorldIdentity name={w.name} accent={w.accent} logo={w.logo} />
                              </a>
                            ) : (
                              <button type="button" className="world-pill-button" onClick={() => onEnter(w.id)} aria-label={`Explore ${w.name} in the Nexus`}>
                                <WorldIdentity name={w.name} accent={w.accent} logo={w.logo} />
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {service ? (
                      <a className="text-link audience-service" href={`#package-${service.id}`} onClick={() => openPackage(service.id)}>
                        {service.name} service <ArrowRight size={16} />
                      </a>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <section className="section" id="network" aria-labelledby="network-title">
          <div className="container">
            <div className="section-head">
              <h2 id="network-title">The network</h2>
              {model?.generated ? <p className="section-note">Last checked {formatDate(model.generated)}</p> : null}
            </div>
            {net.status === "loading" ? <p className="muted section-body">Loading maps...</p> : null}
            {net.status === "error" ? <p className="status status-problem section-body">{net.message}</p> : null}
            {model ? <NetworkList model={model} onSee={gl === "unavailable" ? undefined : (id) => onEnter(id)} joinHref={JOINING} /> : null}
          </div>
        </section>

        <section className="section" id="get-started" aria-labelledby="start-title">
          <div className="container">
            <div className="start">
              <div className="start-text">
                <h2 id="start-title">Make your own map</h2>
                <p>Add your companies. Publish a globe, walk view and directory.</p>
                <p>
                  Or let an AI assistant build it with the local MCP server in the repository. Claude Code offers it when you open the
                  folder; Claude Desktop, Cursor and other MCP clients connect to <code>mcp/server.mjs</code>. Every change is checked
                  against the data contract before it is written.
                </p>
                <div className="setup-links" id="how">
                  <a className="text-link" href={DOCS}>Setup guide <External size={16} /></a>
                  <a className="text-link" href={MCP_GUIDE}>MCP builder <External size={16} /></a>
                  <a className="text-link" href={JOINING}>Join the network <External size={16} /></a>
                </div>
              </div>
              <div className="start-command">
                <CodeBlock code={START} label="Start a map" />
                <p className="fine">Requires Node 22.18+. The example uses fictional companies.</p>
              </div>
            </div>
            <div className="start-apps" aria-labelledby="apps-title">
              <h3 id="apps-title">Import from another app</h3>
              <p>
                Keep your companies in a CRM, a database or a spreadsheet? An AI assistant connected to it can import them through the
                MCP builder. You choose the list and see a preview before anything is written.
              </p>
              <ul className="app-list" aria-label="Apps to import from">
                {APPS.map((app) => (
                  <li key={app.name} className="world-pill">
                    <AppBadge app={app} />
                    <span className="world-pill-name">{app.name}</span>
                  </li>
                ))}
                <li className="world-pill">
                  <span className="badge badge-logo app-badge app-badge-file" aria-hidden="true">
                    <FileSpreadsheet />
                  </span>
                  <span className="world-pill-name">A CSV file</span>
                </li>
              </ul>
              <p className="fine">
                The builder never connects to these apps and takes only the fields the map shows. HubSpot, Airtable, Notion and Google
                Sheets are trademarks of their owners, who do not endorse this project.{" "}
                <a className="text-link" href={FROM_APP_GUIDE}>How it works <External size={16} /></a>
              </p>
            </div>
          </div>
        </section>

        <section className="section" id="built-for-you" aria-labelledby="built-title">
          <div className="container">
            <h2 id="built-title">Services</h2>
            <p className="section-lede">{WHITE_GLOVE.provider ? `Map setup by ${WHITE_GLOVE.provider}.` : "Help building and maintaining your map."}</p>
            <ul className="service-list">
              {[...WHITE_GLOVE.packages.filter((p) => !p.addon), ...WHITE_GLOVE.packages.filter((p) => p.addon)].map((p) => (
                <li key={p.id} id={`package-${p.id}`} className={p.addon ? "package is-addon" : "package"}>
                  <details className="package-details">
                    <summary>
                      <span className="package-overview"><span className="package-name">{p.name}</span><span>{p.summary}</span></span>
                      <ChevronDown size={18} aria-hidden="true" />
                    </summary>
                    <ul className="includes">
                    {p.includes.map((line) => (
                      <li key={line}>
                        <Check size={16} className="include-icon" />
                        <span>{line}</span>
                      </li>
                    ))}
                    </ul>
                  </details>
                  {p.exampleHref ? (
                    <p className="package-example">
                      <a className="text-link" href={p.exampleHref}>
                        Example<span className="sr-only">: {p.name}</span> <ArrowRight size={16} />
                      </a>
                    </p>
                  ) : null}
                  {quoted ? null : <p className="package-price">{p.price ?? "Price on request"}</p>}
                  {p.checkoutUrl ? (
                    <a className="btn btn-outline btn-small" href={p.checkoutUrl}>
                      Book<span className="sr-only">: {p.name}</span>
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
            <div className="wg-cta">
              <a className="btn btn-primary btn-large" href={intakeHref(intake)}>
                Request help <ArrowRight size={18} />
              </a>
              <p className="fine">
                {quoted ? "Price on request. " : null}
                {"email" in intake ? (
                  <>
                    Email <a href={`mailto:${intake.email}`}>{intake.email}</a>.
                  </>
                ) : isPublicGitHubForm(intake.url) ? (
                  "GitHub requests are public."
                ) : null}
                {WHITE_GLOVE.note ? ` ${WHITE_GLOVE.note}` : null}
              </p>
            </div>
          </div>
        </section>

      </main>

      <footer className="site-footer">
        <div className="container footer-inner">
          <div className="footer-top">
            <a className="footer-brand" href={routeHref({ ...LANDING, sample: route.sample })} aria-label="The Nexus, home">
              <Mark size={24} className="brand-mark" />
              The Nexus
            </a>
            <nav className="footer-links" aria-label="Project">
              <a href={FRAMEWORK_REPO}>GitHub</a>
              <a href={DOCS}>Documentation</a>
              <a href={EXAMPLE_MAP}>Example map</a>
              <a href={TERMS}>Network terms</a>
            </nav>
          </div>
          <p className="fine">
            The code uses the MIT License. Map names, data and logos belong to their publishers.
          </p>
        </div>
      </footer>

      <MusicButton />
    </>
  );
}
