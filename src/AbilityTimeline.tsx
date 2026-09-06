import type { Asset, Build, Hero } from "./types";

export function AbilityTimeline({
  hero,
  assets,
  build,
  photo,
}: {
  hero: Hero;
  assets: Asset[];
  build: Build;
  photo: (key: string) => string;
}) {
  const abilities = [1, 2, 3, 4].map((slot) =>
    assets.find((a) => a.class_name === hero.items[`signature${slot}`])!,
  );
  function track(start: number, end: number) {
    const steps = build.abilityOrder.slice(start, end);
    return (
      <div
        className="point-track"
        style={{ "--steps": steps.length } as React.CSSProperties}
      >
        <div className="track-numbers" aria-hidden="true">
          <span />
          {steps.map((_, i) => (
            <span key={i}>{start + i + 1}</span>
          ))}
        </div>
        {abilities.map((ability, slot) => (
          <div className="ability-track-row" key={ability.id}>
            <div className="track-icon" title={ability.name}>
              <img src={photo(`ability-${ability.id}`)} alt={ability.name} />
              <span>{slot + 1}</span>
            </div>
            {steps.map((step, i) => (
              <div className="track-cell" key={i}>
                {step.abilityId === ability.id && (
                  <span
                    className={`point-marker ${step.tier === 0 ? "point-unlock" : ""}`}
                    role="img"
                    aria-label={`Step ${start + i + 1}: ${step.name}, ${step.tier === 0 ? "unlock" : `tier ${step.tier}, ${step.ap} ability points`}, level ${step.level}`}
                    title={`Level ${step.level} · ${step.tier === 0 ? "Unlock" : `Tier ${step.tier}`} · ${step.souls.toLocaleString()} souls`}
                  >
                    <span className="point-diamond">◆</span>
                    {step.ap > 0 && <b>{step.ap}</b>}
                  </span>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }
  return (
    <section className="ability-board" aria-label="Ability point timeline">
      <div className="board-title">
        <h3>Ability Point Order</h3>
        <span>Read left to right</span>
      </div>
      <div className="timeline-wide">{track(0, 16)}</div>
      <div className="timeline-phone">
        <p className="track-range">Steps 1–8</p>
        {track(0, 8)}
        <p className="track-range">Steps 9–16</p>
        {track(8, 16)}
      </div>
      <div className="timeline-legend">
        <span>
          <i className="point-diamond">◆</i> Unlock
        </span>
        <span>
          ◆ 1 <small>Tier 1</small>
        </span>
        <span>
          ◆ 2 <small>Tier 2</small>
        </span>
        <span>
          ◆ 5 <small>Tier 3</small>
        </span>
      </div>
    </section>
  );
}
