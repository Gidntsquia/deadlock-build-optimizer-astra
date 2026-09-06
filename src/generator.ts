import type {
  AggregateData,
  Analytics,
  Asset,
  Hero,
  Build,
  Buy,
  Slot,
  Phase,
  AbilityStep,
} from "./types";

// Fixed, a priori weights. No player history or evaluation result enters this module.
export const WEIGHTS = Object.freeze({
  win: 0.3,
  usage: 0.2,
  value: 0.15,
  synergy: 0.15,
  effect: 0.05,
  phase: 0.05,
  investment: 0.05,
  pair: 0.05,
});
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const number = (v: unknown) => Number.parseFloat(String(v)) || 0;
const rate = (wins: number, matches: number) => (wins + 25) / (matches + 50);
const stats = (item: Asset, pattern: RegExp) =>
  Object.entries(item.properties)
    .filter(([k, p]) => pattern.test(k + " " + (p.label || "")))
    .reduce((s, [, p]) => s + Math.max(0, number(p.value)), 0);
function profile(hero: Hero, abilities: Asset[], weapon: Asset | undefined) {
  const growth = hero.standard_level_up_upgrades;
  const scaling = abilities
    .flatMap((a) => Object.values(a.properties))
    .reduce((s, p) => s + Math.max(0, p.scale_function?.stat_scale || 0), 0);
  const onHit = abilities.some((a) =>
    Object.keys(a.properties).some((k) =>
      /buildupbullet|refillduration|proconhit/i.test(k),
    ),
  );
  const fireRate = weapon?.weapon_info?.shots_per_second || 3;
  return {
    spirit:
      1 +
      clamp(scaling / 8) +
      clamp((growth.MODIFIER_VALUE_TECH_POWER || 0) / 2),
    gun:
      1 +
      clamp((growth.MODIFIER_VALUE_BASE_BULLET_DAMAGE_FROM_LEVEL || 0) * 10),
    fire: 1 + clamp(fireRate / 10) + (onHit ? 1 : 0),
    health:
      (hero.starting_stats.max_health?.value || 800) +
      15 * (growth.MODIFIER_VALUE_BASE_HEALTH_FROM_LEVEL || 0),
    onHit,
  };
}
function features(item: Asset, p: ReturnType<typeof profile>, focus: Slot) {
  const gun =
    stats(item, /BaseAttackDamagePercent|WeaponPower|Weapon Damage/) / 20;
  const fire = stats(item, /FireRate|Fire Rate/) / 15;
  const spirit = stats(item, /TechPower|Spirit Power/) / 15;
  const sustain =
    stats(item, /Lifesteal|HealthRegen|Health Regen/) / 10 +
    stats(item, /BonusHealth|Bonus Health/) / (p.health * 0.15);
  const utility =
    stats(
      item,
      /CooldownReduction|TechCooldown|TechDuration|TechRange|MoveSpeed|Resist/,
    ) / 20;
  const raw =
    gun * p.gun * (focus === "weapon" ? 1.8 : 0.6) +
    fire * p.fire * (focus === "weapon" ? 1.4 : 1) +
    spirit * p.spirit * (focus === "spirit" ? 1.8 : 0.5) +
    sustain +
    utility * 0.6;
  const description = JSON.stringify(item.description || {}).toLowerCase();
  const proc =
    (/spirit|burn|damage over time/.test(description) && focus === "spirit") ||
    (/weapon|bullet|fire rate/.test(description) && focus === "weapon");
  const effect = clamp(
    (proc ? 0.65 : 0) +
      (item.is_active_item ? 0.25 : 0.15) +
      (item.tooltip_sections?.some((s) => s.section_type === "passive")
        ? 0.2
        : 0),
  );
  return {
    value: raw / (item.cost / 800),
    synergy: clamp(raw / 8 + (item.item_slot_type === focus ? 0.25 : 0)),
    effect,
  };
}
export function abilityPath(hero: Hero, assets: Asset[], analytics: Analytics) {
  const abilities = [1, 2, 3, 4].map((n) =>
    assets.find((a) => a.class_name === hero.items[`signature${n}`])!,
  );
  if (abilities.some((a) => !a))
    throw new Error(`Missing signature assets for ${hero.name}`);
  const ids = abilities.map((a) => a.id),
    maxMatches = Math.max(1, ...analytics.abilityOrders.map((a) => a.matches));
  const valid = analytics.abilityOrders.filter(
    (a) =>
      a.abilities.length === 16 &&
      ids.every((id) => a.abilities.filter((x) => x === id).length === 4),
  );
  valid.sort(
    (a, b) =>
      0.65 * rate(b.wins, b.matches) +
        (0.35 * Math.log1p(b.matches)) / Math.log1p(maxMatches) -
        (0.65 * rate(a.wins, a.matches) +
          (0.35 * Math.log1p(a.matches)) / Math.log1p(maxMatches)) ||
      a.abilities.join(",").localeCompare(b.abilities.join(",")),
  );
  // Sparse-hero fallback is explicit and valid, never silently a fabricated empirical order.
  const chosen = valid[0],
    sequence = chosen?.abilities || [...ids, ...ids, ...ids, ...ids];
  let level = 0,
    unlocks = 0,
    points = 0;
  const counts = new Map<number, number>();
  const steps: AbilityStep[] = [];
  const levels = Object.entries(hero.level_info).sort(
    (a, b) => Number(a[0]) - Number(b[0]),
  );
  for (const id of sequence) {
    const tier = counts.get(id) || 0,
      ap = tier === 0 ? 0 : [0, 1, 2, 5][tier],
      slot = ids.indexOf(id) + 1;
    while (
      (tier === 0 ? unlocks < 1 || (slot === 4 && level < 8) : points < ap) &&
      level < levels.length
    ) {
      const entry = levels[level];
      level++;
      for (const currency of entry[1].bonus_currencies || []) {
        if (currency === "EAbilityUnlocks") unlocks++;
        if (currency === "EAbilityPoints") points++;
      }
    }
    if (tier === 0) {
      if (unlocks < 1) throw new Error("Invalid ability unlock budget");
      unlocks--;
    } else {
      if (points < ap) throw new Error("Invalid ability point budget");
      points -= ap;
    }
    steps.push({
      abilityId: id,
      name: abilities[slot - 1].name,
      slot,
      tier,
      level,
      souls: levels[Math.max(0, level - 1)][1].required_gold,
      ap,
    });
    counts.set(id, tier + 1);
  }
  return { steps, evidence: chosen?.matches || 0, fallback: !chosen };
}
export function generateBuilds(data: AggregateData, heroId: number): Build[] {
  const selectedHero = data.heroes.find((h) => h.id === heroId);
  if (!selectedHero) throw new Error("Unknown hero");
  const hero: Hero = selectedHero;
  const population = data.analytics[heroId];
  if (!population) throw new Error("Missing hero analytics");
  const useHighSkill =
    !!population.highSkill &&
    population.highSkill.heroMatches >= 1000 &&
    population.highSkill.itemStats.length >= 30;
  const analytics = useHighSkill ? population.highSkill! : population;
  const pool = data.items.filter(
    (i) => i.shopable && i.cost > 0 && i.item_tier >= 1 && i.item_tier <= 4,
  );
  const itemMap = new Map(pool.map((i) => [i.id, i])),
    byClass = new Map(pool.map((i) => [i.class_name, i]));
  const heroAbilities = data.abilities.filter((a) =>
    [1, 2, 3, 4].some((n) => a.class_name === hero.items[`signature${n}`]),
  );
  const p = profile(
    hero,
    heroAbilities,
    data.weapons.find((w) => w.class_name === hero.items.weapon_primary),
  );
  const statMap = new Map(analytics.itemStats.map((s) => [s.item_id, s]));
  const pairs = new Map(
    analytics.permutations.map((s) => [s.item_ids.join(","), s]),
  );
  const path = abilityPath(hero, data.abilities, analytics);
  return (["spirit", "weapon"] as Slot[]).map((focus) => {
    const featureMap = new Map(pool.map((i) => [i.id, features(i, p, focus)]));
    const maxValues = Object.fromEntries(
      [1, 2, 3, 4].map((t) => [
        t,
        Math.max(
          0.1,
          ...pool
            .filter((i) => i.item_tier === t)
            .map((i) => featureMap.get(i.id)!.value),
        ),
      ]),
    );
    const bought = new Set<number>(),
      owned = new Set<number>(),
      spent: Record<Slot, number> = { weapon: 0, vitality: 0, spirit: 0 };
    const buys: Buy[] = [];
    let total = 0;
    const phases: {
      name: Phase;
      tiers: number[];
      time: number;
      slots: (Slot | null)[];
    }[] = [
      {
        name: "Early",
        tiers: [1],
        time: 240,
        slots: [focus, "vitality", focus, null, null],
      },
      {
        name: "Mid",
        tiers: [2, 3],
        time: 900,
        slots: [focus, "vitality", focus, null, null],
      },
      {
        name: "Late",
        tiers: [3, 4],
        time: 1680,
        slots: [focus, "vitality", focus, null, null],
      },
    ];
    const ancestors = (i: Asset): Asset[] =>
      (i.component_items || []).flatMap((c) => {
        const a = byClass.get(c);
        return a ? [a, ...ancestors(a)] : [];
      });
    for (const phase of phases)
      for (const slot of phase.slots) {
        function evaluate(item: Asset) {
          const s = statMap.get(item.id),
            f = featureMap.get(item.id)!;
          const usage = clamp(
              (s?.matches || 0) / Math.max(1, analytics.heroMatches),
            ),
            win = rate(s?.wins || 0, s?.matches || 0);
          const investment = hero.cost_bonuses[item.item_slot_type] || [];
          const payment = Math.max(
            0,
            item.cost -
              ancestors(item)
                .filter((i) => owned.has(i.id))
                .reduce((sum, i) => sum + i.cost, 0),
          );
          const before =
            investment
              .filter((b) => b.gold_threshold <= spent[item.item_slot_type])
              .at(-1)?.bonus || 0;
          const after =
            investment
              .filter(
                (b) => b.gold_threshold <= spent[item.item_slot_type] + payment,
              )
              .at(-1)?.bonus || 0;
          const relation = [...owned].map((id) => {
            const forward = pairs.get(`${id},${item.id}`),
              reverse = pairs.get(`${item.id},${id}`);
            return forward
              ? rate(forward.wins, forward.matches) *
                  (forward.matches /
                    (forward.matches + (reverse?.matches || 0)))
              : 0.25;
          });
          const pair = relation.length
            ? relation.reduce((a, b) => a + b, 0) / relation.length
            : 0.5;
          const phaseScore = s
            ? Math.exp(-Math.abs(s.avg_buy_time_s - phase.time) / 600)
            : 0.2;
          const score =
            WEIGHTS.win * win +
            (WEIGHTS.usage * Math.log1p(100 * usage)) / Math.log(101) +
            (WEIGHTS.value * f.value) / maxValues[item.item_tier] +
            WEIGHTS.synergy * f.synergy +
            WEIGHTS.effect * f.effect +
            WEIGHTS.phase * phaseScore +
            WEIGHTS.investment * clamp((after - before) / 25) +
            WEIGHTS.pair * pair;
          return { item, score, win, usage };
        }
        const eligible = pool.filter(
          (i) =>
            phase.tiers.includes(i.item_tier) &&
            !bought.has(i.id) &&
            (!slot || i.item_slot_type === slot) &&
            ![...owned].some((id) =>
              ancestors(itemMap.get(id)!).some((a) => a.id === i.id),
            ) &&
            (!i.is_active_item ||
              [...owned].filter((id) => itemMap.get(id)?.is_active_item)
                .length < 4),
        );
        const observed = eligible.filter(
          (i) => (statMap.get(i.id)?.matches || 0) >= 20,
        );
        const ranked = (observed.length ? observed : eligible)
          .map(evaluate)
          .sort((a, b) => b.score - a.score || a.item.id - b.item.id);
        if (!ranked.length)
          throw new Error(
            `Not enough legal ${phase.name} ${slot || ""} items for ${hero.name}`,
          );
        const choice = ranked[0],
          item = choice.item;
        const components = ancestors(item).filter((i) => owned.has(i.id));
        // An owned upgrade already includes its own component cost; don't double-credit ancestors.
        const cost = Math.max(
          0,
          item.cost - components.reduce((n, i) => n + i.cost, 0),
        );
        components.forEach((i) => owned.delete(i.id));
        const sell: number[] = [];
        if (owned.size >= 12) {
          const victim = [...owned].sort(
            (a, b) => itemMap.get(a)!.cost - itemMap.get(b)!.cost || a - b,
          )[0];
          owned.delete(victim);
          sell.push(victim);
        }
        total += cost;
        spent[item.item_slot_type] += cost;
        bought.add(item.id);
        owned.add(item.id);
        buys.push({
          itemId: item.id,
          phase: phase.name,
          cost,
          total,
          score: choice.score,
          winRate: choice.win,
          usage: choice.usage,
          upgradesFrom: components.map((i) => i.id),
          sell,
          reason: `${item.item_slot_type === focus ? "Build focus" : "Balanced support"} · ${item.is_active_item ? "active utility" : "passive value"}${components.length ? " · component upgrade" : ""}`,
        });
      }
    return {
      cohort: useHighSkill ? "Ascendant+" : "All skill levels",
      cohortMatches: analytics.heroMatches,
      id: focus,
      name:
        focus === "spirit"
          ? p.onHit
            ? "Afterburn engine"
            : "Spirit surge"
          : "Bullet pressure",
      subtitle:
        focus === "spirit"
          ? "Sustained spirit damage & survivability"
          : "Weapon damage & sustained fire",
      focus,
      items: buys,
      abilityOrder: path.steps,
      abilityEvidence: path.evidence,
      abilityFallback: path.fallback,
      total,
      kitNote: p.onHit
        ? "Bullet buildup in the kit makes fire rate valuable alongside spirit scaling."
        : `Uses ${hero.name}’s signature scaling, weapon stats, and per-level growth.`,
    };
  });
}
