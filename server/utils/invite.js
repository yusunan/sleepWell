// ============================================================
// utils/invite.js — Invite code generation and validation
// ============================================================

import crypto from 'crypto';
import { query, transaction } from '../db/pool.js';

/**
 * Generate a random invite code.
 * Format: XXXX-XXXX-XXXX (12 hex chars, uppercase, grouped in 3 blocks of 4)
 * Collision space: 16^12 ≈ 2.8 × 10^14
 */
function generateInviteCode() {
    const bytes = crypto.randomBytes(6);
    const hex = bytes.toString('hex').toUpperCase();
    return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
}

/**
 * Generate a batch of unique invite codes.
 * Retries on collision (extremely unlikely but handled).
 */
async function generateInviteCodes(count, createdBy, { maxUses = 1, description = '', expiresAt = null } = {}) {
    const codes = [];
    const maxRetries = count * 3;
    let attempts = 0;

    while (codes.length < count && attempts < maxRetries) {
        attempts++;
        const code = generateInviteCode();

        try {
            await query(
                `INSERT INTO invite_codes (code, created_by, description, max_uses, expires_at)
                 VALUES (?, ?, ?, ?, ?)`,
                [code, createdBy, description, maxUses, expiresAt]
            );
            codes.push(code);
        } catch (err) {
            // Duplicate code (collision) → skip and retry
            if (err.code === 'ER_DUP_ENTRY') {
                continue;
            }
            throw err;
        }
    }

    if (codes.length < count) {
        throw new Error(`Failed to generate ${count} codes after ${attempts} attempts`);
    }

    return codes;
}

/**
 * Validate an invite code for registration.
 * Returns { valid: true } or { valid: false, error: 'ERROR_CODE' }.
 * Consumes one use atomically.
 */
async function validateAndUseInviteCode(code) {
    const normalized = code.trim().toUpperCase();

    return transaction(async (conn) => {
        // Lock the row for update to prevent race conditions
        const [rows] = await conn.execute(
            `SELECT id, max_uses, use_count, expires_at, is_active
             FROM invite_codes WHERE code = ? FOR UPDATE`,
            [normalized]
        );

        if (rows.length === 0) {
            return { valid: false, error: 'INVALID_INVITE_CODE' };
        }

        const record = rows[0];

        if (!record.is_active) {
            return { valid: false, error: 'INVITE_CODE_DEACTIVATED' };
        }

        if (record.expires_at && new Date(record.expires_at) < new Date()) {
            return { valid: false, error: 'INVITE_CODE_EXPIRED' };
        }

        if (record.max_uses !== null && record.use_count >= record.max_uses) {
            return { valid: false, error: 'INVITE_CODE_EXHAUSTED' };
        }

        // Increment use count
        await conn.execute(
            'UPDATE invite_codes SET use_count = use_count + 1 WHERE id = ?',
            [record.id]
        );

        return { valid: true };
    });
}

/**
 * Get all invite codes (admin view).
 */
async function getInviteCodes(page = 1, limit = 20) {
    const offset = (page - 1) * limit;

    const [rows, countResult] = await Promise.all([
        query(
            `SELECT ic.*, u.username AS created_by_username
             FROM invite_codes ic
             LEFT JOIN users u ON ic.created_by = u.id
             ORDER BY ic.created_at DESC
             LIMIT ? OFFSET ?`,
            [limit, offset]
        ),
        query('SELECT COUNT(*) AS total FROM invite_codes'),
    ]);

    return {
        codes: rows,
        total: countResult[0].total,
        page,
        limit,
    };
}

export { generateInviteCode, generateInviteCodes, validateAndUseInviteCode, getInviteCodes };
