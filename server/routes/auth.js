// ============================================================
// routes/auth.js — Authentication routes
// ============================================================

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { query } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import {
    generateAccessToken,
    createRefreshToken,
    validateRefreshToken,
    revokeRefreshToken,
    revokeAllUserTokens,
    rotateRefreshToken,
    REFRESH_EXPIRES_IN_DAYS,
} from '../utils/jwt.js';
import { validateAndUseInviteCode } from '../utils/invite.js';
import { isValidUsername, isValidPassword, sanitizeDisplayName } from '../utils/validation.js';

const router = Router();

// --- Rate limiters ---
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'too_many_attempts', message: '登录尝试过于频繁，请15分钟后再试' },
});

const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'too_many_attempts', message: '注册尝试过于频繁，请1小时后再试' },
});

// --- Helpers ---

function setRefreshCookie(res, rawToken, expiresAt) {
    res.cookie('refreshToken', rawToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        expires: expiresAt,
        path: '/api/auth',
    });
}

function clearRefreshCookie(res) {
    res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/api/auth',
    });
}

// --- POST /api/auth/register ---
router.post('/register', registerLimiter, async (req, res) => {
    try {
        const { username, password, invite_code } = req.body;

        // Validate invite code
        if (!invite_code) {
            return res.status(400).json({ error: 'validation_error', field: 'invite_code', message: '请输入邀请码' });
        }

        // Validate username
        if (!isValidUsername(username)) {
            return res.status(400).json({ error: 'validation_error', field: 'username', message: '用户名须为3-30位字母、数字或下划线' });
        }

        // Validate password
        if (!isValidPassword(password)) {
            return res.status(400).json({ error: 'validation_error', field: 'password', message: '密码须为8-128位，且至少包含一个字母和一个数字' });
        }

        // Check invite code validity (also increments usage atomically)
        const inviteResult = await validateAndUseInviteCode(invite_code);
        if (!inviteResult.valid) {
            const errorMessages = {
                INVALID_INVITE_CODE: '邀请码无效',
                INVITE_CODE_DEACTIVATED: '邀请码已停用',
                INVITE_CODE_EXPIRED: '邀请码已过期',
                INVITE_CODE_EXHAUSTED: '邀请码已被使用完',
            };
            return res.status(403).json({
                error: inviteResult.error,
                message: errorMessages[inviteResult.error] || '邀请码无效',
            });
        }

        // Check if username is already taken
        const existing = await query('SELECT id FROM users WHERE username = ?', [username]);
        if (existing.length > 0) {
            return res.status(409).json({ error: 'username_taken', message: '用户名已被占用' });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, 12);

        // Create user
        const result = await query(
            'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
            [username, passwordHash, 'free']
        );
        const userId = result.insertId;

        // Generate tokens
        const tokenPayload = { sub: userId, username, role: 'free' };
        const accessToken = generateAccessToken(tokenPayload);
        const { rawToken, expiresAt } = await createRefreshToken(userId);

        // Set refresh token cookie
        setRefreshCookie(res, rawToken, expiresAt);

        console.log(`[睡了么 API] User registered: ${username} (id=${userId})`);

        res.status(201).json({
            token: accessToken,
            user: { id: userId, username, display_name: '', role: 'free' },
        });
    } catch (err) {
        console.error('[睡了么 API] Register error:', err);
        res.status(500).json({ error: 'internal_error', message: '注册失败，请稍后重试' });
    }
});

