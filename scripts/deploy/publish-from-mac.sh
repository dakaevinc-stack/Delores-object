#!/usr/bin/env bash
# Выкладка текущего кода с Mac на VPS (без ожидания GitHub).
#
# Использование:
#   bash scripts/deploy/publish-from-mac.sh root@94.242.58.24
#   npm run deploy:live -- root@94.242.58.24
#
# Что делает:
#   1. rsync рабочей копии → /home/deploy/Delores-object (без node_modules/.env/dist);
#   2. npm ci + npm run build от пользователя deploy (берёт .env сервера);
#   3. rsync dist → /var/www/delores-object;
#   4. systemctl restart site-forms;
#   5. smoke: / и /api/health.

set -euo pipefail

TARGET="${1:-}"
if [[ -z "$TARGET" ]]; then
  cat >&2 <<EOF
Использование: bash $0 user@host

Пример: bash $0 root@94.242.58.24
EOF
  exit 2
fi

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
REMOTE_HOST="${TARGET#*@}"
REMOTE_DIR="${REMOTE_DIR:-/home/deploy/Delores-object}"
WEB_ROOT="${WEB_ROOT:-/var/www/delores-object}"

c_blue()  { printf '\033[1;36m%s\033[0m\n' "$*"; }
c_green() { printf '\033[1;32m%s\033[0m\n' "$*"; }
c_red()   { printf '\033[1;31m%s\033[0m\n' "$*" >&2; }

c_blue "▸ 1/5  SSH $TARGET…"
if ! ssh -o ConnectTimeout=12 "$TARGET" 'whoami >/dev/null'; then
  c_red "Нет SSH-доступа к $TARGET"
  exit 1
fi

c_blue "▸ 2/5  Копирую код → $REMOTE_DIR…"
rsync -az --delete \
  --exclude node_modules \
  --exclude .git \
  --exclude data \
  --exclude dist \
  --exclude .env \
  --exclude backups \
  --exclude '.DS_Store' \
  --exclude 'docs/FIELD-TEST-HANDOUT.local.md' \
  "$ROOT/" "$TARGET:$REMOTE_DIR/"

c_blue "▸ 3/5  Сборка на сервере + выкладка статики…"
ssh -t "$TARGET" "set -euo pipefail
  chown -R deploy:deploy '$REMOTE_DIR'
  systemctl stop site-forms || true
  cd '$REMOTE_DIR'
  sudo -u deploy npm ci
  sudo -u deploy npm run build
  mkdir -p '$WEB_ROOT'
  rsync -a --delete '$REMOTE_DIR/dist/' '$WEB_ROOT/'
  systemctl start site-forms
"

c_blue "▸ 4/5  Жду API…"
sleep 2

c_blue "▸ 5/5  Smoke…"
ok=0
if curl -fsS -I "http://${REMOTE_HOST}/" >/dev/null 2>&1; then
  c_green "  ✓ http://${REMOTE_HOST}/"
  ok=1
else
  c_red "  ✖ фронт не ответил 200"
fi
if curl -fsS "http://${REMOTE_HOST}/api/health" 2>/dev/null | grep -q '"ok":true'; then
  c_green "  ✓ http://${REMOTE_HOST}/api/health"
else
  c_red "  ✖ /api/health"
  ok=0
fi

if [[ "$ok" -eq 1 ]]; then
  cat <<EOF

=========================================================
Готово. Откройте:

   http://${REMOTE_HOST}/

Инструкция «без Cursor»: docs/OWN-PROJECT.ru.md
=========================================================
EOF
else
  c_red "Деплой завершился с ошибками проверки. Смотрите: ssh $TARGET 'journalctl -u site-forms -n 80 --no-pager'"
  exit 1
fi
