import type { CSSProperties, ChangeEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import {
  ASPHALT_MIXES,
  CRUSHED_STONE_FRACTIONS,
  clampLayerThicknessCm,
  formatTons,
  formatVolumeM3,
  type AsphaltMixId,
  type AsphaltOrderResult,
  type CrushedStoneFraction,
  type CrushedStoneOrderResult,
  type SandOrderResult,
  type SoilOrderResult,
} from '../../lib/dwgMaterialOrder'
import {
  DWG_PLAN_MARK_KINDS,
  type DwgPlanMarkKind,
} from '../../lib/dwgPlanMarksRepository'
import { kindNeedsHandoverDoc } from '../../lib/ckkbHandoverDocs'
import styles from './DwgViewerChrome.module.css'

type MaterialKind = 'none' | 'asphalt' | 'soil' | 'crushedStone' | 'sand'

function shortAsphaltMixLabel(mixId: AsphaltMixId | string): string {
  switch (mixId) {
    case 'sand':
      return 'Песч.'
    case 'fine':
      return 'Мелк.'
    case 'coarse':
      return 'Крупн.'
    case 'sma15':
      return 'ЩМА-15'
    case 'sma20':
      return 'ЩМА-20'
    default:
      return String(mixId)
  }
}

function formatThicknessDraft(value: number): string {
  return Number.isFinite(value) ? String(value) : ''
}

function parseThicknessDraft(raw: string): number | null {
  const trimmed = raw.trim().replace(',', '.')
  if (trimmed === '' || trimmed === '.' || trimmed === '-') return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}

/** Поле толщины: при редактировании можно полностью очистить, без принудительного «0». */
function MaterialThicknessInput({
  value,
  onChange,
  min = 0,
  max,
  commit,
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  commit?: (n: number) => number
}) {
  const [draft, setDraft] = useState(() => formatThicknessDraft(value))
  const focusedRef = useRef(false)

  useEffect(() => {
    if (!focusedRef.current) setDraft(formatThicknessDraft(value))
  }, [value])

  const applyCommit = (raw: string) => {
    const parsed = parseThicknessDraft(raw)
    if (parsed == null) {
      setDraft(formatThicknessDraft(value))
      return
    }
    let next = parsed
    if (commit) next = commit(next)
    else {
      next = Math.max(min, next)
      if (max != null) next = Math.min(max, next)
    }
    onChange(next)
    setDraft(formatThicknessDraft(next))
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={draft}
      onFocus={() => {
        focusedRef.current = true
      }}
      onBlur={() => {
        focusedRef.current = false
        applyCommit(draft)
      }}
      onChange={(e) => {
        const raw = e.target.value
        if (raw !== '' && !/^\d*[.,]?\d*$/.test(raw)) return
        setDraft(raw)
        const parsed = parseThicknessDraft(raw)
        // «0» фиксируем только при blur — иначе мешает набрать новое число (06, 10…)
        if (parsed != null && parsed !== 0) {
          onChange(parsed)
          if (!/[.,]$/.test(raw)) setDraft(formatThicknessDraft(parsed))
        }
      }}
    />
  )
}

type ZoneStatusProps = {
  enabled: boolean
  selectedKind: DwgPlanMarkKind | null
  onSelectKind: (kind: DwgPlanMarkKind) => void
  note: string
  onNoteChange: (text: string) => void
  noteRequired: boolean
  attachments: File[]
  onAttachmentsChange: (files: File[]) => void
  handoverFolderHint: string | null
  saving?: boolean
  onSave: () => void
  flash: string | null
  materialCalcOpen?: boolean
  onToggleMaterialCalc?: () => void
  /** Подпись кнопки сохранения (например «OK · 2»). */
  saveLabel?: string
  /** Подсказка, к каким зонам применится статус. */
  targetHint?: string | null
}

export function DwgZoneStatusSection({
  selectedKind,
  onSelectKind,
  note,
  onNoteChange,
  noteRequired,
  attachments,
  onAttachmentsChange,
  handoverFolderHint,
  saving = false,
  onSave,
  flash,
  materialCalcOpen = false,
  onToggleMaterialCalc,
  compact = false,
  saveLabel,
  targetHint = null,
}: Omit<ZoneStatusProps, 'enabled'> & { compact?: boolean }) {
  const canSave = selectedKind != null && !saving
  const showDocs = selectedKind != null && kindNeedsHandoverDoc(selectedKind)

  const onPickFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files
    if (!list || list.length === 0) return
    const next = [...attachments]
    for (const f of Array.from(list)) {
      if (!next.some((x) => x.name === f.name && x.size === f.size && x.lastModified === f.lastModified)) {
        next.push(f)
      }
    }
    onAttachmentsChange(next)
    e.target.value = ''
  }

  return (
    <div className={`${styles.zoneStatus} ${compact ? styles.zoneStatusCompact : ''}`}>
      {!compact ? <p className={styles.zoneStatusTitle}>Статус участка</p> : null}
      {targetHint ? <p className={styles.zoneStatusTargetHint}>{targetHint}</p> : null}
      <div className={styles.zoneStatusRow} role="group" aria-label="Статус выделенной зоны">
        {DWG_PLAN_MARK_KINDS.filter((k) => k.id !== 'marker').map((k) => {
          const active = selectedKind === k.id
          const label = compact
            ? (
                {
                  accepted: 'Выполнено',
                  ckkb: 'ЦККБ',
                  issue: 'Замеч.',
                  note: 'Коммент.',
                  marker: 'Маркер',
                } as const
              )[k.id]
            : k.label
          return (
            <button
              key={k.id}
              type="button"
              className={`${styles.zoneStatusBtn} ${active ? styles.zoneStatusBtnActive : ''}`}
              style={
                {
                  '--mark-color': k.color,
                  '--mark-fill': k.fill,
                } as CSSProperties
              }
              title={k.label}
              aria-label={k.label}
              aria-pressed={active}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => onSelectKind(k.id)}
            >
              <span className={styles.zoneStatusDot} aria-hidden />
              {label}
            </button>
          )
        })}
        {onToggleMaterialCalc ? (
          <button
            type="button"
            className={`${styles.zoneStatusCalcBtn} ${materialCalcOpen ? styles.zoneStatusCalcBtnActive : ''}`}
            aria-pressed={materialCalcOpen}
            title="Расчёт асфальта, щебня, песка и других материалов"
            onPointerDown={(e) => e.preventDefault()}
            onClick={onToggleMaterialCalc}
          >
            {materialCalcOpen ? 'Скрыть' : compact ? 'Расчёт' : 'Рассчитать'}
          </button>
        ) : null}
      </div>
      {compact ? (
        <div className={styles.zoneStatusCompactBar}>
          <input
            type="text"
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
            placeholder="Комментарий…"
            className={`${styles.zoneStatusCompactNote}${noteRequired ? ` ${styles.zoneStatusNoteWarn}` : ''}`}
            aria-label="Комментарий к отметке"
          />
          <button
            type="button"
            className={styles.zoneStatusSave}
            disabled={!canSave}
            onClick={onSave}
          >
            {saving ? '…' : saveLabel ?? 'OK'}
          </button>
        </div>
      ) : (
        <>
          <label className={styles.zoneStatusNote}>
            <span>Комментарий (необязательно, для замечания — желательно)</span>
            <input
              type="text"
              value={note}
              onChange={(e) => onNoteChange(e.target.value)}
              placeholder="Текст…"
              className={noteRequired ? styles.zoneStatusNoteWarn : undefined}
            />
          </label>
          <button
            type="button"
            className={styles.zoneStatusSave}
            disabled={!canSave}
            onClick={onSave}
          >
            {saving ? 'Сохраняем…' : saveLabel ?? 'Сохранить отметку'}
          </button>
        </>
      )}
      {showDocs ? (
        <div className={styles.zoneStatusDocs}>
          <p className={styles.zoneStatusDocsTitle}>Документы</p>
          {!compact ? (
            <p className={styles.zoneStatusDocsHint}>
              PDF или фото.
              {handoverFolderHint ? ` Папка «${handoverFolderHint}».` : ''}
            </p>
          ) : handoverFolderHint ? (
            <p className={styles.zoneStatusDocsHint}>Папка «{handoverFolderHint}»</p>
          ) : null}
          <div className={styles.zoneStatusDocsActions}>
            <label className={styles.zoneStatusDocsPick}>
              <input
                type="file"
                accept="image/*,.jpg,.jpeg,.png,.webp,.heic,.pdf,application/pdf,.doc,.docx"
                multiple
                onChange={onPickFiles}
              />
              {compact ? 'Файлы…' : 'Из галереи / файлов…'}
            </label>
            <label className={styles.zoneStatusDocsPick}>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={onPickFiles}
              />
              {compact ? 'Фото' : 'Сфотографировать'}
            </label>
          </div>
          {attachments.length > 0 ? (
            <ul className={styles.zoneStatusDocsList}>
              {attachments.map((f) => (
                <li key={`${f.name}-${f.size}-${f.lastModified}`}>
                  <span>{f.name}</span>
                  <button
                    type="button"
                    className={styles.zoneStatusDocsRemove}
                    aria-label={`Убрать ${f.name}`}
                    onClick={() =>
                      onAttachmentsChange(
                        attachments.filter(
                          (x) =>
                            !(
                              x.name === f.name &&
                              x.size === f.size &&
                              x.lastModified === f.lastModified
                            ),
                        ),
                      )
                    }
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {flash ? <p className={styles.zoneStatusFlash}>{flash}</p> : null}
      {!compact ? (
        <p className={styles.zoneStatusHint}>Статус → при необходимости фото → сохранить</p>
      ) : null}
    </div>
  )
}

type Props = {
  materialKind: MaterialKind
  onMaterialKind: (kind: MaterialKind) => void
  asphaltBinderCm: number
  onAsphaltBinderCm: (v: number) => void
  asphaltWearingCm: number
  onAsphaltWearingCm: (v: number) => void
  asphaltMixId: AsphaltMixId
  onAsphaltMixId: (id: AsphaltMixId) => void
  soilThicknessCm: number
  onSoilThicknessCm: (v: number) => void
  crushedStoneCm: number
  onCrushedStoneCm: (v: number) => void
  crushedStoneFraction: CrushedStoneFraction
  onCrushedStoneFraction: (f: CrushedStoneFraction) => void
  sandCm: number
  onSandCm: (v: number) => void
  asphaltOrder: AsphaltOrderResult | null
  soilOrder: SoilOrderResult | null
  crushedStoneOrder: CrushedStoneOrderResult | null
  sandOrder: SandOrderResult | null
  zoneStatus?: ZoneStatusProps
  /** Скрыть блок «Расчёт заказа» (только статус участка). */
  hideMaterialOrder?: boolean
}

function pickZoneStatusProps(zoneStatus: ZoneStatusProps | undefined) {
  if (!zoneStatus?.enabled) return null
  return {
    selectedKind: zoneStatus.selectedKind,
    onSelectKind: zoneStatus.onSelectKind,
    note: zoneStatus.note,
    onNoteChange: zoneStatus.onNoteChange,
    noteRequired: zoneStatus.noteRequired,
    attachments: zoneStatus.attachments,
    onAttachmentsChange: zoneStatus.onAttachmentsChange,
    handoverFolderHint: zoneStatus.handoverFolderHint,
    saving: zoneStatus.saving,
    onSave: zoneStatus.onSave,
    flash: zoneStatus.flash,
    materialCalcOpen: zoneStatus.materialCalcOpen,
    onToggleMaterialCalc: zoneStatus.onToggleMaterialCalc,
  }
}

export function DwgMaterialOrderPanel({
  materialKind,
  onMaterialKind,
  asphaltBinderCm,
  onAsphaltBinderCm,
  asphaltWearingCm,
  onAsphaltWearingCm,
  asphaltMixId,
  onAsphaltMixId,
  soilThicknessCm,
  onSoilThicknessCm,
  crushedStoneCm,
  onCrushedStoneCm,
  crushedStoneFraction,
  onCrushedStoneFraction,
  sandCm,
  onSandCm,
  asphaltOrder,
  soilOrder,
  crushedStoneOrder,
  sandOrder,
  zoneStatus,
  hideMaterialOrder = false,
}: Props) {
  const unitLabel =
    materialKind === 'asphalt' ? 'т'
      : materialKind === 'none' ? ''
        : 'м³'

  const kindBtn = (
    id: MaterialKind,
    label: string,
    unit: string,
  ) => (
    <button
      type="button"
      className={`${styles.materialKindBtn} ${materialKind === id ? styles.materialKindBtnActive : ''}`}
      aria-pressed={materialKind === id}
      onPointerDown={(e) => e.preventDefault()}
      onClick={() => onMaterialKind(materialKind === id ? 'none' : id)}
    >
      <span className={styles.materialKindLabel}>{label}</span>
      <span className={styles.materialKindUnit}>{unit}</span>
    </button>
  )

  return (
    <div
      className={`${styles.materialCalc}${!zoneStatus?.enabled ? ` ${styles.materialCalcSolo}` : ''}`}
    >
      {zoneStatus?.enabled ? (
        <DwgZoneStatusSection {...pickZoneStatusProps(zoneStatus)!} />
      ) : null}

      {hideMaterialOrder ? null : (
        <div className={styles.materialOrder}>
          <div className={styles.materialOrderHead}>
            <p className={styles.materialCalcTitle}>Расчёт заказа</p>
            {unitLabel ? (
              <span className={styles.materialOrderUnitBadge}>{unitLabel}</span>
            ) : null}
          </div>

          <div className={styles.materialKindRow} role="group" aria-label="Тип материала">
            {kindBtn('asphalt', 'Асфальт', 'т')}
            {kindBtn('soil', 'Грунт', 'м³')}
            {kindBtn('crushedStone', 'Щебень', 'м³')}
            {kindBtn('sand', 'Песок', 'м³')}
          </div>

          {materialKind === 'asphalt' ? (
            <div className={styles.materialBody}>
              <div className={styles.materialFields}>
                <label className={styles.materialField}>
                  <span>Нижний</span>
                  <span className={styles.materialInputWrap}>
                    <MaterialThicknessInput value={asphaltBinderCm} onChange={onAsphaltBinderCm} min={0} />
                    <em>см</em>
                  </span>
                </label>
                <label className={styles.materialField}>
                  <span>Верхний</span>
                  <span className={styles.materialInputWrap}>
                    <MaterialThicknessInput value={asphaltWearingCm} onChange={onAsphaltWearingCm} min={0} />
                    <em>см</em>
                  </span>
                </label>
              </div>
              <p className={styles.asphaltMixTitle}>Смесь</p>
              <div className={styles.concreteGradeRow} role="group" aria-label="Вид асфальта">
                {ASPHALT_MIXES.map((mix) => (
                  <button
                    key={mix.id}
                    type="button"
                    className={`${styles.concreteGradeBtn} ${asphaltMixId === mix.id ? styles.concreteGradeBtnActive : ''}`}
                    aria-pressed={asphaltMixId === mix.id}
                    title={`${mix.label} · ${mix.densityTPerM3} т/м³`}
                    onClick={() => onAsphaltMixId(mix.id)}
                    onPointerDown={(e) => e.preventDefault()}
                  >
                    {shortAsphaltMixLabel(mix.id)}
                  </button>
                ))}
              </div>
              {asphaltOrder ? (
                <div className={styles.materialOrderResult}>
                  <div className={styles.materialOrderTotal}>
                    <span>К заказу</span>
                    <strong>{formatTons(asphaltOrder.totalTons)}</strong>
                  </div>
                  <ul className={styles.materialOrderBreak}>
                    <li>
                      <span>
                        Низ {asphaltOrder.binderCm} см · {shortAsphaltMixLabel(asphaltOrder.binderMixId)}
                      </span>
                      <b>{formatTons(asphaltOrder.binderTons)}</b>
                    </li>
                    <li>
                      <span>
                        Верх {asphaltOrder.wearingCm} см · {shortAsphaltMixLabel(asphaltOrder.wearingMixId)}
                      </span>
                      <b>{formatTons(asphaltOrder.wearingTons)}</b>
                    </li>
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

          {materialKind === 'soil' ? (
            <div className={styles.materialBody}>
              <div className={styles.materialFields}>
                <label className={styles.materialField}>
                  <span>Толщина</span>
                  <span className={styles.materialInputWrap}>
                    <MaterialThicknessInput value={soilThicknessCm} onChange={onSoilThicknessCm} min={0} />
                    <em>см</em>
                  </span>
                </label>
              </div>
              {soilOrder ? (
                <div className={styles.materialOrderResult}>
                  <div className={styles.materialOrderTotal}>
                    <span>Грунт к заказу</span>
                    <strong>{formatVolumeM3(soilOrder.volumeM3)}</strong>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {materialKind === 'crushedStone' ? (
            <div className={styles.materialBody}>
              <div className={styles.materialFields}>
                <label className={styles.materialField}>
                  <span>Толщина</span>
                  <span className={styles.materialInputWrap}>
                    <MaterialThicknessInput
                      value={crushedStoneCm}
                      onChange={onCrushedStoneCm}
                      min={0}
                      commit={clampLayerThicknessCm}
                    />
                    <em>см</em>
                  </span>
                </label>
              </div>
              <p className={styles.asphaltMixTitle}>Фракция</p>
              <div className={styles.concreteGradeRow} role="group" aria-label="Фракция щебня">
                {CRUSHED_STONE_FRACTIONS.map((fraction) => (
                  <button
                    key={fraction}
                    type="button"
                    className={`${styles.concreteGradeBtn} ${crushedStoneFraction === fraction ? styles.concreteGradeBtnActive : ''}`}
                    aria-pressed={crushedStoneFraction === fraction}
                    onClick={() => onCrushedStoneFraction(fraction)}
                    onPointerDown={(e) => e.preventDefault()}
                  >
                    {fraction}
                  </button>
                ))}
              </div>
              {crushedStoneOrder ? (
                <div className={styles.materialOrderResult}>
                  <div className={styles.materialOrderTotal}>
                    <span>Щебень к заказу</span>
                    <strong>{formatVolumeM3(crushedStoneOrder.volumeM3)}</strong>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {materialKind === 'sand' ? (
            <div className={styles.materialBody}>
              <div className={styles.materialFields}>
                <label className={styles.materialField}>
                  <span>Толщина</span>
                  <span className={styles.materialInputWrap}>
                    <MaterialThicknessInput
                      value={sandCm}
                      onChange={onSandCm}
                      min={0}
                      commit={clampLayerThicknessCm}
                    />
                    <em>см</em>
                  </span>
                </label>
              </div>
              {sandOrder ? (
                <div className={styles.materialOrderResult}>
                  <div className={styles.materialOrderTotal}>
                    <span>Песок к заказу</span>
                    <strong>{formatVolumeM3(sandOrder.volumeM3)}</strong>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {materialKind === 'none' ? (
            <p className={styles.materialOrderHint}>Выберите материал — появится толщина и объём заказа</p>
          ) : null}
        </div>
      )}
    </div>
  )
}
