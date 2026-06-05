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
 * Get recent matches.
 * Filter client-side for game_mode 22/23.
 */
export async function getRecentMatches(accountId) {
    return request(`/players/${accountId}/recentMatches`, {}, {});
}

/**
 * Fetch recent matches and filter to Turbo modes on the client.
 */
export async function getTurboRecentMatches(accountId) {
    const matches = await getRecentMatches(accountId);
    if (!Array.isArray(matches)) return [];
    return matches.filter(m => TURBO_MODES.includes(m.game_mode));
}
