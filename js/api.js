// ============================================================
// api.js — OpenDota API Client
// ============================================================

import { API_BASE, API_BACKEND, REQUEST_TIMEOUT, TURBO_MODES } from './config.js';
import { get as cacheGet, set as cacheSet } from './storage.js';
import { CACHE_TTL, STORAGE_KEYS } from './config.js';
import { getToken, refreshAccessToken } from './auth.js';

// --- Internal State ---

const rateLimit = {
    minute: null,
    month: null,
};

const activeControllers = new Map();

// --- Error Types ---

export class ApiError extends Error {
    constructor(message, status, endpoint) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.endpoint = endpoint;
    }
}

export class PlayerNotFoundError extends ApiError {
    constructor(endpoint) {
        super('玩家不存在', 404, endpoint);
        this.name = 'PlayerNotFoundError';
    }
}

export class RateLimitError extends ApiError {
    constructor(endpoint) {
        super('API 请求配额已用尽', 429, endpoint);
        this.name = 'RateLimitError';
    }
}

export class NetworkError extends Error {
    constructor(message) {
        super(message);
        this.name = 'NetworkError';
    }
}

export class AuthError extends Error {
    constructor(message) {
        super(message || '请先登录');
        this.name = 'AuthError';
    }
}

export class UsageLimitError extends Error {
    constructor(message, resetsAt) {
        super(message || '今日使用次数已达上限');
        this.name = 'UsageLimitError';
        this.resetsAt = resetsAt;
    }
}

// --- Core Request Wrapper ---

/**
 * Core fetch wrapper with timeout, rate-limit parsing, and error normalization.
 *
 * @param {string} path - API path, e.g. '/players/123/recentMatches'
 * @param {object} [params] - Query parameters
 * @param {object} [opts] - Options
 * @param {AbortSignal} [opts.signal] - External abort signal
 * @param {string} [opts.cacheKey] - If provided, try cache-first
 * @param {number} [opts.cacheTtl] - Cache TTL in ms
 * @returns {Promise<any>}
 */
async function request(path, params = {}, opts = {}) {
    const { signal: extSignal, cacheKey, cacheTtl } = opts;

    // Check cache
    if (cacheKey) {
        const cached = cacheGet(cacheKey);
        if (cached !== null) return cached;
    }

    // Build URL — strip leading slash since API_BASE ends with /
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;
    const url = new URL(cleanPath, API_BASE);
    for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== '') {
            url.searchParams.set(k, v);
        }
    }

    // Timeout via AbortController
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(new Error('timeout')), REQUEST_TIMEOUT);

    // If external signal aborts, cancel us too
    if (extSignal) {
        if (extSignal.aborted) {
            clearTimeout(timeoutId);
            throw new DOMException('Aborted', 'AbortError');
        }
        extSignal.addEventListener('abort', () => controller.abort(extSignal.reason));
    }

    const endpointKey = `${path}?${url.searchParams.toString()}`;
    activeControllers.set(endpointKey, controller);

    try {
        const response = await fetch(url.toString(), {
            method: 'GET',
            signal: controller.signal,
            headers: { 'Accept': 'application/json' },
        });

        // Parse rate-limit headers
        parseRateLimitHeaders(response);

        // Handle HTTP errors
        if (response.status === 404) {
            throw new PlayerNotFoundError(path);
        }
        if (response.status === 429) {
            throw new RateLimitError(path);
        }
        if (!response.ok) {
            throw new ApiError(
                `API 请求失败 (${response.status})`,
                response.status,
                path
            );
        }

        const data = await response.json();

        // Cache the result
        if (cacheKey && cacheTtl) {
            cacheSet(cacheKey, data, cacheTtl);
        }

        return data;

    } catch (err) {
        // Re-throw our custom errors
        if (err instanceof ApiError) throw err;

        // AbortError — might be from timeout or external cancellation
        if (err.name === 'AbortError') {
            if (controller.signal.reason?.message === 'timeout') {
                throw new NetworkError('请求超时，请检查网络后重试');
            }
            throw err; // Re-throw genuine abort for caller to handle
        }

        // Network errors (offline, DNS failure, etc.)
        if (err instanceof TypeError && err.message.includes('fetch')) {
            throw new NetworkError('网络连接失败，请检查网络后重试');
        }

        throw new NetworkError(`请求失败: ${err.message}`);
    } finally {
        clearTimeout(timeoutId);
        activeControllers.delete(endpointKey);
    }
}

