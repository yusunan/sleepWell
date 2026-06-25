// ============================================================
// db/pool.js — MySQL connection pool (mysql2/promise)
// ============================================================
//
// Supports two connection modes:
//   1. URI mode:  MYSQL_URL=mysql://user:pass@host/db
//      (PlanetScale / any MySQL-compatible service)
//   2. Param mode: MYSQL_HOST / MYSQL_PORT / MYSQL_USER /
//      MYSQL_PASSWORD / MYSQL_DATABASE
//      (self-hosted MySQL, e.g. Alibaba Cloud ECS)
//
// Param mode takes priority if MYSQL_HOST is set.

import mysql from 'mysql2/promise';
// dotenv is loaded by the entry point (server.js or deploy/create-admin.js)

function buildPoolConfig() {
    // Param mode (self-hosted MySQL) — preferred for Alibaba Cloud
    if (process.env.MYSQL_HOST) {
        return {
            host: process.env.MYSQL_HOST,
            port: parseInt(process.env.MYSQL_PORT, 10) || 3306,
            user: process.env.MYSQL_USER || 'root',
            password: process.env.MYSQL_PASSWORD || '',
            database: process.env.MYSQL_DATABASE || 'sleepwell',
            charset: 'utf8mb4',
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
            enableKeepAlive: true,
            keepAliveInitialDelay: 10000,
        };
    }

    // URI mode (PlanetScale / cloud MySQL)
    if (process.env.MYSQL_URL) {
        return {
            uri: process.env.MYSQL_URL,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
            enableKeepAlive: true,
            keepAliveInitialDelay: 10000,
        };
    }

    console.error('[睡了么 API] Fatal: Set MYSQL_HOST (self-hosted) or MYSQL_URL (cloud)');
    process.exit(1);
}

const poolConfig = buildPoolConfig();
const pool = mysql.createPool(poolConfig);

// Verify connection on startup
async function testConnection() {
    try {
        const conn = await pool.getConnection();
        console.log('[睡了么 API] MySQL connected successfully');
        conn.release();
    } catch (err) {
        console.error('[睡了么 API] MySQL connection failed:', err.message);
        // Don't exit — the server can still start; endpoints return 503 if DB is down
    }
}

// Execute a query with automatic connection management
async function query(sql, params = []) {
    const [rows] = await pool.execute(sql, params);
    return rows;
}

// Execute within a transaction
async function transaction(callback) {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const result = await callback(conn);
        await conn.commit();
        return result;
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

export { pool, testConnection, query, transaction };