// --- POST /api/auth/login ---
router.post('/login', loginLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'validation_error', message: '请输入用户名和密码' });
        }

        // Find user
        const rows = await query(
            'SELECT id, username, password_hash, display_name, role, is_active FROM users WHERE username = ?',
            [username]
        );

        if (rows.length === 0) {
            return res.status(401).json({ error: 'invalid_credentials', message: '用户名或密码错误' });
        }

        const user = rows[0];

        if (!user.is_active) {
            return res.status(403).json({ error: 'account_disabled', message: '账号已被禁用' });
        }

        // Verify password
        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) {
            return res.status(401).json({ error: 'invalid_credentials', message: '用户名或密码错误' });
        }

        // Generate tokens
        const tokenPayload = { sub: user.id, username: user.username, role: user.role };
        const accessToken = generateAccessToken(tokenPayload);
        const { rawToken, expiresAt } = await createRefreshToken(user.id);

        // Update last login
        await query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);

        // Set refresh token cookie
        setRefreshCookie(res, rawToken, expiresAt);

        console.log(`[睡了么 API] User logged in: ${username} (id=${user.id})`);

        res.json({
            token: accessToken,
            user: {
                id: user.id,
                username: user.username,
                display_name: user.display_name || '',
                role: user.role,
            },
        });
    } catch (err) {
        console.error('[睡了么 API] Login error:', err);
        res.status(500).json({ error: 'internal_error', message: '登录失败，请稍后重试' });
    }
});

// --- POST /api/auth/refresh ---
router.post('/refresh', async (req, res) => {
    try {
        // Read refresh token from cookie OR request body
        const rawToken = req.cookies?.refreshToken || req.body?.refreshToken;

        if (!rawToken) {
            return res.status(401).json({ error: 'no_refresh_token', message: '请重新登录' });
        }

        // Validate and get userId
        const result = await validateRefreshToken(rawToken);
        if (!result) {
            clearRefreshCookie(res);
            return res.status(401).json({ error: 'invalid_refresh_token', message: '登录已过期，请重新登录' });
        }

        // Get fresh user data
        const rows = await query(
            'SELECT id, username, role, is_active FROM users WHERE id = ?',
            [result.userId]
        );

        if (rows.length === 0 || !rows[0].is_active) {
            clearRefreshCookie(res);
            return res.status(401).json({ error: 'user_inactive', message: '账号已被禁用' });
        }

        const user = rows[0];

        // Rotate refresh token (revoke old, issue new)
        const { rawToken: newRawToken, expiresAt } = await rotateRefreshToken(result.tokenId, user.id);

        // Generate new access token
        const tokenPayload = { sub: user.id, username: user.username, role: user.role };
        const accessToken = generateAccessToken(tokenPayload);

        // Set new cookie
        setRefreshCookie(res, newRawToken, expiresAt);

        res.json({
            token: accessToken,
            user: {
                id: user.id,
                username: user.username,
                display_name: '',
                role: user.role,
            },
        });
    } catch (err) {
        console.error('[睡了么 API] Refresh error:', err);
        res.status(500).json({ error: 'internal_error', message: '刷新失败，请重新登录' });
    }
});

// --- POST /api/auth/logout ---
router.post('/logout', async (req, res) => {
    try {
        const rawToken = req.cookies?.refreshToken || req.body?.refreshToken;

        if (rawToken) {
            const result = await validateRefreshToken(rawToken);
            if (result) {
                await revokeRefreshToken(result.tokenId);
            }
        }

        clearRefreshCookie(res);
        res.json({ message: '已登出' });
    } catch (err) {
        console.error('[睡了么 API] Logout error:', err);
        clearRefreshCookie(res);
        res.json({ message: '已登出' });
    }
});

// --- GET /api/auth/me ---
router.get('/me', requireAuth, async (req, res) => {
    try {
        const rows = await query(
            'SELECT id, username, display_name, role, created_at, last_login_at FROM users WHERE id = ?',
            [req.user.id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'user_not_found', message: '用户不存在' });
        }

        res.json({ user: rows[0] });
    } catch (err) {
        console.error('[睡了么 API] Me error:', err);
        // Fallback to token data
        res.json({
            user: {
                id: req.user.id,
                username: req.user.username,
                display_name: '',
                role: req.user.role,
            },
        });
    }
});

// --- PUT /api/auth/me/display-name ---
router.put('/me/display-name', requireAuth, async (req, res) => {
    try {
        const { display_name } = req.body;
        const sanitized = sanitizeDisplayName(display_name);

        await query('UPDATE users SET display_name = ? WHERE id = ?', [sanitized, req.user.id]);

        res.json({ user: { ...req.user, display_name: sanitized } });
    } catch (err) {
        console.error('[睡了么 API] Update display name error:', err);
        res.status(500).json({ error: 'internal_error', message: '更新失败' });
    }
});

export default router;
