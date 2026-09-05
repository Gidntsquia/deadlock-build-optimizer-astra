import type { PersonalMatch } from "./types";
export function median(values: number[]) {
  const s = [...values].sort((a, b) => a - b),
    n = s.length;
  return n ? (s[Math.floor(n / 2)] + s[Math.floor((n - 1) / 2)]) / 2 : 0;
}
export function personalInsight(matches: PersonalMatch[]) {
  const real = matches.filter(
    (m) => m.game_mode === 1 && [1, 4].includes(m.match_mode),
  );
  return {
    count: real.length,
    minutes: Math.round(median(real.map((m) => m.match_duration_s)) / 60),
    budget: Math.round(median(real.map((m) => m.net_worth)) / 100) * 100,
  };
}
