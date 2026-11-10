/* The network as a list: every map in the registry, with what it calls things and how it
   stands. It is also the way to reach every map without 3D. Maps that are not worlds (their
   manifest fails the checks or does not link back) are listed apart, with the reason. A map's
   districts are left to its panel in the world, so a card stays a few lines long. */
import { instanceHref } from "../../../federation/protocol.ts";
import { capitalize, formatDate, hostOf } from "../lib/copy.ts";
import { statusText, type Listed, type NetworkModel, type World } from "../lib/network.ts";
import { ArrowRight, External } from "./Icons.tsx";
import { WorldIdentity } from "./WorldIdentity.tsx";
import { MapCounts } from "./CountBoard.tsx";

const sentence = (s: string) => {
  const t = capitalize(s.trim());
  return /[.!?…]$/.test(t) ? t : `${t}.`;
};

function WorldCard({ world, onSee, headingLevel }: { world: World; onSee?: (id: string) => void; headingLevel: 2 | 3 | 4 }) {
  const m = world.manifest;
  const H = `h${headingLevel}` as const;
  return (
    <li data-world={world.id} className={`net-card${world.status === "unreachable" ? " is-dim" : ""}`}>
      <div className="net-card-head">
        <div className="net-card-title">
          <H>
            {onSee ? <button type="button" className="world-pill-button" onClick={() => onSee(world.id)}><WorldIdentity name={world.name} accent={world.accent} logo={world.logo} /><span className="sr-only">, explore in the Nexus</span></button> : <WorldIdentity name={world.name} accent={world.accent} logo={world.logo} />}
          </H>
        </div>
      </div>
      {world.status === "unreachable" ? (
        <p className="status status-unreachable">
          Map unavailable. Data from {formatDate(m.updated)}.
        </p>
      ) : null}
      <MapCounts manifest={m} />
      <div className="net-actions">
        <a className="text-link" href={instanceHref(world.url)}>
          Visit map<span className="sr-only">: {world.name}</span>
          <External size={16} />
        </a>
        {world.publisher.website ? (
          <a className="text-link" href={world.publisher.website}>
            Visit link<span className="sr-only">: {world.publisher.name}</span><External size={16} />
          </a>
        ) : null}
      </div>
    </li>
  );
}

function HiddenItem({ item }: { item: Listed }) {
  return (
    <li className="net-hidden-item">
      <p className="net-hidden-name">
        <strong>{item.name}</strong> <span className="net-host">{hostOf(item.url)}</span>
      </p>
      <p className={`status ${item.status === "unreachable" ? "status-unreachable" : "status-problem"}`}>{statusText(item.status)}</p>
      {item.problems.length ? (
        <ul className="problems">
          {item.problems.slice(0, 3).map((p, i) => (
            <li key={i}>{sentence(p)}</li>
          ))}
          {item.problems.length > 3 ? <li>And {item.problems.length - 3} more.</li> : null}
        </ul>
      ) : null}
    </li>
  );
}

export function EmptyNetwork({ joinHref }: { joinHref?: string }) {
  return (
    <div className="empty">
      <p className="empty-title">No maps yet.</p>
      {joinHref ? (
        <a className="text-link" href={joinHref}>
          How to join <ArrowRight size={16} />
        </a>
      ) : null}
    </div>
  );
}

export function NetworkList({ model, onSee, headingLevel = 3, joinHref }: { model: NetworkModel; onSee?: (id: string) => void; headingLevel?: 2 | 3 | 4; joinHref?: string }) {
  const worlds = model.listed.filter((l) => l.world);
  const hidden = model.listed.filter((l) => !l.world);
  const H = `h${headingLevel}` as const;
  return (
    <div className="net">
      {worlds.length ? (
        <ul className="net-grid">
          {worlds.map((l) => (
            <WorldCard key={l.id} world={l.world!} onSee={onSee} headingLevel={headingLevel} />
          ))}
        </ul>
      ) : (
        <EmptyNetwork joinHref={joinHref} />
      )}
      {hidden.length ? (
        <div className="net-hidden">
          <H className="net-hidden-title">Unavailable maps</H>
          <p className="muted">These maps failed the latest check.</p>
          <ul className="net-hidden-list">
            {hidden.map((l) => (
              <HiddenItem key={l.id} item={l} />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
