import { mkdir, readFile, writeFile, rename, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
const ROOT = process.cwd(),
  DATA = path.join(ROOT, "public/data"),
  CACHE = path.join(ROOT, ".cache/deadlock");
await mkdir(DATA, { recursive: true });
await mkdir(CACHE, { recursive: true });
await mkdir(path.join(ROOT, "public/images"), { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exists = async (p) =>
  access(p).then(
    () => true,
    () => false,
  );
const save = async (p, d) => {
  await writeFile(p + ".tmp", JSON.stringify(d));
  await rename(p + ".tmp", p);
};
const sources = [],
  skipped = [];
let nextRequest = 0;
async function request(url, binary = false) {
  const key = createHash("sha256").update(url).digest("hex"),
    file = path.join(CACHE, key + (binary ? ".bin" : ".json"));
  sources.push(url);
  // URL-addressed checkpoints expire after six hours; immutable match metadata and images do not.
  if (await exists(file)) {
    const { stat } = await import("node:fs/promises");
    if (
      binary ||
      url.includes("/metadata") ||
      Date.now() - (await stat(file)).mtimeMs < 21600000
    ) {
      const b = await readFile(file);
      return binary ? b : JSON.parse(b.toString());
    }
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const slot = Math.max(Date.now(), nextRequest);
    nextRequest = slot + 400;
    await sleep(Math.max(0, slot - Date.now()));
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(90000),
        headers: {
          "User-Agent": "DeadlockBuildOptimizer/1.0 (local research)",
        },
      });
      if (!res.ok) {
        if ([400, 404].includes(res.status))
          throw Object.assign(
            new Error(
              `${res.status} ${url}: ${(await res.text()).slice(0, 300)}`,
            ),
            { permanent: true },
          );
        const retry = res.headers.get("retry-after");
        const seconds = Number(retry);
        if (res.status === 429)
          await sleep(
            retry && Number.isFinite(seconds) ? seconds * 1000 : 60000,
          );
        throw new Error(`${res.status} ${url}`);
      }
      const b = Buffer.from(await res.arrayBuffer());
      if (binary && !res.headers.get("content-type")?.startsWith("image/"))
        throw new Error(`Not an image: ${url}`);
      const result = binary ? b : JSON.parse(b.toString());
      await writeFile(file, b);
      return result;
    } catch (e) {
      if (e.permanent || attempt === 4) throw e;
      console.warn(`Retry ${attempt + 1}: ${e.message}`);
      await sleep(1500 * 2 ** attempt);
    }
  }
}
async function pool(values, fn, n = 3) {
  let index = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (index < values.length) {
        const i = index++;
        await fn(values[i], i);
      }
    }),
  );
}
const api = "https://api.deadlock-api.com";
const [allHeroes, allItems] = await Promise.all([
  request(api + "/v1/assets/heroes"),
  request(api + "/v1/assets/items"),
]);
const heroes = allHeroes.filter(
  (h) =>
    h.player_selectable &&
    !h.disabled &&
    !h.in_development &&
    !h.prerelease_only &&
    !h.limited_testing &&
    !h.assigned_players_only,
);
const items = allItems.filter((i) => i.type === "upgrade" && i.cost > 0);
const signatureNames = new Set(
  heroes.flatMap((h) => [1, 2, 3, 4].map((n) => h.items[`signature${n}`])),
);
const abilities = allItems.filter((i) => signatureNames.has(i.class_name));
const weapons = allItems.filter((i) =>
  heroes.some((h) => h.items.weapon_primary === i.class_name),
);
await Promise.all([
  save(path.join(DATA, "items.json"), items),
  save(path.join(DATA, "heroes.json"), heroes),
  save(path.join(DATA, "abilities.json"), abilities),
  save(path.join(DATA, "weapons.json"), weapons),
]);
console.log(
  `Catalog: ${items.length} items, ${items.filter((i) => i.shopable).length} shopable; ${heroes.length} active heroes.`,
);
// Predeclared training window: seven complete UTC days. It is never chosen from validation data.
const end = Math.floor(Date.now() / 86400000) * 86400,
  start = end - 7 * 86400;
