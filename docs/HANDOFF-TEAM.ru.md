# Передача проекта команде разработки

Документ для **нанятых IT-специалистов**: продукт, стек, где что лежит, что уже на сервере, что трогать осторожно.

См. также короткую карту правок: **[FOR-DEVELOPERS.ru.md](./FOR-DEVELOPERS.ru.md)**.

## Продукт

- **Репозиторий:** `deloresh-objects` (бренд «Деловые Решения» / Deloresh Objects).
- **Назначение:** операционка стройки — объекты, задачи сотрудникам, спецтехника, рейсы водителей, чертежи DWG, заявки/отчёты/медиа.
- **Прод:** `http://94.242.58.24/` (домен/HTTPS — когда DNS укажет на этот VPS).
- **GitHub:** https://github.com/dakaevinc-stack/Delores-object

Заказчик будет **продолжать менять** UI и процессы — сохраняйте модульность и не ломайте синхронизацию между устройствами.

## Стек

| Слой | Технологии |
|------|------------|
| UI | React 19, TypeScript, CSS Modules |
| Сборка | Vite 8 |
| Маршруты | React Router 7 |
| API | Node.js (`server/site-forms.mjs`), systemd `site-forms`, nginx `/api` → `:8787` |
| Auth | `POST /api/auth/login` → Bearer; пароли только в `server/staff-passwords.mjs` |
| Тесты | Vitest; живой аудит `npm run test:live`; viewport `npm run test:smoke` |
| Деплой с Mac | `npm run deploy:live -- root@94.242.58.24` |

Node.js **20+**.

## Запуск

```bash
npm ci
npm run dev              # SPA + при необходимости отдельно: npm run dev:site-forms-api
npm run check            # lint + test + build
npm run test:live        # smoke против прода (нужен SSH к VPS)
```

Локально API: см. `.env.example` (`VITE_SITE_FORMS_API_BASE`, `VITE_SITE_FORMS_WRITE_SECRET`).
На сервере секреты в `/etc/deloresh/site-forms.env` и `.env` у `deploy` (rsync **не** затирает `.env`).

## Архитектура данных (актуально)

| Область | Где правда | Клиент |
|---------|------------|--------|
| Задачи, чат, seen, soft-delete | Сервер `staff-tasks.json` + merge | `staffTasksRepository`, `useStaffTasks` |
| Медиа задач | `staff-task-blobs/` | `staffTaskMedia`, `StaffTaskMedia` |
| Логин | Сессии `staff-sessions.json` | `localSession` **v2** (нужен `token`) |
| Отчёты бригадира, заявки, медиа объектов, DWG-файлы | Сервер под `sites/<id>/…` | `siteFormsApi` |
| План дня, метки на плане | Сервер | `workDayPlan*`, `dwgPlanMarksRepository` |
| Парк / overrides / user-sites | Сервер + кэш | `crossDeviceSync`, `fleetRegistry` |
| Часть цифр KPI / ТО / страховок | **Моки** в `src/data/*` | не путать с «живыми» формами |
| Приёмка техники | Внешний Streamlit `:8501` | `VITE_AMEDA_INSPECTION_DASHBOARD_URL` |

Кэш в `localStorage` — ускорение и офлайн-черновик; **источник истины для живых сущностей — API**.

Данные на VPS: `/var/lib/deloresh/site-forms/`.  
Бэкап: cron → `/var/backups/deloresh/` (`scripts/deploy/backup-site-forms.sh`).

## Структура репозитория

```
src/
  app/           # маршруты, ErrorBoundary
  pages/         # экраны
  features/      # UI фич (tasks, site-detail, fleet, driver…)
  domain/        # чистая логика без I/O (staffTask, staffDirectory…)
  data/          # моки / пресеты
  lib/           # API-клиент, репозитории, sync
server/          # site-forms.mjs, staff-auth, staff-passwords
scripts/deploy/  # publish, nginx examples, backup cron
docs/            # этот файл, OWN-PROJECT, DEPLOY, FIELD-TEST…
```

### Крупные файлы (не рвать без нужды)

| Файл | Зачем осторожность |
|------|-------------------|
| `DwgViewerChrome.tsx` (~5k строк) | Жесты, zoom, метки, мобильный UX |
| `dwgPngRegionPick.ts`, measure/pick | Геометрия плана |
| `FleetVehiclePage.tsx` | Много секций карточки |
| `site-forms.mjs` | Все HTTP-ручки и merge |
| `siteFormsApi.ts` | Клиентский контракт API |

Дробить имеет смысл **по секциям + тестам**, не «ради красоты».

## Что передать разработчикам

1. GitHub + этот файл + **FOR-DEVELOPERS.ru.md** + **DEPLOY.ru.md** + **OWN-PROJECT.ru.md**.
2. SSH на VPS и понимание, что `.env` / write-secret / пароли сотрудников **не в git**.
3. Критерии приёмки (пример: «задача с телефона A видна на B за 20 с»).
4. Полевой чек-лист: **FIELD-TEST.ru.md**.

## Правила, чтобы не сломать прод

1. **Не класть пароли** в `src/` и не коммитить `server/staff-passwords.mjs`
   (в git только `server/staff-passwords.example.mjs`).
2. Задачи: любой upsert должен **мержить** comments/attachments; удаление — **soft-delete** (`deletedAtIso`), иначе устройства «воскресят» задачу.
3. После деплоя: `sw.js` должен отдаваться с **no-cache** (см. nginx examples); bump версии в `public/sw.js`.
4. Не делать полный `PUT` массива задач вместо upsert — гонки между телефонами.
5. Перед релизом: `npm run check`; по возможности `npm run test:live`.

## Известные компромиссы

- Часть KPI/парка — демо-данные; заказчик знает.
- HTTP без домена: микрофон/`getUserMedia` и полноценный PWA ограничены — нужен HTTPS.
- Write-secret сейчас попадает в клиентский бандл (нужен для загрузок файлов) — не светить публично лишний раз; при утечке — ротация на сервере + rebuild.
- ESLint: `react-hooks/set-state-in-effect` ослаблен из‑за sync с props.

## Контакты и процесс

Заполните: ответственный заказчика, чат, ветка CI (`main`), кто делает `deploy:live`.
