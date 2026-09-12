# Промпт агенту: стандартный пайплайн DWG (загрузка → план → инструменты)

Скопируй в чат, когда «новый DWG не открывается / нет заливки / опять чиним как Анохину».

## Цель продукта

Любой авторизованный сотрудник загружает `.dwg` в **любой** объект → сервер сам готовит PNG+DXF →
открытие, заливка, точки, отметки, зоны работают **без ручной доводки под один файл**.

Документ для людей: `docs/DWG-STANDARD.ru.md`.
Заливка по пикселям: `docs/AGENT-MEASURE-FILL.prompt.ru.md`.

## Железобетонный пайплайн (не ломай)

```
upload (Bearer/write-secret)
  → save blob + manifest
  → kickPngPreview (ACadSharp Dwg2Png) ∥ kickDxfPreview (Libre→ACadSharp)
  → pngPreviewStatus: pending → ready | failed (с авто-retry)
open
  → сразу URL PNG (не ждать DXF, не ждать Image.onload)
  → tools на растре + pngWorldBounds

replace (PUT project-files/:id/blob)
  → тот же fileId, blob перезаписан, превью пересобраны
  → отметки переносятся по planMap, чертёж остаётся featured

delete
  → blob + PNG + DXF + sidecar meta + надгробия отметок
```

1. **PNG = источник правды** для плана/заливки. DXF — запасной путь.
2. **Не** добавляй site-specific хаки (только olympiyskaya / только anokhina).
3. **`failed` не вечный**: GET должен уметь перезапустить kick после cooldown / по «Обновить план».
4. Regenerate: staff Bearer **или** write-secret (`?regenerate=1`).
5. Новая версия чертежа — **замена по тому же id**, не второй файл: иначе отметки остаются на мёртвом `fileId`.
6. После правок пайплайна — `tsc`, релевантные тесты, bump `public/sw.js`, `deploy:live`.

## Координаты отметок (частый источник тихих регрессий)

`space: 'plan'` — это **пиксели конкретного PNG**. Поэтому в отметке хранится
`planW/planH` и `planMap` (привязка пикселей к координатам чертежа).

- Меняешь размер рендера (`pickPngRenderWidth`) — отметки должны выжить: их пересчитывает
  `rescalePlanMarksForImage` при чтении, **без записи** в хранилище.
- Никогда не «чини» позиции отметок миграцией в localStorage: при слиянии между
  устройствами это даёт пинг-понг.
- Удаление чертежа — только надгробия (`deletedAtIso` + пустая геометрия).
  Жёсткое удаление отметок возвращается обратно при sync с другого телефона.
- `pickFeaturedDrawing`: ручной выбор важнее готовности плана, иначе замена
  чертежа молча показывает прошлую версию.

## Типичные ложные «поломки»

| Симптом | Часто реальная причина | Не делать |
|---------|------------------------|-----------|
| «Не удалось открыть» | Старый SW / таймаут ожидания PNG / local failed | Переписывать заливку |
| Пустой план | `pngPreviewStatus=failed` без retry | Ручной SSH только как last resort |
| Долгое открытие | Ждали DXF/Blob вместо URL PNG | Вернуть ожидание DXF в happy-path |
| Заливка «не та» | См. AGENT-MEASURE-FILL | Чинить upload |
| «Отметки пропали» | Чертёж загрузили заново → новый `fileId` | Переписывать формат отметок |
| «Отметки съехали» | План перерисован в другом разрешении | Править координаты вручную |

## Файлы

- `server/site-forms.mjs` — POST upload, GET png/dxf-preview, kick
- `server/dwg-preview.mjs` — Dwg2Png/Dwg2Dxf, mark ready/failed, caps ~2048
- `src/features/site-detail/SiteProjectHeaderCard.tsx` — upload/replace/delete/open/UI статуса
- `src/lib/dwgPreview.ts`, `src/lib/siteFormsApi.ts` — клиент превью
- `src/lib/dwgPlanMarksRepository.ts` — отметки, `planMap`, пересчёт и надгробия
- `src/lib/featuredDrawing.ts` — какой DWG основной на объекте

## Definition of done для «пайплайн ок»

1. Загрузка тестового DWG под staff → за минуты `pngPreviewStatus=ready` + `pngWorldBounds`.
2. Открытие без текста ошибки; виден цветной план.
3. Заливка/точки не регрессировали на Olympic (если трогал measure — crop proof).
4. «Заменить» на новую версию: отметки на месте, старый blob перезаписан, файл остался основным.
5. «Удалить»: на сервере нет blob/превью/sidecar, отметки погашены, с другого телефона не возвращаются.
6. SW на live обновлён; в доке стандарта шаги для сотрудника актуальны.
