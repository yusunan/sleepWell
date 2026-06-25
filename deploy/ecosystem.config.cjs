// ============================================================
// PM2 Ecosystem Config for 睡了么 API
// ============================================================
// Usage:
//   pm2 start ecosystem.config.cjs
//   pm2 save
//   pm2 startup  (to auto-start on boot)
// ============================================================

module.exports = {
    apps: [
        {
            name: 'sleepwell-api',
            script: './server/server.js',
            cwd: '/opt/sleepwell',   // <-- CHANGE to your app directory
            instances: 1,            // Single instance (can increase if needed)
            exec_mode: 'fork',
            watch: false,
            max_memory_restart: '256M',
            env: {
                NODE_ENV: 'production',
                PORT: 3000,
            },
            // Logging
            log_date_format: 'YYYY-MM-DD HH:mm:ss',
            error_file: '/var/log/sleepwell/pm2-error.log',
            out_file: '/var/log/sleepwell/pm2-out.log',
            merge_logs: true,
            // Auto-restart on crash
            autorestart: true,
            max_restarts: 10,
            restart_delay: 5000,
        },
    ],
};
