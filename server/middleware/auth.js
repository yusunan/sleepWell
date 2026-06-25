// ============================================================
// middleware/auth.js — JWT authentication middleware
// ============================================================

import { verifyAccessToken } from '../utils/jwt.js';
import { query } from '../db/pool.js';

/**
 * Require a valid JWT access token.
 * Attaches `req.user = { id, username, role }` on success.
 * Returns 401 on failure.
 */
async function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            error: 'unauthorized',
            message: '请先登录',
        });
    }

    const token = authHeader.slice(7);

    let payload;
    try {
        payload = verifyAccessToken(token);
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({
                error: 'token_expired',
                message: '登录已过期，请重新登录',
            });
        }
        return res.status(401).json({
            error: 'invalid_token',
            message: '无效的登录凭证',
        });
    }

    if (!payload.sub) {
        return res.status(401).json({
            error: 'invalid_token',
            message: '无效的登录凭证',
        });
    }

    // Verify user still exists and is active
    try {
        const rows = await query(
            'SELECT id, username, role, is_active FROM users WHERE id = ?',
            [payload.sub]
        );

        if (rows.length === 0 || !rows[0].is_active) {
            return res.status(401).json({
                error: 'user_inactive',
                message: '账号已被禁用',
            });
        }

        req.user = {
            id: rows[0].id,
            username: rows[0].username,
            role: rows[0].role,
        };
    } catch (err) {
        console.error('[睡了么 API] Auth user lookup failed:', err.message);
        // If DB is down, still allow the request with payload data
        // (degraded mode — prefer availability over strict security for a game tool)
        req.user = {
            id: payload.sub,
            username: payload.username || 'unknown',
            role: payload.role || 'free',
        };
    }

    next();
}

/**
 * Optionally authenticate. Attaches req.user if token is valid, but
 * does NOT reject the request if no token is present.
 */
async function optionalAuth(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return next();
    }

    const token = authHeader.slice(7);

    try {
        const payload = verifyAccessToken(token);
        if (payload.sub) {
            req.user = {
                id: payload.sub,
                username: payload.username || 'unknown',
                role: payload.role || 'free',
            };
        }
    } catch {
        // Ignore invalid tokens in optional mode
    }

    next();
}

export { requireAuth, optionalAuth };
