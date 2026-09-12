/** Отметки и комментарии на DWG-плане. Локальный кэш + sync на site-forms API. */

import { fetchPlanMarksRemote, putPlanMarksRemote } from './siteFormsApi'

export type DwgPlanMarkKind = 'ckkb' | 'accepted' | 'issue' | 'note' | 'marker'

export type DwgPlanMarkSpace = 'plan' | 'world'

export type DwgPlanMarkShape =
  | { type: 'point'; x: number; y: number }
  | { type: 'zone'; outline: Array<{ x: number; y: number }>; areaM2?: number }
  | { type: 'stroke'; points: Array<{ x: number; y: number }> }

export type DwgPlanMark = {
  id: string
  siteId: string
  fileId: string
  kind: DwgPlanMarkKind
  space: DwgPlanMarkSpace
  shape: DwgPlanMarkShape
  text: string
  author: string
  /** Порядковый номер на объекте (№1, №2…) — для списка, плана и имён файлов */
  n?: number
  createdAtIso: string
  /** Время последнего изменения — для merge между устройствами */
  updatedAtIso: string
  /** Мягкое удаление: остаётся в sync, скрыто в UI */
  deletedAtIso?: string
  /** Id файлов в Документах (акты сдачи ЦККБ / Сдано) */
  attachmentIds?: string[]
  /**
   * Размер PNG-плана (px), в координатах которого записан shape при space:'plan'.
   * Нужен, чтобы отметки не «съезжали», если план перерисовали в другом разрешении.
   */
  planW?: number
  planH?: number
  /**
   * Привязка пикселей плана к координатам чертежа на момент создания.
   * С ней отметка встаёт на место даже если у нового чертежа другие габариты.
   */
  planMap?: DwgPlanMarkMap
}

/** Пиксели PNG ↔ координаты чертежа (тот же смысл, что PngWorldMapping). */
export type DwgPlanMarkMap = {
  originX: number
  originY: number
  pixelsPerUnit: number
  offsetX: number
  offsetY: number
  imgH: number
}

export type DwgPlanMarksBundle = {
  siteId: string
  marks: DwgPlanMark[]
}

export type DwgPlanMarkFilter = {
  kinds?: DwgPlanMarkKind[] | 'all'
  author?: string | 'all'
  period?: 'today' | 'week' | 'all'
  /** Локальная дата YYYY-MM-DD — начало периода (включительно) */
  dateFrom?: string
  /** Локальная дата YYYY-MM-DD — конец периода (включительно) */
  dateTo?: string
}

export const DWG_PLAN_MARK_KINDS: ReadonlyArray<{
  id: DwgPlanMarkKind
  label: string
  color: string
  fill: string
}> = [
  { id: 'accepted', label: 'Выполнено', color: '#34d399', fill: 'rgba(52, 211, 153, 0.38)' },
  { id: 'ckkb', label: 'ЦККБ', color: '#a78bfa', fill: 'rgba(167, 139, 250, 0.38)' },
  { id: 'issue', label: 'Замечание', color: '#f87171', fill: 'rgba(248, 113, 113, 0.38)' },
  { id: 'note', label: 'Комментарий', color: '#fbbf24', fill: 'rgba(251, 191, 36, 0.38)' },
  { id: 'marker', label: 'Маркер', color: '#ffffff', fill: 'rgba(255, 255, 255, 0.22)' },
]

/** Короткие подписи для компактных кнопок статуса / фильтра. */
export const DWG_PLAN_MARK_KIND_SHORT: Record<DwgPlanMarkKind, string> = {
  accepted: 'Выполнено',
  ckkb: 'ЦККБ',
  issue: 'Замеч.',
  note: 'Коммент.',
  marker: 'Маркер',
}

/** Старый кэш по файлу — мигрируем в v2 (по объекту). */
const STORAGE_PREFIX_V1 = 'deloresh.dwg-plan-marks.v1'
const STORAGE_PREFIX = 'deloresh.dwg-plan-marks.v2'

function storageKey(siteId: string): string {
  return `${STORAGE_PREFIX}.${siteId}`
}

