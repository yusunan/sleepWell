// ============================================================
// routes/log.js — Frontend page view / event logging
// ============================================================
//
// Lightweight endpoint for the frontend to report page views
// and feature usage events. Uses navigator.sendBeacon-compatible
// POST for reliability on page unload.
//
// POST /api/log
//   Body: { action: 'page_view' | 'feature_open', path?, extra? }
//   Headers: Authorization (optional, for authenticated users)

import { Router } from 'express';
import { optionalAuth } from '../middleware/auth.js';
import { logAccess } from '../middleware/access-log.js';

const router = Router();

// Allowed frontend actions
const ALLOWED_ACTIONS = new Set([
    'page_view',        // User opens/refreshes the page
    'feature_open',     // User clicks an advanced feature button
    'search',           // User searches for a Steam32 ID
    'dashboard_view',   // User views a player dashboard
]);

router.post('/', optionalAuth, async (req, res) => {
    try {
        const { action, path, extra } = req.body;

        // Validate action
        if (!action || !ALLOWED_ACTIONS.has(action)) {
            return res.status(400).json({ error: 'invalid_action' });
        }

        // Log the event
        logAccess({
            user_id: req.user?.id || null,
            username: req.user?.username || null,
            action,
            path: path || null,
            method: 'POST',
            ip_address: req.ip,
            user_agent: req.headers['user-agent'],
            status_code: 200,
            extra: extra || null,
        });

        // Respond immediately (fire-and-forget on the DB side is handled in logAccess)
        res.status(200).json({ ok: true });
    } catch (err) {
        // Silently ignore — logging should never break the user experience
        res.status(200).json({ ok: true });
    }
});

export default router;
