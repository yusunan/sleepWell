// ============================================================
// app.js — Main Controller for "睡了么" (SleepWell)
// ============================================================

import { VALIDATION, STEAM_ID_OFFSET, TURBO_MODES, MAX_DISPLAY_MATCHES, CACHE_VERSION } from './config.js';
import { STORAGE_KEYS } from './config.js';
import { set as cacheSet, get as cacheGet } from './storage.js';
import { clearAll } from './storage.js';
import { enrichHeroMapWithChinese } from './heroNames.js';
import { evaluateSleep, getSleepMessage, getSleepEmoji, getSleepColor, getSleepLabel, getCurrentSessionAdvice } from './sleep.js';
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
} from './api.js';
import {
    showLoading,
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
    renderPlayerList,
    renderSleepCard,
    renderSessionAdvice,
    setEnemyHighlight,
} from './ui.js';
import {
    createWinRateTrend,
    createHeroPerformanceChart,
    destroyChart,
} from './charts.js';

// --- App State ---
const state = {
    currentViewId: null,     // Currently displayed player
    isEnemy: false,          // Is current view an enemy?
    isLoading: false,
    heroMap: null,
    profile: null,
    counts: null,
    turboStats: null,
    turboMatches: [],
    allRecentMatches: [],    // Unfiltered recent matches (for sleep eval)
    sleepEval: null,         // Sleep evaluation result
    charts: {},
    playerList: { myId: null, enemyIds: [] },
};

// --- Init ---
export async function init() {
    console.log('[睡了么] Initializing...');

    // Clear stale cache if version bumped
    const cachedVersion = localStorage.getItem(STORAGE_KEYS.CACHE_VERSION);
    if (cachedVersion !== String(CACHE_VERSION)) {
        console.log(`[睡了么] Cache version changed (${cachedVersion} → ${CACHE_VERSION}), clearing...`);
        clearAll();
        localStorage.setItem(STORAGE_KEYS.CACHE_VERSION, String(CACHE_VERSION));
    }

    // Setup event listeners immediately
    setupEventListeners();

    // Load player list from localStorage
    loadPlayerList();

    // Render player list UI
    renderPlayerList('player-list', state.playerList, {
        onSelectMy: () => switchToMyPlayer(),
        onSelectEnemy: (id) => switchToEnemy(id),
        onSetMy: (id) => setMyId(id),
        onAddEnemy: (id, note) => addEnemyId(id, note),
        onRemoveEnemy: (id) => removeEnemyId(id),
        onRefresh: () => refreshCurrentPlayer(),
    });

    // Load hero map
    try {
        state.heroMap = await loadHeroMap();
        console.log(`[睡了么] Hero map loaded: ${state.heroMap.size} heroes`);
    } catch (err) {
        console.warn('[睡了么] Failed to load hero map:', err.message);
        state.heroMap = new Map();
    }

    updateRateLimitDisplay();

    // Auto-load my player if set
    if (state.playerList.myId) {
        const input = document.getElementById('search-input');
        if (input) input.value = state.playerList.myId;
        await loadDashboard(state.playerList.myId, false);
    }

    checkUrlHash();
}

// --- Player List Management ---
// Data format: { myId: string, enemyIds: [{id: string, note: string}] }
// Legacy format: { myId: string, enemyIds: string[] } — auto-migrated on load.

function loadPlayerList() {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.PLAYER_LIST);
        if (raw) {
            const data = JSON.parse(raw);
            state.playerList.myId = data.myId || null;
            state.playerList.enemyIds = (data.enemyIds || []).map(e => {
                // Migrate legacy string format → object format
                if (typeof e === 'string') return { id: e, note: '' };
                return e;
            });
        }
    } catch {
        state.playerList = { myId: null, enemyIds: [] };
    }
}

function savePlayerList() {
    try {
        localStorage.setItem(STORAGE_KEYS.PLAYER_LIST, JSON.stringify(state.playerList));
    } catch { /* ignore */ }
}

function setMyId(id) {
    state.playerList.myId = String(id);
    // Remove from enemies if present
    state.playerList.enemyIds = state.playerList.enemyIds.filter(e => e.id !== String(id));
    savePlayerList();
    renderPlayerList('player-list', state.playerList, getListCallbacks());
    switchToMyPlayer();
}