function newId(): string {
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function isKnownMarkKind(kind: string): kind is DwgPlanMarkKind {
  return DWG_PLAN_MARK_KINDS.some((k) => k.id === kind)
}

function markRevisionIso(mark: Pick<DwgPlanMark, 'updatedAtIso' | 'createdAtIso' | 'deletedAtIso'>): string {
  if (mark.deletedAtIso) return mark.deletedAtIso
  if (mark.updatedAtIso) return mark.updatedAtIso
  return mark.createdAtIso
}

function isValidMarkNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 1
}

function isValidPlanSize(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 16
}

function normalizeMark(row: DwgPlanMark): DwgPlanMark {
  const updatedAtIso = row.updatedAtIso || row.createdAtIso
  const next: DwgPlanMark = {
    ...row,
    updatedAtIso,
  }
  if (isValidMarkNumber(row.n)) next.n = Math.floor(row.n)
  else delete next.n
  if (row.deletedAtIso) next.deletedAtIso = row.deletedAtIso
  if (isValidPlanSize(row.planW) && isValidPlanSize(row.planH)) {
    next.planW = Math.round(row.planW)
    next.planH = Math.round(row.planH)
  } else {
    delete next.planW
    delete next.planH
  }
  if (!isUsablePlanMap(row.planMap)) delete next.planMap
  return next
}

/** Подпись для плана/списка: «№12 ЦККБ». */
export function formatDwgPlanMarkLabel(
  mark: Pick<DwgPlanMark, 'kind' | 'n'>,
  opts?: { short?: boolean },
): string {
  const kind = opts?.short === false
    ? (DWG_PLAN_MARK_KINDS.find((k) => k.id === mark.kind)?.label ?? DWG_PLAN_MARK_KIND_SHORT[mark.kind])
    : DWG_PLAN_MARK_KIND_SHORT[mark.kind]
  if (isValidMarkNumber(mark.n)) return `№${mark.n} ${kind}`
  return kind
}

export function isDwgPlanMark(row: unknown): row is DwgPlanMark {
  if (!row || typeof row !== 'object') return false
  const r = row as DwgPlanMark
  const updatedOk =
    r.updatedAtIso === undefined || typeof r.updatedAtIso === 'string'
  const deletedOk =
    r.deletedAtIso === undefined || typeof r.deletedAtIso === 'string'
  const attachmentsOk =
    r.attachmentIds === undefined ||
    (Array.isArray(r.attachmentIds) && r.attachmentIds.every((x) => typeof x === 'string'))
  const nOk = r.n === undefined || isValidMarkNumber(r.n)
  // planW/planH не валидируем строго: неверные значения чистит normalizeMark,
  // терять из-за них всю отметку нельзя.
  return (
    typeof r.id === 'string' &&
    typeof r.siteId === 'string' &&
    typeof r.fileId === 'string' &&
    typeof r.kind === 'string' &&
    isKnownMarkKind(r.kind) &&
    (r.space === 'plan' || r.space === 'world') &&
    typeof r.text === 'string' &&
    typeof r.author === 'string' &&
    typeof r.createdAtIso === 'string' &&
    updatedOk &&
    deletedOk &&
    attachmentsOk &&
    nOk &&
    r.shape != null &&
    typeof r.shape === 'object'
  )
}

/** Макс. номер по объекту (включая удалённые), чтобы номера не переиспользовались. */
export function maxDwgPlanMarkNumber(marks: readonly DwgPlanMark[]): number {
  let max = 0
  for (const m of marks) {
    if (isValidMarkNumber(m.n) && m.n > max) max = m.n
  }
  return max
}

export function nextDwgPlanMarkNumber(siteId: string): number {
  return maxDwgPlanMarkNumber(readSiteMarks(siteId)) + 1
}

/** Старым отметкам без n — номера по дате создания. */
export function backfillDwgPlanMarkNumbers(marks: readonly DwgPlanMark[]): {
  marks: DwgPlanMark[]
  changed: boolean
} {
  let max = maxDwgPlanMarkNumber(marks)
  let changed = false
  const chronological = [...marks].sort((a, b) => {
    const byDate = a.createdAtIso.localeCompare(b.createdAtIso)
    return byDate !== 0 ? byDate : a.id.localeCompare(b.id)
  })
  const byId = new Map(marks.map((m) => [m.id, normalizeMark(m)]))
  for (const m of chronological) {
    const cur = byId.get(m.id)!
    if (isValidMarkNumber(cur.n)) continue
    max += 1
    byId.set(m.id, { ...cur, n: max })
    changed = true
  }
  return { marks: [...byId.values()], changed }
}

