// ============================================================
// middleware/admin.js — Admin-only access control
// ============================================================

/**
 * Require admin role. Must be used AFTER requireAuth middleware.
 */
function requireAdmin(req, res, next) {
    if (!req.user) {
        return res.status(401).json({
            error: 'unauthorized',
            message: '请先登录',
        });
    }

    if (req.user.role !== 'admin') {
        return res.status(403).json({
            error: 'forbidden',
            message: '仅限管理员操作',
        });
    }

    next();
}

export { requireAdmin };