/** Parse rate-limit headers from response */
function parseRateLimitHeaders(response) {
    const minute = response.headers.get('x-rate-limit-remaining-minute');
    const month = response.headers.get('x-rate-limit-remaining-month');
    if (minute !== null) rateLimit.minute = parseInt(minute, 10);
    if (month !== null) rateLimit.month = parseInt(month, 10);
}

// --- Public API ---

/** Cancel all in-flight requests for a specific player */
export function cancelRequests(accountId) {
    for (const [key, controller] of activeControllers) {
        if (key.includes(String(accountId))) {
            controller.abort();
            activeControllers.delete(key);
        }
    }
}

/** Cancel all in-flight requests */
export function cancelAll() {
    for (const [key, controller] of activeControllers) {
        controller.abort();
    }
    activeControllers.clear();
}

/** Get current rate limit status */
export function getRateLimitStatus() {
    return { minute: rateLimit.minute, month: rateLimit.month };
}

// --- Proxy Request (for advanced features) ---

/**
 * Send a request through the backend proxy with JWT auth.
 * Used for advanced features that require usage tracking.
 *
 * @param {string} path - OpenDota API path, e.g. '/players/123/pros'
 * @param {object} [params] - Query parameters
 * @param {object} [opts]
 * @param {string} [opts.feature] - Feature name for usage tracking
 * @param {AbortSignal} [opts.signal] - External abort signal
 * @returns {Promise<any>}
 */
async function proxyRequest(path, params = {}, opts = {}) {
    const { feature, signal: extSignal } = opts;

    // Build URL
    const cleanPath = path.startsWith('/') ? path : '/' + path;
    const url = new URL('/api/proxy' + cleanPath, API_BACKEND);
    for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== '') {
            url.searchParams.set(k, String(v));
        }
    }
    if (feature) {
        url.searchParams.set('_feature', feature);
    }

    const headers = { 'Accept': 'application/json' };
    const token = getToken();
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    // AbortController with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(new Error('timeout')), REQUEST_TIMEOUT);

    if (extSignal) {
        if (extSignal.aborted) {
            clearTimeout(timeoutId);
            throw new DOMException('Aborted', 'AbortError');
        }
        extSignal.addEventListener('abort', () => controller.abort(extSignal.reason));
    }

    const endpointKey = `proxy:${cleanPath}?${url.searchParams.toString()}`;
    activeControllers.set(endpointKey, controller);

    try {
        let response = await fetch(url.toString(), {
            method: 'GET',
            signal: controller.signal,
            headers,
        });

        // Handle 401: try token refresh and retry once
        if (response.status === 401) {
            const user = await refreshAccessToken();
            if (user) {
                const newToken = getToken();
                if (newToken) {
                    headers['Authorization'] = `Bearer ${newToken}`;
                    // Retry with new token
                    const retryController = new AbortController();
                    const retryTimeoutId = setTimeout(() => retryController.abort(new Error('timeout')), REQUEST_TIMEOUT);
                    try {
                        response = await fetch(url.toString(), {
                            method: 'GET',
                            signal: retryController.signal,
                            headers,
                        });
                    } finally {
                        clearTimeout(retryTimeoutId);
                    }
                }
            }
        }

        // Handle 429 (usage limit exceeded)
        if (response.status === 429) {
            let data;
            try { data = await response.json(); } catch { data = {}; }
            throw new UsageLimitError(
                data.message || '今日使用次数已达上限',
                data.resetsAt
            );
        }

        // Handle 401 after retry
        if (response.status === 401) {
            throw new AuthError('请先登录');
        }

        // Handle HTTP errors
        if (response.status === 404) {
            throw new PlayerNotFoundError(path);
        }
        if (!response.ok) {
            throw new ApiError(`代理请求失败 (${response.status})`, response.status, path);
        }

        const data = await response.json();
        return data;

    } catch (err) {
        if (err instanceof ApiError) throw err;
        if (err instanceof AuthError) throw err;
        if (err instanceof UsageLimitError) throw err;

        if (err.name === 'AbortError') {
            if (controller.signal.reason?.message === 'timeout') {
                throw new NetworkError('请求超时，请检查网络后重试');
            }
            throw err;
        }

        if (err instanceof TypeError && err.message.includes('fetch')) {
            throw new NetworkError('网络连接失败，请检查网络后重试');
        }

        throw new NetworkError(`代理请求失败: ${err.message}`);
    } finally {
        clearTimeout(timeoutId);
        activeControllers.delete(endpointKey);
    }
}

