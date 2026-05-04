#!/usr/bin/env bash
# Bootstrap-скрипт развёртывания «Деловые Решения» на чистом Ubuntu/Debian-сервере.
# Делает всё, что нужно, чтобы по http://<IP>/ открывалась рабочая SPA + API site-forms:
#   1. ставит Node.js 20 и nginx (если их нет);
#   2. создаёт системного пользователя deploy и каталоги /var/www/delores-object и /var/lib/deloresh/site-forms;
#   3. клонирует репозиторий и собирает фронт (через scripts/deploy/publish-from-git.sh);
#   4. ставит systemd-сервис site-forms (бэкенд переживает ребут);
#   5. ставит nginx-конфиг с проксированием /api → 127.0.0.1:8787;
#   6. открывает 80 и 22 в ufw, перезапускает nginx, проверяет что всё откликается.
#
# Запуск (на сервере, под пользователем с sudo):
#   curl -fsSL https://raw.githubusercontent.com/dakaevinc-stack/Delores-object/main/scripts/deploy/server-bootstrap.sh | sudo bash
# или, после клонирования репо:
#   sudo bash scripts/deploy/server-bootstrap.sh
#
# Идемпотентен: повторный запуск не ломает существующую установку, а обновляет её.

set -euo pipefail

# --------------------------------------------------------------
# Параметры (можно переопределить переменными окружения)
# --------------------------------------------------------------
REPO_URL="${REPO_URL:-https://github.com/dakaevinc-stack/Delores-object.git}"
BRANCH="${BRANCH:-main}"
DEPLOY_USER="${DEPLOY_USER:-deploy}"
INSTALL_DIR="${INSTALL_DIR:-/home/${DEPLOY_USER}/Delores-object}"
WEB_ROOT="${WEB_ROOT:-/var/www/delores-object}"
DATA_ROOT="${DATA_ROOT:-/var/lib/deloresh/site-forms}"
ENV_FILE="${ENV_FILE:-/etc/deloresh/site-forms.env}"
NGINX_VARIANT="${NGINX_VARIANT:-ip}"          # ip | domain
NGINX_SITE_NAME="${NGINX_SITE_NAME:-delores-object-ip}"

# Опциональные переменные окружения для production-сборки фронта.
# Если не заданы — используем значения по умолчанию из проекта.
VITE_AMEDA_INSPECTION_DASHBOARD_URL="${VITE_AMEDA_INSPECTION_DASHBOARD_URL:-http://94.242.58.24:8501/}"
# Секрет защиты записи. Если не задан — сгенерируем случайный.
VITE_SITE_FORMS_WRITE_SECRET="${VITE_SITE_FORMS_WRITE_SECRET:-}"

