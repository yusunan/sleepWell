// ============================================================
// auth-ui.js — Login and registration modal UI
// ============================================================

import { login, register, logout, isAuthenticated, getCurrentUser } from './auth.js';

/**
 * Show the login modal.
 * @param {object} [opts]
 * @param {string} [opts.message] — Optional message to show (e.g. "请先登录")
 * @param {Function} [opts.onSuccess] — Called after successful login
 */
export function showLoginModal(opts = {}) {
    const { message = '', onSuccess = null } = opts;

    const container = document.getElementById('modal-container');
    if (!container) return;

    const html = `
        <div class="modal-overlay" id="modal-overlay">
            <div class="modal-content auth-modal">
                <button class="modal-close" data-action="close-modal">&times;</button>
                <h2>🔐 登录</h2>
                ${message ? `<p class="auth-message">${escapeHtml(message)}</p>` : ''}
                <form id="login-form" class="auth-form">
                    <div class="form-group">
                        <label for="login-username">用户名</label>
                        <input type="text" id="login-username" class="auth-input"
                               placeholder="3-30位字母、数字或下划线"
                               autocomplete="username" required>
                    </div>
                    <div class="form-group">
                        <label for="login-password">密码</label>
                        <input type="password" id="login-password" class="auth-input"
                               placeholder="至少8位，含字母和数字"
                               autocomplete="current-password" required>
                    </div>
                    <div id="login-error" class="auth-error" style="display:none;"></div>
                    <button type="submit" class="btn btn-primary auth-submit" id="login-submit">
                        登录
                    </button>
                </form>
                <p class="auth-switch">
                    还没有账号？
                    <a href="#" id="switch-to-register">注册新账号</a>
                </p>
            </div>
        </div>
    `;

    container.innerHTML = html;
    bindAuthModalEvents(onSuccess);
}

/**
 * Show the registration modal.
 * @param {object} [opts]
 * @param {Function} [opts.onSuccess] — Called after successful registration
 */
export function showRegisterModal(opts = {}) {
    const { onSuccess = null } = opts;

    const container = document.getElementById('modal-container');
    if (!container) return;

    const html = `
        <div class="modal-overlay" id="modal-overlay">
            <div class="modal-content auth-modal">
                <button class="modal-close" data-action="close-modal">&times;</button>
                <h2>✨ 注册新账号</h2>
                <p class="auth-hint">需要邀请码才能注册</p>
                <form id="register-form" class="auth-form">
                    <div class="form-group">
                        <label for="reg-username">用户名</label>
                        <input type="text" id="reg-username" class="auth-input"
                               placeholder="3-30位字母、数字或下划线"
                               autocomplete="username" required>
                    </div>
                    <div class="form-group">
                        <label for="reg-password">密码</label>
                        <input type="password" id="reg-password" class="auth-input"
                               placeholder="至少8位，含字母和数字"
                               autocomplete="new-password" required>
                    </div>
                    <div class="form-group">
                        <label for="reg-invite-code">邀请码</label>
                        <input type="text" id="reg-invite-code" class="auth-input"
                               placeholder="XXXX-XXXX-XXXX" required>
                    </div>
                    <div id="register-error" class="auth-error" style="display:none;"></div>
                    <button type="submit" class="btn btn-primary auth-submit" id="register-submit">
                        注册
                    </button>
                </form>
                <p class="auth-switch">
                    已有账号？
                    <a href="#" id="switch-to-login">去登录</a>
                </p>
            </div>
        </div>
    `;

    container.innerHTML = html;
    bindAuthModalEvents(onSuccess);
}

/**
 * Update the header auth controls based on current auth state.
 */
