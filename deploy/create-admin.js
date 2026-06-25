// ============================================================
// deploy/create-admin.js — Create initial admin user
// ============================================================
// Usage: node deploy/create-admin.js <username> <password>
//
// Run this on the server after setup to create the first admin user.
// The admin can then log in and generate invite codes via the API.
// ============================================================

import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';
import { query } from '../server/db/pool.js';

// Load .env from server directory
const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '..', 'server', '.env') });

const args = process.argv.slice(2);

if (args.length < 2) {
    console.log('Usage: node deploy/create-admin.js <username> <password>');
    console.log('Example: node deploy/create-admin.js admin MyPass123');
    process.exit(1);
}

const [username, password] = args;

// Validate
if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
    console.error('Error: Username must be 3-30 chars, alphanumeric + underscore');
    process.exit(1);
}
if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
    console.error('Error: Password must be 8+ chars with at least one letter and one digit');
    process.exit(1);
}

async function main() {
    // Check if user already exists
    const existing = await query('SELECT id, role FROM users WHERE username = ?', [username]);
    if (existing.length > 0) {
        console.log(`User "${username}" already exists (id=${existing[0].id}, role=${existing[0].role})`);
        if (existing[0].role !== 'admin') {
            await query("UPDATE users SET role = 'admin' WHERE id = ?", [existing[0].id]);
            console.log('  -> Promoted to admin.');
        }
        process.exit(0);
    }

    // Create admin user
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await query(
        "INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'admin')",
        [username, passwordHash]
    );

    console.log('Admin user created:');
    console.log(`  Username: ${username}`);
    console.log(`  ID:       ${result.insertId}`);
    console.log(`  Role:     admin`);
    console.log('');
    console.log('You can now log in and generate invite codes at /api/invites.');
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