/** Ширины, в которых сервер рендерит план — для старых отметок без planW. */
const PLAN_RENDER_WIDTH_STEPS = [1536, 2048, 3072, 4096, 5120, 6144, 8192, 12288, 16384, 20480]

function markPlanPoints(mark: DwgPlanMark): Array<{ x: number; y: number }> {
  if (mark.shape.type === 'point') return [{ x: mark.shape.x, y: mark.shape.y }]
  if (mark.shape.type === 'zone') return mark.shape.outline
  return mark.shape.points
}

function scalePlanShape(shape: DwgPlanMarkShape, sx: number, sy: number): DwgPlanMarkShape {
  // areaM2 — площадь в метрах, от разрешения плана не зависит и не пересчитывается.
  if (shape.type === 'point') return { ...shape, x: shape.x * sx, y: shape.y * sy }
  if (shape.type === 'zone') {
    return { ...shape, outline: shape.outline.map((p) => ({ x: p.x * sx, y: p.y * sy })) }
  }
  return { ...shape, points: shape.points.map((p) => ({ x: p.x * sx, y: p.y * sy })) }
}

/**
 * Старые отметки planW не писали. Если координаты не влезают в текущий план,
 * значит его перерисовали мельче — восстанавливаем прежнюю ширину по шагам рендера.
 * Если влезают — считаем, что план тот же.
 */
export function inferLegacyPlanWidth(mark: DwgPlanMark, imgW: number, imgH: number): number {
  const pts = markPlanPoints(mark)
  if (pts.length === 0 || imgW <= 0 || imgH <= 0) return imgW
  let maxX = 0
  let maxY = 0
  for (const p of pts) {
    if (Number.isFinite(p.x) && p.x > maxX) maxX = p.x
    if (Number.isFinite(p.y) && p.y > maxY) maxY = p.y
  }
  if (maxX <= imgW * 1.02 && maxY <= imgH * 1.02) return imgW
  const longSide = Math.max(imgW, imgH)
  const needed = Math.max(maxX, maxY)
  const step = PLAN_RENDER_WIDTH_STEPS.find((w) => w >= needed && w > longSide)
  return step ? (step / longSide) * imgW : imgW
}

export function isUsablePlanMap(map: unknown): map is DwgPlanMarkMap {
  if (!map || typeof map !== 'object') return false
  const m = map as DwgPlanMarkMap
  return (
    Number.isFinite(m.originX) &&
    Number.isFinite(m.originY) &&
    Number.isFinite(m.offsetX) &&
    Number.isFinite(m.offsetY) &&
    Number.isFinite(m.imgH) &&
    Number.isFinite(m.pixelsPerUnit) &&
    m.pixelsPerUnit > 0
  )
}

function planPixelToWorld(map: DwgPlanMarkMap, p: { x: number; y: number }) {
  return {
    x: map.originX + (p.x - map.offsetX) / map.pixelsPerUnit,
    y: map.originY + (map.imgH - map.offsetY - p.y) / map.pixelsPerUnit,
  }
}

function worldToPlanPixel(map: DwgPlanMarkMap, p: { x: number; y: number }) {
  return {
    x: map.offsetX + (p.x - map.originX) * map.pixelsPerUnit,
    y: map.imgH - map.offsetY - (p.y - map.originY) * map.pixelsPerUnit,
  }
}

function samePlanMap(a: DwgPlanMarkMap, b: DwgPlanMarkMap): boolean {
  const ppuClose = Math.abs(a.pixelsPerUnit - b.pixelsPerUnit) <= 1e-9 * Math.max(1, a.pixelsPerUnit)
  return (
    ppuClose &&
    Math.abs(a.originX - b.originX) < 1e-6 &&
    Math.abs(a.originY - b.originY) < 1e-6 &&
    Math.abs(a.offsetX - b.offsetX) < 0.01 &&
    Math.abs(a.offsetY - b.offsetY) < 0.01 &&
    Math.abs(a.imgH - b.imgH) < 0.01
  )
}