export function updateHeaderAuth() {
    const container = document.querySelector('.header-right');
    if (!container) return;

    const rateLimitEl = document.getElementById('rate-limit-indicator');

    if (isAuthenticated()) {
        const user = getCurrentUser();
        // Preserve rate limit indicator, add user controls
        let html = '';
        if (rateLimitEl) {
            html += `<div id="rate-limit-indicator">${rateLimitEl.innerHTML}</div>`;
        }
        html += `
            <div class="auth-user-controls">
                <span class="auth-username" title="${escapeHtml(user.username)}">
                    👤 ${escapeHtml(user.display_name || user.username)}
                </span>
                <button class="btn btn-sm btn-logout" id="header-logout" title="退出登录">
                    退出
                </button>
            </div>
        `;
        container.innerHTML = html;

        // Bind logout button
        const logoutBtn = document.getElementById('header-logout');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                await logout();
                updateHeaderAuth();
            });
        }
    } else {
        // Show login button
        let html = '';
        if (rateLimitEl) {
            html += `<div id="rate-limit-indicator">${rateLimitEl.innerHTML}</div>`;
        }
        html += `
            <button class="btn btn-sm btn-login" id="header-login">
                🔐 登录
            </button>
        `;
        container.innerHTML = html;

        // Bind login button
        const loginBtn = document.getElementById('header-login');
        if (loginBtn) {
            loginBtn.addEventListener('click', () => showLoginModal());
        }
    }
}

// --- Internal helpers ---

function bindAuthModalEvents(onSuccess) {
    const overlay = document.getElementById('modal-overlay');
    if (!overlay) return;

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeAuthModal();
    });

    // Close button
    const closeBtn = overlay.querySelector('[data-action="close-modal"]');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeAuthModal);
    }

    // Escape key
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            closeAuthModal();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);

    // Login form
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('login-username')?.value?.trim();
            const password = document.getElementById('login-password')?.value;
            const errorEl = document.getElementById('login-error');
            const submitBtn = document.getElementById('login-submit');

            if (!username || !password) {
                showAuthError(errorEl, '请填写用户名和密码');
                return;
            }

            setAuthLoading(submitBtn, true);
            try {
                await login(username, password);
                closeAuthModal();
                updateHeaderAuth();
                if (onSuccess) onSuccess();
            } catch (err) {
                showAuthError(errorEl, err.message);
            } finally {
                setAuthLoading(submitBtn, false);
            }
        });
    }

    // Register form
    const regForm = document.getElementById('register-form');
    if (regForm) {
        regForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('reg-username')?.value?.trim();
            const password = document.getElementById('reg-password')?.value;
            const inviteCode = document.getElementById('reg-invite-code')?.value?.trim();
            const errorEl = document.getElementById('register-error');
            const submitBtn = document.getElementById('register-submit');

            if (!username || !password || !inviteCode) {
                showAuthError(errorEl, '请填写所有字段');
                return;
            }

            setAuthLoading(submitBtn, true);
            try {
                await register(username, password, inviteCode);
                closeAuthModal();
                updateHeaderAuth();
                if (onSuccess) onSuccess();
            } catch (err) {
                showAuthError(errorEl, err.message);
            } finally {
                setAuthLoading(submitBtn, false);
            }
        });
    }

    // Switch links
    const switchToReg = document.getElementById('switch-to-register');
    if (switchToReg) {
        switchToReg.addEventListener('click', (e) => {
            e.preventDefault();
            showRegisterModal({ onSuccess });
        });
    }

    const switchToLogin = document.getElementById('switch-to-login');
    if (switchToLogin) {
        switchToLogin.addEventListener('click', (e) => {
            e.preventDefault();
            showLoginModal({ onSuccess });
        });
    }
}

function closeAuthModal() {
    const container = document.getElementById('modal-container');
    if (container) container.innerHTML = '';
}

function showAuthError(el, message) {
    if (!el) return;
    el.textContent = message;
    el.style.display = 'block';
}

function setAuthLoading(btn, loading) {
    if (!btn) return;
    btn.disabled = loading;
    btn.textContent = loading ? '处理中...' : (btn.closest('#login-form') ? '登录' : '注册');
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Re-export for convenience
export { closeAuthModal, escapeHtml };
