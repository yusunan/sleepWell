// ============================================================
// routes/invites.js — Invite code management (admin only)
// ============================================================

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/admin.js';
import { generateInviteCodes, getInviteCodes } from '../utils/invite.js';
import { query } from '../db/pool.js';

const router = Router();

// All routes require authentication + admin role
router.use(requireAuth, requireAdmin);

// --- POST /api/invites — Generate invite codes ---
router.post('/', async (req, res) => {
    try {
        const { quantity = 1, max_uses = 1, description = '', expires_in_days } = req.body;

        const qty = parseInt(quantity, 10);
        if (isNaN(qty) || qty < 1 || qty > 100) {
            return res.status(400).json({ error: 'validation_error', field: 'quantity', message: '数量须为 1-100' });
        }

        const uses = max_uses === null ? null : parseInt(max_uses, 10);
        if (uses !== null && (isNaN(uses) || uses < 1)) {
            return res.status(400).json({ error: 'validation_error', field: 'max_uses', message: '使用次数须 >= 1' });
        }

        let expiresAt = null;
        if (expires_in_days) {
            const days = parseInt(expires_in_days, 10);
            if (isNaN(days) || days < 1) {
                return res.status(400).json({ error: 'validation_error', field: 'expires_in_days', message: '过期天数须 >= 1' });
            }
            expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
        }

        const codes = await generateInviteCodes(qty, req.user.id, {
            maxUses: uses,
            description: (description || '').trim().slice(0, 255),
            expiresAt,
        });

        console.log(`[睡了么 API] Admin ${req.user.username} generated ${codes.length} invite codes`);

        res.status(201).json({ codes });
    } catch (err) {
        console.error('[睡了么 API] Generate invites error:', err);
        res.status(500).json({ error: 'internal_error', message: '生成邀请码失败' });
    }
});

// --- GET /api/invites — List invite codes ---
router.get('/', async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const result = await getInviteCodes(page, 20);
        res.json(result);
    } catch (err) {
        console.error('[睡了么 API] List invites error:', err);
        res.status(500).json({ error: 'internal_error', message: '获取邀请码列表失败' });
    }
});

// --- DELETE /api/invites/:code — Deactivate an invite code ---
router.delete('/:code', async (req, res) => {
    try {
        const { code } = req.params;
        const normalized = code.trim().toUpperCase();

        const result = await query(
            'UPDATE invite_codes SET is_active = FALSE WHERE code = ?',
            [normalized]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'not_found', message: '邀请码不存在' });
        }

        console.log(`[睡了么 API] Admin ${req.user.username} deactivated invite code: ${normalized}`);

        res.json({ message: '邀请码已停用' });
    } catch (err) {
        console.error('[睡了么 API] Deactivate invite error:', err);
        res.status(500).json({ error: 'internal_error', message: '停用邀请码失败' });
    }
});

export default router;
