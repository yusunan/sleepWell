// ============================================================
// app.js — Main Application Controller
// ============================================================

import { VALIDATION, STEAM_ID_OFFSET, TURBO_MODES, MAX_DISPLAY_MATCHES } from './config.js';
import { CACHE_TTL, STORAGE_KEYS } from './config.js';
import { get as cacheGet, set as cacheSet } from './storage.js';
import { enrichHeroMapWithChinese } from './heroNames.js';
import {
    getHeroes,
    getPlayer,
    getCounts,
    getRecentMatches,
    fetchTurboStats,
    detectTurboModes,
    getRateLimitStatus,
    cancelAll,
    PlayerNotFoundError,
    RateLimitError,
    NetworkError,
    ApiError,
} from './api.js';
import {
    showLoading,
    showError,
    showEmpty,
    renderPlayerProfile,
    renderTurboSummary,
    renderHeroTable,
    renderRecentMatches,
    renderRateLimitIndicator,
    renderFullDashboard,
    renderChartCanvases,
    clearDashboard,
    showPlayerNotFound,
    showNoTurboData,
    showDashboardError,
    showNetworkError,
    showInputError,
    clearInputError,
} from './ui.js';
import {
    createWinRateTrend,
    createHeroPerformanceChart,
    destroyChart,
} from './charts.js';

// --- Application State ---
const state = {
    currentPlayerId: null,
    isLoading: false,
    heroMap: null,          // Map<hero_id, { name, localized_name, img }>
    profile: null,
    counts: null,
    turboStats: null,       // Merged stats from all turbo modes
    turboMatches: [],       // Merged + sorted turbo matches
    charts: {},             // Active chart instances
};

// --- Initialization ---

export async function init() {
    console.log('[dd2] Initializing Dota 2 Turbo Analyzer...');

    // CRITICAL: Set up event listeners IMMEDIATELY before any async work.
    // Otherwise the form submit won't be intercepted if the user clicks
    // search before the hero map loads.
    setupEventListeners();

    // Also prevent default form submission via inline handler as fallback
    const form = document.getElementById('search-form');
    if (form) {
        form.onsubmit = (e) => e.preventDefault();
    }

    // Initial rate limit display
    updateRateLimitDisplay();

    // Load hero map (from cache or API) — can happen in background
    try {
        state.heroMap = await loadHeroMap();
        console.log(`[dd2] Hero map loaded: ${state.heroMap.size} heroes`);
    } catch (err) {
        console.warn('[dd2] Failed to load hero map, will retry on search:', err.message);
        state.heroMap = new Map();
    }

    // Check URL hash for saved player ID (now that hero map is loaded)
    checkUrlHash();
}

// --- Hero Map Loading ---

async function loadHeroMap() {
    const heroes = await getHeroes();
    const map = new Map();
    for (const hero of heroes) {
        map.set(hero.id, {
            name: hero.name.replace('npc_dota_hero_', ''),
            localized_name: hero.localized_name,
            img: hero.img,
            icon: hero.icon,
            primary_attr: hero.primary_attr,
            attack_type: hero.attack_type,
        });
    }
    // Enrich with Chinese names
    return enrichHeroMapWithChinese(map);
}

// --- Event Listeners ---

function setupEventListeners() {
    const form = document.getElementById('search-form');
    const input = document.getElementById('search-input');

    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            handleSearch();
        });
    }

    if (input) {
        input.addEventListener('input', () => {
            clearInputError('search-input');
        });
        // Auto-focus on load
        input.focus();
    }

    // Window resize → redraw charts
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            for (const chart of Object.values(state.charts)) {
                if (chart && chart.resize) {
                    chart.resize();
                }
            }
        }, 200);
    });

    // Hash change → search new player
    window.addEventListener('hashchange', () => {
        const id = getIdFromHash();
        if (id && id !== state.currentPlayerId) {
            const input = document.getElementById('search-input');
            if (input) input.value = id;
            handleSearch();
        }
    });
}

// --- Search Handling ---

async function handleSearch() {
    const input = document.getElementById('search-input');
    if (!input) return;

    const rawValue = input.value.trim();
    clearInputError('search-input');

    // Validate
    if (!rawValue) {
        showInputError('search-input', '请输入 Steam32 ID');
        return;
    }

    if (!VALIDATION.PATTERN.test(rawValue)) {
        showInputError('search-input', 'Steam ID 只能包含数字');
        return;
    }

    let accountId = rawValue;

    // Convert Steam64 to Steam32 if needed
    if (rawValue.length >= 16 && rawValue.startsWith('7656119')) {
        try {
            const steam64 = BigInt(rawValue);
            accountId = String(steam64 - STEAM_ID_OFFSET);
        } catch {
            showInputError('search-input', '无效的 Steam ID');
            return;
        }
    }

    if (accountId.length < VALIDATION.MIN_ID_LENGTH) {
        showInputError('search-input', `Steam32 ID 至少需要 ${VALIDATION.MIN_ID_LENGTH} 位数字`);
        return;
    }

    // If same player, do nothing (user can refresh manually)
    if (state.isLoading) {
        return; // Already loading
    }

    await loadDashboard(accountId);
}