function addEnemyId(id, note) {
    const sid = String(id);
    if (sid === state.playerList.myId) return;
    if (state.playerList.enemyIds.find(e => e.id === sid)) return;
    state.playerList.enemyIds.push({ id: sid, note: (note || '').trim() });
    savePlayerList();
    renderPlayerList('player-list', state.playerList, getListCallbacks());
}

function removeEnemyId(id) {
    state.playerList.enemyIds = state.playerList.enemyIds.filter(e => e.id !== String(id));
    savePlayerList();
    renderPlayerList('player-list', state.playerList, getListCallbacks());
    if (state.isEnemy && state.currentViewId === String(id)) {
        switchToMyPlayer();
    }
}

function getListCallbacks() {
    return {
        onSelectMy: () => switchToMyPlayer(),
        onSelectEnemy: (id) => switchToEnemy(id),
        onSetMy: (id) => setMyId(id),
        onAddEnemy: (id, note) => addEnemyId(id, note),
        onRemoveEnemy: (id) => removeEnemyId(id),
        onRefresh: () => refreshCurrentPlayer(),
    };
}

function switchToMyPlayer() {
    if (!state.playerList.myId) return;
    state.isEnemy = false;
    document.getElementById('search-input').value = state.playerList.myId;
    loadDashboard(state.playerList.myId, false);
}

function switchToEnemy(id) {
    state.isEnemy = true;
    document.getElementById('search-input').value = id;
    loadDashboard(String(id), true);
}

function refreshCurrentPlayer() {
    if (state.currentViewId) {
        loadDashboard(state.currentViewId, state.isEnemy);
    } else if (state.playerList.myId) {
        loadDashboard(state.playerList.myId, false);
    }
}

// --- Hero Map ---
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
    return enrichHeroMapWithChinese(map);
}

// --- Event Listeners ---
function setupEventListeners() {
    const form = document.getElementById('search-form');
    const input = document.getElementById('search-input');

    if (form) {
        form.onsubmit = (e) => e.preventDefault();
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            handleSearch();
        });
    }

    if (input) {
        input.addEventListener('input', () => clearInputError('search-input'));
        input.focus();
    }

    // Sidebar toggle for mobile
    setupSidebarToggle();

    // Window resize → redraw charts
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            for (const chart of Object.values(state.charts)) {
                if (chart?.resize) chart.resize();
            }
        }, 200);
    });

    // Hash change
    window.addEventListener('hashchange', () => {
        const id = getIdFromHash();
        if (id && id !== state.currentViewId) {
            document.getElementById('search-input').value = id;
            handleSearch();
        }
    });
}

function setupSidebarToggle() {
    const toggle = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    if (!toggle || !sidebar || !overlay) return;

    function open() {
        sidebar.classList.add('open');
        overlay.classList.add('open');
    }
    function close() {
        sidebar.classList.remove('open');
        overlay.classList.remove('open');
    }

    toggle.addEventListener('click', () => {
        sidebar.classList.contains('open') ? close() : open();
    });

    overlay.addEventListener('click', close);

    // Close sidebar on window resize to desktop
    window.addEventListener('resize', () => {
        if (window.innerWidth > 1024) close();
    });
}

// --- Search ---
async function handleSearch() {
    const input = document.getElementById('search-input');
    if (!input) return;
    const rawValue = input.value.trim();
    clearInputError('search-input');

    if (!rawValue) {
        showInputError('search-input', '请输入 Steam32 ID');
        return;
    }
    if (!VALIDATION.PATTERN.test(rawValue)) {
        showInputError('search-input', 'Steam ID 只能包含数字');
        return;
    }

    let accountId = rawValue;
    if (rawValue.length >= 16 && rawValue.startsWith('7656119')) {
        try {
            accountId = String(BigInt(rawValue) - STEAM_ID_OFFSET);
        } catch {
            showInputError('search-input', '无效的 Steam ID');
            return;
        }
    }

    if (state.isLoading) return;

    // Check if this is an enemy
    const isEnemy = state.playerList.enemyIds.some(e => e.id === String(accountId));
    state.isEnemy = isEnemy;

    await loadDashboard(accountId, isEnemy);
}

