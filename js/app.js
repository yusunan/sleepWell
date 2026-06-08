// ============================================================
// app.js — Main Controller for "睡了么" (SleepWell)
// ============================================================

import { VALIDATION, STEAM_ID_OFFSET, TURBO_MODES } from './config.js';
import { STORAGE_KEYS, CACHE_VERSION } from './config.js';
import { clearAll, get as cacheGet, set as cacheSet } from './storage.js';
import { enrichHeroMapWithChinese } from './heroNames.js';
import { evaluateSleep, getSleepMessage, getCurrentSessionAdvice, isPlayerInactive } from './sleep.js';
import {
    getHeroes,
    getPlayer,
    getRecentMatches,
    getTurboCounts,
    fetchTurboStats,
    getPeers,
    getPlayerPros,
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
    renderPeersTable,
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
    renderTeammateInactiveCard,
    renderPatchSelector,
    setEnemyHighlight,
    setTeammateHighlight,
    closeModal,
    showModalLoading,
    renderProsModal,
    showModalAlert,
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
    isTeammate: false,
    isLoading: false,
    heroMap: null,
    profile: null,
    turboCounts: null,       // From /counts?game_mode=23&significant=0
    turboStats: null,        // { wl, heroes, totals } from fetchTurboStats
    turboMatches: [],        // Recent Turbo matches
    allRecentMatches: [],    // All recent matches (for sleep eval)
    sleepEval: null,
    charts: {},
    playerList: { myId: null, enemyIds: [], teammateIds: [] },
    selectedPatch: null,
    availablePatches: [],
};

// --- Init ---
export async function init() {
    console.log('[睡了么] Initializing...');

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
            state.playerList.enemyIds = (data.enemyIds || []).map(e => typeof e === 'string' ? { id: e, note: '' } : e);
            state.playerList.teammateIds = (data.teammateIds || []).map(e => typeof e === 'string' ? { id: e, note: '' } : e);
        }
    } catch { state.playerList = { myId: null, enemyIds: [], teammateIds: [] }; }
}
function savePlayerList() {
    try { localStorage.setItem(STORAGE_KEYS.PLAYER_LIST, JSON.stringify(state.playerList)); } catch {}
}
function setMyId(id) {
    state.playerList.myId = String(id);
    state.playerList.enemyIds = state.playerList.enemyIds.filter(e => e.id !== String(id));
    state.playerList.teammateIds = state.playerList.teammateIds.filter(e => e.id !== String(id));
    savePlayerList(); renderPlayerList('player-list', state.playerList, getListCallbacks()); switchToMyPlayer();
}
function addEnemyId(id, note) {
    const sid = String(id); if (sid === state.playerList.myId) return;
    if (state.playerList.enemyIds.find(e => e.id === sid)) return;
    if (state.playerList.teammateIds.find(e => e.id === sid)) return;
    state.playerList.enemyIds.push({ id: sid, note: (note || '').trim() });
    savePlayerList(); renderPlayerList('player-list', state.playerList, getListCallbacks());
}
function removeEnemyId(id) {
    state.playerList.enemyIds = state.playerList.enemyIds.filter(e => e.id !== String(id));
    savePlayerList(); renderPlayerList('player-list', state.playerList, getListCallbacks());
    if (state.isEnemy && state.currentViewId === String(id)) switchToMyPlayer();
}
function addTeammateId(id, note) {
    const sid = String(id); if (sid === state.playerList.myId) return;
    if (state.playerList.teammateIds.find(e => e.id === sid)) return;
    if (state.playerList.enemyIds.find(e => e.id === sid)) return;
    state.playerList.teammateIds.push({ id: sid, note: (note || '').trim() });
    savePlayerList(); renderPlayerList('player-list', state.playerList, getListCallbacks());
}
function removeTeammateId(id) {
    state.playerList.teammateIds = state.playerList.teammateIds.filter(e => e.id !== String(id));
    savePlayerList(); renderPlayerList('player-list', state.playerList, getListCallbacks());
    if (state.isTeammate && state.currentViewId === String(id)) switchToMyPlayer();
}
function getListCallbacks() {
    return {
        onSelectMy: () => switchToMyPlayer(),
        onSelectEnemy: (id) => switchToEnemy(id),
        onSelectTeammate: (id) => switchToTeammate(id),
        onSetMy: (id) => setMyId(id),
        onAddEnemy: (id, note) => addEnemyId(id, note),
        onRemoveEnemy: (id) => removeEnemyId(id),
        onAddTeammate: (id, note) => addTeammateId(id, note),
        onRemoveTeammate: (id) => removeTeammateId(id),
        onRefresh: () => refreshCurrentPlayer(),
        onOpenPros: () => openPros(),
    };
}
function switchToMyPlayer() { if (state.isLoading || !state.playerList.myId) return; state.isEnemy = false; state.isTeammate = false; document.getElementById('search-input').value = state.playerList.myId; loadDashboard(state.playerList.myId, false, false); }
function switchToEnemy(id) { if (state.isLoading) return; state.isEnemy = true; state.isTeammate = false; document.getElementById('search-input').value = id; loadDashboard(String(id), true, false); }
function switchToTeammate(id) { if (state.isLoading) return; state.isEnemy = false; state.isTeammate = true; document.getElementById('search-input').value = id; loadDashboard(String(id), false, true); }
function refreshCurrentPlayer() { if (state.isLoading) return; if (state.currentViewId) loadDashboard(state.currentViewId, state.isEnemy, state.isTeammate); else if (state.playerList.myId) loadDashboard(state.playerList.myId, false, false); }

