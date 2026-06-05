// ============================================================
// api.js — OpenDota API Client
// ============================================================

import { API_BASE, REQUEST_TIMEOUT, TURBO_MODES } from './config.js';
import { get as cacheGet, set as cacheSet } from './storage.js';
import { CACHE_TTL, STORAGE_KEYS } from './config.js';

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
 * Get player profile.
 */
export async function getPlayer(accountId) {
    return request(`/players/${accountId}`, {}, {
        cacheKey: STORAGE_KEYS.PLAYER_PREFIX + accountId,
        cacheTtl: CACHE_TTL.PLAYER,
    });
}

/**
 * Get counts by dimension (game_mode, lobby_type, etc.).
 */
export async function getCounts(accountId) {
    return request(`/players/${accountId}/counts`, {}, {
        cacheKey: STORAGE_KEYS.COUNTS_PREFIX + accountId,
        cacheTtl: CACHE_TTL.COUNTS,
    });
}

/**
 * Get win/loss stats, optionally filtered by game_mode.
 */
export async function getWinLoss(accountId, gameMode, patch) {
    const params = {};
    if (gameMode !== undefined && gameMode !== null) params.game_mode = gameMode;
    if (patch) params.patch = patch;
    const suffix = patch ? '_p' + patch : '';
    const cacheKey = gameMode != null
        ? STORAGE_KEYS.STATS_PREFIX + accountId + '_wl_' + gameMode + suffix
        : null;
    return request(`/players/${accountId}/wl`, params, {
        cacheKey,
        cacheTtl: CACHE_TTL.STATS,
    });
}

/**
 * Get hero stats for a player, optionally filtered by game_mode.
 */
export async function getHeroStats(accountId, gameMode, patch) {
    const params = {};
    if (gameMode !== undefined && gameMode !== null) params.game_mode = gameMode;
    if (patch) params.patch = patch;
    const suffix = patch ? '_p' + patch : '';
    const cacheKey = gameMode != null
        ? STORAGE_KEYS.STATS_PREFIX + accountId + '_heroes_' + gameMode + suffix
        : null;
    return request(`/players/${accountId}/heroes`, params, {
        cacheKey,
        cacheTtl: CACHE_TTL.STATS,
    });
}

/**
 * Get aggregated totals for a player, optionally filtered by game_mode.
 * The API returns an array of { field, n, sum } objects.
 * We convert it to a flat object like { kills: { n, sum }, deaths: { n, sum } }.
 */
export async function getTotals(accountId, gameMode, patch) {
    const params = {};
    if (gameMode !== undefined && gameMode !== null) params.game_mode = gameMode;
    if (patch) params.patch = patch;
    const suffix = patch ? '_p' + patch : '';
    const cacheKey = gameMode != null
        ? STORAGE_KEYS.STATS_PREFIX + accountId + '_totals_' + gameMode + suffix
        : null;
    const raw = await request(`/players/${accountId}/totals`, params, {
        cacheKey,
        cacheTtl: CACHE_TTL.STATS,
    });
    return convertTotalsArray(raw);
}

/**
 * Convert totals from array format [{ field, n, sum }] to flat object.
 */
function convertTotalsArray(raw) {
    if (!Array.isArray(raw)) return raw; // Already converted or unexpected format
    const obj = {};
    for (const item of raw) {
        obj[item.field] = { n: item.n || 0, sum: item.sum || 0 };
    }
    return obj;
}

/**
 * Get recent matches.
 * NOTE: This endpoint does NOT support game_mode filtering on the server.
 * Filter client-side for game_mode 22/23.
 */
export async function getRecentMatches(accountId) {
    return request(`/players/${accountId}/recentMatches`, {}, {
        // No caching — freshness matters
    });
}

/**
 * Determine which Turbo modes (22, 23) the player has data for.
 * Returns an array of mode IDs that should be fetched.
 */
export function detectTurboModes(countsData) {
    if (!countsData || !countsData.game_mode) return [];

    const modes = [];
    for (const mode of TURBO_MODES) {
        const key = String(mode);
        if (countsData.game_mode[key] && countsData.game_mode[key].games > 0) {
            modes.push(mode);
        }
    }
    return modes;
}