// --- Dashboard Loading ---
async function loadDashboard(accountId, isEnemy) {
    cancelAll();
    state.currentViewId = accountId;
    state.isEnemy = isEnemy;
    state.isLoading = true;
    state.turboStats = null;
    state.turboMatches = [];
    state.allRecentMatches = [];
    state.sleepEval = null;

    // Destroy charts
    for (const [key, chart] of Object.entries(state.charts)) {
        destroyChart(chart);
        delete state.charts[key];
    }

    clearDashboard();
    setEnemyHighlight(isEnemy);

    const dashboard = document.getElementById('dashboard');
    if (dashboard) dashboard.classList.add('loaded');

    showLoading('summary-section', `正在加载 ${accountId} 的数据...`);
    showLoading('profile-section', '');
    showLoading('sleep-section', '');
    showLoading('matches-section', '');

    window.location.hash = `#player-${accountId}`;
    updateRateLimitDisplay();

    // Update player list to reflect current view
    renderPlayerList('player-list', state.playerList, getListCallbacks());

    try {
        console.log(`[睡了么] Loading data for ${accountId} (enemy=${isEnemy})`);

        // Step 1: Profile + counts
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

        // Step 2: Turbo modes
        const turboModes = detectTurboModes(counts);
        console.log(`[睡了么] Turbo modes: [${turboModes.join(', ')}]`);

        if (turboModes.length === 0) {
            showNoTurboData('dashboard', counts);
            updateRateLimitDisplay();
            return;
        }

        // Step 3: Turbo stats + recent matches
        const [turboStats, recentMatches] = await Promise.all([
            fetchTurboStats(accountId, turboModes),
            getRecentMatches(accountId),
        ]);

        updateRateLimitDisplay();

        state.allRecentMatches = recentMatches || [];

        // Step 4: Filter turbo matches
        const turboMatches = (recentMatches || [])
            .filter(m => TURBO_MODES.includes(m.game_mode))
            .sort((a, b) => b.start_time - a.start_time)
            .slice(0, MAX_DISPLAY_MATCHES);
        state.turboMatches = turboMatches;

        // Step 5: Compute turbo stats
        const computedStats = computeTurboStats(turboStats, turboMatches);

        // The /heroes API only returns game counts and wins — no KDA/GPM/XPM.
        // Replace with match-derived stats so all columns show consistent data.
        // (API game counts are still available in the hero table as "场次" if needed.)
        const derivedHeroes = deriveHeroStatsFromMatches(turboMatches);
        if (derivedHeroes.length > 0) {
            computedStats.heroes = derivedHeroes;
        }
        state.turboStats = computedStats;

        // Step 6: Sleep evaluation (uses all recent matches, not just turbo)
        state.sleepEval = evaluateSleep(state.allRecentMatches, state.heroMap);

        // Step 7: Render
        renderFullDashboard(profile, computedStats, state.heroMap, turboMatches);

        // Current session advice (real-time, only during 20:00-02:00)
        const sessionAdvice = getCurrentSessionAdvice(state.allRecentMatches, state.heroMap);
        if (sessionAdvice) {
            renderSessionAdvice('session-advice-section', sessionAdvice, isEnemy);
        } else {
            const el = document.getElementById('session-advice-section');
            if (el) el.innerHTML = '';
        }

        // Sleep card
        if (state.sleepEval) {
            const sleepMsg = getSleepMessage(state.sleepEval, isEnemy, state.heroMap);
            renderSleepCard('sleep-section', state.sleepEval, sleepMsg, isEnemy);
        }

        // Charts
        renderChartCanvases();
        createCharts(computedStats, turboMatches);

        updateRateLimitDisplay();
        console.log(`[睡了么] Dashboard loaded. Sleep score: ${state.sleepEval?.score}`);

    } catch (err) {
        console.error('[睡了么] Load failed:', err);
        if (err instanceof NetworkError) {
            showNetworkError('dashboard', err.message, () => loadDashboard(accountId, isEnemy));
        } else if (err instanceof RateLimitError) {
            showDashboardError('dashboard',
                'API 请求配额已用尽，请稍后重试',
                () => loadDashboard(accountId, isEnemy)
            );
        } else {
            showDashboardError('dashboard', `加载失败: ${err.message}`, () => loadDashboard(accountId, isEnemy));
        }
        updateRateLimitDisplay();
    } finally {
        state.isLoading = false;
    }
}

