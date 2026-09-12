# Карта проекта для разработчиков

Куда идти, если нужно **что-то поменять**, не ломая прод.  
Полный контекст: [HANDOFF-TEAM.ru.md](./HANDOFF-TEAM.ru.md).

## Быстрый выбор

| Хочу изменить… | Открыть в первую очередь |
|----------------|--------------------------|
| Главный экран, карточки разделов | `src/pages/HomePage.tsx`, `src/features/home/` |
| Список / создание задач | `src/pages/TasksPage.tsx`, `src/features/tasks/` |
| Карточка задачи, чат, удаление | `src/pages/TaskDetailPage.tsx` |
| Логика задач (фильтры, права) | `src/domain/staffTask.ts` |
| Сохранение/синк задач | `src/lib/staffTasksRepository.ts`, `src/lib/useStaffTasks.ts` |
| API задач / blobs / login | `server/site-forms.mjs`, `src/lib/siteFormsApi.ts` |
| Список сотрудников (ФИО, роль) | `src/domain/staffDirectory.ts` |
| Пароли | **только** `server/staff-passwords.mjs` (не в git; пример — `staff-passwords.example.mjs`) |
| Сессия в браузере | `src/lib/localSession.ts` (ключ `v2` + `token`) |
| Объекты (список) | `src/pages/ObjectsHubPage.tsx` |
| Карточка объекта, зоны ролей | `src/pages/ObjectDetailPage.tsx`, `src/features/site-detail/SiteRoleZone.tsx` |
| Отчёт бригадира / заявка / медиа | `src/features/site-detail/*`, вызовы в `siteFormsApi.ts` |
| Чертёж DWG | `DwgViewerChrome.tsx` + `src/lib/dwg*` — **высокая цена ошибки** |
| Спецтехника | `src/pages/Fleet*`, `src/features/fleet/` |
| Кабинет водителя / рейсы | `src/pages/DriverCabinetPage.tsx`, `server` `driver-trips` |
| Приёмка (ссылка) | `VITE_AMEDA_INSPECTION_DASHBOARD_URL` + Streamlit на `:8501` |
| Деплой / nginx / бэкап | `scripts/deploy/`, `docs/DEPLOY.ru.md` |
| Полевой тест для людей | `docs/FIELD-TEST.ru.md` |

## Слои (не смешивать)

```
UI (pages/features)
    ↓
domain (правила без сети)
    ↓
lib/*Repository + siteFormsApi  (сеть / localStorage)
    ↓
server/site-forms.mjs           (файлы на диске VPS)
```

Новую фичу: сначала тип/правило в `domain`, потом API, потом UI.

## Команды

```bash
npm run dev          # локальная SPA
npm run check        # перед PR / релизом
npm run deploy:live -- root@94.242.58.24
npm run test:live    # живой smoke API (SSH)
```

## Красные зоны (без тестов не рефакторить)

1. Merge задач и plan-marks на сервере.  
2. Soft-delete задач и sync tombstone.  
3. Auth Bearer + фильтрация `GET /api/staff-tasks`.  
4. DWG жесты / viewport lock / pinch-zoom.  
5. Nginx: `location = /sw.js` с `no-cache` (иначе мобилки залипают на старой сборке).

## Безопасные «облегчения» позже

Имеет смысл дробить **по границам ниже**, отдельными PR + `npm run check`:

- `FleetVehiclePage.tsx` → секции паспорт / документы / расходы  
- `SiteObjectMediaDropSection.tsx` → upload vs gallery  
- `site-forms.mjs` → модули `routes/staff-tasks.mjs`, `routes/sites.mjs` (поведение 1:1)

Не делать big-bang переписывание DWG «с нуля» без заказчика.