// --- Dashboard Loading ---

async function loadDashboard(accountId) {
    // Cancel any in-flight requests
    cancelAll();

    // Reset state
    state.currentPlayerId = accountId;
    state.isLoading = true;
    state.turboStats = null;
    state.turboMatches = [];

    // Destroy existing charts
    for (const [key, chart] of Object.entries(state.charts)) {
        destroyChart(chart);
        delete state.charts[key];
    }

    // Clear previous dashboard data and show loading
    clearDashboard();
    const dashboard = document.getElementById('dashboard');
    if (dashboard) {
        dashboard.classList.add('loaded');
    }
    // Show loading in summary section (keeps section divs intact so
    // renderFullDashboard can find them by ID later)
    showLoading('summary-section', `正在加载 ${accountId} 的数据...`);
    // Also show loading in other sections
    showLoading('profile-section', '');
    showLoading('matches-section', '');

    // Update URL hash
    window.location.hash = `#player-${accountId}`;

    // Show loading in sections (they'll be created after data loads)
    updateRateLimitDisplay();

    try {
        // Step 1: Fetch player profile + counts in parallel
        console.log(`[dd2] Loading data for player ${accountId}...`);

        let profile, counts;
        try {
            [profile, counts] = await Promise.all([
                getPlayer(accountId),
                getCounts(accountId),
            ]);
        } catch (err) {
            if (err instanceof PlayerNotFoundError) {
                showPlayerNotFound('dashboard');
                updateRateLimitDisplay();
                return;
            }
            throw err;
        }

        state.profile = profile;
        state.counts = counts;
        updateRateLimitDisplay();

        // Step 2: Detect Turbo modes
        const turboModes = detectTurboModes(counts);
        console.log(`[dd2] Detected Turbo modes: [${turboModes.join(', ')}]`);

        if (turboModes.length === 0) {
            // No turbo games at all
            showNoTurboData('dashboard', counts);
            updateRateLimitDisplay();
            return;
        }

        // Step 3: Load Turbo stats and recent matches in parallel
        const [turboStats, recentMatches] = await Promise.all([
            fetchTurboStats(accountId, turboModes),
            getRecentMatches(accountId),
        ]);

        updateRateLimitDisplay();

        // Step 4: Filter recent matches to Turbo only (client-side)
        const turboMatches = (recentMatches || [])
            .filter(m => TURBO_MODES.includes(m.game_mode))
            .sort((a, b) => b.start_time - a.start_time) // most recent first
            .slice(0, MAX_DISPLAY_MATCHES);

        state.turboMatches = turboMatches;
        console.log(`[dd2] Loaded ${turboMatches.length} turbo matches`);

        // Step 5: Compute derived statistics
        const computedStats = computeTurboStats(turboStats, turboMatches);

        // Ensure hero list is populated from recent matches if hero stats are empty
        if (computedStats.heroes.length === 0 && turboMatches.length > 0) {
            computedStats.heroes = deriveHeroStatsFromMatches(turboMatches);
        }

        state.turboStats = computedStats;

        // Step 6: Render dashboard
        renderFullDashboard(profile, computedStats, state.heroMap, turboMatches);

        // Step 7: Render chart canvases and create charts
        renderChartCanvases();
        createCharts(computedStats, turboMatches);

        updateRateLimitDisplay();
        console.log(`[dd2] Dashboard loaded successfully`);

    } catch (err) {
        console.error('[dd2] Dashboard load failed:', err);

        if (err instanceof NetworkError) {
            showNetworkError('dashboard', err.message, () => loadDashboard(accountId));
        } else if (err instanceof RateLimitError) {
            showDashboardError('dashboard',
                'API 请求配额已用尽，请稍后重试（免费版每分钟约 60 次请求）',
                () => loadDashboard(accountId)
            );
        } else {
            showDashboardError('dashboard',
                `加载失败: ${err.message}`,
                () => loadDashboard(accountId)
            );
        }
        updateRateLimitDisplay();
    } finally {
        state.isLoading = false;
    }
}

// --- Statistics Computation ---

