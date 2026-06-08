# 睡了么 — Project Context for Claude

## Overview

"睡了么" is a pure frontend Dota 2 Turbo mode sleep analyzer. User inputs Steam32 ID, browser calls OpenDota API directly, evaluates sleep quality based on the last match between 20:00-02:00.

Deployed at: `https://sleepwell-887.pages.dev` (Cloudflare Pages)

## Key Technical Decisions

### API: `game_mode=23&significant=0`

This is the ONLY correct way to filter Turbo mode data. Critical findings:
- `game_mode=22` is All Draft (全英雄选择), NOT Turbo. Do NOT use it.
- `game_mode=23` without `significant=0` returns empty data from most endpoints.
- `game_mode=23&significant=0` — the magic combination that works for `/counts`, `/totals`, `/wl`, `/heroes`.
- `/recentMatches` correctly labels Turbo as `game_mode=23`, works without `significant=0`.
- `/players/{id}/matches?game_mode=23&significant=0&included_account_id={proId}` — find matches with a specific player.

### Data Sources

| Endpoint | What it provides | Parameters |
|----------|-----------------|------------|
| `recentMatches` | 20 recent matches with full details (KDA/GPM/XPM) | `game_mode=23&significant=0` |
| `matches` | Full match history with another player | `game_mode=23&significant=0&included_account_id=X` |
| `counts` | Game counts by patch/lane_role/region/is_radiant | `game_mode=23&significant=0` |
| `totals` | Aggregated KDA/GPM/XPM/last_hits/etc | `game_mode=23&significant=0` |
| `wl` | Win/loss counts | `game_mode=23&significant=0` |
| `heroes` | Per-hero game counts and win rates (NO KDA/GPM) | `game_mode=23&significant=0` |

- Patch filter: `/totals?game_mode=23&significant=0&patch=60` etc.
- Hero stats from API have ONLY `games` and `win` fields. No KDA/GPM/XPM.
- CORS: OpenDota returns `access-control-allow-origin`, works from any origin.

### Sleep Evaluation

- Window: Most recent completed 02:00 → (02:00 - 6h) = previous day 20:00
- Before 02:00 today → use yesterday's 02:00 as end
- After 02:00 today → use today's 02:00 as end
- Score: time 50% + win 25% + KDA 25%
- KDA score: monotonic increasing (KDA越高越牛逼). <1=30, 1-10 linear 50→100, ≥10=100
- Real-time advice: only shown when current time is 20:00-02:00

## File Structure

```
dd2/
├── index.html          # Entry page, Chinese UI, inline version-check script
├── _headers            # Cloudflare Pages CDN cache policy
├── version.txt         # App version number for cache-busting
├── LICENSE             # BSL 1.1
├── css/style.css       # Dark theme, responsive, sidebar overlay, modal
├── js/
│   ├── config.js       # API_BASE, STORAGE_KEYS, PATCH_VERSIONS, RANK_MEDALS, CACHE_VERSION
│   ├── storage.js      # localStorage with TTL, namespace 'dd2_'
│   ├── api.js          # OpenDota client: request(), getHeroes(), getPlayer(),
│   │                   #   getRecentMatches(), getMatchesWithPlayer(),
│   │                   #   getTurboCounts(), getTurboTotals(),
│   │                   #   getTurboWinLoss(), getTurboHeroStats(), fetchTurboStats(),
│   │                   #   getPeers(), getTopPlayers(), getPlayerPros()
│   ├── heroNames.js    # Chinese hero name mapping (internal_name → 中文)
│   ├── sleep.js        # evaluateSleep(), getSleepMessage(), getCurrentSessionAdvice(),
│   │                   #   isPlayerInactive()
│   ├── charts.js       # createWinRateTrend(), createHeroPerformanceChart(),
│   │                   #   createMmrTrendChart()
│   ├── ui.js           # All DOM rendering: renderPlayerList, renderSleepCard,
│   │                   #   renderSessionAdvice, renderTeammateInactiveCard,
│   │                   #   renderTurboSummary, renderHeroTable, renderRecentMatches,
│   │                   #   renderPeersTable, renderPatchSelector, renderPlayerProfile,
│   │                   #   renderLeaderboardModal, renderProsModal, renderProMatchRow,
│   │                   #   showModalLoading, showLoading, showError, showEmpty, closeModal
│   └── app.js          # Main controller: init(), loadDashboard(), player management,
│                       #   patch filter, data computation, loadPeers(),
│                       #   openLeaderboard(), openPros()
└── README.md
```

## State Management

