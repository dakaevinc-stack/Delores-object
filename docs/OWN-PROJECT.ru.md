# Владение проектом без Cursor

Cursor — только редактор. **Сайт, код, сервер и домен от него не зависят.**
Этот файл — что хранить и как продолжать править / выпускать релизы,
если Cursor недоступен.

---

## 1. Три опоры (проверьте раз в месяц)

| Что | Где сейчас | Зачем |
|-----|------------|--------|
| Код | GitHub: `https://github.com/dakaevinc-stack/Delores-object` | история, бэкап, деплой с любого ПК |
| Копия на Mac | папка `Deloresh Objects` | править локально |
| Прод | VPS `94.242.58.24` (SSH), статика `/var/www/delores-object`, API `site-forms` | то, что видят сотрудники |

Доступы, которые должны быть у вас **вне Cursor**:
- логин GitHub + 2FA / SSH-ключ к GitHub;
- SSH к серверу: `ssh root@94.242.58.24` (или ваш логин с sudo);
- пароль/ключ регистратора домена (когда подключите).

---

## 2. Чем править код без Cursor

Любой редактор: **VS Code**, WebStorm, Sublime, даже nano на сервере.

```bash
# Если папки на Mac нет — клонируйте:
git clone https://github.com/dakaevinc-stack/Delores-object.git
cd Delores-object

npm ci
npm run dev          # локально http://localhost:5173
```

Дальше как обычно: правите файлы → сохраняете → коммит/пуш (см. ниже).

---

## 3. Как выкладывать обновления на прод

### Способ A — из локальной папки (рекомендуется, не ждёт GitHub)

С Mac, из корня проекта:

```bash
npm run deploy:live -- root@94.242.58.24
```

Скрипт:
1. копирует ваш текущий код на сервер (без `node_modules` / `.env`);
2. собирает фронт **на сервере** (с правильным write-secret из `/etc/deloresh/site-forms.env`);
3. кладёт `dist/` в `/var/www/delores-object`;
4. перезапускает `site-forms`;
5. проверяет `http://…/` и `/api/health`.

Перед выкладкой полезно поднять версию PWA-кэша в `public/sw.js`
(`deloresh-shell-vNN` / `deloresh-assets-vNN`), иначе телефоны могут
держать старую оболочку.

### Способ B — через GitHub (классика)

```bash
git add -A
git commit -m "кратко: зачем изменение"
git push origin main

npm run deploy:server -- root@94.242.58.24
```

`deploy:server` тянет код с GitHub `main` и пересобирает сервер.
Имеет смысл, когда код уже запушен и вы хотите «как у всех в репо».

### Быстрая проверка после деплоя

```bash
curl -fsS http://94.242.58.24/api/health
curl -fsS -I http://94.242.58.24/ | head -5
curl -fsS http://94.242.58.24/sw.js | head -3
```

Должно быть `{"ok":true}`, фронт 200, в `sw.js` свежий `deloresh-shell-v…`.

---

## 4. Домен (когда купили)

Подставьте свой домен вместо `example.ru`.

### DNS у регистратора

| Тип | Имя | Значение |
|-----|-----|----------|
| A | `@` (корень) | `94.242.58.24` |
| A | `www` | `94.242.58.24` |

Подождите 5–60 минут (иногда до суток).

### Nginx + HTTPS на сервере

```bash
ssh root@94.242.58.24

# 1) Конфиг с доменом
cp /home/deploy/Delores-object/scripts/deploy/nginx-site.conf.example \
   /etc/nginx/sites-available/delores-object
# отредактируйте server_name: example.ru www.example.ru
nano /etc/nginx/sites-available/delores-object

ln -sf /etc/nginx/sites-available/delores-object /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# 2) Сертификат Let's Encrypt
apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d example.ru -d www.example.ru
```

После этого сотрудники открывают **`https://example.ru/`**.

Подробности ещё в [DEPLOY.ru.md](./DEPLOY.ru.md) §7.

---

## 5. Бэкап данных (чтобы не потерять отчёты/задачи/фото)

На сервере лежат файлы API:

`/var/lib/deloresh/site-forms/`

Раз в неделю (или перед крупным релизом):

```bash
ssh root@94.242.58.24 \
  'tar czf /root/deloresh-forms-$(date +%F).tgz /var/lib/deloresh/site-forms && ls -lh /root/deloresh-forms-*.tgz | tail -3'
```

Скачать архив на Mac:

```bash
scp root@94.242.58.24:/root/deloresh-forms-YYYY-MM-DD.tgz ~/Backups/
```

Код и так на GitHub — отдельно бэкапить репозиторий не обязательно,
но не мешает иметь zip свежего `main`.

---

## 6. Полезные команды на сервере

```bash
ssh root@94.242.58.24

systemctl status site-forms nginx
journalctl -u site-forms -n 80 --no-pager   # логи API
systemctl restart site-forms                # перезапуск API
```

Откат фронта к предыдущему коммиту на сервере — см. [DEPLOY.ru.md](./DEPLOY.ru.md) §8.

---

## 7. Чек-лист «мне не о чем переживать»

- [ ] Могу зайти на GitHub с телефона/другого ПК
- [ ] `ssh root@94.242.58.24` работает без Cursor
- [ ] `npm run deploy:live -- root@94.242.58.24` отрабатывает с Mac
- [ ] Знаю, где DNS домена и куда ставить A → `94.242.58.24`
- [ ] Хотя бы один свежий tar-бэкап `site-forms` лежит у меня на диске
- [ ] В README и в этом файле актуальные ссылки/IP

Если все пункты отмечены — блокировка Cursor **не останавливает** ни прод, ни правки.
