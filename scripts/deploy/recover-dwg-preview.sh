#!/usr/bin/env bash
# Восстановление DWG-превью на сервере: убивает зависшие Dwg2Png, ставит инструменты,
# перезапускает API и перегенерирует DXF+PNG.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DATA_ROOT="${DELORESH_SITE_FORMS_DATA:-/var/lib/deloresh/site-forms}"

echo "▸ Останавливаю зависшие конвертеры..."
pkill -f '/opt/deloresh/dwg2png/publish/Dwg2Png' 2>/dev/null || true
pkill -f 'dwg2png-' 2>/dev/null || true
sleep 1

if [[ -f "$ROOT/scripts/install-dwg2dxf.sh" ]] && command -v dotnet >/dev/null 2>&1; then
  echo "▸ Ставлю Dwg2Dxf + Dwg2Png..."
  bash "$ROOT/scripts/install-dwg2dxf.sh"
fi

echo "▸ Перезапуск site-forms..."
systemctl restart site-forms
sleep 2
curl -fsS http://127.0.0.1:8787/api/health | grep -q '"ok":true'

echo "▸ Перегенерация превью..."
DELORESH_SITE_FORMS_DATA="$DATA_ROOT" node "$ROOT/scripts/generate-dwg-previews.mjs" --force

echo "✓ Готово"
