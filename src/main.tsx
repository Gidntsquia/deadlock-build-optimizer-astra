import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import {
  Flame,
  Crosshair,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  X,
  Layers,
  Clock3,
  ShieldCheck,
  Activity,
  ArrowRight,
  WifiOff,
  Info,
} from "lucide-react";
import { generateBuilds } from "./generator";
import { computeCore, loadValidation, validateBuild } from "./validation";
import { personalInsight } from "./personalization";
import { statLines, descriptions } from "./assetText";
import type {
  AggregateData,
  Asset,
  Build,
  Buy,
  Manifest,
  PersonalMatch,
  ValidationMatch,
} from "./types";
import "./style.css";
const base = import.meta.env.BASE_URL;
const souls = (n: number) => n.toLocaleString("en-US");
const compact = (n: number) => `${(n / 1000).toFixed(1)}k`;
interface Data extends AggregateData {
  images: Record<string, string>;
  manifest: Manifest;
  personal: PersonalMatch[];
  validation: ValidationMatch[];
}
async function read<T>(name: string): Promise<T> {
  const res = await fetch(`${base}data/${name}.json`);
  if (!res.ok)
    throw new Error(`Missing ${name} snapshot. Run npm run fetch-data.`);
  return res.json();
}
async function load(): Promise<Data> {
  const [
    heroes,
    items,
    abilities,
    weapons,
    analytics,
    images,
    manifest,
    personal,
  ] = await Promise.all([
    read<Data["heroes"]>("heroes"),
    read<Data["items"]>("items"),
    read<Data["abilities"]>("abilities"),
    read<Data["weapons"]>("weapons"),
    read<Data["analytics"]>("analytics"),
    read<Data["images"]>("images"),
    read<Manifest>("manifest"),
    read<PersonalMatch[]>("personal-history"),
  ]);
  const aggregate = { heroes, items, abilities, weapons, analytics };
  generateBuilds(aggregate, 1); // Complete generation before opening the held-out snapshot.
  const validation = await loadValidation(base);
  return { ...aggregate, images, manifest, personal, validation };
}
function Root() {
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    load()
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  return data ? (
    <App data={data} />
  ) : (
    <main className="loading">
      <Crosshair size={36} />
      <h1>Deadlock Build Optimizer</h1>
      <p role="status">{error || "Opening your local snapshots…"}</p>
      {error && <button onClick={() => location.reload()}>Try again</button>}
    </main>
  );
}
function App({ data }: { data: Data }) {
  const [heroId, setHeroId] = useState(1),
    [buildIndex, setBuildIndex] = useState(0),
    [tab, setTab] = useState("Items"),
    [detail, setDetail] = useState<Buy | null>(null);
  const hero = data.heroes.find((h) => h.id === heroId)!,
    builds = useMemo(() => generateBuilds(data, heroId), [data, heroId]),
    build = builds[buildIndex];
  const core = useMemo(() => computeCore(data.validation), [data]),
    insight = useMemo(() => personalInsight(data.personal), [data]);
  const reports = useMemo(
    () => builds.map((b) => validateBuild(b, core)),
    [builds, core],
  );
  const report = reports[buildIndex];
  const itemMap = useMemo(
    () => new Map(data.items.map((i) => [i.id, i])),
    [data],
  );
  const coreIds = new Set(core.filter((i) => i.core).map((i) => i.itemId));
  const photo = (key: string) => base + data.images[key];
  const chooseHero = (id: number) => {
    setHeroId(id);
    setBuildIndex(0);
    setDetail(null);
  };
  useEffect(() => {
    type Tool = {
      name: string;
      description: string;
      inputSchema: object;
      annotations: object;
      execute: (input: unknown) => unknown;
    };
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: Tool,
            options: { signal: AbortSignal },
          ) => unknown;
        };
      }
    ).modelContext;
    if (!context) return;
    const lifecycle = new AbortController();
    try {
      Promise.resolve(
        context.registerTool(
          {
            name: "select_hero_build",
            description:
              "Select an active Deadlock hero and build focus in the optimizer.",
            inputSchema: {
              type: "object",
              properties: {
                heroId: { type: "integer" },
                focus: { type: "string", enum: ["spirit", "weapon"] },
              },
              required: ["heroId", "focus"],
              additionalProperties: false,
            },
            annotations: { readOnlyHint: false, untrustedContentHint: false },
            execute(input) {
              const x = input as { heroId: number; focus: string };
              if (
                !x ||
                !data.heroes.some((h) => h.id === x.heroId) ||
                !["spirit", "weapon"].includes(x.focus)
              )
                throw new Error(
                  "Choose an active hero and spirit or weapon focus",
                );
              flushSync(() => {
                chooseHero(x.heroId);
                setBuildIndex(x.focus === "spirit" ? 0 : 1);
              });
              return { heroId: x.heroId, focus: x.focus };
            },
          },
          { signal: lifecycle.signal },
        ),
      ).catch(() => {});
    } catch {
      /* Optional browser capability. */
    }
    return () => lifecycle.abort();
  }, [data]);
  return (
    <div className="app-shell">
      <header className="masthead">
        <div className="brand">
          <Crosshair size={25} />
          <span>
            DEADLOCK<span className="brand-sub">BUILD OPTIMIZER</span>
          </span>
        </div>
        <span className="local-status">
          <span /> SNAPSHOT READY
        </span>
      </header>
      <main>
        <section className="hero-panel" aria-label="Hero selection">
          <div className="hero-copy">
            <span className="eyebrow">THEORY INTO FIREPOWER</span>
            <h1>{hero.name}</h1>
            <p>{hero.description.role}</p>
            <label className="hero-select">
              <span>Change hero</span>
              <select
                aria-label="Select hero"
                value={heroId}
                onChange={(e) => chooseHero(Number(e.target.value))}
              >
                {data.heroes.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} />
            </label>
          </div>
          <img
            className="hero-art"
            src={photo(`hero-${heroId}`)}
            alt={hero.name}
          />
          <span className="hero-number">{String(heroId).padStart(2, "0")}</span>
        </section>
        <div className="section-heading">
          <h2>Choose your approach</h2>
          <span>02 BUILDS</span>
        </div>
        <div className="build-picker" aria-label="Build selection">
          {builds.map((b, i) => (
            <button
              key={b.id}
              className={`build-option ${i === buildIndex ? "selected" : ""}`}
              aria-pressed={i === buildIndex}
              onClick={() => setBuildIndex(i)}
            >
              {i === 0 ? <Flame size={21} /> : <Crosshair size={21} />}
              <strong>{b.name}</strong>
              <span>{i === 0 ? "SPIRIT FOCUS" : "WEAPON FOCUS"}</span>
              <span className="build-agreement">
                {heroId === 1
                  ? `${reports[i].agreement}% agreement`
                  : "Infernus validation only"}
              </span>
              {i === buildIndex && (
                <Check className="selected-check" size={16} />
              )}
            </button>
          ))}
        </div>
        <div className="build-summary">
          <span>
            <Layers size={15} />
            {build.items.length} purchases
          </span>
          <span className="soul-color">◈ {souls(build.total)} souls</span>
          <span>3 phases</span>
        </div>
        <div className="personal-note">
          <Clock3 size={18} />
          <p>
            {insight.count ? (
              <>
                <strong>Your games run ~{insight.minutes} min.</strong>{" "}
                Purchases past your {compact(insight.budget)} median net worth
                are marked “stretch”.{" "}
                <span>Last {insight.count} standard matches.</span>
              </>
            ) : (
              <>
                No eligible personal matches in this snapshot. Use the phase
                plan as a general guide.
              </>
            )}
          </p>
        </div>
        <nav className="tabs" aria-label="Build view">
          {["Items", "Abilities", "Validation"].map((t) => (
            <button
              key={t}
              aria-current={tab === t ? "page" : undefined}
              className={tab === t ? "active" : ""}
              onClick={() => setTab(t)}
            >
              {t === "Items" ? (
                <Layers size={17} />
              ) : t === "Abilities" ? (
                <Activity size={17} />
              ) : (
                <ShieldCheck size={17} />
              )}{" "}
              {t}
              {t === "Validation" && heroId === 1 && (
                <span className="tab-dot" />
              )}
            </button>
          ))}
        </nav>
        {tab === "Items" && (
          <section aria-label="Item build" className="view">
            <div className="view-intro">
              <div>
                <h2>The buy order</h2>
                <p>{build.subtitle}</p>
              </div>
              <span className={`focus-badge ${build.focus}`}>
                {build.focus}
              </span>
            </div>
            {(["Early", "Mid", "Late"] as const).map((phase, idx) => (
              <section
                className="phase"
                key={phase}
                aria-label={`${phase} game`}
              >
                <div className="phase-heading">
                  <div>
                    <span className="phase-number">0{idx + 1}</span>
                    <h3>{phase} game</h3>
                  </div>
                  <span>
                    {idx === 0
                      ? "ESTABLISH YOUR LANE"
                      : idx === 1
                        ? "COME ONLINE"
                        : "CLOSE IT OUT"}
                  </span>
                </div>
                <div className="item-list">
                  {build.items
                    .filter((b) => b.phase === phase)
                    .map((b) => {
                      const item = itemMap.get(b.itemId)!,
                        n = build.items.indexOf(b) + 1;
                      return (
                        <button
                          className="item-row"
                          key={b.itemId}
                          data-item-id={b.itemId}
                          onClick={() => setDetail(b)}
                          aria-label={`View ${item.name}`}
                        >
                          <span className="buy-number">
                            {String(n).padStart(2, "0")}
                          </span>
                          <div className={`item-image ${item.item_slot_type}`}>
                            <img
                              src={photo(`item-${item.id}`)}
                              alt={item.name}
                              loading="lazy"
                            />
                          </div>
                          <div className="item-main">
                            <strong>{item.name}</strong>
                            <div className="item-tags">
                              <span
                                className={`core-badge ${heroId === 1 && coreIds.has(item.id) ? "is-core" : ""}`}
                              >
                                {heroId !== 1
                                  ? "Core check: N/A"
                                  : coreIds.has(item.id)
                                    ? "✓ Zergggy core"
                                    : "Not core"}
                              </span>
                              {b.upgradesFrom.length > 0 && (
                                <span>Upgrade</span>
                              )}
                              {insight.count > 0 &&
                                b.total > insight.budget && (
                                  <span className="stretch">Stretch</span>
                                )}
                            </div>
                            {b.sell.length > 0 && (
                              <small>
                                Sell{" "}
                                {b.sell
                                  .map((id) => itemMap.get(id)?.name)
                                  .join(", ")}
                              </small>
                            )}
                          </div>
                          <div className="item-cost">
                            <strong>◈ {souls(b.cost)}</strong>
                            <span>{souls(b.total)} total</span>
                          </div>
                          <ChevronRight size={15} />
                        </button>
                      );
                    })}
                </div>
              </section>
            ))}
            <p className="fine-print">
              Tap an item for its full shop card. Component credit is included;
              totals exclude sale refunds. “Not core” means below 30% in the
              held-out sample.
            </p>
            <div className="kit-note">
              <Info size={18} />
              <p>{build.kitNote}</p>
            </div>
          </section>
        )}
        {tab === "Abilities" && (
          <section className="view" aria-label="Ability order">
            <div className="view-intro">
              <div>
                <h2>Level with a plan</h2>
                <p>Unlocks and upgrade tiers, in order.</p>
              </div>
              <Activity size={25} />
            </div>
            <div className="ability-key">
              {[1, 2, 3, 4].map((slot) => {
                const a = data.abilities.find(
                  (a) => a.class_name === hero.items[`signature${slot}`],
                )!;
                return (
                  <div key={slot}>
                    <img src={photo(`ability-${a.id}`)} alt="" />
                    <span>{slot}</span>
                    <strong>{a.name}</strong>
                  </div>
                );
              })}
            </div>
            <p className="explanation">
              {build.abilityFallback
                ? "No complete aggregate order met the sample threshold. This is a legal, balanced fallback."
                : `Selected from complete aggregate paths · ${souls(build.abilityEvidence)} matches. Both builds share this evidence-based path.`}{" "}
              Levels follow the hero’s soul and ability-point thresholds.
            </p>
            <ol className="ability-sequence">
              {build.abilityOrder.map((s, i) => (
                <li key={i}>
                  <span className="step-index">{i + 1}</span>
                  <span className="ability-slot">{s.slot}</span>
                  <div>
                    <strong>{s.name}</strong>
                    <span>
                      Level {s.level} · {souls(s.souls)} souls
                      {s.ap > 0 ? ` · ${s.ap} AP` : ""}
                    </span>
                  </div>
                  <span
                    className={s.tier === 0 ? "unlock-label" : "tier-label"}
                  >
                    {s.tier === 0 ? "Unlock" : `Tier ${s.tier}`}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}
        {tab === "Validation" && (
          <section className="view" aria-label="Validation report">
            <div className="view-intro">
              <div>
                <h2>How did the generator do?</h2>
                <p>An independent check against Zergggy.</p>
              </div>
              <ShieldCheck size={26} />
            </div>
            {heroId !== 1 ? (
              <div className="empty-state">
                <ShieldCheck size={32} />
                <h3>Infernus is the test case</h3>
                <p>
                  These {hero.name} builds use this hero’s aggregate analytics.
                  Zergggy’s Infernus data cannot validate another hero.
                </p>
                <button
                  className="primary-button"
                  onClick={() => chooseHero(1)}
                >
                  View Infernus <ArrowRight size={17} />
                </button>
              </div>
            ) : (
              <>
                <div className="validation-score">
                  <div
                    className="score-ring"
                    style={
                      {
                        "--score": `${report.agreement * 3.6}deg`,
                      } as React.CSSProperties
                    }
                  >
                    <strong>
                      {report.agreement}
                      <span>%</span>
                    </strong>
                  </div>
                  <div>
                    <span className="eyebrow">HELD-OUT AGREEMENT</span>
                    <h3>{build.name}</h3>
                    <p>Similarity to the core, not a win prediction.</p>
                  </div>
                </div>
                <div className="report-metrics">
                  <div>
                    <strong>{Math.round(report.overlap * 100)}%</strong>
                    <span>Weighted overlap</span>
                  </div>
                  <div>
                    <strong>
                      {report.order === null
                        ? "N/A"
                        : `${Math.round(report.order * 100)}%`}
                    </strong>
                    <span>Buy-order agreement</span>
                  </div>
                  <div>
                    <strong>
                      {report.shared}/{report.coreCount}
                    </strong>
                    <span>Core items matched</span>
                  </div>
                </div>
                <div className="validation-explainer">
                  <h3>
                    <ShieldCheck size={18} /> A test set, never a recipe
                  </h3>
                  <p>
                    Core items appear in <strong>at least 30%</strong> of{" "}
                    {data.validation.length} real Infernus matches. Less
                    frequent experiments are excluded. Wins count 1.5× when
                    weighting overlap and purchase timing.
                  </p>
                  <p>
                    Overall = 70% weighted item overlap + 30% pairwise buy-order
                    agreement. Missing order evidence contributes zero. No
                    scoring weights were tuned to this result.
                  </p>
                </div>
                <h3 className="list-title">
                  The reference core <span>{report.coreCount} ITEMS</span>
                </h3>
                <div className="core-list">
                  {core
                    .filter((c) => c.core)
                    .map((c) => {
                      const item = itemMap.get(c.itemId),
                        included = build.items.some(
                          (b) => b.itemId === c.itemId,
                        );
                      return (
                        <div key={c.itemId}>
                          <span
                            className={
                              included ? "matched-icon" : "missing-icon"
                            }
                          >
                            {included ? <Check size={17} /> : "–"}
                          </span>
                          <div>
                            <strong>
                              {item?.name || `Retired item #${c.itemId}`}
                            </strong>
                            <span>
                              {included ? "In this build" : "Not in this build"}
                              {item && !item.shopable ? " · retired" : ""}
                            </span>
                          </div>
                          <span>
                            {Math.round(c.frequency * 100)}%
                            <small>of matches</small>
                          </span>
                        </div>
                      );
                    })}
                </div>
                <details className="audit-details">
                  <summary>Sample & method details</summary>
                  <p>
                    Training:{" "}
                    {new Date(
                      data.manifest.aggregateWindow.start * 1000,
                    ).toLocaleDateString("en-US", { timeZone: "UTC" })}
                    –
                    {new Date(
                      (data.manifest.aggregateWindow.endExclusive - 1) * 1000,
                    ).toLocaleDateString("en-US", { timeZone: "UTC" })}
                    {" UTC. "}Held-out matches overlap:{" "}
                    {data.manifest.heldOutOverlap}. Only standard
                    unranked/ranked games of at least 10 minutes, without
                    abandonment, are sampled.
                  </p>
                  <p>
                    Core eligibility uses unweighted frequency. Weighted Jaccard
                    penalizes both missed core items and extra recommendations.
                    Purchase order compares the earliest purchase per match,
                    with win-weighted mean times. Retired core items remain in
                    the evaluation denominator.
                  </p>
                  <p>
                    {core.filter((c) => !c.core).length} experimental items
                    excluded. The {report.pairs} shared-item pairs support the
                    order score. This small, older sample can differ from the
                    current patch.
                  </p>
                  <div className="match-ids">
                    {data.validation.map((m) => (
                      <span key={m.match_id}>
                        {m.match_id} · {m.won ? "W" : "L"}
                      </span>
                    ))}
                  </div>
                </details>
              </>
            )}
          </section>
        )}
        <footer>
          <div>
            <WifiOff size={14} />
            <span>
              Local data ·{" "}
              {new Date(data.manifest.fetchedAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          </div>
          <p>
            {data.manifest.activeHeroes} heroes · {data.manifest.shopableItems}{" "}
            current shop items
          </p>
          <p>Community analytics. Not affiliated with Valve.</p>
          <a
            href="https://api.deadlock-api.com/docs"
            target="_blank"
            rel="noreferrer"
          >
            Deadlock API <ArrowUpRight size={13} />
          </a>
        </footer>
      </main>
      {detail && (
        <ItemDialog
          item={itemMap.get(detail.itemId)!}
          buy={detail}
          build={build}
          image={photo(`item-${detail.itemId}`)}
          close={() => setDetail(null)}
          names={itemMap}
        />
      )}
    </div>
  );
}
function ItemDialog({
  item,
  buy,
  image,
  close,
  names,
}: {
  item: Asset;
  buy: Buy;
  build: Build;
  image: string;
  close: () => void;
  names: Map<number, Asset>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.showModal();
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = old;
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`item-dialog ${item.item_slot_type}`}
      onCancel={close}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
    >
      <div className="dialog-inner">
        <div className="dialog-top">
          <span>ITEM INTELLIGENCE</span>
          <button aria-label="Close item details" onClick={close}>
            <X size={22} />
          </button>
        </div>
        <div className="detail-hero">
          <img src={image} alt={item.name} />
          <div>
            <span className="eyebrow">
              {item.item_slot_type} · TIER {item.item_tier}
            </span>
            <h2>{item.name}</h2>
            <strong>◈ {souls(item.cost)} souls</strong>
          </div>
        </div>
        <div className="detail-purchase">
          <span>
            {buy.phase} game · purchase{" "}
            {buy.cost !== item.cost ? "upgrade" : "cost"}
          </span>
          <strong>◈ {souls(buy.cost)}</strong>
        </div>
        {buy.upgradesFrom.length > 0 && (
          <p className="explanation">
            Credits{" "}
            {buy.upgradesFrom.map((id) => names.get(id)?.name).join(", ")}{" "}
            already purchased.
          </p>
        )}
        <div className="stat-grid">
          {statLines(item).map((s) => (
            <div key={s.key}>
              <strong>{s.value}</strong>
              <span>
                {s.label}
                {s.conditional ? ` (${s.conditional})` : ""}
              </span>
            </div>
          ))}
        </div>
        <div className="item-descriptions">
          {descriptions(item).map((d, i) => (
            <section key={i}>
              <h3>{d.label}</h3>
              <p>{d.text}</p>
            </section>
          ))}
        </div>
        <div className="detail-evidence">
          <h3>Why it made the build</h3>
          <p>{buy.reason}</p>
          <span>{(buy.winRate * 100).toFixed(1)}% smoothed item win rate</span>
          <p className="fine-print">
            Observational item statistics, not a prediction of your win chance.
            Stats above are the unmodified asset values.
          </p>
        </div>
      </div>
    </dialog>
  );
}
createRoot(document.getElementById("root")!).render(<Root />);
