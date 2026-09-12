# Участие в разработке

1. Перед коммитом / PR: **`npm run check`** (lint, тесты, сборка).
2. Куда править что: **`docs/FOR-DEVELOPERS.ru.md`**.
3. Передача внешней команде: **`docs/HANDOFF-TEAM.ru.md`**.
4. Сервер и деплой: **`docs/DEPLOY.ru.md`**, для заказчика без IDE — **`docs/OWN-PROJECT.ru.md`**.
5. Резервы / ключи localStorage: **`docs/RECOVERY.ru.md`**.
6. Крупные UI-изменения — по возможности тест или скрин в описании PR.
7. После выкладки на прод: bump `public/sw.js` (SHELL/ASSETS) уже в том же PR, что меняет UI; проверить, что nginx отдаёт `/sw.js` с `no-cache`.

**Не коммитить:** пароли сотрудников, `docs/STAFF-CREDENTIALS.local.md`, `docs/FIELD-TEST-HANDOUT.local.md`, `.env`.

Ветки и code review — по договорённости команды.
