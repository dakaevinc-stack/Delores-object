import type { MeasurementUnitId } from './brigadierReport'

/**
 * Каталог материалов для заявок снабженцу.
 *
 * Сделан группированным: 11 категорий (песок, щебень, бордюр, асфальт,
 * трубы, ЖБИ, вывоз отходов, спецтехника, грунт, инструмент) с
 * 1–4 ходовыми позициями в каждой. Каждая позиция несёт короткую
 * подсказку (`subtitle`) — чтобы при выборе из списка снабженец сразу
 * понимал, о какой именно фракции/диаметре/марке речь.
 *
 * Дополнительно у позиции есть `aliases` — альтернативные написания,
 * по которым работает поиск в форме (например, «труба 110я» найдёт
 * ПВХ D110, «5-20» — гранит 5–20).
 *
 * Расширять список — здесь, в одном месте. После добавления позиции
 * она автоматически появится в форме, в поиске, в шапке заявки и в
 * экспорте (TXT/CSV).
 */

export type ProcurementCategoryId =
  | 'sand'
  | 'crushed-stone'
  | 'curb'
  | 'granite-curb'
  | 'asphalt'
  | 'plastic-pipes'
  | 'rcc'
  | 'waste-removal'
  | 'machinery'
  | 'topsoil'
  | 'tools'
  | 'labor'

export type ProcurementCategory = {
  readonly id: ProcurementCategoryId
  readonly title: string
  /** Однострочное пояснение всей группы. */
  readonly hint: string
  /** Декоративный набор, что-бы CSS могла подставить иконку и акцент. */
  readonly accent:
    | 'sand'
    | 'stone'
    | 'concrete'
    | 'asphalt'
    | 'pipe'
    | 'truck'
    | 'machinery'
    | 'soil'
    | 'tool'
    | 'people'
}

export type ProcurementPreset = {
  /** Стабильный slug — попадает в localStorage / в JSON заявки. Никогда не переименовывать. */
  readonly id: string
  readonly categoryId: ProcurementCategoryId
  /** Полное профессиональное название, отображается в карточке. */
  readonly title: string
  /** Подсказка под названием, ≤ 90 символов, чтобы помещалась в одну-две строки. */
  readonly subtitle: string
  /** Единица измерения по умолчанию (можно переопределить в строке заявки). */
  readonly defaultUnit: MeasurementUnitId
  /** Альтернативные написания для поиска: лоу-кейс, без точек. */
  readonly aliases?: readonly string[]
}

/* ─── Категории ────────────────────────────────────────────────────── */

export const PROCUREMENT_CATEGORIES: readonly ProcurementCategory[] = [
  { id: 'sand', title: 'Песок', hint: 'для бетона, подсыпок и обратной засыпки', accent: 'sand' },
  { id: 'crushed-stone', title: 'Щебень', hint: 'по фракции и породе', accent: 'stone' },
  { id: 'curb', title: 'Бордюр бетонный', hint: 'по ГОСТ 6665, длина 100 см', accent: 'concrete' },
  { id: 'granite-curb', title: 'Бордюр гранитный', hint: 'пилёный или колотый', accent: 'concrete' },
  { id: 'asphalt', title: 'Асфальт', hint: 'по слоям и типам смеси', accent: 'asphalt' },
  { id: 'plastic-pipes', title: 'Трубы пластиковые', hint: 'по диаметру и назначению', accent: 'pipe' },
  { id: 'rcc', title: 'ЖБИ-изделия', hint: 'колодцы, плиты, лотки', accent: 'concrete' },
  { id: 'waste-removal', title: 'Вывоз отходов', hint: 'в бортах самосвала (≈10–12 м³)', accent: 'truck' },
  { id: 'machinery', title: 'Спецтехника', hint: 'все классы из реестра парка, аренда смен', accent: 'machinery' },
  { id: 'topsoil', title: 'Грунт растительный', hint: 'для газонов и озеленения', accent: 'soil' },
  { id: 'tools', title: 'Инструмент', hint: 'малая механизация (бензорез, виброплита и пр.), в сменах', accent: 'tool' },
  { id: 'labor', title: 'Бригада', hint: 'дополнительные люди на объект — на смену или вахту', accent: 'people' },
] as const

/* ─── Позиции каталога ─────────────────────────────────────────────── */

