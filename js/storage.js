// ============================================================
// storage.js — localStorage Caching Layer
// ============================================================

const PREFIX = '';
const NAMESPACE = 'dd2_';

/**
 * Get a value from localStorage.
 * Returns null if key doesn't exist, is expired, or on any error.
 */
export function get(key) {
    try {
        const raw = localStorage.getItem(PREFIX + key);
        if (raw === null) return null;

        const entry = JSON.parse(raw);
        // Validate structure
        if (!entry || typeof entry !== 'object' || !('data' in entry)) {
            localStorage.removeItem(PREFIX + key);
            return null;
        }

        // Check expiry
        if (entry.expiresAt && Date.now() > entry.expiresAt) {
            localStorage.removeItem(PREFIX + key);
            return null;
        }

        return entry.data;
    } catch {
        // Parse error or localStorage unavailable — degrade gracefully
        return null;
    }
}

/**
 * Set a value in localStorage with TTL.
 * Silently fails on QuotaExceededError or unavailable localStorage.
 */
export function set(key, data, ttlMs) {
    try {
        const entry = {
            data,
            expiresAt: Date.now() + ttlMs,
        };
        localStorage.setItem(PREFIX + key, JSON.stringify(entry));
    } catch (e) {
        if (e.name === 'QuotaExceededError') {
            console.warn('[dd2] localStorage quota exceeded, clearing old entries');
            clearExpired();
            try {
                localStorage.setItem(PREFIX + key, JSON.stringify({
                    data,
                    expiresAt: Date.now() + ttlMs,
                }));
            } catch {
                // Still failed — give up silently
            }
        }
        // Other errors (e.g., private browsing, security policy) — ignore
    }
}

/**
 * Remove a key from localStorage.
 */
export function remove(key) {
    try {
        localStorage.removeItem(PREFIX + key);
    } catch {
        // Ignore
    }
}

/**
 * Remove all dd2-related keys from localStorage.
 */
export function clearAll() {
    try {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(NAMESPACE)) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
    } catch {
        // Ignore
    }
}

/**
 * Remove only expired entries to free up space.
 */
function clearExpired() {
    try {
        const now = Date.now();
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key || !key.startsWith(NAMESPACE)) continue;
            try {
                const raw = localStorage.getItem(key);
                if (raw) {
                    const entry = JSON.parse(raw);
                    if (entry.expiresAt && now > entry.expiresAt) {
                        keysToRemove.push(key);
                    }
                }
            } catch {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
    } catch {
        // Ignore
    }
}
