// ============================================================
// app.js — Main Controller for "睡了么" (SleepWell)
// ============================================================

import { VALIDATION, STEAM_ID_OFFSET, TURBO_MODES } from './config.js';
import { STORAGE_KEYS, CACHE_VERSION } from './config.js';
import { clearAll } from './storage.js';
import { enrichHeroMapWithChinese } from './heroNames.js';
import { evaluateSleep, getSleepMessage, getCurrentSessionAdvice } from './sleep.js';
import {
    getHeroes,
    getPlayer,
    getRecentMatches,
    getRateLimitStatus,
    cancelAll,
    PlayerNotFoundError,
    RateLimitError,
    NetworkError,
} from './api.js';
import {
    showLoading,
    renderPlayerProfile,
    renderTurboSummary,
    renderHeroTable,
    renderRecentMatches,
    renderRateLimitIndicator,
    renderFullDashboard,
    renderChartCanvases,
    clearDashboard,
    showPlayerNotFound,
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
    currentViewId: null,
    isEnemy: false,
    isLoading: false,
    heroMap: null,
    profile: null,
    turboMatches: [],       // Recent Turbo matches (game_mode 22/23)
    allRecentMatches: [],   // All recent matches (for sleep eval)
    sleepEval: null,
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

    setupEventListeners();
    loadPlayerList();
    updateRateLimitDisplay();

    renderPlayerList('player-list', state.playerList, getListCallbacks());

    try {
        state.heroMap = await loadHeroMap();
        console.log(`[睡了么] Hero map loaded: ${state.heroMap.size} heroes`);
    } catch (err) {
        console.warn('[睡了么] Failed to load hero map:', err.message);
        state.heroMap = new Map();
    }

    if (state.playerList.myId) {
        const input = document.getElementById('search-input');
        if (input) input.value = state.playerList.myId;
        await loadDashboard(state.playerList.myId, false);
    }

    checkUrlHash();
}

// --- Player List Management ---
function loadPlayerList() {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.PLAYER_LIST);
        if (raw) {
            const data = JSON.parse(raw);
            state.playerList.myId = data.myId || null;
            state.playerList.enemyIds = (data.enemyIds || []).map(e => {
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
        form.addEventListener('submit', (e) => { e.preventDefault(); handleSearch(); });
    }
    if (input) {
        input.addEventListener('input', () => clearInputError('search-input'));
        input.focus();
    }

    setupSidebarToggle();

    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            for (const chart of Object.values(state.charts)) {
                if (chart?.resize) chart.resize();
            }
        }, 200);
    });

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

    function close() { sidebar.classList.remove('open'); overlay.classList.remove('open'); }
    toggle.addEventListener('click', () => { sidebar.classList.contains('open') ? close() : (sidebar.classList.add('open'), overlay.classList.add('open')); });
    overlay.addEventListener('click', close);
    window.addEventListener('resize', () => { if (window.innerWidth > 1024) close(); });
}