const heroStats = await request(
  `${api}/v1/analytics/hero-stats?min_unix_timestamp=${start}&max_unix_timestamp=${end - 1}&game_mode=normal&match_mode=ranked,unranked`,
);
await save(path.join(DATA, "hero-stats.json"), heroStats);
const highSkillHeroStats = await request(
  `${api}/v1/analytics/hero-stats?min_unix_timestamp=${start}&max_unix_timestamp=${end - 1}&game_mode=normal&match_mode=ranked,unranked&min_average_badge=100`,
);
await save(path.join(DATA, "high-skill-hero-stats.json"), highSkillHeroStats);
const analytics = {};
await pool(heroes, async (h) => {
  const q = new URLSearchParams({
    hero_id: String(h.id),
    game_mode: "normal",
    match_mode: "ranked,unranked",
    min_unix_timestamp: String(start),
    max_unix_timestamp: String(end - 1),
    min_matches: "20",
  });
  const itemStats = await request(`${api}/v1/analytics/item-stats?${q}`);
  const abilityOrders = await request(
    `${api}/v1/analytics/ability-order-stats?${q}&min_ability_upgrades=16&max_ability_upgrades=16`,
  );
  // The API forbids combining comb_size and item_ids. Request ordered pairs directly.
  const permutations = await request(
    `${api}/v1/analytics/item-permutation-stats?${q}&comb_size=2`,
  );
  const heroMatches = heroStats.find((s) => s.hero_id === h.id)?.matches || 0;
  if (!heroMatches)
    throw new Error(`No aggregate hero denominator for ${h.name}`);
  analytics[h.id] = { heroMatches, itemStats, abilityOrders, permutations };
  const highMatches =
    highSkillHeroStats.find((s) => s.hero_id === h.id)?.matches || 0;
  if (highMatches >= 1000) {
    const eliteQuery = `${q}&min_average_badge=100`;
    const highItems = await request(
      `${api}/v1/analytics/item-stats?${eliteQuery}`,
    );
    const highOrders = await request(
      `${api}/v1/analytics/ability-order-stats?${eliteQuery}&min_ability_upgrades=16&max_ability_upgrades=16`,
    );
    const highPairs = await request(
      `${api}/v1/analytics/item-permutation-stats?${eliteQuery}&comb_size=2`,
    );
    analytics[h.id].highSkill = {
      heroMatches: highMatches,
      itemStats: highItems,
      abilityOrders: highOrders,
      permutations: highPairs,
    };
  }
  console.log(
    `Analytics ${h.name}: ${itemStats.length} items, ${abilityOrders.length} orders, ${permutations.length} pairs`,
  );
});
await save(path.join(DATA, "analytics.json"), analytics);
const standard = (m) =>
  m.game_mode === 1 &&
  [1, 4].includes(m.match_mode) &&
  m.match_duration_s >= 600 &&
  !m.abandoned_time_s;
const [history, personal] = await Promise.all([
  request(`${api}/v1/players/35187362/match-history`),
  request(`${api}/v1/players/267836488/match-history`),
]);
const infernus = history
  .filter((m) => m.hero_id === 1)
  .sort((a, b) => b.start_time - a.start_time || b.match_id - a.match_id);