async function openPros() {
    if (!state.playerList.myId) {
        showModalAlert('请先在左侧「本人」区域设置您的 Steam32 ID');
        return;
    }
    try {
        showModalLoading();
        const pros = await getPlayerPros(state.playerList.myId);
        renderProsModal(Array.isArray(pros) ? pros : [], state.playerList.myId);
    } catch (err) {
        console.error('[睡了么] Pros error:', err);
        showModalAlert('加载与神同行数据失败: ' + (err.message || '未知错误'));
    }
}

async function loadPeers(accountId) {
    try {
        const peers = await getPeers(accountId);
        if (peers && Array.isArray(peers)) {
            renderPeersTable('peers-table-section', peers);
        }
    } catch (err) {
        console.warn('[睡了么] Failed to load peers:', err.message);
        // Silently hide peers section on error
        const section = document.getElementById('peers-section');
        if (section) section.style.display = 'none';
    }
}

async function loadHeroMap() {
    const heroes = await getHeroes();
    const map = new Map();
    for (const hero of heroes) map.set(hero.id, { name: hero.name.replace('npc_dota_hero_', ''), localized_name: hero.localized_name, img: hero.img, icon: hero.icon, primary_attr: hero.primary_attr, attack_type: hero.attack_type });
    return enrichHeroMapWithChinese(map);
}

// --- Event Listeners ---
function setupEventListeners() {
    const form = document.getElementById('search-form');
    const input = document.getElementById('search-input');
    if (form) { form.onsubmit = (e) => e.preventDefault(); form.addEventListener('submit', (e) => { e.preventDefault(); handleSearch(); }); }
    if (input) { input.addEventListener('input', () => clearInputError('search-input')); input.focus(); }
    setupSidebarToggle();
    let resizeTimer;
    window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { for (const chart of Object.values(state.charts)) { if (chart?.resize) chart.resize(); } }, 200); });
    window.addEventListener('hashchange', () => { const id = getIdFromHash(); if (id && id !== state.currentViewId) { document.getElementById('search-input').value = id; handleSearch(); } });
}
function setupSidebarToggle() {
    const toggle = document.getElementById('sidebar-toggle'), sidebar = document.getElementById('sidebar'), overlay = document.getElementById('sidebar-overlay');
    if (!toggle || !sidebar || !overlay) return;
    function close() { sidebar.classList.remove('open'); overlay.classList.remove('open'); }
    toggle.addEventListener('click', () => { sidebar.classList.contains('open') ? close() : (sidebar.classList.add('open'), overlay.classList.add('open')); });
    overlay.addEventListener('click', close);
    window.addEventListener('resize', () => { if (window.innerWidth > 1024) close(); });
}

