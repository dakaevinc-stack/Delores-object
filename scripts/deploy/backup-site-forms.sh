#!/usr/bin/env bash
# Ежедневный бэкап данных site-forms (задачи, формы, медиа, сессии).
# Ставится cron'ом на сервер (см. install-backup-cron.sh).
#
# Переменные окружения:
#   DATA_ROOT   — каталог данных (по умолчанию /var/lib/deloresh/site-forms)
#   BACKUP_DIR  — куда класть архивы (по умолчанию /var/backups/deloresh)
#   KEEP_DAYS   — сколько дней хранить (по умолчанию 14)

set -euo pipefail

DATA_ROOT="${DATA_ROOT:-/var/lib/deloresh/site-forms}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/deloresh}"
KEEP_DAYS="${KEEP_DAYS:-14}"

if [[ ! -d "$DATA_ROOT" ]]; then
  echo "backup-site-forms: нет каталога $DATA_ROOT" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
stamp="$(date +%F)"
out="$BACKUP_DIR/deloresh-forms-${stamp}.tgz"
parent="$(dirname "$DATA_ROOT")"
base="$(basename "$DATA_ROOT")"

tar czf "$out" -C "$parent" "$base"

# Удаляем старые архивы (mtime старше KEEP_DAYS)
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'deloresh-forms-*.tgz' -mtime +"$KEEP_DAYS" -delete

ls -lh "$out"
