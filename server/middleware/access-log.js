// ============================================================
// middleware/access-log.js — Access log middleware
// ============================================================
//
// Records every API request to the access_logs table.
// Captures: user info (from JWT), IP, UA, path, method, status,
// duration, and referer.
//
// Skips: /api/health, /favicon.ico, OPTIONS preflight.
//
// Uses a fire-and-forget insert to avoid impacting response time.
// Failed inserts are silently discarded (logging is best-effort).
// ============================================================

import { query } from '../db/pool.js';

// Actions that map to different request types
function classifyAction(path, method) {
    if (path.startsWith('/api/auth/register')) return 'register';
    if (path.startsWith('/api/auth/login'))    return 'login';
    if (path.startsWith('/api/auth/logout'))   return 'logout';
    if (path.startsWith('/api/auth/refresh'))  return 'token_refresh';
    if (path.startsWith('/api/proxy/'))        return 'proxy_api_call';
    if (path.startsWith('/api/usage/'))        return 'usage_query';
    if (path.startsWith('/api/invites/'))      return 'invite_manage';
    if (path.startsWith('/api/log/'))          return 'page_view';
    if (path.startsWith('/api/public/'))       return 'public_data';
    if (path.startsWith('/api/auth/me'))       return 'session_check';
    return 'api_request';
}

// Skip logging for these paths
const SKIP_PATHS = new Set([
    '/api/health',
    '/favicon.ico',
]);

function shouldSkip(path, method) {
    if (method === 'OPTIONS') return true;
    if (SKIP_PATHS.has(path)) return true;
    return false;
}

// Truncate long fields to fit DB column limits
function truncate(str, maxLen) {
    if (!str) return null;
    return str.length > maxLen ? str.slice(0, maxLen) : str;
}

/**
 * Access log middleware.
 * Must be placed AFTER cookie-parser and any auth middleware.
 * Uses res.on('finish') to capture status code and duration.
 */
function accessLogMiddleware(req, res, next) {
    // Skip uninteresting requests
    if (shouldSkip(req.path, req.method)) {
        return next();
    }

    const startTime = Date.now();

    // Capture response finish to get status code and duration
    res.on('finish', () => {
        const duration = Date.now() - startTime;

        // Extract user info (may be set by requireAuth or optionalAuth)
        const userId = req.user?.id || null;
        const username = req.user?.username || null;

        // Build log entry
        const logEntry = {
            user_id: userId,
            username: truncate(username, 50),
            action: classifyAction(req.path, req.method),
            path: truncate(req.originalUrl, 500),
            method: req.method,
            ip_address: req.ip || req.socket?.remoteAddress || null,
            user_agent: truncate(req.headers['user-agent'], 500),
            referer: truncate(req.headers.referer || req.headers.referrer, 500),
            status_code: res.statusCode,
            duration_ms: duration,
            extra: null,
        };

        // Fire-and-forget: don't await, don't block
        insertAccessLog(logEntry);
    });

    next();
}

/**
 * Insert a single access log entry asynchronously.
 * Errors are silently ignored (logging is best-effort).
 */
async function insertAccessLog(entry) {
    try {
        await query(
            `INSERT INTO access_logs
             (user_id, username, action, path, method, ip_address,
              user_agent, referer, status_code, duration_ms, extra)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                entry.user_id,
                entry.username,
                entry.action,
                entry.path,
                entry.method,
                entry.ip_address,
                entry.user_agent,
                entry.referer,
                entry.status_code,
                entry.duration_ms,
                entry.extra ? JSON.stringify(entry.extra) : null,
            ]
        );
    } catch (err) {
        // Log to console but don't fail the request
        if (process.env.NODE_ENV !== 'production') {
            console.warn('[睡了么 API] Access log insert failed:', err.message);
        }
    }
}

/**
 * Direct log function for use outside middleware (e.g., in route handlers
 * when you need to log an event with extra metadata).
 *
 * @param {object} entry
 * @param {number|null} entry.user_id
 * @param {string|null} entry.username
 * @param {string} entry.action
 * @param {string|null} entry.path
 * @param {string} entry.method
 * @param {string|null} entry.ip_address
 * @param {string|null} entry.user_agent
 * @param {number|null} entry.status_code
 * @param {object|null} entry.extra - Will be JSON-stringified
 */
function logAccess(entry) {
    insertAccessLog({
        user_id: entry.user_id || null,
        username: truncate(entry.username, 50),
        action: entry.action || 'custom',
        path: truncate(entry.path, 500),
        method: entry.method || 'POST',
        ip_address: entry.ip_address || null,
        user_agent: truncate(entry.user_agent, 500),
        referer: null,
        status_code: entry.status_code || null,
        duration_ms: null,
        extra: entry.extra || null,
    });
}

export { accessLogMiddleware, logAccess };
