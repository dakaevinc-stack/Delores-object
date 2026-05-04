#!/usr/bin/env bash
# Удалённый запуск bootstrap-скрипта с вашего Mac/Linux на сервер по SSH.
#
# Использование:
#   bash scripts/deploy/from-mac.sh user@94.242.58.24
# или через npm:
#   npm run deploy:server -- user@94.242.58.24
#
# Что делает:
#   1. Проверяет ssh-доступ (запускает короткую команду «whoami; uname -a»);
#   2. Проверяет, что у пользователя есть sudo (если нет — попросит ввести пароль);
#   3. Скачивает свежий server-bootstrap.sh из main-ветки GitHub и запускает на
#      сервере под sudo. Весь вывод стримится в ваш терминал в реальном времени.
#   4. По завершении показывает финальный статус.
#
# Дополнительные переменные окружения (необязательно):
#   BRANCH=main                                  — какую ветку разворачивать
#   NGINX_VARIANT=ip                             — ip|domain
#   NGINX_SITE_NAME=delores-object-ip            — имя файла в /etc/nginx/sites-*
#   VITE_AMEDA_INSPECTION_DASHBOARD_URL=...      — URL Streamlit-панели приёмки
#
# Эти переменные можно задать ровно так:
#   BRANCH=feature/x bash scripts/deploy/from-mac.sh user@host

set -euo pipefail

TARGET="${1:-}"

if [[ -z "$TARGET" ]]; then
    cat >&2 <<EOF
Использование: bash $0 user@host

Пример: bash $0 root@94.242.58.24
        bash $0 ibragim@94.242.58.24
EOF
    exit 2
fi

REMOTE_URL="${REMOTE_URL:-https://raw.githubusercontent.com/dakaevinc-stack/Delores-object/main/scripts/deploy/server-bootstrap.sh}"
BRANCH="${BRANCH:-main}"
NGINX_VARIANT="${NGINX_VARIANT:-ip}"
NGINX_SITE_NAME="${NGINX_SITE_NAME:-delores-object-ip}"
VITE_AMEDA_INSPECTION_DASHBOARD_URL="${VITE_AMEDA_INSPECTION_DASHBOARD_URL:-http://94.242.58.24:8501/}"

c_blue()  { printf '\033[1;36m%s\033[0m\n' "$*"; }
c_green() { printf '\033[1;32m%s\033[0m\n' "$*"; }
c_red()   { printf '\033[1;31m%s\033[0m\n' "$*" >&2; }

c_blue "▸ 1/4  Проверяю SSH-доступ к $TARGET..."
if ! ssh -o BatchMode=no -o ConnectTimeout=10 "$TARGET" 'whoami && uname -a'; then
    c_red "Не удалось подключиться по ssh к $TARGET."
    c_red "Проверьте, что: (а) хост и логин верные; (б) у вас настроен ssh-ключ или пароль; (в) сервер слушает 22 порт."
    exit 1
fi

c_blue "▸ 2/4  Проверяю, доступен ли sudo..."
if ! ssh "$TARGET" 'sudo -n true 2>/dev/null'; then
    c_blue "  sudo требует пароль — он будет запрошен ниже при запуске установки."
fi

c_blue "▸ 3/4  Запускаю server-bootstrap.sh на $TARGET (через GitHub raw)..."

# Передаём настройки через окружение sudo, чтобы они не потерялись при -E.
ENV_PREFIX="BRANCH='$BRANCH' NGINX_VARIANT='$NGINX_VARIANT' NGINX_SITE_NAME='$NGINX_SITE_NAME'"
ENV_PREFIX+=" VITE_AMEDA_INSPECTION_DASHBOARD_URL='$VITE_AMEDA_INSPECTION_DASHBOARD_URL'"

# -t выделяет TTY на сервере, чтобы sudo мог запросить пароль интерактивно.
# Само тело — однострочник: качаем bootstrap и сразу запускаем под sudo с env.
ssh -t "$TARGET" "set -euo pipefail; \
    curl -fsSL '$REMOTE_URL' -o /tmp/server-bootstrap.sh && \
    chmod +x /tmp/server-bootstrap.sh && \
    sudo -E env $ENV_PREFIX bash /tmp/server-bootstrap.sh"

c_blue "▸ 4/4  Smoke-тест: проверяю фронт и API из своего Mac..."

REMOTE_HOST="${TARGET#*@}"
sleep 2
if curl -fsS -I "http://${REMOTE_HOST}/" >/dev/null 2>&1; then
    c_green "  ✓ http://${REMOTE_HOST}/ отвечает 200 (фронт раздаётся nginx-ом)"
else
    c_red   "  ✖ http://${REMOTE_HOST}/ не ответил 200. Возможно, хостер блокирует 80 порт. См. docs/DEPLOY.ru.md → раздел 6."
fi

if curl -fsS "http://${REMOTE_HOST}/api/health" 2>/dev/null | grep -q '"ok":true'; then
    c_green "  ✓ http://${REMOTE_HOST}/api/health возвращает {ok:true}"
else
    c_red   "  ✖ http://${REMOTE_HOST}/api/health не ответил. Запросите логи: ssh $TARGET 'journalctl -u site-forms -n 100 --no-pager'"
fi

cat <<EOF

=========================================================
Готово. Поделитесь с шефом ссылкой:

   http://${REMOTE_HOST}/

Полезное на будущее:

  # Обновить прод после очередного git push в main:
  bash scripts/deploy/from-mac.sh ${TARGET}

  # Логи бэкенда заявок/отчётов:
  ssh ${TARGET} 'journalctl -u site-forms -f'

  # Полный гайд по развёртыванию:
  docs/DEPLOY.ru.md
=========================================================
EOF
