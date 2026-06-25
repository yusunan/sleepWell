// ============================================================
// utils/jwt.js — JWT and refresh token management
// ============================================================

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { query, transaction } from '../db/pool.js';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
const REFRESH_EXPIRES_IN_DAYS = parseInt(process.env.REFRESH_TOKEN_EXPIRES_IN_DAYS, 10) || 7;

if (!JWT_SECRET) {
    console.error('[睡了么 API] Fatal: JWT_SECRET environment variable is not set');
    process.exit(1);
}

// --- Access Token (JWT) ---

function generateAccessToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function verifyAccessToken(token) {
    return jwt.verify(token, JWT_SECRET);
}

// --- Refresh Token ---

function generateRefreshToken() {
    return crypto.randomBytes(32).toString('hex');
}

function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Create a new refresh token in the database.
 * Returns the raw token (sent to client) and the stored record.
 */
async function createRefreshToken(userId) {
    const rawToken = generateRefreshToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + REFRESH_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000);

    await query(
        'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
        [userId, tokenHash, expiresAt]
    );

    return { rawToken, expiresAt };
}

/**
 * Validate a refresh token. Returns { userId, tokenId } if valid, null otherwise.
 * Also handles breach detection: if a revoked token is reused, revoke ALL user tokens.
 */
async function validateRefreshToken(rawToken) {
    if (!rawToken) return null;

    const tokenHash = hashToken(rawToken);

    const rows = await query(
        'SELECT id, user_id, revoked, expires_at FROM refresh_tokens WHERE token_hash = ?',
        [tokenHash]
    );

    if (rows.length === 0) return null;

    const record = rows[0];

    // Check expiry
    if (new Date(record.expires_at) < new Date()) {
        return null;
    }

    // Breach detection: if a revoked token is being used, revoke ALL tokens for this user
    if (record.revoked) {
        console.warn(`[睡了么 API] Breach detected: revoked refresh token reused for user ${record.user_id}`);
        await query(
            'UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = ?',
            [record.user_id]
        );
        return null;
    }

    return { userId: record.user_id, tokenId: record.id };
}

/**
 * Revoke a specific refresh token.
 */
async function revokeRefreshToken(tokenId) {
    await query('UPDATE refresh_tokens SET revoked = TRUE WHERE id = ?', [tokenId]);
}

/**
 * Revoke all refresh tokens for a user.
 */
async function revokeAllUserTokens(userId) {
    await query('UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = ?', [userId]);
}

/**
 * Rotate refresh token: revoke old, create new, all in a transaction.
 */
async function rotateRefreshToken(oldTokenId, userId) {
    return transaction(async (conn) => {
        // Revoke the old token
        await conn.execute('UPDATE refresh_tokens SET revoked = TRUE WHERE id = ?', [oldTokenId]);

        // Create new token
        const rawToken = generateRefreshToken();
        const tokenHash = hashToken(rawToken);
        const expiresAt = new Date(Date.now() + REFRESH_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000);

        await conn.execute(
            'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
            [userId, tokenHash, expiresAt]
        );

        return { rawToken, expiresAt };
    });
}

/**
 * Clean up expired/revoked refresh tokens.
 */
async function cleanupExpiredTokens() {
    const result = await query(
        "DELETE FROM refresh_tokens WHERE expires_at < NOW() - INTERVAL 1 DAY OR (revoked = TRUE AND created_at < NOW() - INTERVAL 1 DAY)"
    );
    if (result.affectedRows > 0) {
        console.log(`[睡了么 API] Cleaned up ${result.affectedRows} expired refresh tokens`);
    }
}

// Periodic cleanup every hour
setInterval(cleanupExpiredTokens, 60 * 60 * 1000);

export {
    generateAccessToken,
    verifyAccessToken,
    createRefreshToken,
    validateRefreshToken,
    revokeRefreshToken,
    revokeAllUserTokens,
    rotateRefreshToken,
    REFRESH_EXPIRES_IN_DAYS,
};
