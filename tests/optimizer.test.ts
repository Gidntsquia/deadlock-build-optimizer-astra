import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { generateBuilds, WEIGHTS } from "../src/generator";
import { computeCore, validateBuild } from "../src/validation";
import { personalInsight, median } from "../src/personalization";
import {
  descriptions,
  plainText,
  propertyValue,
  statLines,
} from "../src/assetText";
import type {
  AggregateData,
  ValidationMatch,
  PersonalMatch,
  Manifest,
} from "../src/types";
const read = (file: string) =>
  JSON.parse(fs.readFileSync(`public/data/${file}.json`, "utf8"));
const data: AggregateData = {
  heroes: read("heroes"),
  items: read("items"),
  abilities: read("abilities"),
  weapons: read("weapons"),
  analytics: read("analytics"),
};
const manifest: Manifest = read("manifest"),
  matches: ValidationMatch[] = read("zergggy-matches");

test("consensus follows common purchases and observed timing without category quotas", () => {
  const preferred = data.items
    .filter(
      (i) => i.shopable && i.item_tier === 1 && i.item_slot_type === "spirit",
    )
    .slice(0, 5);
  assert.equal(preferred.length, 5);
  const population = data.analytics[1];
  const input: AggregateData = {
    ...data,
    analytics: {
      ...data.analytics,
      1: {
        ...population,
        highSkill: undefined,
        heroMatches: 10000,
        itemStats: data.items
          .filter((i) => i.shopable)
          .map((i) => {
            const index = preferred.findIndex((p) => p.id === i.id);
            const count = index >= 0 ? 9000 : 20;
            return {
              item_id: i.id,
              matches: count,
              wins: count / 2,
              avg_buy_time_s: index >= 0 ? 500 - index * 50 : 900,
            };
          }),
      },
    },
  };
  const build = generateBuilds(input, 1)[0];
  assert.deepEqual(
    build.items.filter((b) => b.phase === "Early").map((b) => b.itemId),
    [...preferred].reverse().map((i) => i.id),
  );
});

test("sparse expert cohorts fall back without mixing population denominators", () => {
  const population = { ...data.analytics[1], highSkill: undefined };
  const buildWith = (heroMatches: number, rows: number) =>
    generateBuilds(
      {
        ...data,
        analytics: {
          ...data.analytics,
          1: {
            ...population,
            highSkill: {
              ...population,
              heroMatches,
              itemStats: population.itemStats.slice(0, rows),
            },
          },
        },
      },
      1,
    )[0];
  const baseline = generateBuilds(
    { ...data, analytics: { ...data.analytics, 1: population } },
    1,
  )[0];
  for (const candidate of [buildWith(199, 30), buildWith(200, 11)]) {
    assert.equal(candidate.cohort, "All skill levels");
    assert.equal(candidate.cohortMatches, population.heroMatches);
    assert.deepEqual(candidate.items, baseline.items);
  }
  const eligible = buildWith(200, population.itemStats.length);
  assert.equal(eligible.cohort, "Ascendant+");
  assert.equal(eligible.cohortMatches, 200);
});
test("expert item decisions are independent of broad-population preferences", () => {
  const baseline = generateBuilds(data, 1)[0];
  assert.equal(baseline.cohort, "Ascendant+");
  const population = data.analytics[1];
  const changed = generateBuilds(
    {
      ...data,
      analytics: {
        ...data.analytics,
        1: {
          ...population,
          heroMatches: 1,
          itemStats: [],
          permutations: [],
        },
      },
    },
    1,
  )[0];
  assert.deepEqual(changed.items, baseline.items);
  const withoutExpertPaths = generateBuilds(
    {
      ...data,
      analytics: {
        ...data.analytics,
        1: {
          ...population,
          highSkill: { ...population.highSkill!, abilityOrders: [] },
        },
      },
    },
    1,
  )[0];
  assert.equal(withoutExpertPaths.abilityCohort, "All skill levels");
  assert.ok(withoutExpertPaths.abilityEvidence > 0);
});