/**
 * Fetch Turbo stats for all relevant modes in parallel.
 * Returns merged results.
 *
 * @param {number|string} accountId
 * @param {number[]} turboModes - Array of game_mode IDs to fetch (e.g., [23] or [22, 23])
 * @returns {Promise<{wl: {win:number,lose:number}, heroes: Array, totals: Object}>}
 */
export async function fetchTurboStats(accountId, turboModes, patch) {
    if (turboModes.length === 0) {
        return { wl: { win: 0, lose: 0 }, heroes: [], totals: {} };
    }

    // Fetch all modes in parallel
    const results = await Promise.allSettled(
        turboModes.flatMap(mode => [
            getWinLoss(accountId, mode, patch).then(d => ({ type: 'wl', mode, data: d })),
            getHeroStats(accountId, mode, patch).then(d => ({ type: 'heroes', mode, data: d })),
            getTotals(accountId, mode, patch).then(d => ({ type: 'totals', mode, data: d })),
        ])
    );

    // Separate by type
    const wlResults = [];
    const heroResults = [];
    const totalResults = [];

    for (const r of results) {
        if (r.status === 'fulfilled') {
            const { type, data } = r.value;
            if (type === 'wl') wlResults.push(data);
            else if (type === 'heroes') heroResults.push(data);
            else if (type === 'totals') totalResults.push(data);
        }
    }

    return {
        wl: mergeWinLoss(wlResults),
        heroes: mergeHeroStats(heroResults),
        totals: mergeTotals(totalResults),
    };
}

// --- Data Merging Helpers ---

function mergeWinLoss(results) {
    const merged = { win: 0, lose: 0 };
    for (const r of results) {
        merged.win += r.win || 0;
        merged.lose += r.lose || 0;
    }
    return merged;
}

function mergeHeroStats(results) {
    // results is an array of arrays: [[hero1, hero2, ...], [hero1, hero3, ...]]
    // Each hero object contains aggregated totals (sums) from the API.
    // To merge, we sum all numeric fields across modes.
    const heroMap = new Map();

    // Fields that should be summed (totals)
    const NUMERIC_FIELDS = [
        'games', 'win', 'kills', 'deaths', 'assists',
        'last_hits', 'denies', 'hero_damage', 'tower_damage',
        'hero_healing', 'gold', 'gold_per_min', 'xp_per_min',
        'duration', 'lane_efficiency', 'tower_kills',
        'roshan_kills', 'observer_uses', 'sentry_uses',
    ];

    for (const heroList of results) {
        if (!Array.isArray(heroList)) continue;
        for (const hero of heroList) {
            const id = hero.hero_id;
            if (!heroMap.has(id)) {
                // Deep copy the hero object
                heroMap.set(id, { ...hero });
            } else {
                const existing = heroMap.get(id);
                // Sum all numeric fields
                for (const field of NUMERIC_FIELDS) {
                    if (typeof hero[field] === 'number') {
                        existing[field] = (existing[field] || 0) + hero[field];
                    }
                }
                // Keep the most recent last_played
                if (hero.last_played > (existing.last_played || 0)) {
                    existing.last_played = hero.last_played;
                }
            }
        }
    }

    // Convert to array and sort by games descending
    return Array.from(heroMap.values())
        .sort((a, b) => (b.games || 0) - (a.games || 0));
}

function mergeTotals(results) {
    if (results.length === 0) return {};
    if (results.length === 1) return results[0];

    // Each result is now a flat object like { kills: {n, sum}, deaths: {n, sum} }
    const merged = {};
    for (const r of results) {
        for (const [field, data] of Object.entries(r)) {
            if (data && typeof data.n === 'number') {
                if (!merged[field]) {
                    merged[field] = { n: 0, sum: 0 };
                }
                merged[field].n += data.n;
                merged[field].sum += data.sum;
            }
        }
    }
    return merged;
}

/**
 * Fetch recent matches and filter to Turbo modes on the client.
 */
export async function getTurboRecentMatches(accountId) {
    const matches = await getRecentMatches(accountId);
    if (!Array.isArray(matches)) return [];
    return matches.filter(m => TURBO_MODES.includes(m.game_mode));
}