# --------------------------------------------------------------
# Утилиты
# --------------------------------------------------------------
log()  { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*" >&2; }
die()  { printf '\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

require_root() {
    if [[ $EUID -ne 0 ]]; then
        die "Запустите скрипт с правами root (sudo bash $0)."
    fi
}

apt_install_if_missing() {
    local pkg="$1"
    if ! dpkg -s "$pkg" >/dev/null 2>&1; then
        log "Устанавливаю пакет: $pkg"
        DEBIAN_FRONTEND=noninteractive apt-get install -y "$pkg"
    fi
}

# --------------------------------------------------------------
# Шаги
# --------------------------------------------------------------

step_packages() {
    log "Обновляю apt и ставлю базовые пакеты"
    apt-get update
    apt_install_if_missing curl
    apt_install_if_missing ca-certificates
    apt_install_if_missing rsync
    apt_install_if_missing git
    apt_install_if_missing nginx
    apt_install_if_missing ufw

    if ! command -v node >/dev/null 2>&1 || [[ "$(node -v 2>/dev/null | sed 's/^v//' | cut -d. -f1)" -lt 20 ]]; then
        log "Ставлю Node.js 20 LTS из NodeSource"
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
        DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
    else
        log "Node.js уже установлен: $(node -v)"
    fi
}

step_user_and_dirs() {
    if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
        log "Создаю системного пользователя: $DEPLOY_USER"
        adduser --system --group --home "/home/${DEPLOY_USER}" --shell /bin/bash "$DEPLOY_USER"
    else
        log "Пользователь $DEPLOY_USER уже существует"
    fi

    log "Готовлю каталоги"
    install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 755 "/home/${DEPLOY_USER}"
    install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 755 "$(dirname "$INSTALL_DIR")"
    install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 755 "$WEB_ROOT"
    install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 755 "$DATA_ROOT"
    install -d -o root -g root -m 755 "$(dirname "$ENV_FILE")"
}

step_env_file() {
    if [[ -f "$ENV_FILE" ]]; then
        log "Файл переменных бэкенда уже есть: $ENV_FILE"
        return
    fi
    if [[ -z "$VITE_SITE_FORMS_WRITE_SECRET" ]]; then
        VITE_SITE_FORMS_WRITE_SECRET="$(openssl rand -hex 24 2>/dev/null || head -c 32 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 48)"
        log "Сгенерирован секрет VITE_SITE_FORMS_WRITE_SECRET (сохранится в /etc/deloresh/site-forms.env)"
    fi
    log "Пишу $ENV_FILE"
    umask 077
    cat > "$ENV_FILE" <<EOF
# Создан server-bootstrap.sh.
DELORESH_SITE_FORMS_PORT=8787
DELORESH_SITE_FORMS_DATA=$DATA_ROOT
DELORESH_SITE_FORMS_WRITE_SECRET=$VITE_SITE_FORMS_WRITE_SECRET
EOF
    chmod 600 "$ENV_FILE"
}

step_clone_or_update() {
    if [[ ! -d "$INSTALL_DIR/.git" ]]; then
        log "Клонирую репозиторий: $REPO_URL → $INSTALL_DIR"
        sudo -u "$DEPLOY_USER" git clone --branch "$BRANCH" --depth 1 "$REPO_URL" "$INSTALL_DIR"
    else
        log "Обновляю локальную копию репозитория ($INSTALL_DIR)"
        sudo -u "$DEPLOY_USER" git -C "$INSTALL_DIR" fetch origin "$BRANCH"
        sudo -u "$DEPLOY_USER" git -C "$INSTALL_DIR" reset --hard "origin/$BRANCH"
    fi
}

step_build_frontend() {
    log "Собираю production-бандл (npm ci + npm run build)"
    # Передаём VITE-переменные так, чтобы Vite их увидел в build-time.
    # Секрет извлекаем из /etc/deloresh/site-forms.env (там он гарантированно есть).
    local SECRET
    SECRET="$(awk -F= '/^DELORESH_SITE_FORMS_WRITE_SECRET=/{print substr($0, index($0,"=")+1)}' "$ENV_FILE")"

    sudo -u "$DEPLOY_USER" \
        VITE_AMEDA_INSPECTION_DASHBOARD_URL="$VITE_AMEDA_INSPECTION_DASHBOARD_URL" \
        VITE_SITE_FORMS_WRITE_SECRET="$SECRET" \
        bash -lc "cd '$INSTALL_DIR' && npm ci && npm run build"

    log "Раскатываю dist/ → $WEB_ROOT (rsync --delete)"
    rsync -a --delete "$INSTALL_DIR/dist/" "$WEB_ROOT/"
    chown -R "$DEPLOY_USER:$DEPLOY_USER" "$WEB_ROOT"
}

step_systemd_service() {
    log "Ставлю systemd unit site-forms (с подменой пользователя на $DEPLOY_USER)"
    local UNIT_SRC="$INSTALL_DIR/scripts/deploy/site-forms.service"
    local UNIT_DST="/etc/systemd/system/site-forms.service"

    if [[ ! -f "$UNIT_SRC" ]]; then
        die "В репозитории не найден $UNIT_SRC — обновите код."
    fi

    sed \
        -e "s|^User=.*|User=${DEPLOY_USER}|" \
        -e "s|^Group=.*|Group=${DEPLOY_USER}|" \
        -e "s|^WorkingDirectory=.*|WorkingDirectory=${INSTALL_DIR}|" \
        -e "s|^EnvironmentFile=.*|EnvironmentFile=${ENV_FILE}|" \
        -e "s|^ReadWritePaths=.*|ReadWritePaths=${DATA_ROOT}|" \
        "$UNIT_SRC" > "$UNIT_DST"

    chmod 644 "$UNIT_DST"

    systemctl daemon-reload
    systemctl enable site-forms.service
    systemctl restart site-forms.service
    sleep 1
    systemctl --no-pager --full status site-forms.service | head -n 20 || true
}

step_tg_bridge() {
    local TG_ENV="/etc/deloresh/tg-bridge.env"
    if [[ ! -f "$TG_ENV" ]]; then
        log "Telegram-бридж: $TG_ENV не найден — пропускаю установку (включится автоматически после создания файла)."
        # Если сервис уже стоял — оставим как есть.
        return
    fi

    log "Ставлю systemd unit tg-bridge (Telegram → site-forms)"
    local UNIT_SRC="$INSTALL_DIR/scripts/deploy/tg-bridge.service"
    local UNIT_DST="/etc/systemd/system/tg-bridge.service"

    if [[ ! -f "$UNIT_SRC" ]]; then
        die "В репозитории не найден $UNIT_SRC — обновите код."
    fi

    # Подкладываем секрет site-forms в env tg-bridge, если его там ещё нет
    # (чтобы оператору не приходилось вручную копировать одно и то же значение).
    local SITE_SECRET
    SITE_SECRET="$(awk -F= '/^DELORESH_SITE_FORMS_WRITE_SECRET=/{print substr($0, index($0,"=")+1)}' "$ENV_FILE")"
    if [[ -n "$SITE_SECRET" ]] && grep -qE '^SITE_FORMS_WRITE_SECRET=\s*$' "$TG_ENV"; then
        log "  подставляю SITE_FORMS_WRITE_SECRET в $TG_ENV"
        sed -i "s|^SITE_FORMS_WRITE_SECRET=\\s*$|SITE_FORMS_WRITE_SECRET=${SITE_SECRET}|" "$TG_ENV"
    fi

    sed \
        -e "s|^User=.*|User=${DEPLOY_USER}|" \
        -e "s|^Group=.*|Group=${DEPLOY_USER}|" \
        -e "s|^WorkingDirectory=.*|WorkingDirectory=${INSTALL_DIR}|" \
        -e "s|^ReadWritePaths=.*|ReadWritePaths=${DATA_ROOT}|" \
        "$UNIT_SRC" > "$UNIT_DST"

    chmod 644 "$UNIT_DST"

    systemctl daemon-reload
    systemctl enable tg-bridge.service
    systemctl restart tg-bridge.service
    sleep 1
    systemctl --no-pager --full status tg-bridge.service | head -n 20 || true
}

step_nginx() {
    log "Ставлю nginx-конфиг ($NGINX_VARIANT)"
    local NGINX_SRC NGINX_DST="/etc/nginx/sites-available/${NGINX_SITE_NAME}"

    case "$NGINX_VARIANT" in
        ip)
            NGINX_SRC="$INSTALL_DIR/scripts/deploy/nginx-site-ip.conf.example" ;;
        domain)
            NGINX_SRC="$INSTALL_DIR/scripts/deploy/nginx-site.conf.example" ;;
        *)
            die "Неверный NGINX_VARIANT=$NGINX_VARIANT (ожидается ip|domain)"
    esac

    if [[ ! -f "$NGINX_SRC" ]]; then
        die "Не найден nginx-пример: $NGINX_SRC"
    fi

    cp "$NGINX_SRC" "$NGINX_DST"
    ln -sf "$NGINX_DST" "/etc/nginx/sites-enabled/${NGINX_SITE_NAME}"

    # Если включён default — отключаем (он перебивает наш default_server).
    if [[ -L /etc/nginx/sites-enabled/default ]]; then
        rm -f /etc/nginx/sites-enabled/default
        log "Отключил /etc/nginx/sites-enabled/default (конфликт default_server)"
    fi

    log "Проверяю конфигурацию nginx"
    nginx -t
    systemctl reload nginx
}

