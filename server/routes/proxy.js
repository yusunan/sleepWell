// ============================================================
// routes/proxy.js — OpenDota API proxy with usage tracking
// ============================================================

import { Router } from 'express';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { checkUsageLimit, recordUsage } from '../middleware/usage.js';
import { isValidProxyPath, filterProxyParams } from '../utils/validation.js';

const router = Router();

const OPENDOTA_BASE = 'https://api.opendota.com/api';

/**
 * In-memory cache for proxy responses.
 * Simple Map with TTL-based expiration.
 * Only caches global/shared data (heroes, heroStats), not user-specific data.
 */
const proxyCache = new Map();

const CACHEABLE_PATHS = new Set([
    'heroStats',
    'heroes',
]);

function getCached(key) {
    const entry = proxyCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        proxyCache.delete(key);
        return null;
    }
    return entry.data;
}

function setCache(key, data, ttlMs) {
    proxyCache.set(key, { data, expiresAt: Date.now() + ttlMs });
    // Limit cache size
    if (proxyCache.size > 500) {
        const oldest = proxyCache.keys().next().value;
        proxyCache.delete(oldest);
    }
}

/**
 * GET /api/proxy/*
 *
 * Proxies requests to OpenDota API.
 * - Requires authentication (via requireAuth).
 * - Checks usage limits if _feature query param is set.
 * - Caches global data responses server-side.
 * - Validates URL path and query params for security.
 */
router.get('/*', requireAuth, checkUsageLimit, async (req, res) => {
    try {
        // Extract the OpenDota path from the request
        // req.path will be like '/players/12345/matches' (router is mounted at /api/proxy)
        // req.params[0] captures the wildcard
        const proxyPath = '/' + (req.params[0] || '');

        // Security: validate path
        if (!isValidProxyPath(proxyPath)) {
            return res.status(400).json({
                error: 'invalid_path',
                message: '无效的请求路径',
            });
        }

        // Security: filter query params
        const params = filterProxyParams(req.query);

        // Build OpenDota URL
        const cleanPath = proxyPath.startsWith('/') ? proxyPath.slice(1) : proxyPath;
        const url = new URL(cleanPath, OPENDOTA_BASE);
        for (const [key, value] of Object.entries(params)) {
            url.searchParams.set(key, value);
        }

        // Check server-side cache for cacheable paths
        const subresource = proxyPath.split('/').pop();
        if (CACHEABLE_PATHS.has(subresource)) {
            const cacheKey = url.toString();
            const cached = getCached(cacheKey);
            if (cached) {
                // Still record usage for cached responses
                if (req.usageInfo) {
                    await recordUsage(req.user.id, req.usageInfo.featureName, req.ip);
                }
                return res.json(cached);
            }
        }

        // Forward request to OpenDota
        console.log(`[睡了么 API] Proxy: ${url.pathname}${url.search} (user=${req.user.username}, feature=${req.query._feature || 'background'})`);

        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Sleepwell/2.0 (proxy)',
            },
            signal: AbortSignal.timeout(15000),
        });

        // Parse response
        let data;
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            data = await response.json();
        } else {
            data = await response.text();
        }

        // Handle OpenDota errors
        if (!response.ok) {
            console.warn(`[睡了么 API] OpenDota returned ${response.status} for ${proxyPath}`);
            return res.status(response.status).json({
                error: 'opendota_error',
                status: response.status,
                message: typeof data === 'object' ? (data.error || 'OpenDota API error') : 'OpenDota API error',
            });
        }

        // Cache cacheable responses
        if (CACHEABLE_PATHS.has(subresource)) {
            // Cache hero stats for 1 hour, heroes for 24 hours
            const ttl = subresource === 'heroes' ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
            setCache(url.toString(), data, ttl);
        }

        // Record usage for advanced features
        if (req.usageInfo) {
            await recordUsage(req.user.id, req.usageInfo.featureName, req.ip);
        }

        res.json(data);
    } catch (err) {
        if (err.name === 'TimeoutError' || err.message?.includes('timeout')) {
            console.warn(`[睡了么 API] Proxy timeout: ${req.params[0]}`);
            return res.status(504).json({ error: 'gateway_timeout', message: 'OpenDota API 响应超时' });
        }

        console.error('[睡了么 API] Proxy error:', err.message);
        res.status(502).json({ error: 'proxy_error', message: '代理请求失败' });
    }
});

export default router;
