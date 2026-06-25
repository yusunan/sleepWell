// ============================================================
// server.js — 睡了么 Backend API Entry Point
// ============================================================

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';

import { testConnection } from './db/pool.js';
import { accessLogMiddleware } from './middleware/access-log.js';
import authRoutes from './routes/auth.js';
import inviteRoutes from './routes/invites.js';
import proxyRoutes from './routes/proxy.js';
import usageRoutes from './routes/usage.js';
import logRoutes from './routes/log.js';

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'https://sleepwell-887.pages.dev';
const isProduction = process.env.NODE_ENV === 'production';

// --- Trust proxy (Railway / reverse proxy) ---
app.set('trust proxy', 1);

// --- Security headers ---
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// --- CORS ---
app.use(cors({
    origin: CORS_ORIGIN,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 86400, // 24h preflight cache
}));

// --- Body parsing (tight limits for auth payloads) ---
app.use(express.json({ limit: '4kb' }));

// --- Cookie parser (for refresh tokens) ---
app.use(cookieParser());

// --- Logging ---
app.use(morgan(isProduction ? 'combined' : 'dev'));

// --- Access log (fire-and-forget, non-blocking) ---
app.use(accessLogMiddleware);

// --- Global rate limit ---
app.use(rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'too_many_requests', message: '请求过于频繁，请稍后再试' },
}));

// --- Health check ---
app.get('/api/health', async (_req, res) => {
    try {
        const { query } = await import('./db/pool.js');
        await query('SELECT 1');
        res.json({ status: 'ok', uptime: process.uptime(), db: 'connected' });
    } catch {
        res.status(503).json({ status: 'degraded', uptime: process.uptime(), db: 'disconnected' });
    }
});

// --- Public: usage limits for display on frontend ---
app.get('/api/public/limits', async (_req, res) => {
    try {
        const { query } = await import('./db/pool.js');
        const limits = await query('SELECT role, feature_name, max_count, period FROM usage_limits ORDER BY role, feature_name');
        const grouped = {};
        for (const row of limits) {
            if (!grouped[row.role]) grouped[row.role] = {};
            grouped[row.role][row.feature_name] = { maxCount: row.max_count, period: row.period };
        }
        res.json({ limits: grouped });
    } catch (err) {
        console.error('[睡了么 API] Failed to fetch public limits:', err.message);
        // Fallback static data
        res.json({
            limits: {
                free: {
                    meta_heroes: { maxCount: 3, period: 'daily' },
                    pro_players: { maxCount: 3, period: 'daily' },
                    hero_recommend: { maxCount: 3, period: 'daily' },
                    all_matches: { maxCount: 3, period: 'daily' },
                },
            },
        });
    }
});

// --- Routes ---
app.use('/api/auth', authRoutes);
app.use('/api/invites', inviteRoutes);
app.use('/api/proxy', proxyRoutes);
app.use('/api/usage', usageRoutes);
app.use('/api/log', logRoutes);

// --- 404 handler ---
app.use((_req, res) => {
    res.status(404).json({ error: 'not_found', message: '接口不存在' });
});

// --- Global error handler ---
app.use((err, _req, res, _next) => {
    console.error('[睡了么 API] Unhandled error:', err);
    const status = err.status || err.statusCode || 500;
    res.status(status).json({
        error: 'internal_error',
        message: isProduction ? '服务器内部错误' : err.message,
    });
});

// --- Start ---
async function start() {
    console.log('[睡了么 API] Starting server...');
    console.log(`[睡了么 API] Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`[睡了么 API] CORS origin: ${CORS_ORIGIN}`);

    await testConnection();

    app.listen(PORT, () => {
        console.log(`[睡了么 API] Server listening on port ${PORT}`);
    });
}

start().catch(err => {
    console.error('[睡了么 API] Failed to start:', err);
    process.exit(1);
});

export default app;
