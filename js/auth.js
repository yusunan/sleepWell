// ============================================================
// auth.js — Frontend authentication module
// ============================================================
//
// Manages JWT access tokens in memory and refresh tokens via
// httpOnly cookie. On page load, attempts to restore the session
// by calling /api/auth/refresh (cookie automatically sent).
//
// Exports:
//   initAuth()              — Initialize auth state on app load
//   login(username, pwd)    — Login and store token in memory
//   register(user, pwd, inv)— Register with invite code
//   logout()                — Clear session
//   getToken()              — Get current JWT or null
//   getCurrentUser()        — Get current user object or null
//   isAuthenticated()       — Boolean
//   requireAuth()           — Returns true if authenticated, false if not
//   onAuthChange(cb)        — Subscribe to auth state changes
//

import { API_BACKEND, AUTH } from './config.js';

// --- Module-scoped state (NOT in localStorage for security) ---
let token = null;
let currentUser = null;
let refreshPromise = null;
const listeners = [];

// --- Internal helpers ---

function notifyListeners() {
    for (const cb of listeners) {
        try { cb(currentUser); } catch { /* ignore */ }
    }
}

async function apiCall(path, options = {}) {
    const url = `${API_BACKEND}${path}`;
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
        ...options,
        headers,
        credentials: 'include', // Send httpOnly refresh cookie
    });

    return response;
}

async function refreshAccessToken() {
    // Prevent concurrent refresh calls
    if (refreshPromise) return refreshPromise;

    refreshPromise = (async () => {
        try {
            const response = await fetch(`${API_BACKEND}/api/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
            });

            if (!response.ok) {
                token = null;
                currentUser = null;
                return null;
            }

            const data = await response.json();
            token = data.token;
            currentUser = data.user;
            notifyListeners();
            return data.user;
        } catch {
            token = null;
            currentUser = null;
            return null;
        } finally {
            refreshPromise = null;
        }
    })();

    return refreshPromise;
}

// Schedule proactive token refresh before expiry
let refreshTimer = null;
function scheduleRefresh() {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(async () => {
        console.log('[睡了么 Auth] Proactive token refresh');
        await refreshAccessToken();
        scheduleRefresh(); // Schedule next refresh
    }, AUTH.TOKEN_REFRESH_INTERVAL);
}

// --- Public API ---

/**
 * Initialize auth state on app load.
 * Attempts to restore session via refresh token cookie.
 */
export async function initAuth() {
    console.log('[睡了么 Auth] Initializing...');

    // Try to restore session
    try {
        await refreshAccessToken();
        if (currentUser) {
            console.log(`[睡了么 Auth] Session restored: ${currentUser.username}`);
            scheduleRefresh();
        } else {
            console.log('[睡了么 Auth] No active session');
        }
    } catch {
        console.log('[睡了么 Auth] Session restore failed');
    }
}

/**
 * Login with username and password.
 */
export async function login(username, password) {
    const response = await fetch(`${API_BACKEND}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || '登录失败');
    }

    token = data.token;
    currentUser = data.user;
    notifyListeners();
    scheduleRefresh();

    console.log(`[睡了么 Auth] Logged in: ${currentUser.username}`);
    return data.user;
}

/**
 * Register with username, password, and invite code.
 */
export async function register(username, password, inviteCode) {
    const response = await fetch(`${API_BACKEND}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password, invite_code: inviteCode }),
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || '注册失败');
    }

    token = data.token;
    currentUser = data.user;
    notifyListeners();
    scheduleRefresh();

    console.log(`[睡了么 Auth] Registered: ${currentUser.username}`);
    return data.user;
}

/**
 * Logout — revoke refresh token and clear state.
 */
export async function logout() {
    try {
        await fetch(`${API_BACKEND}/api/auth/logout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
        });
    } catch {
        // Ignore network errors on logout
    }

    if (refreshTimer) clearTimeout(refreshTimer);
    token = null;
    currentUser = null;
    notifyListeners();

    console.log('[睡了么 Auth] Logged out');
}

/**
 * Get current JWT access token (or null).
 */
export function getToken() {
    return token;
}

/**
 * Get current user object (or null).
 */
export function getCurrentUser() {
    return currentUser;
}

/**
 * Whether the user is currently authenticated.
 */
export function isAuthenticated() {
    return !!currentUser;
}

/**
 * Check if user is authenticated. Returns true/false.
 * Does NOT show UI — callers should handle showing login if needed.
 */
export function requireAuth() {
    return !!currentUser;
}

/**
 * Subscribe to auth state changes.
 * Callback receives (user | null).
 */
export function onAuthChange(callback) {
    listeners.push(callback);
    // Immediately invoke with current state
    try { callback(currentUser); } catch { /* ignore */ }
}

/**
 * Get a fetch-compatible headers object with auth.
 */
export function authHeaders() {
    if (!token) return {};
    return { 'Authorization': `Bearer ${token}` };
}

// --- Frontend Event Beacon ---

/**
 * Send a lightweight event to the backend access log.
 * Uses a fire-and-forget POST — never blocks or throws.
 *
 * @param {'page_view'|'feature_open'|'search'|'dashboard_view'} action
 * @param {object} [extra] - Optional metadata
 */
export function beacon(action, extra = {}) {
    try {
        const body = JSON.stringify({
            action,
            path: location.pathname + location.search,
            extra: Object.keys(extra).length > 0 ? extra : undefined,
        });

        // Use sendBeacon for reliability, fall back to fetch
        const url = `${API_BACKEND}/api/log`;
        const headers = {
            'Content-Type': 'application/json',
            ...authHeaders(),
        };

        if (navigator.sendBeacon) {
            const blob = new Blob([body], { type: 'application/json' });
            navigator.sendBeacon(url, blob);
        } else {
            // Fire-and-forget fetch
            fetch(url, {
                method: 'POST',
                headers,
                body,
                keepalive: true,
            }).catch(() => {});
        }
    } catch {
        // Silently ignore — beacon must never throw
    }
}
