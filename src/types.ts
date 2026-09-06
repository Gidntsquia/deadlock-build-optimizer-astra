export type Slot = "weapon" | "vitality" | "spirit";
export type Property = {
  value?: string | number;
  label?: string;
  postfix?: string;
  prefix?: string;
  disable_value?: string;
  tooltip_section?: string;
  provided_property_type?: string;
  scale_function?: {
    stat_scale?: number;
    class_name?: string;
    specific_stat_scale_type?: string;
  };
  conditional?: string;
};
export interface Asset {
  id: number;
  class_name: string;
  name: string;
  type: string;
  cost: number;
  item_tier: number;
  item_slot_type: Slot;
  shopable?: boolean;
  is_active_item?: boolean;
  properties: Record<string, Property>;
  description?: Record<string, string>;
  tooltip_sections?: {
    section_type: string;
    section_attributes?: {
      loc_string?: string;
      properties?: string[];
      elevated_properties?: string[];
      important_properties?: string[];
    }[];
  }[];
  component_items?: string[];
  upgrades?: {
    property_upgrades: { name: string; bonus: string | number }[];
  }[];
  weapon_info?: { bullet_damage?: number; shots_per_second?: number };
}
export interface Hero {
  id: number;
  name: string;
  description: { role: string; playstyle: string };
  items: Record<string, string>;
  starting_stats: Record<string, { value: number }>;
  standard_level_up_upgrades: Record<string, number>;
  cost_bonuses: Record<Slot, { gold_threshold: number; bonus: number }[]>;
  level_info: Record<
    string,
    { required_gold: number; bonus_currencies?: string[] }
  >;
}
export interface ItemStats {
  item_id: number;
  wins: number;
  matches: number;
  avg_buy_time_s: number;
}
export interface AbilityStats {
  abilities: number[];
  wins: number;
  matches: number;
}
export interface PairStats {
  item_ids: number[];
  wins: number;
  matches: number;
}
export interface Analytics {
  highSkill?: Analytics;
  heroMatches: number;
  itemStats: ItemStats[];
  abilityOrders: AbilityStats[];
  permutations: PairStats[];
}
export interface AggregateData {
  heroes: Hero[];
  items: Asset[];
  abilities: Asset[];
  weapons: Asset[];
  analytics: Record<number, Analytics>;
}
export type Phase = "Early" | "Mid" | "Late";
export interface Buy {
  itemId: number;
  phase: Phase;
  cost: number;
  total: number;
  score: number;
  winRate: number;
  usage: number;
  upgradesFrom: number[];
  sell: number[];
  reason: string;
}
export interface AbilityStep {
  abilityId: number;
  name: string;
  slot: number;
  tier: number;
  level: number;
  souls: number;
  ap: number;
}
export interface Build {
  cohort: string;
  cohortMatches: number;
  id: string;
  name: string;
  subtitle: string;
  focus: Slot;
  items: Buy[];
  abilityOrder: AbilityStep[];
  abilityEvidence: number;
  abilityCohort: string;
  abilityFallback: boolean;
  total: number;
  kitNote: string;
}
export interface Purchase {
  item_id: number;
  game_time_s: number;
}
export interface ValidationMatch {
  match_id: number;
  account_id: number;
  hero_id: number;
  start_time: number;
  game_mode: number;
  match_mode: number;
  duration_s: number;
  won: boolean;
  purchases: Purchase[];
}
export interface PersonalMatch {
  match_id: number;
  match_duration_s: number;
  net_worth: number;
  game_mode: number;
  match_mode: number;
}
export interface Manifest {
  fetchedAt: string;
  activeHeroes: number;
  catalogItems: number;
  shopableItems: number;
  validationMatches: number;
  personalMatches: number;
  aggregateWindow: { start: number; endExclusive: number };
  heldOutOverlap: number;
  warnings: string[];
}