// --- Stats Computation ---
function computeTurboStats(turboStats, matches) {
    const { wl, heroes, totals } = turboStats;
    const wins = wl.win || 0;
    const losses = wl.lose || 0;
    const totalGames = wins + losses;
    const winRate = totalGames > 0 ? (wins / totalGames * 100) : 0;

    // Totals is { field: { n, sum } } — compute per-game averages
    function avg(field) {
        const d = totals[field];
        if (!d || !d.n) return 0;
        return d.sum / d.n;
    }
    let avgKills = avg('kills');
    let avgDeaths = avg('deaths');
    let avgAssists = avg('assists');
    let avgGpm = avg('gold_per_min');
    let avgXpm = avg('xp_per_min');

    // Fallback: if totals are missing (API /totals failed or returned empty),
    // compute averages from recent matches
    if (avgGpm === 0 && avgXpm === 0 && matches.length > 0) {
        let sumK = 0, sumD = 0, sumA = 0, sumGpm = 0, sumXpm = 0;
        for (const m of matches) {
            sumK += m.kills || 0;
            sumD += m.deaths || 0;
            sumA += m.assists || 0;
            sumGpm += m.gold_per_min || 0;
            sumXpm += m.xp_per_min || 0;
        }
        avgKills = sumK / matches.length;
        avgDeaths = sumD / matches.length;
        avgAssists = sumA / matches.length;
        avgGpm = sumGpm / matches.length;
        avgXpm = sumXpm / matches.length;
    }

    const maxStreak = calculateMaxWinStreak(matches);
    return { totalGames, wins, losses, winRate, avgKills, avgDeaths, avgAssists, avgGpm, avgXpm, maxStreak, heroes: heroes || [], totals };
}

function calculateMaxWinStreak(matches) {
    if (!matches?.length) return 0;
    const sorted = [...matches].sort((a, b) => a.start_time - b.start_time);
    let max = 0, cur = 0;
    for (const m of sorted) {
        if ((m.player_slot < 128) === m.radiant_win) { cur++; max = Math.max(max, cur); }
        else { cur = 0; }
    }
    return max;
}

function deriveHeroStatsFromMatches(matches) {
    const map = new Map();
    for (const m of matches) {
        const hid = m.hero_id;
        if (!map.has(hid)) map.set(hid, { hero_id: hid, games: 0, win: 0, kills: 0, deaths: 0, assists: 0, gold_per_min: 0, xp_per_min: 0, hero_damage: 0, tower_damage: 0, last_hits: 0 });
        const h = map.get(hid);
        h.games++;
        if ((m.player_slot < 128) === m.radiant_win) h.win++;
        h.kills += m.kills || 0;
        h.deaths += m.deaths || 0;
        h.assists += m.assists || 0;
        h.gold_per_min += m.gold_per_min || 0;
        h.xp_per_min += m.xp_per_min || 0;
        h.hero_damage += m.hero_damage || 0;
        h.tower_damage += m.tower_damage || 0;
        h.last_hits += m.last_hits || 0;
    }
    return Array.from(map.values()).sort((a, b) => b.games - a.games);
}

// --- Charts ---
function createCharts(stats, matches) {
    const trendCanvas = document.getElementById('winrate-trend-chart');
    if (trendCanvas && matches.length > 0) {
        const chart = createWinRateTrend(trendCanvas, matches);
        if (chart) state.charts.winRateTrend = chart;
    } else if (trendCanvas) {
        trendCanvas.parentElement.innerHTML = '<div class="state-empty" style="padding:40px"><p class="state-text">数据不足</p></div>';
    }

    const heroCanvas = document.getElementById('hero-perf-chart');
    if (heroCanvas && stats.heroes.length > 0) {
        const chart = createHeroPerformanceChart(heroCanvas, stats.heroes, state.heroMap);
        if (chart) state.charts.heroPerformance = chart;
    } else if (heroCanvas) {
        heroCanvas.parentElement.innerHTML = '<div class="state-empty" style="padding:40px"><p class="state-text">暂无英雄数据</p></div>';
    }
}

// --- URL Hash ---
function checkUrlHash() {
    const id = getIdFromHash();
    if (id && id !== state.currentViewId && !state.isLoading) {
        document.getElementById('search-input').value = id;
        setTimeout(() => handleSearch(), 500);
    }
}
function getIdFromHash() {
    const match = window.location.hash.match(/^#player-(\d+)$/);
    return match ? match[1] : null;
}

// --- Rate Limit ---
function updateRateLimitDisplay() {
    renderRateLimitIndicator('rate-limit-indicator', getRateLimitStatus());
}
setInterval(updateRateLimitDisplay, 10000);