// --- Search ---
async function handleSearch() {
    const input = document.getElementById('search-input'); if (!input) return;
    const rawValue = input.value.trim(); clearInputError('search-input');
    if (!rawValue) { showInputError('search-input', '请输入 Steam32 ID'); return; }
    if (!VALIDATION.PATTERN.test(rawValue)) { showInputError('search-input', 'Steam ID 只能包含数字'); return; }
    let accountId = rawValue;
    if (rawValue.length >= 16 && rawValue.startsWith('7656119')) { try { accountId = String(BigInt(rawValue) - STEAM_ID_OFFSET); } catch { showInputError('search-input', '无效的 Steam ID'); return; } }
    if (state.isLoading) return;
    state.isEnemy = state.playerList.enemyIds.some(e => e.id === String(accountId));
    state.isTeammate = state.playerList.teammateIds.some(e => e.id === String(accountId));
    await loadDashboard(accountId, state.isEnemy, state.isTeammate);
}

// --- Dashboard ---
async function loadDashboard(accountId, isEnemy, isTeammate = false) {
    cancelAll();
    state.currentViewId = accountId; state.isEnemy = isEnemy; state.isTeammate = isTeammate; state.isLoading = true;
    state.turboMatches = []; state.allRecentMatches = []; state.sleepEval = null;
    state.turboCounts = null; state.turboStats = null; state.selectedPatch = null; state.availablePatches = [];

    for (const [key, chart] of Object.entries(state.charts)) { destroyChart(chart); delete state.charts[key]; }
    clearDashboard();
    if (isTeammate) {
        setTeammateHighlight(true);
    } else {
        setEnemyHighlight(isEnemy);
    }
    const dashboard = document.getElementById('dashboard'); if (dashboard) dashboard.classList.add('loaded');
    const LOADING_TEXT = '别只关心赢的多不多，重要是睡的好不好';
    showLoading('summary-section', LOADING_TEXT);
    showLoading('profile-section', ''); showLoading('sleep-section', '');
    showLoading('matches-section', LOADING_TEXT);
    showLoading('hero-table-section', LOADING_TEXT);
    window.location.hash = `#player-${accountId}`;
    updateRateLimitDisplay(); renderPlayerList('player-list', state.playerList, getListCallbacks());

    try {
        console.log(`[睡了么] Loading for ${accountId} (enemy=${isEnemy}, teammate=${isTeammate})`);

        // Fetch profile + turbo counts/stats + recent matches
        let profile, turboCounts, turboStats, recentMatches;
        try {
            [profile, turboCounts, turboStats, recentMatches] = await Promise.all([
                getPlayer(accountId),
                getTurboCounts(accountId),
                fetchTurboStats(accountId),
                getRecentMatches(accountId),
            ]);
        } catch (err) {
            if (err instanceof PlayerNotFoundError) { showPlayerNotFound('dashboard'); return; }
            throw err;
        }
        state.profile = profile; state.turboCounts = turboCounts; state.turboStats = turboStats;
        state.allRecentMatches = recentMatches || [];
        updateRateLimitDisplay();

        // Extract patches
        state.availablePatches = extractPatches(turboCounts);
        console.log(`[睡了么] Turbo patches: ${state.availablePatches.length}`);

        // Filter turbo matches from recent
        const turboMatches = (recentMatches || [])
            .filter(m => TURBO_MODES.includes(m.game_mode))
            .sort((a, b) => b.start_time - a.start_time);
        state.turboMatches = turboMatches;

        if (turboMatches.length === 0 && (!turboCounts?.game_mode?.['23']?.games)) {
            showDashboardError('dashboard', '该玩家没有加速模式比赛记录');
            return;
        }

        // Compute summary from counts + totals
        const computedStats = computeSummaryFromData(turboCounts, turboStats, turboMatches);
        state.sleepEval = evaluateSleep(state.allRecentMatches, state.heroMap);

        // Render
        if (state.availablePatches.length > 0) {
            renderPatchSelector('patch-selector-section', state.availablePatches, state.selectedPatch,
                (patch) => onPatchChange(accountId, isEnemy, patch));
        }
        renderFullDashboard(profile, computedStats, state.heroMap, turboMatches);

        // Check if this is an inactive teammate (>1 year no games)
        if (isTeammate && isPlayerInactive(state.allRecentMatches)) {
            renderTeammateInactiveCard('sleep-section');
            // Clear session advice — no current session for inactive players
            const adviceSection = document.getElementById('session-advice-section');
            if (adviceSection) adviceSection.innerHTML = '';
        } else {
            const sessionAdvice = getCurrentSessionAdvice(state.allRecentMatches, state.heroMap, isTeammate);
            if (sessionAdvice) renderSessionAdvice('session-advice-section', sessionAdvice, isEnemy, isTeammate);
            if (state.sleepEval) {
                renderSleepCard('sleep-section', state.sleepEval, getSleepMessage(state.sleepEval, isEnemy, state.heroMap, isTeammate), isEnemy, isTeammate);
            }
        }
        renderChartCanvases(); createCharts(computedStats, turboMatches);
        updateRateLimitDisplay();
        console.log(`[睡了么] Done. Sleep score: ${state.sleepEval?.score}`);

        // Fetch and render recent peers (non-blocking, independent of main dashboard)
        loadPeers(accountId);

    } catch (err) {
        // Silently ignore intentional cancellation (AbortError from cancelAll)
        if (err.name === 'AbortError') return;
        console.error('[睡了么] Error:', err);
        if (err instanceof NetworkError) showNetworkError('dashboard', err.message, () => loadDashboard(accountId, isEnemy, isTeammate));
        else if (err instanceof RateLimitError) showDashboardError('dashboard', 'API 请求配额已用尽，请稍后重试', () => loadDashboard(accountId, isEnemy, isTeammate));
        else showDashboardError('dashboard', `加载失败: ${err.message}`, () => loadDashboard(accountId, isEnemy, isTeammate));
        updateRateLimitDisplay();
    } finally { state.isLoading = false; }
}

