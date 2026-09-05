import type { Build, ValidationMatch } from "./types";
export interface CoreItem {
  itemId: number;
  frequency: number;
  weightedFrequency: number;
  meanTime: number;
  core: boolean;
}
export function computeCore(matches: ValidationMatch[]): CoreItem[] {
  const eligible = matches.filter(
    (m) =>
      m.hero_id === 1 && m.game_mode === 1 && [1, 4].includes(m.match_mode),
  );
  const totalWeight = eligible.reduce((s, m) => s + (m.won ? 1.5 : 1), 0),
    map = new Map<number, { count: number; weight: number; time: number }>();
  for (const m of eligible) {
    const first = new Map<number, number>();
    for (const p of m.purchases)
      first.set(
        p.item_id,
        Math.min(first.get(p.item_id) ?? Infinity, p.game_time_s),
      );
    for (const [id, time] of first) {
      const old = map.get(id) || { count: 0, weight: 0, time: 0 },
        weight = m.won ? 1.5 : 1;
      map.set(id, {
        count: old.count + 1,
        weight: old.weight + weight,
        time: old.time + time * weight,
      });
    }
  }
  return [...map]
    .map(([itemId, s]) => ({
      itemId,
      frequency: s.count / eligible.length,
      weightedFrequency: s.weight / totalWeight,
      meanTime: s.time / s.weight,
      core: s.count / eligible.length >= 0.3,
    }))
    .sort(
      (a, b) =>
        b.weightedFrequency - a.weightedFrequency || a.itemId - b.itemId,
    );
}
export function validateBuild(build: Build, core: CoreItem[]) {
  const set = core.filter((i) => i.core),
    ids = build.items.map((i) => i.itemId),
    shared = set.filter((i) => ids.includes(i.itemId));
  // Weighted Jaccard: missing core retains its frequency weight; non-core recommendations weigh 1.
  const numerator = shared.reduce((s, i) => s + i.weightedFrequency, 0);
  const denominator =
    set.reduce((s, i) => s + i.weightedFrequency, 0) +
    ids.filter((id) => !set.some((i) => i.itemId === id)).length;
  const overlap = denominator ? numerator / denominator : 0;
  let concordant = 0,
    pairs = 0;
  for (let a = 0; a < shared.length; a++)
    for (let b = a + 1; b < shared.length; b++) {
      const x = shared[a],
        y = shared[b];
      if (x.meanTime === y.meanTime) continue;
      pairs++;
      if (
        (ids.indexOf(x.itemId) - ids.indexOf(y.itemId)) *
          (x.meanTime - y.meanTime) >
        0
      )
        concordant++;
    }
  const order = pairs ? concordant / pairs : null;
  return {
    agreement: Math.round(100 * (0.7 * overlap + 0.3 * (order ?? 0))),
    overlap,
    order,
    shared: shared.length,
    coreCount: set.length,
    pairs,
  };
}
export async function loadValidation(
  base: string,
  reader: (
    url: string,
  ) => Promise<{ ok: boolean; json: () => Promise<ValidationMatch[]> }> = fetch,
): Promise<ValidationMatch[]> {
  const response = await reader(`${base}data/zergggy-matches.json`);
  if (!response.ok) throw new Error("Validation snapshot missing");
  return response.json();
}