step_firewall() {
    if command -v ufw >/dev/null 2>&1; then
        log "Открываю SSH (22) и HTTP (80) в ufw"
        ufw allow OpenSSH || true
        ufw allow 80/tcp || true
        # Если включают вариант :8080 — раскомментировать вручную
        if ufw status | grep -q "Status: inactive"; then
            warn "ufw неактивен. Если хотите включить файрвол: ufw enable"
        fi
    fi
}

step_smoke_test() {
    log "Smoke-проверка: API health и фронт"
    sleep 1
    if curl -fsS http://127.0.0.1:8787/api/health >/dev/null; then
        echo "  ✓ site-forms API отвечает на /api/health"
    else
        warn "site-forms API не ответил — посмотрите: journalctl -u site-forms -n 50"
    fi
    if curl -fsS -I http://127.0.0.1/ | head -n 1 | grep -q "200"; then
        echo "  ✓ nginx отдаёт SPA на 80 порту"
    else
        warn "nginx не отдал 200 на /. Проверьте: nginx -t && systemctl status nginx"
    fi
}

main() {
    require_root
    step_packages
    step_user_and_dirs
    step_env_file
    step_clone_or_update
    step_build_frontend
    step_systemd_service
    step_tg_bridge
    step_nginx
    step_firewall
    step_smoke_test

    local IP
    IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
    cat <<EOF

============================================================
✓ Развёртывание завершено.

Откройте в браузере:
  http://${IP:-<IP-сервера>}/

Полезные команды на сервере:
  systemctl status site-forms          # бэкенд (заявки/отчёты/медиа)
  journalctl -u site-forms -f          # логи бэкенда
  systemctl status nginx               # фронт-веб-сервер
  nginx -t && systemctl reload nginx   # перечитать конфиг nginx

Обновить приложение (после коммитов в main на GitHub):
  sudo bash $INSTALL_DIR/scripts/deploy/server-bootstrap.sh

Файлы и каталоги:
  Репо:        $INSTALL_DIR
  Статика:     $WEB_ROOT
  Данные:      $DATA_ROOT
  Бэкенд .env: $ENV_FILE
============================================================
EOF
}

main "$@"
