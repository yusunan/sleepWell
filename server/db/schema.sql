-- ============================================================
-- 睡了么 — Database Schema
-- Target: MySQL 8.0+ (PlanetScale compatible)
-- Usage: mysql -h <host> -u <user> -p <db> < schema.sql
-- ============================================================

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(100) DEFAULT '',
    role ENUM('free', 'premium', 'admin') NOT NULL DEFAULT 'free',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP NULL DEFAULT NULL,
    INDEX idx_username (username),
    INDEX idx_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Invite codes table
CREATE TABLE IF NOT EXISTS invite_codes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(32) UNIQUE NOT NULL,
    created_by INT NOT NULL,
    description VARCHAR(255) DEFAULT '',
    max_uses INT DEFAULT 1,
    use_count INT NOT NULL DEFAULT 0,
    expires_at TIMESTAMP NULL DEFAULT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
    INDEX idx_code (code),
    INDEX idx_active (is_active, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Usage limits configuration
CREATE TABLE IF NOT EXISTS usage_limits (
    id INT AUTO_INCREMENT PRIMARY KEY,
    role ENUM('free', 'premium', 'admin') NOT NULL,
    feature_name VARCHAR(50) NOT NULL,
    max_count INT NOT NULL,
    period ENUM('daily', 'weekly', 'monthly') NOT NULL DEFAULT 'daily',
    UNIQUE KEY uk_role_feature (role, feature_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Usage records (audit log)
CREATE TABLE IF NOT EXISTS usage_records (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    feature_name VARCHAR(50) NOT NULL,
    consumed_count INT NOT NULL DEFAULT 1,
    ip_address VARCHAR(45) DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    INDEX idx_user_feature_date (user_id, feature_name, created_at),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Refresh tokens
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    revoked BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_token_hash (token_hash),
    INDEX idx_user_revoked (user_id, revoked)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Access logs (audit trail for all API calls and page visits)
CREATE TABLE IF NOT EXISTS access_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    username VARCHAR(50) NULL,
    action VARCHAR(100) NOT NULL,
    path VARCHAR(500) NULL,
    method VARCHAR(10) DEFAULT 'GET',
    ip_address VARCHAR(45) NULL,
    user_agent VARCHAR(500) NULL,
    referer VARCHAR(500) NULL,
    status_code INT NULL,
    duration_ms INT NULL,
    extra JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_user_id (user_id),
    INDEX idx_action (action),
    INDEX idx_created_at (created_at),
    INDEX idx_user_action_date (user_id, action, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Seed data: default usage limits
-- ============================================================

INSERT IGNORE INTO usage_limits (role, feature_name, max_count, period) VALUES
    ('free',    'meta_heroes',    3,    'daily'),
    ('free',    'pro_players',    3,    'daily'),
    ('free',    'hero_recommend', 3,    'daily'),
    ('free',    'all_matches',    3,    'daily'),
    ('premium', 'meta_heroes',    9999, 'daily'),
    ('premium', 'pro_players',    9999, 'daily'),
    ('premium', 'hero_recommend', 9999, 'daily'),
    ('premium', 'all_matches',    9999, 'daily'),
    ('admin',   'meta_heroes',    99999, 'daily'),
    ('admin',   'pro_players',    99999, 'daily'),
    ('admin',   'hero_recommend', 99999, 'daily'),
    ('admin',   'all_matches',    99999, 'daily');
