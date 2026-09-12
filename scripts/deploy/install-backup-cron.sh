#!/usr/bin/env bash
# Ставит ежедневный cron-бэкап site-forms на сервер.
# Запуск на сервере под root:
#   bash scripts/deploy/install-backup-cron.sh
# или с Mac:
#   scp scripts/deploy/backup-site-forms.sh scripts/deploy/install-backup-cron.sh root@HOST:/tmp/
#   ssh root@HOST 'bash /tmp/install-backup-cron.sh'

set -euo pipefail

SCRIPT_SRC="${1:-}"
if [[ -z "$SCRIPT_SRC" ]]; then
  HERE="$(cd "$(dirname "$0")" && pwd)"
  SCRIPT_SRC="$HERE/backup-site-forms.sh"
fi

if [[ ! -f "$SCRIPT_SRC" ]]; then
  echo "install-backup-cron: нет файла $SCRIPT_SRC" >&2
  exit 1
fi

install -m 0755 "$SCRIPT_SRC" /usr/local/sbin/backup-deloresh-forms.sh
mkdir -p /var/backups/deloresh

CRON_FILE=/etc/cron.d/deloresh-site-forms-backup
cat >"$CRON_FILE" <<'EOF'
# Ежедневный бэкап данных Deloresh Objects (site-forms)
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin
0 3 * * * root /usr/local/sbin/backup-deloresh-forms.sh >>/var/log/deloresh-backup.log 2>&1
EOF
chmod 644 "$CRON_FILE"

# Прогон сразу, чтобы проверить и получить первый архив
/usr/local/sbin/backup-deloresh-forms.sh

echo "OK: cron ежедневно в 03:00 → /var/backups/deloresh/ (хранить 14 дней)"