// --- Patch Filter ---
function extractPatches(counts) {
    if (!counts?.patch) return [];
    return Object.keys(counts.patch).filter(k => k !== 'NaN').map(Number).sort((a, b) => b - a);
}

async function onPatchChange(accountId, isEnemy, patch) {
    state.selectedPatch = patch;
    const LOADING_TEXT = '别只关心赢的多不多，重要是睡的好不好';
    showLoading('summary-section', LOADING_TEXT);
    showLoading('hero-table-section', LOADING_TEXT);
    try {
        const turboStats = await fetchTurboStats(accountId, patch);
        state.turboStats = turboStats;
        const computedStats = computeSummaryFromData(state.turboCounts, turboStats, state.turboMatches);
        state.turboStats = turboStats;
        renderTurboSummary('summary-section', computedStats);
        renderHeroTable('hero-table-section', computeHeroesFromData(turboStats.heroes, state.turboMatches), state.heroMap, null);
        renderChartCanvases(); createCharts(computedStats, state.turboMatches);
    } catch (err) { console.warn('[睡了么] Patch re-fetch failed:', err); }
}

// --- Computation ---
function computeSummaryFromData(counts, turboStats, matches) {
    const { wl, heroes, totals } = turboStats;
    const wins = wl.win || 0, losses = wl.lose || 0, totalGames = wins + losses;

    function avg(field) { const d = totals[field]; return (d && d.n > 0) ? d.sum / d.n : 0; }

    // Fallback: compute from recent matches if totals missing
    let avgKills = avg('kills'), avgDeaths = avg('deaths'), avgAssists = avg('assists');
    let avgGpm = avg('gold_per_min'), avgXpm = avg('xp_per_min');
    if (avgGpm === 0 && matches.length > 0) {
        let sK = 0, sD = 0, sA = 0, sG = 0, sX = 0;
        for (const m of matches) { sK += m.kills||0; sD += m.deaths||0; sA += m.assists||0; sG += m.gold_per_min||0; sX += m.xp_per_min||0; }
        avgKills = sK / matches.length; avgDeaths = sD / matches.length; avgAssists = sA / matches.length;
        avgGpm = sG / matches.length; avgXpm = sX / matches.length;
    }

    // Extra dimensions from counts
    const isRadiant = counts?.is_radiant || {};
    const radiantData = isRadiant[1] || isRadiant['1'] || {};
    const direData = isRadiant[0] || isRadiant['0'] || {};
    const radiantWR = radiantData.games > 0 ? (radiantData.win / radiantData.games * 100) : 0;
    const direWR = direData.games > 0 ? (direData.win / direData.games * 100) : 0;
    const laneRole = counts?.lane_role || {};
    const coreGames = (laneRole[0] || laneRole['0'] || {}).games || 0;
    const supportGames = (laneRole[1] || laneRole['1'] || {}).games || 0;

    return {
        totalGames, wins, losses,
        winRate: totalGames > 0 ? (wins / totalGames * 100) : 0,
        avgKills, avgDeaths, avgAssists, avgGpm, avgXpm,
        maxStreak: calculateMaxWinStreak(matches),
        radiantWR, direWR, coreGames, supportGames,
        heroes: computeHeroesFromData(heroes, matches),
    };
}

