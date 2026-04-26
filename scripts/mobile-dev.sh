#!/usr/bin/env bash
# mobile-dev.sh
# Удобный запуск dev-сервера для проверки на телефоне/планшете/ноуте/десктопе.
# 1. Снимает зависшие процессы на порту 5173
# 2. Запускает vite на всех интерфейсах (0.0.0.0)
# 3. Печатает все URL-ы, которые можно открыть на любом устройстве
# 4. Если у вас выключен VPN — автоматически поднимает публичный
#    HTTPS-тоннель через Cloudflare (работает из любой сети: 4G/5G/чужой Wi-Fi)

set -u

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT=5173
CFD_BIN="$PROJECT_ROOT/.local/bin/cloudflared"

log()  { printf "\033[1;36m%s\033[0m\n" "$*"; }
ok()   { printf "\033[1;32m%s\033[0m\n" "$*"; }
warn() { printf "\033[1;33m%s\033[0m\n" "$*"; }
err()  { printf "\033[1;31m%s\033[0m\n" "$*"; }

# --- 1) чистим порт ---
existing_pid="$(lsof -ti :$PORT 2>/dev/null | head -1 || true)"
if [[ -n "${existing_pid:-}" ]]; then
  log "Порт $PORT уже занят (pid=$existing_pid), освобождаю…"
  kill -9 "$existing_pid" 2>/dev/null || true
  sleep 1
fi

# --- 2) запускаем vite в фоне ---
log "Поднимаю Vite на 0.0.0.0:$PORT …"
(
  cd "$PROJECT_ROOT"
  npx vite --host 0.0.0.0 --port "$PORT" --strictPort > /tmp/vite-mobile-dev.log 2>&1 &
  echo $! > /tmp/vite-mobile-dev.pid
)

# ждём, пока Vite ответит 200
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -sS -o /dev/null -w "%{http_code}" --max-time 1 "http://127.0.0.1:$PORT/" 2>/dev/null | grep -q 200; then
    break
  fi
  sleep 1
done

if ! curl -sS -o /dev/null -w "%{http_code}" --max-time 2 "http://127.0.0.1:$PORT/" 2>/dev/null | grep -q 200; then
  err "Vite не поднялся. Смотрите лог: /tmp/vite-mobile-dev.log"
  exit 1
fi
ok "Vite готов."
echo

# --- 3) печатаем URL-ы для разных устройств ---
LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"

echo "================ ОТКРЫВАТЬ ТАК ================"
echo
echo "На этом Mac:"
echo "   http://localhost:$PORT"
echo
if [[ -n "$LAN_IP" ]]; then
  echo "На телефоне/планшете/другом ноуте В ТОЙ ЖЕ Wi-Fi:"
  echo "   http://$LAN_IP:$PORT"
  echo
  echo "   (Если не открывается — отключите VPN и на Mac, и на телефоне.)"
fi
echo "==============================================="
echo

# --- 4) пробуем Cloudflare-тоннель (работает из любой сети) ---
if [[ -x "$CFD_BIN" ]]; then
  log "Пробую поднять публичный HTTPS-тоннель (Cloudflare Quick Tunnel)…"
  log "Если VPN блокирует DNS, тоннель не стартует — это нормально, LAN-URL всё равно работает."
  "$CFD_BIN" tunnel --url "http://localhost:$PORT" --no-autoupdate 2>&1 | \
    awk '/trycloudflare\.com/ && !printed { print; print "\nОткрывайте ЭТУ ссылку на любом устройстве — 4G/5G/чужой Wi-Fi тоже подойдёт.\n"; printed=1 } { print }' &
  CFD_PID=$!
  # не ждём тут — cloudflared и vite живут параллельно
fi

echo
ok "Чтобы остановить — Ctrl+C в этом окне."
echo

# держим скрипт живым, пока жив Vite
VITE_PID="$(cat /tmp/vite-mobile-dev.pid 2>/dev/null || true)"
trap 'kill ${CFD_PID:-0} ${VITE_PID:-0} 2>/dev/null; exit 0' INT TERM
wait "$VITE_PID" 2>/dev/null || true