export const PROCUREMENT_MATERIAL_PRESETS: readonly ProcurementPreset[] = [
  /* ── Песок (м³) ── */
  {
    id: 'sand-quarry',
    categoryId: 'sand',
    title: 'Песок карьерный',
    subtitle: 'крупнозернистый — подсыпки и обратная засыпка',
    defaultUnit: 'm3',
    aliases: ['песок', 'карьер'],
  },
  {
    id: 'sand-river-washed',
    categoryId: 'sand',
    title: 'Песок речной мытый',
    subtitle: 'чистый — для бетона и плиточных работ',
    defaultUnit: 'm3',
    aliases: ['речной', 'мытый'],
  },
  {
    id: 'sand-construction',
    categoryId: 'sand',
    title: 'Песок строительный, Мк ≥ 2.0',
    subtitle: 'средне-крупный — под подушки и цементные смеси',
    defaultUnit: 'm3',
    aliases: ['строительный', 'мк'],
  },

  /* ── Щебень (т) ── */
  {
    id: 'crushed-granite-5-20',
    categoryId: 'crushed-stone',
    title: 'Щебень гранитный 5–20',
    subtitle: 'асфальтобетон, бетонные смеси',
    defaultUnit: 't',
    aliases: ['щебень', '5-20', '5 20', 'гранит 5'],
  },
  {
    id: 'crushed-granite-20-40',
    categoryId: 'crushed-stone',
    title: 'Щебень гранитный 20–40',
    subtitle: 'основания дорог, дренаж',
    defaultUnit: 't',
    aliases: ['20-40', '20 40', 'гранит 20'],
  },
  {
    id: 'crushed-gravel-5-20',
    categoryId: 'crushed-stone',
    title: 'Щебень гравийный 5–20',
    subtitle: 'подсыпки, дешёвый аналог гранита',
    defaultUnit: 't',
    aliases: ['гравий', 'гравийный'],
  },

  /* ── Бордюр бетонный (шт.) ── */
  {
    id: 'curb-br-100-30-15',
    categoryId: 'curb',
    title: 'Бордюр БР 100.30.15',
    subtitle: 'дорожный, между проезжей частью и тротуаром',
    defaultUnit: 'pcs',
    aliases: ['бр 100', 'бр1003015', 'бортовой', 'бк'],
  },
  {
    id: 'curb-br-100-20-8',
    categoryId: 'curb',
    title: 'Бордюр БР 100.20.8',
    subtitle: 'тротуарный (магистральный пешеходный)',
    defaultUnit: 'pcs',
    aliases: ['бр 100 20', 'тротуарный'],
  },

  /* ── Бордюр гранитный (п.м.) ── */
  {
    id: 'granite-curb-300x150',
    categoryId: 'granite-curb',
    title: 'Бордюр гранитный пилёный 300×150',
    subtitle: 'дорожный гранит, погонный метр',
    defaultUnit: 'lm',
    aliases: ['гранитный', 'гп 300', 'гп300150'],
  },
  {
    id: 'granite-curb-200x80',
    categoryId: 'granite-curb',
    title: 'Бордюр гранитный пилёный 200×80',
    subtitle: 'тротуарный гранит, погонный метр',
    defaultUnit: 'lm',
    aliases: ['гп 200', 'гп20080'],
  },

  /* ── Асфальт (т) ── */
  {
    id: 'asphalt-type-a-15',
    categoryId: 'asphalt',
    title: 'Асфальтобетон тип А-15',
    subtitle: 'верхний слой — основные проезды и магистрали',
    defaultUnit: 't',
    aliases: ['а15', 'верхний', 'абс'],
  },
  {
    id: 'asphalt-type-b',
    categoryId: 'asphalt',
    title: 'Асфальтобетон тип Б',
    subtitle: 'нижний (выравнивающий) слой основания',
    defaultUnit: 't',
    aliases: ['тип б', 'нижний', 'выравнивающий'],
  },
  {
    id: 'asphalt-cold',
    categoryId: 'asphalt',
    title: 'Холодный асфальт',
    subtitle: 'ямочный ремонт круглый год, без катка',
    defaultUnit: 't',
    aliases: ['ямочный', 'холодный'],
  },

  /* ── Трубы пластиковые (п.м.) ── */
  {
    id: 'pipe-pe-d63',
    categoryId: 'plastic-pipes',
    title: 'Труба ПНД D63',
    subtitle: 'водопровод, наружные сети низкого давления',
    defaultUnit: 'lm',
    aliases: ['труба 63', '63я', 'пнд 63', 'пэ 63'],
  },
  {
    id: 'pipe-pe-d110',
    categoryId: 'plastic-pipes',
    title: 'Труба ПНД D110',
    subtitle: 'магистрали водоснабжения',
    defaultUnit: 'lm',
    aliases: ['труба 110', '110я', 'пнд 110', 'пэ 110'],
  },
  {
    id: 'pipe-pvc-d110',
    categoryId: 'plastic-pipes',
    title: 'Труба ПВХ D110 канализационная',
    subtitle: 'внутриквартальные канализационные сети',
    defaultUnit: 'lm',
    aliases: ['пвх 110', 'канализация 110'],
  },
  {
    id: 'pipe-pvc-d160',
    categoryId: 'plastic-pipes',
    title: 'Труба ПВХ D160 канализационная',
    subtitle: 'магистральная ливневая канализация',
    defaultUnit: 'lm',
    aliases: ['пвх 160', 'ливневка 160'],
  },

  /* ── ЖБИ (шт.) ── */
  {
    id: 'rcc-ks-15-9',
    categoryId: 'rcc',
    title: 'Кольцо колодца КС 15.9',
    subtitle: 'Ø1,5 × 0,9 м — стандартный колодец',
    defaultUnit: 'pcs',
    aliases: ['кс 15', 'кольцо 1500', 'жби'],
  },
  {
    id: 'rcc-pp-1-15',
    categoryId: 'rcc',
    title: 'Крышка-плита ПП 1-15',
    subtitle: 'на кольцо КС 15.9',
    defaultUnit: 'pcs',
    aliases: ['пп 1-15', 'крышка 1500'],
  },
  {
    id: 'rcc-road-plate-3000-1750',
    categoryId: 'rcc',
    title: 'Плита дорожная 3000×1750',
    subtitle: 'временные дороги и площадки',
    defaultUnit: 'pcs',
    aliases: ['плита дорожная', 'пд'],
  },

  /* ── Вывоз отходов (борт) ── */
  {
    id: 'waste-concrete-brick',
    categoryId: 'waste-removal',
    title: 'Вывоз: бетон/кирпичный бой',
    subtitle: 'один борт самосвала ≈ 10–12 м³',
    defaultUnit: 'truckload',
    aliases: ['бетон', 'кирпич', 'бой'],
  },
  {
    id: 'waste-soil-iv',
    categoryId: 'waste-removal',
    title: 'Вывоз: грунт IV категории',
    subtitle: 'глина, суглинок — борт',
    defaultUnit: 'truckload',
    aliases: ['грунт', 'глина', 'суглинок'],
  },
  {
    id: 'waste-asphalt-millings',
    categoryId: 'waste-removal',
    title: 'Вывоз: срезка асфальта (фрезерат)',
    subtitle: 'после холодной фрезеровки — борт',
    defaultUnit: 'truckload',
    aliases: ['срезка', 'фрезерат'],
  },

  /* ── Спецтехника (смена) ─────────────────────────────────────────────
     Все 13 классов соответствуют реестру нашего парка
     (FLEET_CATEGORIES в src/data/fleet.mock.ts). Когда туда добавляется
     новый класс — добавьте такой же сюда, чтобы бригадир мог его
     заявить. ID связан с fleetCategoryId через хвост `-<id>`. */
  {
    id: 'machinery-light-trucks',
    categoryId: 'machinery',
    title: 'Малотоннажный а/м',
    subtitle: 'материалы малыми партиями, развозка по объектам',
    defaultUnit: 'shift',
    aliases: ['газель', 'малотоннаж', 'фургон'],
  },
  {
    id: 'machinery-buses',
    categoryId: 'machinery',
    title: 'Автобус для персонала',
    subtitle: 'доставка бригады, вахтовые перевозки',
    defaultUnit: 'shift',
    aliases: ['автобус', 'паз', 'вахта'],
  },
  {
    id: 'machinery-special-trucks',
    categoryId: 'machinery',
    title: 'Спецавтомобиль',
    subtitle: 'автокран, гидроподъёмник, цистерна — спецназначение',
    defaultUnit: 'shift',
    aliases: ['спецавто', 'автокран', 'кран', 'вышка', 'ассенизатор'],
  },
  {
    id: 'machinery-dump-trucks',
    categoryId: 'machinery',
    title: 'Самосвал',
    subtitle: 'перевозка сыпучих и строительного мусора (20–25 т)',
    defaultUnit: 'shift',
    aliases: ['самосвал', 'камаз', 'shacman'],
  },
  {
    id: 'machinery-road-tractors',
    categoryId: 'machinery',
    title: 'Седельный тягач',
    subtitle: 'магистральные перевозки с полуприцепом',
    defaultUnit: 'shift',
    aliases: ['тягач', 'фура', 'седельник'],
  },
  {
    id: 'machinery-trailers',
    categoryId: 'machinery',
    title: 'Полуприцеп / прицеп',
    subtitle: 'под ваш тягач — длинномер, низкорамник, тент',
    defaultUnit: 'shift',
    aliases: ['полуприцеп', 'прицеп', 'низкорамник'],
  },
  {
    id: 'machinery-front-loaders',
    categoryId: 'machinery',
    title: 'Фронтальный погрузчик',
    subtitle: 'погрузка сыпучих и навалов',
    defaultUnit: 'shift',
    aliases: ['фронтальник', 'frontloader'],
  },
  {
    id: 'machinery-mini-loaders',
    categoryId: 'machinery',
    title: 'Минипогрузчик',
    subtitle: 'благоустройство и узкие зоны (Bobcat и аналоги)',
    defaultUnit: 'shift',
    aliases: ['bobcat', 'бобкэт', 'минипогрузчик', 'миник'],
  },
  {
    id: 'machinery-backhoes',
    categoryId: 'machinery',
    title: 'Экскаватор-погрузчик',
    subtitle: 'универсал — траншеи, погрузка, разработка (JCB / Cat)',
    defaultUnit: 'shift',
    aliases: ['jcb', 'cat', 'backhoe', 'экскаватор погрузчик'],
  },
  {
    id: 'machinery-excavators',
    categoryId: 'machinery',
    title: 'Экскаватор',
    subtitle: 'котлованы и траншеи, рабочий орган 1,0–1,5 м³',
    defaultUnit: 'shift',
    aliases: ['экскаватор', 'эо', 'гусеничный', 'волво', 'hitachi'],
  },
  {
    id: 'machinery-rollers',
    categoryId: 'machinery',
    title: 'Каток самоходный',
    subtitle: 'уплотнение оснований и асфальта (5–18 т)',
    defaultUnit: 'shift',
    aliases: ['каток', 'дорожный каток'],
  },
  {
    id: 'machinery-pavers',
    categoryId: 'machinery',
    title: 'Асфальтоукладчик',
    subtitle: 'укладка асфальтобетонных покрытий',
    defaultUnit: 'shift',
    aliases: ['укладчик', 'paver', 'асфальтоукладчик', 'volvo'],
  },
  {
    id: 'machinery-cold-mills',
    categoryId: 'machinery',
    title: 'Дорожная фреза',
    subtitle: 'снятие асфальта, фрезеровка дорожного полотна',
    defaultUnit: 'shift',
    aliases: ['фреза', 'фрезеровка', 'wirtgen'],
  },

  /* ── Грунт растительный (м³) ── */
  {
    id: 'topsoil-chernozem',
    categoryId: 'topsoil',
    title: 'Чернозём (растительный грунт)',
    subtitle: 'газоны, клумбы, озеленение',
    defaultUnit: 'm3',
    aliases: ['чернозем', 'растительный', 'газон'],
  },

  /* ── Машины и инструмент (смена) ── */
  {
    id: 'tool-cutter-asphalt',
    categoryId: 'tools',
    title: 'Бензорез по асфальту/бетону',
    subtitle: 'резка швов и кромок',
    defaultUnit: 'shift',
    aliases: ['бензорез', 'диск'],
  },
  {
    id: 'tool-saw-joint',
    categoryId: 'tools',
    title: 'Шоворез (нарезчик швов)',
    subtitle: 'деформационные швы в бетоне',
    defaultUnit: 'shift',
    aliases: ['шоворез', 'нарезчик'],
  },
  {
    id: 'tool-vibroplate-90',
    categoryId: 'tools',
    title: 'Виброплита 90 кг',
    subtitle: 'уплотнение тротуарных оснований',
    defaultUnit: 'shift',
    aliases: ['виброплита', 'трамбовка'],
  },

  /* ── Бригада (чел.) ─────────────────────────────────────────────────
     Заявка дополнительной рабочей силы на объект — например, когда на
     завтра нужно усилить бригаду на земляные работы. Указывается
     в человеках, объёмно по смене или вахте — детали в комментарии. */
  {
    id: 'labor-workers',
    categoryId: 'labor',
    title: 'Дополнительные рабочие',
    subtitle: 'универсальные рабочие на объект — землекопы, монтажники',
    defaultUnit: 'person',
    aliases: ['рабочие', 'усиление', 'бригада', 'допсилы'],
  },
  {
    id: 'labor-itr',
    categoryId: 'labor',
    title: 'ИТР (мастер / прораб)',
    subtitle: 'инженерно-технический работник на смену',
    defaultUnit: 'person',
    aliases: ['итр', 'мастер', 'прораб', 'инженер'],
  },
  {
    id: 'labor-helpers',
    categoryId: 'labor',
    title: 'Разнорабочие (подсобники)',
    subtitle: 'разгрузка, уборка, вспомогательные работы',
    defaultUnit: 'person',
    aliases: ['подсобники', 'разнорабочие', 'грузчики'],
  },
] as const