// --- Direct API Functions (unchanged, for core dashboard) ---

/**
 * Fetch hero list (id → name mapping).
 * Cached for 7 days in localStorage.
 */
export async function getHeroes() {
    return request('/heroes', {}, {
        cacheKey: STORAGE_KEYS.HEROES,
        cacheTtl: CACHE_TTL.HEROES,
    });
}

/**
 * Fetch global hero stats (all game modes, includes turbo_picks/turbo_wins).
 * Cached for 1 hour.
 */
export async function getHeroStats() {
    return request('/heroStats', {}, {
        cacheKey: 'dd2_hero_stats',
        cacheTtl: 60 * 60 * 1000, // 1 hour
    });
}

/**
 * Get player profile.
 */
export async function getPlayer(accountId) {
    return request(`/players/${accountId}`, {}, {
        cacheKey: STORAGE_KEYS.PLAYER_PREFIX + accountId,
        cacheTtl: CACHE_TTL.PLAYER,
    });
}

/** Base params for Turbo-only data */
const TURBO_PARAMS = { game_mode: 23, significant: 0 };
/**
 * Get recent matches (Turbo mode only).
 */
export async function getRecentMatches(accountId) {
    return request(`/players/${accountId}/recentMatches`, TURBO_PARAMS, {});
}
/**
 * Get Turbo mode counts (accurate with significant=0).
 */
export async function getTurboCounts(accountId, patch) {
    const params = { ...TURBO_PARAMS };
    if (patch) params.patch = patch;
    const suffix = patch ? '_p' + patch : '';
    return request(`/players/${accountId}/counts`, params, {
        cacheKey: STORAGE_KEYS.COUNTS_PREFIX + accountId + '_turbo' + suffix,
        cacheTtl: CACHE_TTL.STATS,
    });
}

/**
 * Get Turbo win/loss stats.
 */
export async function getTurboWinLoss(accountId, patch) {
    const params = { ...TURBO_PARAMS };
    if (patch) params.patch = patch;
    const suffix = patch ? '_p' + patch : '';
    return request(`/players/${accountId}/wl`, params, {
        cacheKey: STORAGE_KEYS.STATS_PREFIX + accountId + '_turbo_wl' + suffix,
        cacheTtl: CACHE_TTL.STATS,
    });
}

/**
 * Get Turbo hero stats.
 */
export async function getTurboHeroStats(accountId, patch) {
    const params = { ...TURBO_PARAMS };
    if (patch) params.patch = patch;
    const suffix = patch ? '_p' + patch : '';
    return request(`/players/${accountId}/heroes`, params, {
        cacheKey: STORAGE_KEYS.STATS_PREFIX + accountId + '_turbo_heroes' + suffix,
        cacheTtl: CACHE_TTL.STATS,
    });
}

/**
 * Get Turbo aggregated totals. Returns { field: {n, sum} }.
 */
export async function getTurboTotals(accountId, patch) {
    const params = { ...TURBO_PARAMS };
    if (patch) params.patch = patch;
    const suffix = patch ? '_p' + patch : '';
    const raw = await request(`/players/${accountId}/totals`, params, {
        cacheKey: STORAGE_KEYS.STATS_PREFIX + accountId + '_turbo_totals' + suffix,
        cacheTtl: CACHE_TTL.STATS,
    });
    return convertTotalsArray(raw);
}

function convertTotalsArray(raw) {
    if (!Array.isArray(raw)) return raw;
    const obj = {};
    for (const item of raw) obj[item.field] = { n: item.n || 0, sum: item.sum || 0 };
    return obj;
}

/**
 * Fetch all Turbo stats in parallel (wl + heroes + totals).
 */
export async function fetchTurboStats(accountId, patch) {
    const [wl, heroes, totals] = await Promise.all([
        getTurboWinLoss(accountId, patch),
        getTurboHeroStats(accountId, patch),
        getTurboTotals(accountId, patch),
    ]);
    return { wl, heroes, totals };
}

/**
 * Fetch recent matches and filter to Turbo modes on the client.
 */
