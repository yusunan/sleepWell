// ============================================================
// db/init.js — Initialize database schema
// Usage: node db/init.js
// ============================================================

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool, testConnection } from './pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, 'schema.sql');

async function init() {
    console.log('[睡了么 DB] Connecting to MySQL...');
    await testConnection();

    console.log('[睡了么 DB] Reading schema...');
    const schema = fs.readFileSync(schemaPath, 'utf-8');

    // Split by semicolons and execute each statement
    const statements = schema
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--') && s !== '');

    const conn = await pool.getConnection();
    try {
        for (const stmt of statements) {
            // Skip pure comment lines
            if (stmt.split('\n').every(line => line.trim().startsWith('--') || line.trim() === '')) {
                continue;
            }
            try {
                await conn.execute(stmt);
            } catch (err) {
                // Table already exists (for CREATE IF NOT EXISTS) or duplicate key (for INSERT IGNORE)
                // are expected on re-run; log other errors
                if (!err.message.includes('already exists') && !err.message.includes('Duplicate')) {
                    console.warn(`  ⚠ Skipped: ${err.message.split('\n')[0]}`);
                }
            }
        }
        console.log('[睡了么 DB] Schema initialized successfully');
    } finally {
        conn.release();
    }

    await pool.end();
    console.log('[睡了么 DB] Done');
}

init().catch(err => {
    console.error('[睡了么 DB] Fatal:', err);
    process.exit(1);
});