function remapPlanShape(
  shape: DwgPlanMarkShape,
  from: DwgPlanMarkMap,
  to: DwgPlanMarkMap,
): DwgPlanMarkShape {
  const move = (p: { x: number; y: number }) => worldToPlanPixel(to, planPixelToWorld(from, p))
  if (shape.type === 'point') {
    const next = move(shape)
    return { ...shape, x: next.x, y: next.y }
  }
  if (shape.type === 'zone') return { ...shape, outline: shape.outline.map(move) }
  return { ...shape, points: shape.points.map(move) }
}

/**
 * Приводит plan-отметки к пикселям текущего PNG.
 * Вызывается при открытии плана: план могли перерисовать в другом разрешении
 * или чертёж заменили на новую версию.
 */
export function rescalePlanMarksForImage(
  marks: readonly DwgPlanMark[],
  imgW: number,
  imgH: number,
  opts?: { map?: DwgPlanMarkMap | null; nowIso?: string },
): { marks: DwgPlanMark[]; changed: boolean } {
  if (!(imgW > 0) || !(imgH > 0)) return { marks: [...marks], changed: false }
  const nowIso = opts?.nowIso ?? new Date().toISOString()
  const planMap = isUsablePlanMap(opts?.map) ? opts.map : null
  const stampW = Math.round(imgW)
  const stampH = Math.round(imgH)
  let changed = false

  const next = marks.map((raw) => {
    const mark = normalizeMark(raw)
    if (mark.space !== 'plan') return mark

    // Точный путь: знаем привязку и тогда, и сейчас — считаем через координаты чертежа.
    if (planMap && isUsablePlanMap(mark.planMap)) {
      if (samePlanMap(mark.planMap, planMap)) return mark
      changed = true
      return {
        ...mark,
        shape: remapPlanShape(mark.shape, mark.planMap, planMap),
        planW: stampW,
        planH: stampH,
        planMap,
        updatedAtIso: nowIso,
      }
    }

    // Иначе — по размеру плана: масштаб меняется, габариты чертежа те же.
    const planW = isValidPlanSize(mark.planW) ? mark.planW : inferLegacyPlanWidth(mark, imgW, imgH)
    const planH = isValidPlanSize(mark.planH) ? mark.planH : (planW / imgW) * imgH
    const sx = imgW / planW
    const sy = imgH / planH
    // Аспект плана между рендерами не меняется; если изменился — не угадываем.
    if (Math.abs(sx - sy) > 0.02 * Math.max(sx, sy)) return mark

    const stampMap = planMap ? { planMap } : null
    if (Math.abs(sx - 1) < 0.001 && Math.abs(sy - 1) < 0.001) {
      if (mark.planW === stampW && mark.planH === stampH && (!planMap || mark.planMap)) return mark
      changed = true
      return { ...mark, planW: stampW, planH: stampH, ...stampMap }
    }
    changed = true
    return {
      ...mark,
      shape: scalePlanShape(mark.shape, sx, sy),
      planW: stampW,
      planH: stampH,
      ...stampMap,
      updatedAtIso: nowIso,
    }
  })
  return { marks: next, changed }
}

/**
 * Чертёж удалили — его отметки больше не нужны.
 * Жёстко удалять нельзя: другое устройство вернёт их при слиянии.
 * Поэтому ставим deletedAtIso и убираем геометрию — остаётся только метка «удалено».
 */
export function tombstonePlanMarksForFile(
  marks: readonly DwgPlanMark[],
  fileId: string,
  nowIso = new Date().toISOString(),
): { marks: DwgPlanMark[]; changed: boolean } {
  let changed = false
  const next = marks.map((mark) => {
    if (mark.fileId !== fileId || mark.deletedAtIso) return mark
    changed = true
    const light: DwgPlanMark = {
      ...mark,
      shape: { type: 'point', x: 0, y: 0 },
      deletedAtIso: nowIso,
      updatedAtIso: nowIso,
    }
    delete light.planW
    delete light.planH
    delete light.planMap
    return light
  })
  return { marks: next, changed }
}

