// ============================================================
// routes/usage.js — Usage limit queries
// ============================================================

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getUsageSummary } from '../middleware/usage.js';

const router = Router();

// --- GET /api/usage/my-limits ---
router.get('/my-limits', requireAuth, async (req, res) => {
    try {
        const summary = await getUsageSummary(req.user.id, req.user.role);
        res.json({
            role: req.user.role,
            limits: summary,
        });
    } catch (err) {
        console.error('[睡了么 API] Get usage limits error:', err);
        // Fallback for free users
        res.json({
            role: req.user.role,
            limits: {
                meta_heroes: { max: 3, used: 0, period: 'daily' },
                pro_players: { max: 3, used: 0, period: 'daily' },
                hero_recommend: { max: 3, used: 0, period: 'daily' },
                all_matches: { max: 3, used: 0, period: 'daily' },
            },
        });
    }
});

export default router;
