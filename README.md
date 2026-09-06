# Deadlock Build Optimizer

## GitHub Pages

Published as **Deadlock build optimizer astra**:
[Open the app](https://gidntsquia.github.io/deadlock-build-optimizer-astra/).

The public repository is [Gidntsquia/deadlock-build-optimizer-astra](https://github.com/Gidntsquia/deadlock-build-optimizer-astra).
`main` contains the source and snapshots; `gh-pages` contains only the built static app and `.nojekyll`.
Relative Vite asset paths support the repository subdirectory. GitHub Pages publishes the root of `gh-pages`.
After committing future source/data changes, run `npm run deploy` with GitHub CLI authentication to rebuild and publish.
The deployment preserves branch history and includes the existing snapshots; it does not fetch fresh game data automatically.

A mobile-first React 19 + Vite + TypeScript app with local snapshots, one deterministic consensus build per active hero, complete ability paths, shop detail cards, and a separate held-out evaluation. No backend, database, authentication, API keys, or paid services.

## Run locally

Use Node.js 22+ and npm. In this WSL-hosted directory, run commands from a WSL terminal.

```sh
npm install
npm run fetch-data
npm run dev
```

The initial fetch needs internet access and may take several minutes. This delivery already includes snapshots and images in `public/`; subsequent app usage and production builds need no external network. A local HTTP server is still necessary: opening `index.html` as a `file://` URL is not supported. The app makes same-origin requests only; the source link is an optional external navigation.

```sh
npm run build
npm run preview
npm test
npm run validate
npx playwright install chromium   # one-time browser test dependency
npm run verify:browser
```

`verify:browser` serves the production `dist` on an automatically assigned local port, opens a fresh mobile Chromium context, blocks external requests, and writes screenshots and a JSON report. It needs an existing production build. For stronger offline verification on Linux with `unshare` and `iproute2`:

```sh
unshare -Urn bash scripts/verify-offline.sh
```

This creates a network namespace with **only loopback**, builds the app, runs the algorithm tests, and tests the served production app. It does not disconnect the host machine.

## Verified acceptance results — September 6, 2026

**One upstream-dependent criterion is not met:** the API supplies **251 upgrade catalog entries, of which only 173 have `shopable: true`**. All 251 are retained exactly as supplied; retired items are never relabeled as purchasable. The requested minimum of 200 _shopable_ items cannot truthfully be reached with the current source. The test suite explicitly skips that numerical assertion with the actual counts, rather than reporting it as passed.

| Acceptance criterion                                                          | Result and evidence                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fetch snapshots; ≥200 shopable items; all active heroes; ≥20 held-out matches | **Partial: upstream count limitation above.** `npm run fetch-data` completed with 251 catalog entries, 173 shopable, 38 active heroes, item/ability/pair analytics for all 38, and 30 eligible matches with purchases.          |
| Offline production build and error-free served app                            | **Pass.** Built and browser-tested in a loopback-only network namespace. Zero external requests and zero console errors.                                                                                                        |
| Default Infernus; two named builds; ≥12 items, phases, costs, totals, images  | **Updated at user request:** one consensus build with 22 ordered purchases in three phases. All 22 image/detail bindings tested.                                                                                             |
| Three other heroes render builds and ability order                            | **Pass, exceeded.** One build and all three views tested for all 38 active heroes, including Seven, Vindicta, and Lady Geist.                                                                                                 |
| Four real ability names, unlocks and tiers                                    | **Pass.** Napalm, Flame Dash, Afterburn, Concussive Combustion; 16 operations with four unlocks and tiers 1–3 for each ability. Point and soul budgets tested for every hero.                                                   |
| Item detail cards match asset data                                            | **Pass.** Image, catalog cost, tier, slot, every displayed stat value/label, and every description tested for all 22 recommended Infernus cards. Missing-value asset properties are omitted.                                    |
| Core/not-core badges and per-build agreement                                  | **Pass.** Every Infernus recommendation is labeled. The recommended build shows agreement; full report explains overlap, order, exclusions, and sample. Other heroes explicitly say validation is Infernus-only.                    |
| Generator isolated from held-out data                                         | **Pass.** Generator has one type-only import and receives only aggregate data plus hero/item/ability/weapon assets. No player files, account IDs, network, filesystem, or validation dependencies. Data windows do not overlap. |
| 390×844 layout and ≥40px tap targets                                          | **Pass.** All hero/build/view combinations and 22 detail dialogs tested for horizontal overflow and target dimensions. Escape closes the dialog and restores focus. Desktop stays in a centered 680px column.                   |
| Documented scoring and deterministic reruns                                   | **Pass.** Exact deep equality for repeated generation on all 38 heroes; per-hero SHA-256 build fingerprints saved. Fixed weights below.                                                                                         |

Evidence is in `verification/`: `offline-verification.log`, `browser-report.json`, `build-hashes.json`, `generated-infernus.json`, `validation-report.json`, mobile screenshots for items/abilities/validation/detail, and a desktop screenshot. The algorithm suite has **12 passing tests and 1 explicitly skipped upstream constraint**, with no failures.

## Data pipeline and provenance

The brief's legacy `assets.deadlock-api.com/v2/...` endpoints redirect to the main API. The script uses their current equivalents and never scrapes Statlocker:

- [Assets and analytics OpenAPI](https://api.deadlock-api.com/openapi.json): `/v1/assets/heroes`, `/v1/assets/items`, `/v1/analytics/hero-stats`, `item-stats`, `ability-order-stats`, `item-permutation-stats`.
- `/v1/players/35187362/match-history` and `/v1/matches/{match_id}/metadata?disable_steam=true` for evaluation only.
- `/v1/players/267836488/match-history` for personal pacing only.
- Shop images and hero/ability images are downloaded from the actual URLs supplied by the assets data, preferring `shop_image_webp` for shop items. The source image URLs remain in the asset records.
- [Valve protobuf mode definitions](https://github.com/SteamTracking/Protobufs/blob/master/deadlock/citadel_gcmessages_common.proto) identify normal game mode as `1`, unranked as `1`, ranked as `4`, private lobby as `2`, and coop bots as `3`. Private lobbies are **not** treated as ranked matches.

`public/data/` contains full upgrade records (`items.json`), all active hero assets (`heroes.json`), their four signature abilities (`abilities.json`), main weapon assets (`weapons.json`), hero match denominators (`hero-stats.json`), per-hero aggregate data (`analytics.json`), all Infernus history entries (`zergggy-history.json`), the eligible metadata sample (`zergggy-matches.json`), personal history (`personal-history.json`), local image mapping (`images.json`), and provenance (`manifest.json`). The metadata sample retains raw player item events alongside the shop-purchase projection. Ability upgrade events are excluded from the shop purchase projection.

Active means player-selectable and not disabled, in development, prerelease-only, limited-testing, or assigned-players-only. At fetch time there are 38. Every active hero must have an aggregate denominator; a missing denominator fails the fetch. Sparse ability orders have the explicit fallback below.

Aggregate analytics use **seven complete UTC days preceding the fetch day**, standard mode, ranked/unranked only, and a 20-match minimum. This window was fixed independently of player results. Hero totals use the same window and modes. Pair queries use `comb_size=2`; the API rejects `comb_size` combined with `item_ids`. Ability queries request complete 16-event sequences.

The held-out sampler sorts Infernus history newest-first and takes 30 matches of normal ranked/unranked play, at least ten minutes, no abandonment, matching metadata/player/hero, and at least eight shop purchase events. Missing metadata is logged and the next eligible match is tried; fewer than 20 successful matches fails the fetch. Steam fallback is disabled to avoid its severe rate limit. In this fetch all 30 eligible metadata requests succeeded. Wins come from player team versus metadata winning team.

The script independently audits temporal disjointness after fetching; the delivered sample has **zero overlap** with the aggregate window. If future player matches overlap that fixed window, fetching fails with an explicit isolation error rather than silently publishing a contaminated evaluation. The aggregate API offers no exclusion-account filter; we do not claim the entire population excludes that player's older/unrelated games. The held-out **matches themselves** are excluded by time.

Requests are globally spaced at least 400ms apart (≤150 requests/minute), with three data workers/four image workers. It retries transient errors up to five attempts with exponential delay, honors numeric `Retry-After` on 429, and conservatively waits 60 seconds otherwise. HTTP 400/404 are not retried. URL-addressed checkpoints in `.cache/deadlock` resume interrupted fetching: analytics/assets/history expire after six hours; metadata and image blobs are reused. `manifest.json` is written last and records exact URLs, timestamps, counts, skips and limitations. Each JSON write is atomic, but the entire directory is not a transaction; after a failed refresh, rerun successfully before using its mixed partial snapshots. Remove `.cache/deadlock` to force a fresh retrieval of cached immutable resources.

## Generator: inputs and fixed scoring

`src/generator.ts` is a pure, deterministic function of `AggregateData` and hero ID. It does not import, fetch or read any player snapshot, personal insight, agreement value, or validation output. The consensus revision is declared in `verification/consensus-plan.md`. It prioritizes aggregate usage and observed timing, with no reference-player items or timings used as generator inputs. The existing reference sample has been reused during development.

For each legal next item, maximize this weighted sum:

| Term                   | Weight | Definition                                                                                                                                                                                     |
| ---------------------- | -----: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Win rate               |    15% | Beta(25,25) smoothed rate: `(wins + 25) / (matches + 50)`.                                                                                                                                     |
| Usage                  |    55% | Purchase-match count divided by total matches of that hero, clamped to [0,1]; score uses this linear frequency.                                                                    |
| Stat value per soul    |     5% | Kit/focus-weighted stat utility divided by catalog cost in 800-soul units, normalized by the maximum within the item's tier.                                                                   |
| Kit synergy            |     5% | `clamp(rawStatUtility / 8 + 0.25 if matching the build's slot focus)`.                                                                                                                         |
| Active/passive utility |   2.5% | Focus-relevant effect prose contributes 0.65; active items add 0.25, other items 0.15; passive tooltip sections add 0.20; clamp to [0,1].                                                      |
| Game phase             |    10% | `exp(-distanceToNearestTarget / 600)`, targets 240/900/1680 seconds. Unknown timing scores 0.2.                                                                                      |
| Soul investment        |   2.5% | Marginal bonus from crossing this hero's asset `cost_bonuses` thresholds in that item category, divided by 25 and clamped. This is a cumulative investment heuristic, not a combat simulation. |
| Ordered pair evidence  |     5% | Mean over owned items: smoothed pair win rate × forward pair count / (forward + reverse pair count). Missing pair = 0.25; empty inventory = 0.5.                                               |

All ties break by numeric item ID, and there is no randomness, network access, current-time use, or input mutation during generation. Ability ties break by the serialized ability ID sequence.

Stat feature scales are explicit: weapon damage /20; fire rate /15; spirit power /15; lifesteal/regen /10; bonus health /15% of projected hero health; cooldown/duration/range/movement/resist /20. Negative and absent values contribute zero. Projected health is starting health plus 15 level-growth increments. Spirit affinity is `1 + clamp(sum(signature stat scales)/8) + clamp(spirit growth/2)`; gun affinity is `1 + clamp(bullet damage growth×10)`; fire affinity is `1 + clamp(shots per second/10) + 1 if bullet buildup/refill exists in the kit`. Fallback base health is 800 and fire rate is 3 only if assets omit those fields.

Raw utility combines gun × gun affinity × (1.8 weapon-focus /0.6 spirit-focus), fire × fire affinity × (1.4 /1), spirit × spirit affinity × (0.5 /1.8), sustain, and 0.6×utility. Effect prose recognizes spirit/burn/damage-over-time versus weapon/bullet/fire-rate keywords. Thus Infernus's actual Afterburn buildup/refill properties, spirit scaling, weapon fire rate and growth all affect scoring without a hand-curated item list. This is a transparent heuristic optimizer, **not a proof of globally optimal play or a predicted win rate**. Item win rates have selection/survivorship bias; the prior dampens small samples but does not eliminate that bias.

Ascendant+ (`min_average_badge=100`) evidence is preferred exclusively for items, pairs, usage and timing when at least 200 hero matches and 12 item rows exist; otherwise use all-skill data. Current snapshots qualify all 38 heroes. Infernus now uses 702 Ascendant+ matches. The UI shows the chosen cohort and actual denominator. Expert rows require five observations to be fetched, and selection still prefers items with 20 observations; win rates retain the 25/25 prior. Ability paths prefer the expert cohort, falling back to a clearly labeled all-skill path when complete expert evidence is absent.

`node scripts/fetch-data.mjs --expert-only` refreshes expert hero denominators, items, pairs and ability orders in the existing manifest window, preserving assets and the reference sample. `high-skill-hero-stats.json` preserves the denominators and the manifest records source URLs and expert refresh time.

### Build legality and phases

The consensus build targets the number of shop items with at least 30% aggregate cohort usage, bounded to 12–24 unique purchases. Infernus has 22. There are no category or per-phase purchase quotas. Rank legal candidates using the unchanged weights, shortlist the strongest remaining plan purchases, then schedule by observed timing with components before their upgrades. Label early through 600 seconds, mid through 1,200 seconds, and late thereafter, never moving backward between phases. Missing timing uses tier-based defaults. Focus comes from offensive-category usage.

Only `shopable: true` assets qualify. Candidates with at least 20 observed matches are preferred whenever any legal observed candidate exists. Unobserved candidates are a fallback only, with neutral 50% smoothed win rate and zero usage. Already-bought items, downgrade components of currently owned upgrades, and a fifth simultaneous active item are excluded. Owned components are consumed and credited against the upgrade's catalog cost. If no component was previously bought, the full catalog cost is charged. At a conservative 12 occupied slots, the cheapest remaining item is sold before adding a replacement; this instruction is displayed. This avoids assuming optional extra inventory capacity. The timeline is a **purchase plan**, not all listed items simultaneously equipped.

Running totals sum actual purchase payments after component credits. Sale refunds are deliberately excluded, producing a conservative budget rather than patch-dependent refund assumptions. Investment scoring uses cumulative category spending and candidate payment after owned-component credit as a heuristic. It does not attempt to simulate every conditional effect, enemy composition, or match situation.

### Ability paths

Hero `signature1`–`signature4` class names resolve to real ability assets. A candidate aggregate path must contain 16 events with each ability ID appearing four times. Rank paths by 65% smoothed win rate + 35% log-normalized usage. First occurrence is unlock; subsequent occurrences are tiers 1, 2 and 3 at costs 1, 2 and 5 AP. The scheduler follows the hero asset's `level_info` currencies and soul thresholds; the ultimate cannot unlock before level 8. It waits/saves points when needed. All four unlocks and all 32 AP are checked.

The build uses the best aggregate ability path. If complete evidence is absent, unlock slots 1–4, then upgrade each in slot order through tiers 1–3, scheduling each legally. The UI explicitly labels this fallback and never assigns it invented match counts.

## Separate held-out evaluation

`npm run validate` generates and saves Infernus builds **before opening the held-out snapshot**, then saves scores, the full core table, and a generator source hash. In the browser, initial generation also finishes before `loadValidation` fetches the player sample. Only the validation module names and opens that sample in application code; test fixtures and the fetch script necessarily handle raw snapshots separately.

An item is **core when it appears in ≥30% of sampled matches**, counting presence once per match. Items below 30% are experiments and are excluded from the reference core. This eligibility threshold is unweighted so a single win cannot turn a rare experiment into a core item. After eligibility, a win weighs **1.5**, a loss **1**. Weighted frequency is weighted appearances / total match weight; purchase timing is the win-weighted mean of each match's earliest purchase of the item. Repeated buys never inflate presence.

Overlap is weighted Jaccard: numerator = sum of weighted frequencies of shared core items; denominator = sum of weights of **all** core items + 1 for each non-core recommended item. Missing core and extra items are therefore both penalized. Retired core items remain in the denominator rather than disappearing to improve the score. Order agreement is the fraction of shared-item pairs whose build order agrees with their weighted mean purchase times. Tied times are omitted; fewer than two shared items yields N/A order and zero contribution.

**Overall agreement = round(100 × (0.70 × overlap + 0.30 × order)).** This measures how well the generator did against one player's core; it is not build strength, a confidence interval, or predicted win probability. The expert/adaptive revision yields **59%**, up from the deployed **45%**: 15/24 core items, 46.63% weighted overlap, and 88.57% agreement across 105 shared-item pairs. Adaptive scheduling alone scored 48%; prioritizing expert data improved it further. The evaluator and 30-match sample are unchanged. Expert snapshots were refreshed within the original disjoint training window. This is a reused development benchmark, not fresh independent generalization evidence; it is small, older, and drawn from one player. The policy was declared in `verification/adaptive-plan.md` before evaluation.

Non-Infernus builds show “Core check: N/A” and an Infernus-only validation explanation, rather than applying another hero's reference set.

## Personalization and UI judgments

- Personal history is no longer loaded by the app. The game-length note and stretch badges were removed at the user’s request. Historical snapshots and the standalone pacing utility remain for provenance.
- Infernus is the default hero. Current asset names take precedence over historical familiarity: Napalm is not hardcoded as Catalyst.
- A single centered column, parchment shop panels, cyan emphasis, category-colored cards with real shop imagery and Roman tier corners, one recommended build, and Items/Abilities/Validation navigation keep the phone experience focused. Desktop retains the same 680px column. No account editing, sharing backend, or speculative features were added.
- Native select and modal dialog provide keyboard behavior and touch targets. Escape/backdrop/close dismiss item details; focus returns to the triggering item. The modal prevents background scrolling. Reduced-motion preferences are respected.
- Detail cards use unmodified catalog costs plus separate credited purchase cost. Stats use source labels/values/units; unspecified, zero/default-disabled, and `-1` sentinel values are hidden. All provided nonduplicate tooltip/description prose is rendered as plain text. API HTML/SVG is stripped rather than executed; visual inline icons become text-only. Item names, badges, and primary imagery always remain visible.
- All required imagery is downloaded from factual asset URLs; there are no generated approximations, remote fonts, runtime API calls, or tracking. Snapshot errors show a retry state with the fetch command instead of a blank page.
- An optional, feature-detected WebMCP `select_hero_build` tool mirrors hero selection. The browser used for QA lacks native WebMCP, so native registry integration is not claimed as verified and is not required for this app's acceptance criteria.
- The original delivery was local-only; GitHub Pages was subsequently added at the user's request. The data and images retain Valve/community ownership; no affiliation is implied.

## Source layout

`scripts/fetch-data.mjs` owns acquisition; `src/generator.ts` owns pure generation; `src/validation.ts` owns held-out core/scoring/loading; `src/personalization.ts` owns pacing; `src/assetText.ts` owns safe source-text rendering; `src/main.tsx`, `src/AbilityTimeline.tsx`, `src/style.css`, and `src/shop.css` own UI. Tests are in `tests/optimizer.test.ts` and `scripts/verify-browser.ts`. The snapshots and image files are intentional deliverables, not gitignored build output.