/** Слияние двух списков: побеждает более свежая ревизия по id. */
export function mergeDwgPlanMarks(
  local: readonly DwgPlanMark[],
  remote: readonly DwgPlanMark[],
): DwgPlanMark[] {
  const map = new Map<string, DwgPlanMark>()
  for (const raw of [...remote, ...local]) {
    if (!isDwgPlanMark(raw)) continue
    const mark = normalizeMark(raw)
    const prev = map.get(mark.id)
    if (!prev || markRevisionIso(mark) >= markRevisionIso(prev)) {
      map.set(mark.id, mark)
    }
  }
  return [...map.values()]
}

function migrateLegacyMarks(siteId: string): DwgPlanMark[] {
  if (typeof localStorage === 'undefined') return []
  const out: DwgPlanMark[] = []
  const prefix = `${STORAGE_PREFIX_V1}.${siteId}.`
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key || !key.startsWith(prefix)) continue
      const raw = localStorage.getItem(key)
      if (!raw) continue
      const parsed = JSON.parse(raw) as unknown
      if (!Array.isArray(parsed)) continue
      for (const row of parsed) {
        if (isDwgPlanMark(row) && row.siteId === siteId) out.push(normalizeMark(row))
      }
    }
  } catch {
    /* ignore */
  }
  return out
}

function clearLegacyMarks(siteId: string): void {
  if (typeof localStorage === 'undefined') return
  const prefix = `${STORAGE_PREFIX_V1}.${siteId}.`
  const toRemove: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith(prefix)) toRemove.push(key)
  }
  for (const key of toRemove) localStorage.removeItem(key)
}

function readSiteMarks(siteId: string): DwgPlanMark[] {
  if (typeof localStorage === 'undefined') return []
  let loaded: DwgPlanMark[] | null = null
  try {
    const raw = localStorage.getItem(storageKey(siteId))
    if (raw) {
      const parsed = JSON.parse(raw) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const r = parsed as Record<string, unknown>
        if (r.siteId === siteId && Array.isArray(r.marks)) {
          loaded = r.marks.filter(isDwgPlanMark).map(normalizeMark)
        }
      } else if (Array.isArray(parsed)) {
        loaded = parsed.filter(isDwgPlanMark).map(normalizeMark)
      }
    }
  } catch {
    /* fall through to legacy */
  }
  if (!loaded) {
    const legacy = migrateLegacyMarks(siteId)
    if (legacy.length > 0) {
      writeSiteMarks(siteId, legacy)
      clearLegacyMarks(siteId)
      return readSiteMarks(siteId)
    }
    return []
  }
  const { marks, changed } = backfillDwgPlanMarkNumbers(loaded)
  if (changed) writeSiteMarks(siteId, marks)
  return marks
}

function writeSiteMarks(siteId: string, marks: DwgPlanMark[]): void {
  if (typeof localStorage === 'undefined') return
  try {
    const { marks: filled } = backfillDwgPlanMarkNumbers(marks)
    const bundle: DwgPlanMarksBundle = { siteId, marks: filled.map(normalizeMark) }
    localStorage.setItem(storageKey(siteId), JSON.stringify(bundle))
  } catch {
    /* quota */
  }
}

function sortMarks(marks: DwgPlanMark[]): DwgPlanMark[] {
  return [...marks].sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso))
}

function activeMarks(marks: readonly DwgPlanMark[]): DwgPlanMark[] {
  return marks.filter((m) => !m.deletedAtIso)
}

export function markKindMeta(kind: DwgPlanMarkKind) {
  return DWG_PLAN_MARK_KINDS.find((k) => k.id === kind) ?? DWG_PLAN_MARK_KINDS[3]
}

export function listDwgPlanMarks(siteId: string, fileId: string): DwgPlanMark[] {
  return sortMarks(
    activeMarks(readSiteMarks(siteId)).filter((m) => m.fileId === fileId),
  )
}

export function listAllDwgPlanMarks(siteId: string): DwgPlanMark[] {
  return sortMarks(activeMarks(readSiteMarks(siteId)))
}

/**
 * Fetch → merge → put. Так два телефона не затирают отметки друг друга.
 */
