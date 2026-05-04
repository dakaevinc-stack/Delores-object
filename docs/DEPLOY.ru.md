# Развёртывание на сервере 94.242.58.24

Пошаговая инструкция «как поднять проект так, чтобы шеф открыл ссылку и
сразу пользовался: смотрел дашборд, отправлял заявки снабженцу,
скидывал отчёты бригадиру».

Архитектура после развёртывания:

```
┌──────────────────────────────────────┐
│  Браузер шефа                        │
│  http://94.242.58.24/                │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐  /api/sites/.../procurement-requests
│  nginx (порт 80)                     │  /api/sites/.../brigadier-reports
│  отдаёт SPA из /var/www/...          │  /api/sites/.../object-media
└──────────────┬───────────────────────┘
        /api/* │  (прокси на 127.0.0.1:8787)
               ▼
┌──────────────────────────────────────┐
│  systemd: site-forms.service         │
│  node server/site-forms.mjs          │
│  пишет JSON и медиа в                │
│  /var/lib/deloresh/site-forms        │
└──────────────────────────────────────┘
```

## 0. Что у нас уже автоматизировано

В репозитории лежат:

- `scripts/deploy/server-bootstrap.sh` — единый скрипт, разворачивающий
  чистый Ubuntu/Debian-сервер «под ключ»: ставит Node.js 20, nginx, ufw,
  создаёт пользователя `deploy`, клонирует репо, собирает фронт, ставит
  systemd-сервис бэкенда, кладёт nginx-конфиг с проксированием `/api`,
  открывает 80-й порт. Идемпотентен — повторный запуск обновляет.
- `scripts/deploy/site-forms.service` — systemd unit для бэкенда заявок.
- `scripts/deploy/site-forms.env.example` — пример секретов бэкенда.
- `scripts/deploy/nginx-site-ip.conf.example` — nginx без домена (по IP),
  с `/api/* → 127.0.0.1:8787`.
- `scripts/deploy/nginx-site.conf.example` — nginx с доменом, на случай,
  когда подключим домен и HTTPS.
- `scripts/deploy/publish-from-git.sh` — быстрый ребилд фронта без
  пересоздания сервиса (вызывается изнутри bootstrap-скрипта).

## 1. Первая установка — одна команда с вашего Mac

Самый простой путь. На своём Mac, из корня проекта:

```bash
npm run deploy:server -- <ваш-логин>@94.242.58.24
```

(или эквивалентно `bash scripts/deploy/from-mac.sh <логин>@94.242.58.24`)

Что произойдёт:

1. Wrapper попробует `ssh <логин>@94.242.58.24` (SSH-ключ или пароль —
   как у вас настроено).
2. Запустит `curl … server-bootstrap.sh | sudo bash` на удалённой машине.
   sudo при необходимости запросит пароль прямо в вашем терминале.
3. Bootstrap идёт ~2–5 минут на чистой машине, в конце на сервере
   и в вашем терминале выведет блок:
   ```
   ✓ Развёртывание завершено.
   Откройте в браузере:
     http://94.242.58.24/
   ```
4. После этого wrapper сам сделает smoke-test с вашего Mac:
   - `curl http://<IP>/` — должно вернуть 200;
   - `curl http://<IP>/api/health` — должно вернуть `{"ok":true}`.

Если 80-й порт занят чем-то другим — см. раздел **6. Альтернатива:
на отдельном порту**. Streamlit-панель на :8501 НЕ блокирует 80-й
порт — это разные порты, путать не нужно.

### Альтернатива: запустить bootstrap прямо на сервере

Если по какой-то причине запускать с Mac неудобно (нет ssh-ключа,
другой админ заходит) — то же самое можно сделать вручную:

```bash
ssh <логин>@94.242.58.24
curl -fsSL https://raw.githubusercontent.com/dakaevinc-stack/Delores-object/main/scripts/deploy/server-bootstrap.sh | sudo bash
```

Эффект тот же.

## 2. Обновление после изменений в коде

После каждого `git push origin main` запустите ту же команду — она
подтянет свежий код, пересоберёт фронт и перезапустит бэкенд:

```bash
npm run deploy:server -- <логин>@94.242.58.24
```

Или, если хочется только пересобрать фронт без переустановки сервиса
(быстрее на ~30 секунд):