test("snapshots cover every active hero and all current shop assets", () => {
  assert.ok(data.items.length >= 200);
  assert.equal(
    data.items.filter((i) => i.shopable).length,
    manifest.shopableItems,
  );
  assert.equal(data.heroes.length, manifest.activeHeroes);
  for (const h of data.heroes) {
    assert.ok(Array.isArray(data.analytics[h.id].itemStats));
    assert.ok(data.analytics[h.id].itemStats.length > 0);
    assert.ok(Array.isArray(data.analytics[h.id].abilityOrders));
    assert.ok(Array.isArray(data.analytics[h.id].permutations));
  }
  const images = read("images");
  for (const i of data.items.filter((i) => i.shopable)) {
    assert.ok(fs.statSync(`public/${images[`item-${i.id}`]}`).size > 100);
  }
});
test("strict >=200 shopable criterion is transparently reported, never faked", (t) => {
  if (manifest.shopableItems < 200) {
    assert.ok(manifest.warnings.some((w) => w.includes(">=200")));
    t.skip(
      `UPSTREAM LIMITATION: ${manifest.shopableItems} shopable, ${manifest.catalogItems} catalog items`,
    );
  } else assert.ok(manifest.shopableItems >= 200);
});
test("every hero deterministically generates one legal adaptive purchase plan", () => {
  assert.ok(
    Math.abs(Object.values(WEIGHTS).reduce((a, b) => a + b, 0) - 1) < 1e-12,
  );
  const before = JSON.stringify(data),
    hashes: Record<number, string> = {};
  for (const hero of data.heroes) {
    const builds = generateBuilds(data, hero.id);
    assert.equal(builds.length, 1);
    assert.deepEqual(builds, generateBuilds(data, hero.id));
    hashes[hero.id] = createHash("sha256")
      .update(JSON.stringify(builds))
      .digest("hex");
    for (const b of builds) {
      assert.ok(b.items.length >= 12 && b.items.length <= 24);
      const cohort =
        b.cohort === "Ascendant+"
          ? data.analytics[hero.id].highSkill!
          : data.analytics[hero.id];
      const popular = data.items.filter(
        (i) =>
          i.shopable &&
          i.cost > 0 &&
          i.item_tier >= 1 &&
          i.item_tier <= 4 &&
          (cohort.itemStats.find((s) => s.item_id === i.id)?.matches || 0) /
            Math.max(1, cohort.heroMatches) >=
            0.3,
      );
      assert.equal(b.items.length, Math.min(24, Math.max(12, popular.length)));
      assert.equal(new Set(b.items.map((i) => i.itemId)).size, b.items.length);
      const phases = b.items.map((b) =>
        ["Early", "Mid", "Late"].indexOf(b.phase),
      );
      assert.deepEqual(
        phases,
        [...phases].sort((a, b) => a - b),
      );
      let total = 0;
      const owned = new Set<number>();
      for (const buy of b.items) {
        const item = data.items.find((i) => i.id === buy.itemId)!;
        assert.ok(item.shopable);
        assert.ok(Number.isFinite(buy.score));
        assert.ok(buy.winRate >= 0 && buy.winRate <= 1);
        assert.ok(buy.cost >= 0);
        assert.ok(buy.cost <= item.cost);
        total += buy.cost;
        assert.equal(buy.total, total);
        for (const id of [...buy.upgradesFrom, ...buy.sell]) {
          assert.ok(owned.has(id));
          owned.delete(id);
        }
        owned.add(item.id);
        assert.ok(owned.size <= 12);
        assert.ok(
          [...owned].filter(
            (id) => data.items.find((i) => i.id === id)!.is_active_item,
          ).length <= 4,
        );
      }
      assert.equal(b.total, total);
    }
  }
  assert.equal(JSON.stringify(data), before);
  fs.mkdirSync("verification", { recursive: true });
  fs.writeFileSync(
    "verification/build-hashes.json",
    JSON.stringify(hashes, null, 2),
  );
});
test("all heroes have four real abilities with legal unlocks and 1/2/5 AP upgrades", () => {
  for (const hero of data.heroes) {
    const b = generateBuilds(data, hero.id)[0];
    assert.equal(b.abilityOrder.length, 16);
    assert.equal(new Set(b.abilityOrder.map((s) => s.name)).size, 4);
    let spent = 0,
      unlocked = 0;
    const tiers = new Map<number, number>();
    for (const step of b.abilityOrder) {
      assert.equal(step.tier, tiers.get(step.abilityId) || 0);
      tiers.set(step.abilityId, step.tier + 1);
      assert.equal(
        data.abilities.find((a) => a.id === step.abilityId)?.name,
        step.name,
      );
      assert.ok(step.level <= 36);
      if (step.tier === 0) {
        unlocked++;
        if (step.slot === 4) assert.ok(step.level >= 8);
      } else spent += step.ap;
      const currencies = Object.entries(hero.level_info)
        .filter(([level]) => Number(level) <= step.level)
        .flatMap(([, l]) => l.bonus_currencies || []);
      assert.ok(
        unlocked <= currencies.filter((c) => c === "EAbilityUnlocks").length,
      );
      assert.ok(
        spent <= currencies.filter((c) => c === "EAbilityPoints").length,
      );
    }
    assert.equal(spent, 32);
  }
});
test("validation sample contains at least 20 real Infernus matches, disjoint from training", () => {
  assert.ok(matches.length >= 20);
  assert.ok(matches.length <= 30);
  assert.equal(new Set(matches.map((m) => m.match_id)).size, matches.length);
  for (const m of matches) {
    assert.equal(m.account_id, 35187362);
    assert.equal(m.hero_id, 1);
    assert.equal(m.game_mode, 1);
    assert.ok([1, 4].includes(m.match_mode));
    assert.ok(m.purchases.length >= 8);
    assert.ok(
      m.start_time < manifest.aggregateWindow.start ||
        m.start_time >= manifest.aggregateWindow.endExclusive,
    );
    assert.ok(
      m.purchases.every(
        (p) =>
          Number.isFinite(p.game_time_s) &&
          data.items.some((i) => i.id === p.item_id),
      ),
    );
  }
  assert.equal(manifest.heldOutOverlap, 0);
});
test("core threshold is unweighted 30%, repeats count once, wins weight frequency and timing", () => {
  const synthetic = Array.from({ length: 10 }, (_, i) => ({
    match_id: i,
    hero_id: 1,
    account_id: 35187362,
    game_mode: 1,
    match_mode: 1,
    start_time: 0,
    duration_s: 1000,
    won: i === 0,
    purchases: [
      ...(i < 3
        ? [
            { item_id: 1, game_time_s: i === 0 ? 100 : 200 },
            { item_id: 1, game_time_s: 500 },
          ]
        : []),
      ...(i < 2 ? [{ item_id: 2, game_time_s: 100 }] : []),
    ],
  }));
  const core = computeCore(synthetic),
    a = core.find((c) => c.itemId === 1)!,
    b = core.find((c) => c.itemId === 2)!;
  assert.equal(a.frequency, 0.3);
  assert.equal(a.core, true);
  assert.equal(b.core, false);
  assert.equal(a.weightedFrequency, 3.5 / 10.5);
  assert.equal(a.meanTime, 550 / 3.5);
});
test("validation penalizes extra/missing items and reversed shared purchase order", () => {
  const b = generateBuilds(data, 1)[0],
    ids = b.items.map((i) => i.itemId);
  const c = ids.map((id, i) => ({
    itemId: id,
    frequency: 1,
    weightedFrequency: 1,
    meanTime: i * 100,
    core: true,
  }));
  assert.equal(validateBuild(b, c).agreement, 100);
  assert.equal(
    validateBuild({ ...b, items: [...b.items].reverse() }, c).agreement,
    70,
  );
  assert.ok(
    validateBuild({ ...b, items: b.items.slice(0, 5) }, c).agreement < 100,
  );
  assert.equal(validateBuild(b, []).agreement, 0);
});
test("generator has no player/validation dependency or hidden filesystem access", () => {
  const source = fs.readFileSync("src/generator.ts", "utf8");
  assert.doesNotMatch(
    source,
    /zergggy|35187362|267836488|personal-history|validation|fetch\(|readFile/i,
  );
  assert.match(source, /import type[\s\S]*?from ["']\.\/types["']/);
  assert.equal((source.match(/^import /gm) || []).length, 1);
});
test("personalization uses standard-mode match data and correct median", () => {
  assert.equal(median([20, 10, 30, 40]), 25);
  const p = read("personal-history") as PersonalMatch[],
    insight = personalInsight(p);
  assert.ok(insight.count > 0);
  assert.ok(insight.minutes > 0);
  assert.ok(insight.budget > 0);
  assert.equal(insight.count, p.length);
});
test("detail text preserves source values and strips executable markup", () => {
  for (const i of data.items)
    assert.ok(statLines(i).every((s) => !s.value.includes("undefined")));
  assert.equal(
    plainText("<svg><path/></svg><span>Spirit</span><br>damage"),
    "Spirit\ndamage",
  );
  assert.equal(propertyValue({ value: "7m", postfix: "m" }), "7m");
  for (const item of data.items.filter((i) => i.shopable)) {
    assert.ok(statLines(item).length > 0);
    for (const s of statLines(item))
      assert.equal(s.value, propertyValue(item.properties[s.key]));
    for (const d of descriptions(item)) assert.doesNotMatch(d.text, /<[^>]+>/);
  }
});