export async function persistDwgPlanMarks(siteId: string): Promise<boolean> {
  const local = readSiteMarks(siteId)
  const remote = await fetchPlanMarksRemote(siteId)
  const remoteMarks = remote
    ? remote.marks.filter(isDwgPlanMark).filter((m) => m.siteId === siteId).map(normalizeMark)
    : []
  const merged = mergeDwgPlanMarks(local, remoteMarks)
  writeSiteMarks(siteId, merged)
  return putPlanMarksRemote(siteId, { siteId, marks: merged })
}

/**
 * Подтянуть отметки с сервера и слить с локальным кэшем.
 * Если на сервере пусто, а локально есть — выгружаем локальные (миграция).
 */
export async function syncDwgPlanMarksFromServer(siteId: string): Promise<DwgPlanMark[]> {
  const remote = await fetchPlanMarksRemote(siteId)
  const local = readSiteMarks(siteId)
  if (!remote) return sortMarks(activeMarks(local))

  const remoteMarks = remote.marks
    .filter(isDwgPlanMark)
    .filter((m) => m.siteId === siteId)
    .map(normalizeMark)

  if (remoteMarks.length === 0 && local.length > 0) {
    await putPlanMarksRemote(siteId, { siteId, marks: local })
    return sortMarks(activeMarks(local))
  }

  const merged = mergeDwgPlanMarks(local, remoteMarks)
  writeSiteMarks(siteId, merged)
  clearLegacyMarks(siteId)

  // Если локально были новые/изменённые — докинем на сервер
  const localSig = local.map((m) => `${m.id}:${markRevisionIso(m)}`).sort().join('|')
  const mergedSig = merged.map((m) => `${m.id}:${markRevisionIso(m)}`).sort().join('|')
  const remoteSig = remoteMarks.map((m) => `${m.id}:${markRevisionIso(m)}`).sort().join('|')
  if (mergedSig !== remoteSig && mergedSig !== localSig) {
    void putPlanMarksRemote(siteId, { siteId, marks: merged })
  } else if (mergedSig !== remoteSig) {
    void putPlanMarksRemote(siteId, { siteId, marks: merged })
  }

  return sortMarks(activeMarks(merged))
}

export function upsertDwgPlanMark(
  mark: Omit<DwgPlanMark, 'id' | 'createdAtIso' | 'updatedAtIso' | 'deletedAtIso' | 'n'> & {
    id?: string
    n?: number
    createdAtIso?: string
    updatedAtIso?: string
    attachmentIds?: string[]
  },
): DwgPlanMark {
  const list = readSiteMarks(mark.siteId)
  const now = new Date().toISOString()
  const existing = mark.id ? list.find((m) => m.id === mark.id) : undefined
  const n = isValidMarkNumber(mark.n)
    ? Math.floor(mark.n)
    : existing && isValidMarkNumber(existing.n)
      ? existing.n
      : maxDwgPlanMarkNumber(list) + 1
  const next: DwgPlanMark = {
    id: mark.id ?? newId(),
    siteId: mark.siteId,
    fileId: mark.fileId,
    kind: mark.kind,
    space: mark.space,
    shape: mark.shape,
    text: mark.text.trim(),
    author: mark.author.trim() || 'Пользователь',
    n,
    createdAtIso: mark.createdAtIso ?? now,
    updatedAtIso: mark.updatedAtIso ?? now,
  }
  if (mark.attachmentIds && mark.attachmentIds.length > 0) {
    next.attachmentIds = [...mark.attachmentIds]
  }
  if (isValidPlanSize(mark.planW) && isValidPlanSize(mark.planH)) {
    next.planW = Math.round(mark.planW)
    next.planH = Math.round(mark.planH)
  }
  if (isUsablePlanMap(mark.planMap)) next.planMap = { ...mark.planMap }
  const idx = list.findIndex((m) => m.id === next.id)
  if (idx >= 0) list[idx] = next
  else list.unshift(next)
  writeSiteMarks(mark.siteId, list)
  void persistDwgPlanMarks(mark.siteId)
  return next
}

export async function upsertDwgPlanMarkAndSync(
  mark: Omit<DwgPlanMark, 'id' | 'createdAtIso' | 'updatedAtIso' | 'deletedAtIso' | 'n'> & {
    id?: string
    n?: number
    createdAtIso?: string
    updatedAtIso?: string
    attachmentIds?: string[]
  },
): Promise<{ mark: DwgPlanMark; ok: boolean }> {
  const saved = upsertDwgPlanMark(mark)
  const ok = await persistDwgPlanMarks(mark.siteId)
  return { mark: saved, ok }
}