function computeHeroesFromData(apiHeroes, matches) {
    const matchHeroes = deriveHeroStatsFromMatches(matches);
    if (matchHeroes.length > 0) {
        const mMap = new Map(matchHeroes.map(h => [h.hero_id, h]));
        // Use match-derived stats for KDA/GPM/XPM, API for game counts
        for (const hero of apiHeroes || []) {
            const mh = mMap.get(hero.hero_id);
            if (mh) {
                hero._match_games = mh.games;
                hero.kills = mh.kills; hero.deaths = mh.deaths; hero.assists = mh.assists;
                hero.gold_per_min = mh.gold_per_min; hero.xp_per_min = mh.xp_per_min;
                hero.hero_damage = mh.hero_damage; hero.tower_damage = mh.tower_damage; hero.last_hits = mh.last_hits;
            }
        }
        for (const mh of matchHeroes) { if (!apiHeroes?.find(h => h.hero_id === mh.hero_id)) apiHeroes?.push(mh); }
    }
    if (!apiHeroes?.length) return matchHeroes;
    return (apiHeroes || []).sort((a, b) => (b.games || 0) - (a.games || 0));
}

function deriveHeroStatsFromMatches(matches) {
    const map = new Map();
    for (const m of matches) {
        const hid = m.hero_id;
        if (!map.has(hid)) map.set(hid, { hero_id: hid, games: 0, win: 0, kills: 0, deaths: 0, assists: 0, gold_per_min: 0, xp_per_min: 0, hero_damage: 0, tower_damage: 0, last_hits: 0 });
        const h = map.get(hid); h.games++;
        if ((m.player_slot < 128) === m.radiant_win) h.win++;
        h.kills += m.kills||0; h.deaths += m.deaths||0; h.assists += m.assists||0;
        h.gold_per_min += m.gold_per_min||0; h.xp_per_min += m.xp_per_min||0;
        h.hero_damage += m.hero_damage||0; h.tower_damage += m.tower_damage||0; h.last_hits += m.last_hits||0;
    }
    return Array.from(map.values()).sort((a, b) => b.games - a.games);
}

function calculateMaxWinStreak(matches) {
    if (!matches?.length) return 0;
    const sorted = [...matches].sort((a, b) => a.start_time - b.start_time);
    let max = 0, cur = 0;
    for (const m of sorted) { if ((m.player_slot < 128) === m.radiant_win) { cur++; max = Math.max(max, cur); } else cur = 0; }
    return max;
}

// --- Charts ---
function createCharts(stats, matches) {
    const tc = document.getElementById('winrate-trend-chart');
    if (tc && matches.length > 0) { const c = createWinRateTrend(tc, matches); if (c) state.charts.winRateTrend = c; }
    const hc = document.getElementById('hero-perf-chart');
    if (hc && stats.heroes?.length > 0) { const c = createHeroPerformanceChart(hc, stats.heroes, state.heroMap); if (c) state.charts.heroPerformance = c; }
}

// --- URL Hash ---
function checkUrlHash() { const id = getIdFromHash(); if (id && id !== state.currentViewId && !state.isLoading) { document.getElementById('search-input').value = id; setTimeout(() => handleSearch(), 500); } }
function getIdFromHash() { const m = window.location.hash.match(/^#player-(\d+)$/); return m ? m[1] : null; }

// --- Rate Limit ---
function updateRateLimitDisplay() { renderRateLimitIndicator('rate-limit-indicator', getRateLimitStatus()); }
setInterval(updateRateLimitDisplay, 10000);