await save(path.join(DATA, "zergggy-history.json"), infernus);
await save(
  path.join(DATA, "personal-history.json"),
  personal
    .filter(standard)
    .sort((a, b) => b.start_time - a.start_time)
    .slice(0, 100),
);
const sampled = [];
for (const m of infernus.filter(standard)) {
  if (sampled.length >= 30) break;
  try {
    const raw = await request(
        `${api}/v1/matches/${m.match_id}/metadata?disable_steam=true`,
      ),
      info = raw.match_info;
    const p = info?.players?.find(
      (p) => p.account_id === 35187362 && p.hero_id === 1,
    );
    if (
      !p ||
      info.game_mode !== 1 ||
      ![1, 4].includes(info.match_mode) ||
      p.abandon_match_time_s > 0
    )
      throw new Error("Metadata mode/player mismatch or abandonment");
    const purchases = p.items
      .filter(
        (x) =>
          items.some((i) => i.id === x.item_id) &&
          Number.isFinite(x.game_time_s),
      )
      .sort((a, b) => a.game_time_s - b.game_time_s);
    if (purchases.length < 8)
      throw new Error("Insufficient shop purchase events");
    sampled.push({
      match_id: m.match_id,
      start_time: info.start_time,
      hero_id: 1,
      account_id: p.account_id,
      game_mode: info.game_mode,
      match_mode: info.match_mode,
      duration_s: info.duration_s,
      won: p.team === info.winning_team,
      purchases,
      raw_player_items: p.items,
    });
    console.log(`Validation metadata ${sampled.length}/30: ${m.match_id}`);
  } catch (e) {
    skipped.push({ match_id: m.match_id, reason: e.message });
    console.warn(`Skipped ${m.match_id}: ${e.message}`);
  }
}
if (sampled.length < 20)
  throw new Error(
    `Only ${sampled.length} eligible validation matches; at least 20 required.`,
  );
await save(path.join(DATA, "zergggy-matches.json"), sampled);
// Explicit audit: no held-out match may occur in the aggregate time window.
const overlap = sampled.filter(
  (m) => m.start_time >= start && m.start_time < end,
);
if (overlap.length)
  throw new Error(
    `Held-out isolation failed: ${overlap.length} validation matches overlap the aggregate window. Snapshots are not publishable.`,
  );
const images = {};
const jobs = [
  ...items
    .filter((i) => i.shopable)
    .map((i) => ({
      key: `item-${i.id}`,
      url: i.shop_image_webp || i.shop_image || i.image_webp || i.image,
    })),
  ...heroes.map((h) => ({
    key: `hero-${h.id}`,
    url: h.images.icon_hero_card_webp || h.images.icon_image_small_webp,
  })),
  ...abilities.map((a) => ({
    key: `ability-${a.id}`,
    url: a.image_webp || a.image,
  })),
];
await pool(
  jobs,
  async (job, index) => {
    if (!job.url) throw new Error(`Missing image URL ${job.key}`);
    const extension = new URL(job.url).pathname.split(".").pop();
    const local = `images/${job.key}.${extension}`;
    await writeFile(
      path.join(ROOT, "public", local),
      await request(job.url, true),
    );
    images[job.key] = local;
    if (index % 40 === 0) console.log(`Images ${index}/${jobs.length}`);
  },
  4,
);
await save(path.join(DATA, "images.json"), images);
const warnings = [];
if (items.filter((i) => i.shopable).length < 200)
  warnings.push(
    `Upstream exposes only ${items.filter((i) => i.shopable).length} shopable items (${items.length} total); the >=200 shopable acceptance criterion cannot truthfully pass.`,
  );
const manifest = {
  fetchedAt: new Date().toISOString(),
  aggregateWindow: { start, endExclusive: end },
  activeHeroes: heroes.length,
  catalogItems: items.length,
  shopableItems: items.filter((i) => i.shopable).length,
  validationMatches: sampled.length,
  personalMatches: personal.filter(standard).slice(0, 100).length,
  heldOutOverlap: overlap.length,
  skipped,
  warnings,
  sources: [...new Set(sources)].sort(),
};
await save(path.join(DATA, "manifest.json"), manifest);
console.log(
  "Snapshots complete.",
  JSON.stringify({ ...manifest, sources: manifest.sources.length }, null, 2),
);
