#!/usr/bin/env bash
# Сборка из git и выкладка статики в WEB_ROOT (например /var/www/delores-object).
# Запуск на сервере один раз вручную или по cron после git pull.
#
# Пример:
#   export REPO_URL="https://github.com/dakaevinc-stack/Delores-object.git"
#   export INSTALL_DIR="$HOME/Delores-object"
#   export WEB_ROOT="/var/www/delores-object"
#   bash scripts/deploy/publish-from-git.sh
#
# Для WEB_ROOT вне домашней директории понадобится sudo:
#   sudo mkdir -p /var/www/delores-object && sudo chown "$USER" /var/www/delores-object

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/dakaevinc-stack/Delores-object.git}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/Delores-object}"
WEB_ROOT="${WEB_ROOT:-/var/www/delores-object}"
BRANCH="${BRANCH:-main}"

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Нужна команда: $1" >&2
    exit 1
  }
}

need_cmd git
need_cmd npm

if [[ ! -d "$INSTALL_DIR/.git" ]]; then
  mkdir -p "$(dirname "$INSTALL_DIR")"
  git clone --branch "$BRANCH" --depth 1 "$REPO_URL" "$INSTALL_DIR"
else
  git -C "$INSTALL_DIR" fetch origin "$BRANCH"
  git -C "$INSTALL_DIR" reset --hard "origin/$BRANCH"
fi

cd "$INSTALL_DIR"
npm ci
npm run build

if [[ -f scripts/install-dwg2dxf.sh ]] && command -v dotnet >/dev/null 2>&1; then
  bash scripts/install-dwg2dxf.sh || echo "Предупреждение: dwg2dxf (ACadSharp) не установлен — DWG-превью могут быть урезаны." >&2
fi

if [[ -f scripts/generate-dwg-previews.mjs ]]; then
  DELORESH_SITE_FORMS_DATA="${DATA_ROOT:-/var/lib/deloresh/site-forms}" \
    node scripts/generate-dwg-previews.mjs --force || true
fi

mkdir -p "$WEB_ROOT"
rsync -a --delete "$INSTALL_DIR/dist/" "$WEB_ROOT/"

echo "Готово: статика в $WEB_ROOT"
echo "Проверьте nginx (root + try_files для SPA) и certbot для HTTPS."
