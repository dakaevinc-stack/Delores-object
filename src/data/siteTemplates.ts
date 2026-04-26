/**
 * Шаблоны «типов работ» для мастера создания объекта.
 * Каждый шаблон = заготовка этапов (с весами в общем прогрессе)
 * и базовых критериев с плановыми объёмами.
 *
 * Значения выбраны по аналогии с уже заведёнными объектами,
 * чтобы новая площадка «по умолчанию» выглядела осмысленно.
 */

export type SiteTemplateId = 'road' | 'landscape' | 'utilities' | 'custom'

export interface TemplateStage {
  id: string
  name: string
  planPercent: number
}

export interface TemplateCriterion {
  id: string
  name: string
  unit: string
  planUnits: number
}

export interface SiteTemplate {
  id: SiteTemplateId
  name: string
  lead: string
  bullets: readonly string[]
  stages: readonly TemplateStage[]
  criteria: readonly TemplateCriterion[]
}

export const SITE_TEMPLATES: readonly SiteTemplate[] = [
  {
    id: 'road',
    name: 'Дорожные работы',
    lead: 'Проезды, магистрали, устройство покрытия.',
    bullets: [
      'Основание и бортовой камень',
      'Устройство покрытия',
      'Ограждения и знаки',
    ],
    stages: [
      { id: 'prep', name: 'Подготовка', planPercent: 15 },
      { id: 'base', name: 'Основание', planPercent: 25 },
      { id: 'curb', name: 'Бортовой камень', planPercent: 20 },
      { id: 'cover', name: 'Асфальтобетонное покрытие', planPercent: 30 },
      { id: 'finish', name: 'Ограждения и знаки', planPercent: 10 },
    ],
    criteria: [
      { id: 'gravel', name: 'Щебень', unit: 'м³', planUnits: 1800 },
      { id: 'sand', name: 'Песок', unit: 'м³', planUnits: 960 },
      { id: 'curb', name: 'Бортовой камень', unit: 'мп', planUnits: 300 },
      { id: 'asphalt', name: 'Асфальт', unit: 'т', planUnits: 2400 },
    ],
  },
  {
    id: 'landscape',
    name: 'Тротуары и бортовой камень',
    lead: 'Тротуары, установка бортового камня, знаки.',
    bullets: [
      'Подготовка и выкоп траншеи под БК',
      'Установка бортового камня',
      'Устройство тротуаров',
    ],
    stages: [
      { id: 'prep', name: 'Подготовка', planPercent: 15 },
      { id: 'trench', name: 'Выкоп траншеи под БК', planPercent: 25 },
      { id: 'curb', name: 'Установка бортового камня', planPercent: 30 },
      { id: 'pavement', name: 'Устройство тротуаров', planPercent: 30 },
    ],
    criteria: [
      { id: 'curb', name: 'Бортовой камень', unit: 'мп', planUnits: 320 },
      { id: 'gravel', name: 'Щебень под БК', unit: 'м³', planUnits: 260 },
      { id: 'sand', name: 'Песок', unit: 'м³', planUnits: 180 },
    ],
  },
  {
    id: 'utilities',
    name: 'Инженерные сети и комплекс',
    lead: 'Сети, колодцы, конструктив — как в крупных комплексах.',
    bullets: ['Инженерные сети', 'Колодцы и конструктив', 'Ограждения и знаки'],
    stages: [
      { id: 'prep', name: 'Подготовка', planPercent: 15 },
      { id: 'util', name: 'Инженерные сети', planPercent: 35 },
      { id: 'struct', name: 'Конструктив', planPercent: 30 },
      { id: 'finish', name: 'Ограждения и знаки', planPercent: 20 },
    ],
    criteria: [
      { id: 'pipes', name: 'Трубы', unit: 'мп', planUnits: 420 },
      { id: 'gravel', name: 'Щебень', unit: 'м³', planUnits: 800 },
      { id: 'sand', name: 'Песок', unit: 'м³', planUnits: 500 },
    ],
  },
  {
    id: 'custom',
    name: 'Свой шаблон',
    lead: 'Пустая заготовка — этапы и объёмы добавите вручную.',
    bullets: ['Гибкая структура', 'Без пред-заполнения'],
    stages: [],
    criteria: [],
  },
]

export function findTemplate(id: SiteTemplateId): SiteTemplate {
  return SITE_TEMPLATES.find((t) => t.id === id) ?? SITE_TEMPLATES[SITE_TEMPLATES.length - 1]
}
