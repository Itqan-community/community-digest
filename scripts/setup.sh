#!/usr/bin/env bash
# setup.sh — configure the community-digest droplet after creation
# Run via provision.sh (SSH'd as root), or manually: bash scripts/setup.sh
# Idempotent — safe to re-run.

set -euo pipefail

REPO_URL="https://github.com/Itqan-community/community-digest.git"
APP_DIR="/opt/community-digest"
LOG_DIR="/var/log/community-digest"
NODE_VERSION="20"

echo "--- Installing system packages ---"
apt-get update -qq
apt-get install -y -qq curl git nginx certbot python3-certbot-nginx mysql-client

echo "--- Installing Node.js $NODE_VERSION ---"
if ! command -v node &>/dev/null || [[ "$(node --version | cut -d. -f1 | tr -d v)" -lt "$NODE_VERSION" ]]; then
  curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
  apt-get install -y nodejs
fi
echo "  Node: $(node --version)  npm: $(npm --version)"

echo "--- Installing PM2 ---"
npm install -g pm2 --quiet

echo "--- Cloning / updating repo ---"
if [[ -d "$APP_DIR/.git" ]]; then
  git -C "$APP_DIR" pull --ff-only origin main
else
  git clone "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"
npm install --omit=dev --quiet

echo "--- Installing .env ---"
if [[ -f /tmp/.env.digest ]]; then
  cp /tmp/.env.digest "$APP_DIR/.env"
  rm /tmp/.env.digest
  echo "  .env installed from provision script."
elif [[ ! -f "$APP_DIR/.env" ]]; then
  echo "WARNING: No .env found. Copy manually: scp .env root@<ip>:/opt/community-digest/.env"
fi

echo "--- Log directory ---"
mkdir -p "$LOG_DIR"

echo "--- Running DB migration ---"
if [[ -f "$APP_DIR/.env" ]]; then
  # shellcheck source=/dev/null
  source "$APP_DIR/.env"
  mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" "-p$DB_PASS" "$DB_NAME" \
    < "$APP_DIR/db/migrations/001_create_digest_subscribers.sql"
  echo "  Migration applied."
else
  echo "  SKIP: no .env — run migration manually after copying .env"
fi

echo "--- PM2: starting server.js ---"
if pm2 list | grep -q "digest-server"; then
  pm2 restart digest-server
else
  pm2 start "$APP_DIR/server.js" \
    --name digest-server \
    --cwd "$APP_DIR"
  pm2 save
fi

# Enable PM2 startup on boot (prints a command — must be run if not already done)
pm2 startup | grep "sudo" | bash || true

echo "--- Cron job ---"
CRON_LINE="0 9 * * 1 cd $APP_DIR && /usr/bin/node digest.js >> $LOG_DIR/cron.log 2>&1"
( crontab -l 2>/dev/null | grep -v "community-digest"; echo "$CRON_LINE" ) | crontab -
echo "  Cron: $CRON_LINE"

echo "--- nginx config ---"
cat > /etc/nginx/sites-available/digest <<'NGINX'
server {
    listen 80;
    server_name digest.community.itqan.dev;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/digest /etc/nginx/sites-enabled/digest
nginx -t && systemctl reload nginx
echo "  nginx configured."

echo ""
echo "=== Setup complete ==="
echo "  App:  $APP_DIR"
echo "  Logs: $LOG_DIR/cron.log"
echo "  PM2:  pm2 status | pm2 logs digest-server"
echo ""
echo "  Once DNS A record for digest.community.itqan.dev is live, run:"
echo "  certbot --nginx -d digest.community.itqan.dev"
echo ""
echo "  Test the digest (sends to TEST_RECIPIENT_EMAIL only):"
echo "  cd $APP_DIR && SEND_MODE=test node digest.js"