export async function getTurboRecentMatches(accountId) {
    const matches = await getRecentMatches(accountId);
    if (!Array.isArray(matches)) return [];
    return matches.filter(m => TURBO_MODES.includes(m.game_mode));
}

/**
 * Get recent peers (players frequently matched with/against in the last 90 days).
 * Only Turbo mode.
 */
export async function getPeers(accountId) {
    return request(`/players/${accountId}/peers`, {
        game_mode: 23,
        significant: 0,
        date: 90,
    }, {
        cacheKey: STORAGE_KEYS.STATS_PREFIX + accountId + '_turbo_peers',
        cacheTtl: CACHE_TTL.STATS,
    });
}

/**
 * Get top players by turbo MMR (琅琊榜).
 */
export async function getTopPlayers() {
    return request('/topPlayers', { turbo: 1 }, {
        cacheKey: 'dd2_top_players_turbo',
        cacheTtl: CACHE_TTL.STATS,
    });
}

/**
 * Get pro players the given account has played with (与神同行).
 * Only Turbo mode.
 */
export async function getPlayerPros(accountId) {
    return request(`/players/${accountId}/pros`, {
        game_mode: 23,
        significant: 0,
    }, {
        cacheKey: STORAGE_KEYS.STATS_PREFIX + accountId + '_pros',
        cacheTtl: CACHE_TTL.STATS,
    });
}

/**
 * Get matches played with a specific player (Turbo mode only).
 * @param {string} accountId - The main player's ID
 * @param {string} includedAccountId - The pro/other player's ID to filter by
 */
export async function getMatchesWithPlayer(accountId, includedAccountId) {
    return request(`/players/${accountId}/matches`, {
        game_mode: 23,
        significant: 0,
        included_account_id: includedAccountId,
    });
}

/**
 * Get matches for a specific hero (Turbo mode only, last 20 matches).
 * @param {string} accountId - The player's ID
 * @param {number} heroId - The hero ID to filter by
 */
export async function getHeroMatches(accountId, heroId) {
    return request(`/players/${accountId}/matches`, {
        game_mode: 23,
        significant: 0,
        hero_id: heroId,
        limit: 20,
    });
}

/**
 * Get all recent matches (Turbo mode only) with a configurable limit.
 * @param {string} accountId - The player's ID
 * @param {number} limit - Max number of matches to fetch (default 500)
 */
export async function getAllMatches(accountId, limit = 500) {
    return request(`/players/${accountId}/matches`, {
        game_mode: 23,
        significant: 0,
        limit: limit,
    });
}

/**
 * Get this week's Turbo mode matches (from Monday to today).
 * @param {string} accountId - The player's ID
 * @param {number} dateDays - Number of days to look back (1=Monday, 7=Sunday)
 */
export async function getWeeklyMatches(accountId, dateDays) {
    return request(`/players/${accountId}/matches`, {
        game_mode: 23,
        significant: 0,
        date: dateDays,
    });
}

// --- Proxy API Functions (for advanced features with usage tracking) ---

/**
 * Get player pros via backend proxy (与神同行).
 * Usage feature: pro_players
 */
export async function getPlayerProsProxied(accountId) {
    return proxyRequest(`/players/${accountId}/pros`,
        { game_mode: 23, significant: 0 },
        { feature: 'pro_players' }
    );
}

/**
 * Get all matches via backend proxy (500场数据).
 * Usage feature: all_matches
 */
export async function getAllMatchesProxied(accountId, limit = 500) {
    return proxyRequest(`/players/${accountId}/matches`,
        { game_mode: 23, significant: 0, limit },
        { feature: 'all_matches' }
    );
}

/**
 * Get turbo hero stats via backend proxy (英雄推荐).
 * Usage feature: hero_recommend
 */
export async function getTurboHeroStatsProxied(accountId, patch) {
    const params = { game_mode: 23, significant: 0 };
    if (patch) params.patch = patch;
    return proxyRequest(`/players/${accountId}/heroes`, params,
        { feature: 'hero_recommend' }
    );
}

/**
 * Get hero matches via backend proxy (英雄推荐 detail).
 * Usage feature: hero_recommend
 */
export async function getHeroMatchesProxied(accountId, heroId) {
    return proxyRequest(`/players/${accountId}/matches`,
        { game_mode: 23, significant: 0, hero_id: heroId, limit: 20 },
        { feature: 'hero_recommend' }
    );
}