```bash
ssh <логин>@94.242.58.24 'sudo -u deploy bash /home/deploy/Delores-object/scripts/deploy/publish-from-git.sh'
```

## 3. Проверка работы

```bash
# бэкенд (заявки/отчёты/медиа)
systemctl status site-forms
journalctl -u site-forms -f          # логи в реальном времени

# фронт (nginx)
systemctl status nginx
curl -I http://127.0.0.1/            # должен быть 200 OK

# health-чек API
curl http://127.0.0.1/api/health     # {"ok":true}
```

## 4. Что попадает на диск

| Что | Куда | Бэкап |
|-----|------|-------|
| Заявки снабженцу | `/var/lib/deloresh/site-forms/sites/<siteId>/procurement-requests.json` | `tar czf forms-$(date +%F).tgz /var/lib/deloresh/site-forms` |
| Отчёты бригадира | `/var/lib/deloresh/site-forms/sites/<siteId>/brigadier-reports.json` | то же |
| Фото/видео объектов | `/var/lib/deloresh/site-forms/sites/<siteId>/object-media/blobs/` | то же |
| Манифест медиа | `/var/lib/deloresh/site-forms/sites/<siteId>/object-media/manifest.json` | то же |

## 5. Безопасность записи

Скрипт сгенерирует случайный секрет в `/etc/deloresh/site-forms.env`
(`DELORESH_SITE_FORMS_WRITE_SECRET`) и встроит его в production-сборку
фронта (`VITE_SITE_FORMS_WRITE_SECRET`). Это значит:

- **GET-запросы** доступны всем (читать заявки/отчёты).
- **POST/PATCH/DELETE** разрешены только запросам с заголовком
  `X-Deloresh-Write-Secret`, который ставит наш фронт.

Если хотите, чтобы любой посторонний с тем же URL не мог писать —
секрет уже работает. Если хотите усилить (логин/пароль для шефа) — это
отдельная задача (Basic Auth в nginx или полноценная авторизация).

## 6. Альтернатива: запуск на отдельном порту (если 80 занят)

Если на 80-м порту стоит ОДИН ИЗ ВАЖНЫХ сервисов (например, иной
проект, который нельзя трогать), запустите bootstrap так:

```bash
sudo NGINX_VARIANT=ip NGINX_SITE_NAME=delores-object-8080 \
     bash /home/deploy/Delores-object/scripts/deploy/server-bootstrap.sh
```

Затем в `/etc/nginx/sites-available/delores-object-8080` закомментируйте
блок «Вариант A» и раскомментируйте «Вариант B» (там слушается 8080).
Откройте порт `8080` в `ufw` и шеф ходит на
`http://94.242.58.24:8080/`.

## 7. HTTPS и домен (когда будем готовы)

1. Поднимите A-запись домена на `94.242.58.24`.
2. Замените `nginx-site-ip.conf.example` на `nginx-site.conf.example`,
   подставьте свой `server_name`.
3. Поставьте `certbot`:
   ```bash
   sudo apt-get install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d delores.example.ru -d www.delores.example.ru
   ```
4. После выпуска сертификата шеф открывает `https://delores.example.ru/`.

## 8. Откат

Если новая сборка сломала прод:

```bash
# Откат к предыдущему коммиту main
sudo -u deploy git -C /home/deploy/Delores-object reset --hard HEAD~1
sudo bash /home/deploy/Delores-object/scripts/deploy/server-bootstrap.sh
```

## 9. Чек-лист, что у шефа всё работает

- [ ] Открывается `http://94.242.58.24/` — видна главная.
- [ ] Карточка «Спецтехника» открывает реестр.
- [ ] Карточка «Приём и учёт спецтехники» открывает Streamlit-панель в
      новой вкладке (стрелка ↗).
- [ ] В карточке объекта работает «Заявка снабженцу» (создаётся, видна
      после перезагрузки страницы — значит, ушла в API, а не в
      localStorage).
- [ ] В карточке объекта работает «Отчёт бригадира».
- [ ] Загруженное фото объекта остаётся после перезагрузки страницы.

Если хотя бы один пункт мимо — пришлите вывод
`journalctl -u site-forms -n 100` и `nginx -T | head -200`, починим.