/* ─── Утилиты ──────────────────────────────────────────────────────── */

const PRESETS_BY_ID = new Map(
  PROCUREMENT_MATERIAL_PRESETS.map((p) => [p.id, p] as const),
)

const CATEGORY_BY_ID = new Map(
  PROCUREMENT_CATEGORIES.map((c) => [c.id, c] as const),
)

/**
 * Старые presetId, которые могли остаться в localStorage и в JSON
 * заявок на сервере. Если форма видит такой id — открываем как
 * «свободную строку»: title (он лежит в самой записи) + дефолтная
 * единица. Карточка не падает, в ленте отчётов всё на месте.
 */
const LEGACY_PRESET_TO_NEW: Readonly<Record<string, string>> = {
  // Самые первые id с прошлого года (плоский каталог из 5 позиций).
  curb: 'curb-br-100-30-15',
  pipes: 'pipe-pe-d110',
  sand: 'sand-quarry',
  asphalt: 'asphalt-type-a-15',
  'crushed-stone': 'crushed-granite-20-40',
  // Ранние machinery-id (до выравнивания со всеми классами парка).
  'machinery-backhoe': 'machinery-backhoes',
  'machinery-excavator': 'machinery-excavators',
  'machinery-dump-truck': 'machinery-dump-trucks',
  'machinery-roller': 'machinery-rollers',
}

