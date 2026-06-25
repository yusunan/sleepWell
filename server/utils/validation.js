// ============================================================
// utils/validation.js — Input validation helpers
// ============================================================

/**
 * Validate a username.
 * Rules: alphanumeric + underscore, 3-30 characters.
 */
function isValidUsername(username) {
    if (typeof username !== 'string') return false;
    return /^[a-zA-Z0-9_]{3,30}$/.test(username);
}

/**
 * Validate a password.
 * Rules: 8-128 characters, must contain at least one letter and one digit.
 */
function isValidPassword(password) {
    if (typeof password !== 'string') return false;
    if (password.length < 8 || password.length > 128) return false;
    // At least one letter and one digit
    return /[a-zA-Z]/.test(password) && /\d/.test(password);
}

/**
 * Validate a Steam32 account ID.
 * Rules: numeric string, 4-10 digits.
 */
function isValidAccountId(id) {
    if (typeof id !== 'string' && typeof id !== 'number') return false;
    const str = String(id);
    return /^\d{4,10}$/.test(str);
}

/**
 * Sanitize a display name string.
 * Strips HTML tags, trims, truncates to 100 chars.
 */
function sanitizeDisplayName(name) {
    if (typeof name !== 'string') return '';
    return name
        .replace(/<[^>]*>/g, '')   // strip HTML tags
        .replace(/[<>"']/g, '')     // strip dangerous chars
        .trim()
        .slice(0, 100);
}

/**
 * Validate proxy URL path to prevent path traversal.
 * Only allows: /players/:id[/:subresource]
 */
function isValidProxyPath(path) {
    if (typeof path !== 'string') return false;

    // Must start with /players/
    if (!path.startsWith('/players/')) return false;

    // No path traversal attempts
    if (path.includes('..') || path.includes('//') || path.includes('\\')) return false;

    // Match: /players/:id or /players/:id/subresource
    // Allowed subresources for OpenDota
    const allowedSubresources = [
        'recentMatches', 'matches', 'heroes', 'peers',
        'totals', 'counts', 'wl', 'pros', 'heroStats',
        'ratings', 'rankings', 'records', 'wardmap', 'wordcloud',
    ];

    const parts = path.split('/').filter(Boolean); // ['players', '12345'] or ['players', '12345', 'matches']
    if (parts.length < 2 || parts.length > 3) return false;

    if (parts[0] !== 'players') return false;

    // Account ID must be numeric
    if (!isValidAccountId(parts[1])) return false;

    // Optional subresource
    if (parts.length === 3) {
        if (!allowedSubresources.includes(parts[2])) return false;
    }

    return true;
}

/**
 * Whitelist query parameters for OpenDota proxy.
 * Strips any unexpected parameters.
 */
function filterProxyParams(params) {
    const allowed = [
        'game_mode', 'significant', 'date', 'limit',
        'patch', 'included_account_id', 'hero_id',
        'sort', 'offset', 'project',
    ];

    const filtered = {};
    for (const [key, value] of Object.entries(params)) {
        if (allowed.includes(key) && value !== undefined && value !== null && value !== '') {
            // Validate numeric params
            if (['limit', 'offset'].includes(key)) {
                const n = parseInt(value, 10);
                if (isNaN(n) || n < 0 || n > 1000) continue;
                filtered[key] = String(n);
            } else {
                // String coercion prevents injection
                filtered[key] = String(value);
            }
        }
    }
    return filtered;
}

export {
    isValidUsername,
    isValidPassword,
    isValidAccountId,
    sanitizeDisplayName,
    isValidProxyPath,
    filterProxyParams,
};
