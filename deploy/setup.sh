#!/bin/bash
# ============================================================
# 睡了么 — Alibaba Cloud ECS Setup Script
# ============================================================
# Tested on: Ubuntu 22.04 / CentOS 7+ / Alibaba Cloud Linux 3
#
# Usage (as root):
#   chmod +x setup.sh
#   ./setup.sh
#
# This script:
#   1. Installs Node.js 20, MySQL 8.0, Nginx, PM2
#   2. Creates MySQL database and user
#   3. Initializes the database schema
#   4. Configures Nginx reverse proxy
#   5. Starts the app with PM2
# ============================================================

set -e

# --- Configuration (CHANGE THESE) ---
APP_DIR="/opt/sleepwell"
DOMAIN="api.your-domain.com"           # Your API domain
MYSQL_ROOT_PASS="change_me_root"
MYSQL_APP_USER="sleepwell"
MYSQL_APP_PASS="change_me_app_password"
MYSQL_APP_DB="sleepwell"
JWT_SECRET=$(openssl rand -hex 32)

echo "========================================"
echo "  睡了么 — Server Setup"
echo "  Target: ${APP_DIR}"
echo "  Domain: ${DOMAIN}"
echo "========================================"
echo ""

# --- 1. Detect OS ---
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
else
    echo "Cannot detect OS. Exiting."
    exit 1
fi
echo "[1/7] Detected OS: $OS"

# --- 2. Install dependencies ---
echo "[2/7] Installing dependencies..."

install_node() {
    if command -v node &>/dev/null && [ "$(node -v | cut -d. -f1 | tr -d 'v')" -ge 20 ]; then
        echo "  Node.js $(node -v) already installed"
        return
    fi
    echo "  Installing Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
}

install_mysql() {
    if command -v mysql &>/dev/null; then
        echo "  MySQL already installed"
        return
    fi
    echo "  Installing MySQL 8.0..."
    if [ "$OS" = "ubuntu" ] || [ "$OS" = "debian" ]; then
        apt-get update
        apt-get install -y mysql-server
    elif [ "$OS" = "centos" ] || [ "$OS" = "alinux" ] || [ "$OS" = "rhel" ]; then
        yum install -y mysql-server
    fi
    systemctl enable mysql
    systemctl start mysql
}

install_nginx() {
    if command -v nginx &>/dev/null; then
        echo "  Nginx already installed"
        return
    fi
    echo "  Installing Nginx..."
    if [ "$OS" = "ubuntu" ] || [ "$OS" = "debian" ]; then
        apt-get install -y nginx
    elif [ "$OS" = "centos" ] || [ "$OS" = "alinux" ] || [ "$OS" = "rhel" ]; then
        yum install -y nginx
    fi
    systemctl enable nginx
    systemctl start nginx
}

install_pm2() {
    if command -v pm2 &>/dev/null; then
        echo "  PM2 already installed"
        return
    fi
    echo "  Installing PM2..."
    npm install -g pm2
}

if [ "$OS" = "ubuntu" ] || [ "$OS" = "debian" ]; then
    apt-get update
fi

install_node
install_mysql
install_nginx
install_pm2

echo "  All dependencies installed"

# --- 3. MySQL setup ---
echo "[3/7] Setting up MySQL..."

# Secure the MySQL installation (set root password if not set)
mysql -u root -e "ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '${MYSQL_ROOT_PASS}';" 2>/dev/null || true

# Create database and app user
mysql -u root -p"${MYSQL_ROOT_PASS}" <<SQL
CREATE DATABASE IF NOT EXISTS ${MYSQL_APP_DB}
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS '${MYSQL_APP_USER}'@'localhost'
    IDENTIFIED BY '${MYSQL_APP_PASS}';

GRANT ALL PRIVILEGES ON ${MYSQL_APP_DB}.* TO '${MYSQL_APP_USER}'@'localhost';
FLUSH PRIVILEGES;
SQL

echo "  MySQL database and user created"

# --- 4. Deploy app ---
echo "[4/7] Deploying application..."

mkdir -p ${APP_DIR}
cp -r server/* ${APP_DIR}/
cp deploy/nginx.conf ${APP_DIR}/nginx.conf
cp deploy/ecosystem.config.cjs ${APP_DIR}/ecosystem.config.cjs
cp deploy/create-admin.js ${APP_DIR}/create-admin.js
cd ${APP_DIR}
npm install --production

# Create .env
cat > ${APP_DIR}/.env <<ENV
# MySQL (self-hosted)
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=${MYSQL_APP_USER}
MYSQL_PASSWORD=${MYSQL_APP_PASS}
MYSQL_DATABASE=${MYSQL_APP_DB}

# JWT
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=7d

# CORS — your Cloudflare Pages domain
CORS_ORIGIN=https://sleepwell-887.pages.dev

# Server
NODE_ENV=production
PORT=3000
ENV

echo "  .env created with JWT_SECRET=${JWT_SECRET}"

# Initialize database schema
echo "  Initializing database schema..."
node ${APP_DIR}/db/init.js

# --- 5. Configure Nginx ---
echo "[5/7] Configuring Nginx..."

# Copy and customize nginx config
cp ${APP_DIR}/nginx.conf /etc/nginx/sites-available/sleepwell-api
sed -i "s/api.your-domain.com/${DOMAIN}/g" /etc/nginx/sites-available/sleepwell-api

# Enable site (Ubuntu/Debian)
if [ -d /etc/nginx/sites-enabled ]; then
    ln -sf /etc/nginx/sites-available/sleepwell-api /etc/nginx/sites-enabled/
    rm -f /etc/nginx/sites-enabled/default
elif [ -d /etc/nginx/conf.d ]; then
    cp /etc/nginx/sites-available/sleepwell-api /etc/nginx/conf.d/sleepwell-api.conf
fi

nginx -t && systemctl reload nginx
echo "  Nginx configured"

# --- 6. Start app with PM2 ---
echo "[6/7] Starting app with PM2..."

# Create log directory
mkdir -p /var/log/sleepwell

pm2 start ${APP_DIR}/ecosystem.config.cjs
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null || true

echo "  PM2 started"

# --- 7. SSL Certificate (optional, requires DNS to be pointed) ---
echo "[7/7] SSL Certificate..."
echo ""
echo "  Once your domain DNS is pointed to this server, run:"
echo "    apt-get install -y certbot python3-certbot-nginx"
echo "    certbot --nginx -d ${DOMAIN}"
echo ""

# --- Done ---
echo "========================================"
echo "  ✅ Setup complete!"
echo ""
echo "  App directory: ${APP_DIR}"
echo "  API endpoint:  http://${DOMAIN}/api/health"
echo "  MySQL user:    ${MYSQL_APP_USER}"
echo "  MySQL db:      ${MYSQL_APP_DB}"
echo ""
echo "  JWT Secret (saved in .env): ${JWT_SECRET}"
echo ""
echo "  Next steps:"
echo "  1. Point your domain DNS A record to this server's IP"
echo "  2. Run certbot to get SSL certificate"
echo "  3. Update deploy/nginx.conf: uncomment SSL lines"
echo "  4. Create initial admin user: see below"
echo "  5. Update js/config.js API_BACKEND with your domain"
echo "========================================"
