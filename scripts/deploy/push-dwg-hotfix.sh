#!/usr/bin/env bash
# Горячий деплой DWG-фикса с Mac на прод (без git push).
#   bash scripts/deploy/push-dwg-hotfix.sh
set -euo pipefail

TARGET="${1:-deloresh}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WEB_ROOT="${WEB_ROOT:-/var/www/delores-object}"

echo "▸ Сборка фронта..."
cd "$ROOT"
npm run build

echo "▸ Копирую на ${TARGET}..."
scp "$ROOT/server/site-forms.mjs" "$ROOT/server/dwg-preview.mjs" "$TARGET:/tmp/"
scp "$ROOT/tools/dwg2png/Dwg2Png.csproj" "$ROOT/tools/dwg2png/Program.cs" "$TARGET:/tmp/dwg2png-src/"
scp "$ROOT/scripts/generate-dwg-previews.mjs" "$ROOT/scripts/deploy/recover-dwg-preview.sh" "$TARGET:/tmp/"
rsync -a --delete "$ROOT/dist/" "$TARGET:/tmp/deloresh-dist/"

echo "▸ Установка на сервере..."
ssh "$TARGET" "set -eo pipefail
  pkill -f '/opt/deloresh/dwg2png/publish/Dwg2Png' 2>/dev/null || true
  true
  cp /tmp/site-forms.mjs /tmp/dwg-preview.mjs /home/deploy/Delores-object/server/
  cp /tmp/generate-dwg-previews.mjs /home/deploy/Delores-object/scripts/
  cp /tmp/recover-dwg-preview.sh /home/deploy/Delores-object/scripts/deploy/
  chmod +x /home/deploy/Delores-object/scripts/deploy/recover-dwg-preview.sh
  chown deploy:deploy /home/deploy/Delores-object/server/site-forms.mjs /home/deploy/Delores-object/server/dwg-preview.mjs
  chown deploy:deploy /home/deploy/Delores-object/scripts/generate-dwg-previews.mjs
  chown deploy:deploy /home/deploy/Delores-object/scripts/deploy/recover-dwg-preview.sh
  DEST=/opt/deloresh/dwg2png
  mkdir -p \"\$DEST\"
  cp /tmp/dwg2png-src/* \"\$DEST/\"
  cd \"\$DEST\"
  dotnet publish -c Release -o \"\$DEST/publish\" -r linux-x64 --self-contained false
  rsync -a --delete /tmp/deloresh-dist/ ${WEB_ROOT}/
  bash /home/deploy/Delores-object/scripts/deploy/recover-dwg-preview.sh
"

echo "▸ Smoke-тест..."
HOST="${TARGET#*@}"
HOST="${HOST:-94.242.58.24}"
curl -fsS "http://${HOST}/api/health" | grep -q '"ok":true'
echo "✓ http://${HOST}/ — DWG hotfix задеплоен"
