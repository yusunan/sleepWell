// ============================================================
// middleware/usage.js — Usage limit check middleware
// ============================================================

import { query, transaction } from '../db/pool.js';

/**
 * Feature names mapped to their respective advanced features.
 */
const FEATURE_NAMES = new Set([
    'meta_heroes',
    'pro_players',
    'hero_recommend',
    'all_matches',
]);

/**
 * Check if the user has remaining usage for a given feature.
 * Must be used AFTER requireAuth middleware.
 *
 * Query param `_feature` determines which feature to check.
 * If `_feature` is absent or is 'background', no limit is checked.
 *
 * On success: proceeds to the route handler.
 * On limit exceeded: returns 429 with resetsAt timestamp.
 */
async function checkUsageLimit(req, res, next) {
    // If no user (shouldn't happen if requireAuth ran first), skip
    if (!req.user) {
        return next();
    }

    const featureName = req.query._feature;

    // No feature specified → background request, don't count
    if (!featureName || featureName === 'background' || !FEATURE_NAMES.has(featureName)) {
        return next();
    }

    // Admin users are exempt from limits
    if (req.user.role === 'admin') {
        return next();
    }

    try {
        // Get the limit for this user's role
        const limits = await query(
            'SELECT max_count, period FROM usage_limits WHERE role = ? AND feature_name = ?',
            [req.user.role, featureName]
        );

        if (limits.length === 0) {
            // No limit defined for this role/feature — allow
            return next();
        }

        const { max_count: maxCount, period } = limits[0];

        // Calculate the period start
        const now = new Date();
        let periodStart;
        switch (period) {
            case 'weekly':
                periodStart = new Date(now);
                periodStart.setDate(now.getDate() - now.getDay());
                periodStart.setHours(0, 0, 0, 0);
                break;
            case 'monthly':
                periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
                break;
            case 'daily':
            default:
                periodStart = new Date(now);
                periodStart.setHours(0, 0, 0, 0);
                break;
        }

        // Count usage in the current period
        const usageRows = await query(
            `SELECT COALESCE(SUM(consumed_count), 0) AS used
             FROM usage_records
             WHERE user_id = ? AND feature_name = ? AND created_at >= ?`,
            [req.user.id, featureName, periodStart]
        );

        const used = usageRows[0].used;

        if (used >= maxCount) {
            // Calculate when the limit resets
            const resetsAt = new Date(periodStart);
            switch (period) {
                case 'daily':
                    resetsAt.setDate(resetsAt.getDate() + 1);
                    break;
                case 'weekly':
                    resetsAt.setDate(resetsAt.getDate() + 7);
                    break;
                case 'monthly':
                    resetsAt.setMonth(resetsAt.getMonth() + 1);
                    break;
            }

            return res.status(429).json({
                error: 'daily_limit_reached',
                message: `今日使用次数已达上限 (${used}/${maxCount})，请明日再试`,
                used,
                max: maxCount,
                resetsAt: resetsAt.toISOString(),
            });
        }

        // Attach usage info to request for the route handler to record
        req.usageInfo = {
            featureName,
            maxCount,
            used,
        };
    } catch (err) {
        console.error('[睡了么 API] Usage limit check failed:', err.message);
        // On error, allow the request (fail open for availability)
    }

    next();
}

/**
 * Record a usage event. Called after a successful proxy request.
 */
async function recordUsage(userId, featureName, ipAddress) {
    if (!userId || !featureName || !FEATURE_NAMES.has(featureName)) {
        return;
    }

    try {
        await query(
            'INSERT INTO usage_records (user_id, feature_name, ip_address) VALUES (?, ?, ?)',
            [userId, featureName, ipAddress || null]
        );
    } catch (err) {
        // Non-critical — log and continue
        console.error('[睡了么 API] Failed to record usage:', err.message);
    }
}

/**
 * Get usage summary for a user.
 */
async function getUsageSummary(userId, role) {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    // Get limits for the role
    const limits = await query(
        'SELECT feature_name, max_count, period FROM usage_limits WHERE role = ?',
        [role]
    );

    // Get today's usage counts
    const usage = await query(
        `SELECT feature_name, COALESCE(SUM(consumed_count), 0) AS used
         FROM usage_records
         WHERE user_id = ? AND created_at >= ?
         GROUP BY feature_name`,
        [userId, todayStart]
    );

    const usageMap = {};
    for (const row of usage) {
        usageMap[row.feature_name] = row.used;
    }

    const result = {};
    for (const limit of limits) {
        result[limit.feature_name] = {
            max: limit.max_count,
            used: usageMap[limit.feature_name] || 0,
            period: limit.period,
        };
    }

    return result;
}

export { checkUsageLimit, recordUsage, getUsageSummary };
