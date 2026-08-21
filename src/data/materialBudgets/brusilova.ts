import type { MaterialBudget } from '../../domain/materialBudget'

/**
 * Смета расхода материалов — ул. Брусилова.
 *
 * Составлена по фактическому перечню использованных материалов объекта.
 * Давальческие и покупные позиции одного материала объединены в одну
 * статью (источник поставки — не вид материала).
 *
 * Единицы согласованы с каталогом `PROCUREMENT_MATERIAL_PRESETS`.
 * Группы — по технологическому циклу дорожного строительства.
 *
 * `planned` — предварительный расчёт; когда придёт точная ведомость —
 * правим цифры здесь.
 */
export const BRUSILOVA_MATERIAL_BUDGET: MaterialBudget = {
  siteId: 'brusilova',
  siteName: 'Брусилова',
  asOfIso: '2026-08-19T00:00:00.000Z',
  articles: [
    /* ── Земляные работы ─────────────────────────────────────────── */
    {
      id: 'sand-quarry',
      presetId: 'sand-quarry',
      title: 'Песок карьерный',
      group: 'Земляные работы',
      unit: 'm3',
      planned: 8_600,
    },

    /* ── Основания ───────────────────────────────────────────────── */
    {
      id: 'crushed-5-20',
      presetId: 'crushed-granite-5-20',
      title: 'Щебень гранитный фр. 5–20',
      group: 'Основания',
      unit: 'm3',
      planned: 2_880,
    },
    {
      id: 'crushed-20-40',
      presetId: 'crushed-granite-20-40',
      title: 'Щебень гранитный фр. 20–40',
      group: 'Основания',
      unit: 'm3',
      planned: 9_120,
    },
    {
      id: 'crushed-40-70',
      presetId: 'crushed-granite-40-70',
      title: 'Щебень гранитный фр. 40–70',
      group: 'Основания',
      unit: 'm3',
      planned: 3_400,
    },
    {
      id: 'shgps-c4',
      presetId: 'crushed-shgps-c4',
      title: 'ЩГПС С4',
      group: 'Основания',
      unit: 'm3',
      planned: 4_500,
    },

    /* ── Бетон ───────────────────────────────────────────────────── */
    {
      id: 'concrete-b7-5',
      presetId: 'concrete-b7-5',
      title: 'Бетон тощий B7,5 (М100)',
      group: 'Бетон',
      unit: 'm3',
      planned: 420,
    },
    {
      id: 'concrete-b15',
      presetId: 'concrete-b15',
      title: 'Бетон товарный B15 (М200)',
      group: 'Бетон',
      unit: 'm3',
      planned: 800,
    },
    {
      id: 'concrete-b22-5',
      presetId: 'concrete-b22-5',
      title: 'Бетон товарный B22,5 (М300)',
      group: 'Бетон',
      unit: 'm3',
      planned: 240,
    },

    /* ── Бортовой камень ─────────────────────────────────────────── */
    {
      id: 'curb-road',
      presetId: 'curb-br-100-30-15',
      title: 'Бордюр дорожный БР 100.30.15',
      group: 'Бортовой камень',
      unit: 'pcs',
      planned: 14_400,
    },
    {
      id: 'curb-r3',
      presetId: 'curb-radius-r3',
      title: 'Бордюр радиусный R3',
      group: 'Бортовой камень',
      unit: 'pcs',
      planned: 320,
    },
    {
      id: 'curb-r6',
      presetId: 'curb-radius-r6',
      title: 'Бордюр радиусный R6',
      group: 'Бортовой камень',
      unit: 'pcs',
      planned: 180,
    },
    {
      id: 'curb-comp',
      presetId: 'curb-compensator-15',
      title: 'Компенсатор бордюрный 15',
      group: 'Бортовой камень',
      unit: 'pcs',
      planned: 260,
    },

    /* ── Асфальт ─────────────────────────────────────────────────── */
    {
      id: 'asphalt-kz-b',
      presetId: 'asphalt-type-b',
      title: 'Асфальтобетон КЗ тип Б марка I (нижний слой)',
      group: 'Асфальт',
      unit: 't',
      planned: 8_400,
    },
    {
      id: 'asphalt-mz',
      presetId: 'asphalt-type-b-mz',
      title: 'Асфальтобетон МЗ (мелкозернистый)',
      group: 'Асфальт',
      unit: 't',
      planned: 3_200,
    },
    {
      id: 'asphalt-sandy',
      presetId: 'asphalt-sandy',
      title: 'Асфальтобетон песчаный (тротуары)',
      group: 'Асфальт',
      unit: 't',
      planned: 2_100,
    },
    {
      id: 'asphalt-shma',
      presetId: 'asphalt-shma-20',
      title: 'ЩМА-20 (верхний слой магистралей)',
      group: 'Асфальт',
      unit: 't',
      planned: 1_800,
    },

    /* ── Дорожная химия ──────────────────────────────────────────── */
    {
      id: 'emulsion',
      presetId: 'emulsion-edkb-b',
      title: 'Эмульсия битумная ЭДКБ-Б',
      group: 'Дорожная химия',
      unit: 't',
      planned: 45,
    },

    /* ── Благоустройство ─────────────────────────────────────────── */
    {
      id: 'topsoil',
      presetId: 'topsoil-chernozem',
      title: 'Чернозём (растительный грунт)',
      group: 'Благоустройство',
      unit: 'm3',
      planned: 5_500,
    },
  ],
}