export function deleteDwgPlanMark(siteId: string, fileId: string, id: string): boolean {
  const list = readSiteMarks(siteId)
  const idx = list.findIndex((m) => m.id === id && m.fileId === fileId)
  if (idx < 0) return false
  const now = new Date().toISOString()
  list[idx] = {
    ...list[idx],
    deletedAtIso: now,
    updatedAtIso: now,
  }
  writeSiteMarks(siteId, list)
  void persistDwgPlanMarks(siteId)
  return true
}

export async function deleteDwgPlanMarkAndSync(
  siteId: string,
  fileId: string,
  id: string,
): Promise<boolean> {
  const okLocal = deleteDwgPlanMark(siteId, fileId, id)
  if (!okLocal) return false
  return persistDwgPlanMarks(siteId)
}

/** Чертёж удалён — гасим его отметки локально (на сервере это делает site-forms). */
export async function dropDwgPlanMarksForDeletedFile(
  siteId: string,
  fileId: string,
): Promise<boolean> {
  const { marks, changed } = tombstonePlanMarksForFile(readSiteMarks(siteId), fileId)
  if (!changed) return false
  writeSiteMarks(siteId, marks)
  return persistDwgPlanMarks(siteId)
}

function startOfTodayMs(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Локальный календарный день отметки (YYYY-MM-DD). */
export function markLocalDayKey(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function filterDwgPlanMarks(
  marks: readonly DwgPlanMark[],
  filter: DwgPlanMarkFilter,
): DwgPlanMark[] {
  const kinds = filter.kinds
  const author = filter.author
  const period = filter.period ?? 'all'
  const dateFrom = filter.dateFrom?.trim() || ''
  const dateTo = filter.dateTo?.trim() || ''
  const todayStart = startOfTodayMs()
  const weekStart = todayStart - 6 * 24 * 60 * 60 * 1000

  return marks.filter((m) => {
    if (m.deletedAtIso) return false
    if (kinds && kinds !== 'all' && kinds.length > 0 && !kinds.includes(m.kind)) return false
    if (author && author !== 'all' && m.author !== author) return false
    if (dateFrom || dateTo) {
      const day = markLocalDayKey(m.createdAtIso)
      if (!day) return false
      if (dateFrom && day < dateFrom) return false
      if (dateTo && day > dateTo) return false
    } else if (period === 'today') {
      if (new Date(m.createdAtIso).getTime() < todayStart) return false
    } else if (period === 'week') {
      if (new Date(m.createdAtIso).getTime() < weekStart) return false
    }
    return true
  })
}

export function uniqueMarkAuthors(marks: readonly DwgPlanMark[]): string[] {
  const set = new Set<string>()
  for (const m of marks) {
    if (m.author.trim()) set.add(m.author.trim())
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'ru'))
}

function csvEscape(value: string): string {
  if (/[";\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

const CSV_DELIM = ';'

export type DwgPlanMarksExportContext = {
  siteName?: string
  planName?: string
}

export type DwgPlanMarkExportRow = {
  n: number | null
  kind: DwgPlanMarkKind
  status: string
  areaM2: number | null
  areaLabel: string
  comment: string
  author: string
  dateLabel: string
  attachments: number
  shapeLabel: string
}

function formatExportArea(areaM2: number): string {
  const abs = Math.abs(areaM2)
  if (abs >= 10_000) {
    return `${(areaM2 / 10_000).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} га`
  }
  return `${areaM2.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} м²`
}

function capitalizeExportSentence(text: string): string {
  const t = text.trim()
  if (!t || t === '—') return t || '—'
  return t.charAt(0).toLocaleUpperCase('ru-RU') + t.slice(1)
}

function capitalizeExportName(text: string): string {
  const t = text.trim()
  if (!t || t === '—') return t || '—'
  return t
    .split(/\s+/)
    .map((word) => {
      if (!word) return word
      const first = word.charAt(0).toLocaleUpperCase('ru-RU')
      const rest = word.slice(1).toLocaleLowerCase('ru-RU')
      return `${first}${rest}`
    })
    .join(' ')
}

function formatExportMarkDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const raw = d.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  return capitalizeExportSentence(raw)
}

function markShapeLabel(mark: DwgPlanMark): string {
  if (mark.shape.type === 'zone') return 'Зона'
  if (mark.shape.type === 'stroke') return 'Маркер'
  return 'Точка'
}

function sortMarksForExport(marks: readonly DwgPlanMark[]): DwgPlanMark[] {
  return marks
    .filter((m) => !m.deletedAtIso)
    .sort((a, b) => {
      const an = isValidMarkNumber(a.n) ? a.n : Number.MAX_SAFE_INTEGER
      const bn = isValidMarkNumber(b.n) ? b.n : Number.MAX_SAFE_INTEGER
      if (an !== bn) return an - bn
      return a.createdAtIso.localeCompare(b.createdAtIso)
    })
}

/** Строки реестра отметок — для Excel и CSV. */
export function buildDwgPlanMarkExportRows(marks: readonly DwgPlanMark[]): DwgPlanMarkExportRow[] {
  return sortMarksForExport(marks).map((m) => {
    const meta = markKindMeta(m.kind)
    const areaM2 =
      m.shape.type === 'zone' && m.shape.areaM2 != null && Number.isFinite(m.shape.areaM2)
        ? m.shape.areaM2
        : null
    return {
      n: isValidMarkNumber(m.n) ? m.n : null,
      kind: m.kind,
      status: meta.label,
      areaM2,
      areaLabel: areaM2 != null ? formatExportArea(areaM2) : '—',
      comment: capitalizeExportSentence(m.text.trim()) || '—',
      author: capitalizeExportName(m.author.trim()) || '—',
      dateLabel: formatExportMarkDate(m.createdAtIso),
      attachments: m.attachmentIds?.length ?? 0,
      shapeLabel: markShapeLabel(m),
    }
  })
}

/** @deprecated Используйте downloadDwgPlanMarksExcel — CSV оставлен для совместимости. */
export type DwgPlanMarksCsvExportContext = DwgPlanMarksExportContext

/** Таблица для Excel: русские заголовки, понятные значения, разделитель «;». */
export function dwgPlanMarksToCsv(
  marks: readonly DwgPlanMark[],
  ctx: DwgPlanMarksExportContext = {},
): string {
  const siteName = ctx.siteName?.trim() ?? ''
  const planName = ctx.planName?.trim() ?? ''
  const header = [
    '№',
    'Статус',
    'Площадь, м²',
    'Комментарий',
    'Автор',
    'Дата',
    'Объект',
    'План',
    'Актов',
    'Тип',
  ]
  const rows = buildDwgPlanMarkExportRows(marks).map((row) =>
    [
      row.n != null ? String(row.n) : '',
      row.status,
      row.areaM2 != null ? row.areaM2.toFixed(2).replace('.', ',') : '',
      csvEscape(row.comment === '—' ? '' : row.comment),
      csvEscape(row.author === '—' ? '' : row.author),
      row.dateLabel === '—' ? '' : row.dateLabel,
      csvEscape(siteName),
      csvEscape(planName),
      row.attachments > 0 ? String(row.attachments) : '',
      row.shapeLabel,
    ].join(CSV_DELIM),
  )
  return [`sep=${CSV_DELIM}`, header.join(CSV_DELIM), ...rows].join('\n') + '\n'
}

export function downloadDwgPlanMarksCsv(
  marks: readonly DwgPlanMark[],
  filename = 'plan-marks.csv',
  ctx?: DwgPlanMarksExportContext,
): void {
  const csv = dwgPlanMarksToCsv(marks, ctx)
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  a.click()
  URL.revokeObjectURL(url)
}

export function markCentroid(mark: DwgPlanMark): { x: number; y: number } {
  if (mark.shape.type === 'point') return { x: mark.shape.x, y: mark.shape.y }
  const pts = mark.shape.type === 'stroke' ? mark.shape.points : mark.shape.outline
  if (pts.length === 0) return { x: 0, y: 0 }
  let sx = 0
  let sy = 0
  for (const p of pts) {
    sx += p.x
    sy += p.y
  }
  return { x: sx / pts.length, y: sy / pts.length }
}