export function findProcurementPreset(id: string | null | undefined): ProcurementPreset | null {
  if (!id) return null
  const direct = PRESETS_BY_ID.get(id)
  if (direct) return direct
  const mapped = LEGACY_PRESET_TO_NEW[id]
  if (mapped) {
    const fallback = PRESETS_BY_ID.get(mapped)
    return fallback ?? null
  }
  return null
}

export function findProcurementCategory(
  id: ProcurementCategoryId | string | null | undefined,
): ProcurementCategory | null {
  if (!id) return null
  return CATEGORY_BY_ID.get(id as ProcurementCategoryId) ?? null
}

/**
 * Нормализация для поиска: lower, ё→е, выкидываем пунктуацию, схлопываем
 * пробелы. Идентичная логика для probe и для целей поиска (title +
 * subtitle + aliases) — гарантирует, что «Труба 110я», «труба 110я»,
 * «ТРУБА.110я» и «труба-110я» дадут одинаковый матч.
 */
function normalizeQuery(s: string): string {
  return s
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Поиск пресета по строке. Учитывает заголовок, подсказку и алиасы.
 * Если строка пустая — возвращает весь каталог в исходном порядке.
 */
export function searchProcurementPresets(query: string): readonly ProcurementPreset[] {
  const q = normalizeQuery(query)
  if (!q) return PROCUREMENT_MATERIAL_PRESETS

  return PROCUREMENT_MATERIAL_PRESETS.filter((p) => {
    if (normalizeQuery(p.title).includes(q)) return true
    if (normalizeQuery(p.subtitle).includes(q)) return true
    if (p.aliases?.some((a) => normalizeQuery(a).includes(q))) return true
    return false
  })
}

/** Группирует пресеты по категории (в исходном порядке категорий). */
export function groupProcurementPresets(
  presets: readonly ProcurementPreset[],
): ReadonlyArray<{
  readonly category: ProcurementCategory
  readonly presets: readonly ProcurementPreset[]
}> {
  const groups: Array<{
    category: ProcurementCategory
    presets: ProcurementPreset[]
  }> = []
  for (const cat of PROCUREMENT_CATEGORIES) {
    const inGroup = presets.filter((p) => p.categoryId === cat.id)
    if (inGroup.length > 0) {
      groups.push({ category: cat, presets: inGroup })
    }
  }
  return groups
}