// --- Search ---
async function handleSearch() {
    const input = document.getElementById('search-input');
    if (!input) return;
    const rawValue = input.value.trim();
    clearInputError('search-input');

    if (!rawValue) { showInputError('search-input', '请输入 Steam32 ID'); return; }
    if (!VALIDATION.PATTERN.test(rawValue)) { showInputError('search-input', 'Steam ID 只能包含数字'); return; }

    let accountId = rawValue;
    if (rawValue.length >= 16 && rawValue.startsWith('7656119')) {
        try { accountId = String(BigInt(rawValue) - STEAM_ID_OFFSET); }
        catch { showInputError('search-input', '无效的 Steam ID'); return; }
    }
    if (state.isLoading) return;

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
    state.turboMatches = [];
    state.allRecentMatches = [];
    state.sleepEval = null;

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
    renderPlayerList('player-list', state.playerList, getListCallbacks());

    try {
        console.log(`[睡了么] Loading data for ${accountId} (enemy=${isEnemy})`);

        // Step 1: Fetch profile + recent matches
        let profile, recentMatches;
        try {
            [profile, recentMatches] = await Promise.all([
                getPlayer(accountId),
                getRecentMatches(accountId),
            ]);
        } catch (err) {
            if (err instanceof PlayerNotFoundError) {
                showPlayerNotFound('dashboard');
                return;
            }
            throw err;
        }
        state.profile = profile;
        state.allRecentMatches = recentMatches || [];
        updateRateLimitDisplay();

        // Step 2: Filter to Turbo matches only
        const turboMatches = (recentMatches || [])
            .filter(m => TURBO_MODES.includes(m.game_mode))
            .sort((a, b) => b.start_time - a.start_time);
        state.turboMatches = turboMatches;
        console.log(`[睡了么] Turbo matches: ${turboMatches.length}/${recentMatches.length}`);

        if (turboMatches.length === 0) {
            showDashboardError('dashboard', '该玩家近期没有加速模式比赛记录', () => loadDashboard(accountId, isEnemy));
            return;
        }

        // Step 3: Compute all stats from matches
        const computedStats = computeStatsFromMatches(turboMatches);

        // Step 4: Sleep evaluation
        state.sleepEval = evaluateSleep(state.allRecentMatches, state.heroMap);

        // Step 5: Render dashboard
        renderFullDashboard(profile, computedStats, state.heroMap, turboMatches);

        // Sleep card
        const sessionAdvice = getCurrentSessionAdvice(state.allRecentMatches, state.heroMap);
        if (sessionAdvice) {
            renderSessionAdvice('session-advice-section', sessionAdvice, isEnemy);
        }
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
            showDashboardError('dashboard', 'API 请求配额已用尽，请稍后重试', () => loadDashboard(accountId, isEnemy));
        } else {
            showDashboardError('dashboard', `加载失败: ${err.message}`, () => loadDashboard(accountId, isEnemy));
        }
        updateRateLimitDisplay();
    } finally {
        state.isLoading = false;
    }
}

// --- Stats Computation (from matches only) ---
function computeStatsFromMatches(matches) {
    let sumK = 0, sumD = 0, sumA = 0, sumGpm = 0, sumXpm = 0;
    let wins = 0, losses = 0;

    const heroMap = new Map();

    for (const m of matches) {
        // Win/Loss
        const isWin = (m.player_slot < 128) === m.radiant_win;
        if (isWin) wins++; else losses++;

        // Summary averages
        sumK += m.kills || 0;
        sumD += m.deaths || 0;
        sumA += m.assists || 0;
        sumGpm += m.gold_per_min || 0;
        sumXpm += m.xp_per_min || 0;

        // Per-hero stats
        const hid = m.hero_id;
        if (!heroMap.has(hid)) {
            heroMap.set(hid, { hero_id: hid, games: 0, win: 0, kills: 0, deaths: 0, assists: 0, gold_per_min: 0, xp_per_min: 0, hero_damage: 0, tower_damage: 0, last_hits: 0 });
        }
        const h = heroMap.get(hid);
        h.games++;
        if (isWin) h.win++;
        h.kills += m.kills || 0;
        h.deaths += m.deaths || 0;
        h.assists += m.assists || 0;
        h.gold_per_min += m.gold_per_min || 0;
        h.xp_per_min += m.xp_per_min || 0;
        h.hero_damage += m.hero_damage || 0;
        h.tower_damage += m.tower_damage || 0;
        h.last_hits += m.last_hits || 0;
    }

    const total = matches.length;
    const heroes = Array.from(heroMap.values()).sort((a, b) => b.games - a.games);

    return {
        totalGames: total,
        wins,
        losses,
        winRate: total > 0 ? (wins / total * 100) : 0,
        avgKills: total > 0 ? sumK / total : 0,
        avgDeaths: total > 0 ? sumD / total : 0,
        avgAssists: total > 0 ? sumA / total : 0,
        avgGpm: total > 0 ? sumGpm / total : 0,
        avgXpm: total > 0 ? sumXpm / total : 0,
        maxStreak: calculateMaxWinStreak(matches),
        heroes,
    };
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

// --- Charts ---
function createCharts(stats, matches) {
    const trendCanvas = document.getElementById('winrate-trend-chart');
    if (trendCanvas && matches.length > 0) {
        const chart = createWinRateTrend(trendCanvas, matches);
        if (chart) state.charts.winRateTrend = chart;
    }
    const heroCanvas = document.getElementById('hero-perf-chart');
    if (heroCanvas && stats.heroes.length > 0) {
        const chart = createHeroPerformanceChart(heroCanvas, stats.heroes, state.heroMap);
        if (chart) state.charts.heroPerformance = chart;
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