`app.js` holds a single `state` object:
- `playerList`: `{ myId, enemyIds: [{id, note}], teammateIds: [{id, note}] }` — persisted in localStorage `dd2_player_list`
- `heroMap`: Map of hero_id → internal_name, localized_name, etc.
- `turboCounts`: from `/counts` — has `.patch`, `.is_radiant`, `.lane_role` etc.
- `turboStats`: `{ wl, heroes, totals }` — from `fetchTurboStats()`
- `turboMatches`: recent Turbo matches, sorted by start_time desc
- `allRecentMatches`: all recent matches (for sleep eval)
- `selectedPatch`: null (all) or a patch number
- `sleepEval`: result from `evaluateSleep()`
- `isEnemy`: whether current view is an enemy player
- `isTeammate`: whether current view is a teammate
- `currentViewId`: the Steam32 ID currently being viewed

## Cache

- `localStorage` with `dd2_` namespace, TTL-based auto-expiry via `storage.js`
- `CACHE_VERSION` in config.js — bump to clear stale API caches on load
- Player list (`dd2_player_list`) and `dd2_cache_version` are preserved across cache clears
- Hero list cached 7 days, player stats 5 minutes, peers/pros 5 minutes
- MMR history (`dd2_mmr_history_{id}`) is **permanent**, preserved across cache clears, only saved for the main player (not enemies/teammates)

### localStorage Keys

| Key | Content | TTL |
|-----|---------|-----|
| `dd2_heroes` | All hero name mappings | 7 days |
| `dd2_player_list` | `{myId, enemyIds[], teammateIds[]}` | Permanent |
| `dd2_cache_version` | Version number | Permanent |
| `dd2_app_version` | Version number for update detection | Permanent |
| `dd2_top_players_turbo` | Leaderboard data | 5 min |
| `dd2_player_{id}` | Player profile | 5 min |
| `dd2_counts_{id}_turbo` | Turbo counts by dimension | 5 min |
| `dd2_stats_{id}_turbo_wl` | Win/loss (all patches) | 5 min |
| `dd2_stats_{id}_turbo_wl_p{ver}` | Win/loss (specific patch) | 5 min |
| `dd2_stats_{id}_turbo_heroes` | Hero stats (all patches) | 5 min |
| `dd2_stats_{id}_turbo_heroes_p{ver}` | Hero stats (specific patch) | 5 min |
| `dd2_stats_{id}_turbo_totals` | Aggregated KDA/GPM/XPM (all) | 5 min |
| `dd2_stats_{id}_turbo_totals_p{ver}` | Aggregated KDA/GPM/XPM (patch) | 5 min |
| `dd2_stats_{id}_turbo_peers` | Frequent peers (90 days) | 5 min |
| `dd2_stats_{id}_pros` | Pro players encountered | 5 min |
| `dd2_mmr_history_{id}` | MMR history `[{ts, mmr}, ...]` | Permanent |

### Version Update Detection

Three-layer cache-busting strategy:
1. **`_headers`**: Cloudflare Pages sets `no-cache, no-store, must-revalidate` on `index.html` and `version.txt`
2. **Inline version check**: Async XHR in `index.html` fetches `/version.txt` (timestamp), compares with `dd2_app_ts` in localStorage. If mismatch → clear all `dd2_*` caches (except `player_list` and `mmr_history_*`) → `location.reload(true)`
3. **No `?v=` query strings on assets**: Removed for UC Browser compatibility; `_headers` controls JS/CSS caching with `max-age=3600`

When deploying an update, run one command:
- `date +%s > version.txt` (or set Cloudflare Pages build command to do this automatically)

## CSS Layout

- Desktop (>1024px): `display: grid; grid-template-columns: 240px 1fr` (in `@media (min-width: 1025px)`)
- Mobile (≤1024px): `display: block`, sidebar is `position: fixed` with `translateX(-100%)`, toggled via ☰ button
- Summary cards: 3×3 grid on desktop, 3×3 on tablet, 2×N on phone
- Match table hides duration/link columns on tablet, K/D/A on phone
- Peers table hides against columns on tablet, with columns on phone
- Leaderboard/pros modals: full-screen bottom sheet on mobile; MMR column visible, last-match hidden on phone
- Pros modal: "比赛" button per row uses event delegation on `.modal-body` for mobile compatibility; clicking fetches matches via `getMatchesWithPlayer()`, renders sub-table with OD/DB links
- Sidebar sections use collapsible sections with CSS `max-height` transition
- MMR trend chart: full-width (`grid-column: 1 / -1`) below win-rate and hero performance charts

## Hero Name Mapping

`heroNames.js` maps Dota 2 internal names to Chinese. Internal names are the `hero.name` from `/heroes` API with `npc_dota_hero_` prefix stripped (e.g., `slark`, `queenofpain`, `keeper_of_the_light`). **Keys must be lowercase snake_case** (not PascalCase) — otherwise `enrichHeroMapWithChinese()` won't match and heroes will show English names.

## Build/Deploy

- Zero build tools, zero npm deps
- Chart.js loaded via CDN: `https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js`
- Deploy: push to GitHub → Cloudflare Pages auto-deploys
- Local dev: `python3 -m http.server 8233`