function computeTurboStats(turboStats, matches) {
    const { wl, heroes, totals } = turboStats;

    const wins = wl.win || 0;
    const losses = wl.lose || 0;
    const totalGames = wins + losses;
    const winRate = totalGames > 0 ? (wins / totalGames * 100) : 0;

    // Compute averages from totals
    const gameCount = totals.field_count || totalGames || 1;
    const avgKills = (totals.kills || 0) / gameCount;
    const avgDeaths = (totals.deaths || 0) / gameCount;
    const avgAssists = (totals.assists || 0) / gameCount;
    const avgGpm = (totals.gold_per_min || 0) / gameCount;
    const avgXpm = (totals.xp_per_min || 0) / gameCount;

    // Compute longest win streak from matches
    const maxStreak = calculateMaxWinStreak(matches);

    return {
        totalGames,
        wins,
        losses,
        winRate,
        avgKills,
        avgDeaths,
        avgAssists,
        avgGpm,
        avgXpm,
        maxStreak,
        heroes: heroes || [],
        totals,
    };
}

/**
 * Calculate the longest consecutive win streak from matches (sorted by time).
 */
function calculateMaxWinStreak(matches) {
    if (!matches || matches.length === 0) return 0;

    // Sort chronologically
    const sorted = [...matches].sort((a, b) => a.start_time - b.start_time);

    let maxStreak = 0;
    let currentStreak = 0;

    for (const match of sorted) {
        const isWin = (match.player_slot < 128) === match.radiant_win;
        if (isWin) {
            currentStreak++;
            if (currentStreak > maxStreak) {
                maxStreak = currentStreak;
            }
        } else {
            currentStreak = 0;
        }
    }

    return maxStreak;
}

/**
 * Derive basic hero stats from recent matches when /heroes endpoint returns empty.
 */
function deriveHeroStatsFromMatches(matches) {
    const heroMap = new Map();
    for (const match of matches) {
        const hid = match.hero_id;
        if (!heroMap.has(hid)) {
            heroMap.set(hid, {
                hero_id: hid,
                games: 0,
                win: 0,
                kills: 0,
                deaths: 0,
                assists: 0,
                gold_per_min: 0,
                xp_per_min: 0,
                hero_damage: 0,
                tower_damage: 0,
                last_hits: 0,
            });
        }
        const hero = heroMap.get(hid);
        hero.games++;
        const isWin = (match.player_slot < 128) === match.radiant_win;
        if (isWin) hero.win++;
        hero.kills += match.kills || 0;
        hero.deaths += match.deaths || 0;
        hero.assists += match.assists || 0;
        hero.gold_per_min += match.gold_per_min || 0;
        hero.xp_per_min += match.xp_per_min || 0;
        hero.hero_damage += match.hero_damage || 0;
        hero.tower_damage += match.tower_damage || 0;
        hero.last_hits += match.last_hits || 0;
    }
    return Array.from(heroMap.values()).sort((a, b) => b.games - a.games);
}

// --- Chart Creation ---

function createCharts(stats, matches) {
    // Win rate trend chart
    const trendCanvas = document.getElementById('winrate-trend-chart');
    if (trendCanvas && matches.length > 0) {
        const trendChart = createWinRateTrend(trendCanvas, matches);
        if (trendChart) {
            state.charts.winRateTrend = trendChart;
        }
    } else if (trendCanvas) {
        const parent = trendCanvas.parentElement;
        if (parent) {
            parent.innerHTML = '<div class="state-empty" style="padding:40px"><p class="state-text">数据不足，无法生成趋势图</p></div>';
        }
    }

    // Hero performance chart
    const heroCanvas = document.getElementById('hero-perf-chart');
    if (heroCanvas && stats.heroes.length > 0) {
        const heroChart = createHeroPerformanceChart(heroCanvas, stats.heroes, state.heroMap);
        if (heroChart) {
            state.charts.heroPerformance = heroChart;
        }
    } else if (heroCanvas) {
        const parent = heroCanvas.parentElement;
        if (parent) {
            parent.innerHTML = '<div class="state-empty" style="padding:40px"><p class="state-text">暂无英雄数据</p></div>';
        }
    }
}

// --- URL Hash Support ---

function checkUrlHash() {
    const id = getIdFromHash();
    if (id) {
        const input = document.getElementById('search-input');
        if (input) input.value = id;
        // Auto-search on page load if hash present
        setTimeout(() => handleSearch(), 500);
    }
}

function getIdFromHash() {
    const match = window.location.hash.match(/^#player-(\d+)$/);
    return match ? match[1] : null;
}

// --- Rate Limit Display ---

function updateRateLimitDisplay() {
    const status = getRateLimitStatus();
    renderRateLimitIndicator('rate-limit-indicator', status);
}

// Set up periodic rate limit update
setInterval(updateRateLimitDisplay, 10000);
