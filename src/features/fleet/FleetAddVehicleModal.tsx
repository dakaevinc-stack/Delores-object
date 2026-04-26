import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  FleetCategory,
  FleetCategoryId,
  FleetPresetCategoryId,
  FleetVehicle,
} from '../../domain/fleet'
import { FLEET_CATEGORIES } from '../../data/fleet.mock'
import { FleetCategoryIcon } from './FleetCategoryIcon'
import { nextVehicleId } from './fleetRegistry'
import styles from './FleetAddVehicleModal.module.css'

type Props = {
  open: boolean
  onClose: () => void
  /**
   * Коллбек создания. Возвращает либо уже готовую машину (для preset-категорий),
   * либо машину + имя кастомного класса — его нужно зарегистрировать в реестре.
   */
  onCreate: (vehicle: FleetVehicle, customCategoryTitle?: string) => void
  /** Если передан — категория заблокирована, пользователь только заполняет поля. */
  lockedCategory?: FleetCategory
}

function defaultSchematic(cat: FleetCategoryId): FleetVehicle['schematicVariant'] {
  switch (cat) {
    case 'excavators':
      return 'excavator'
    case 'front-loaders':
    case 'mini-loaders':
      return 'loader'
    case 'rollers':
      return 'roller'
    case 'pavers':
      return 'paver'
    case 'special-trucks':
    case 'backhoes':
      return 'articulated'
    case 'trailers':
    case 'cold-mills':
      return 'generic'
    default:
      return 'truck'
  }
}

function addYear(iso: string, years = 1): string {
  const d = new Date(iso + 'T12:00:00')
  d.setFullYear(d.getFullYear() + years)
  return d.toISOString().slice(0, 10)
}

/* ============================================================
   Режимы выбора класса:
     preset — одна из заранее известных категорий (карточки-чипы)
     custom — пользователь вводит своё название класса (например, «Автокраны»)
   ============================================================ */
type Mode = 'preset' | 'custom'

export function FleetAddVehicleModal({ open, onClose, onCreate, lockedCategory }: Props) {
  const firstInputRef = useRef<HTMLInputElement | null>(null)
  const customNameRef = useRef<HTMLInputElement | null>(null)

  const [mode, setMode] = useState<Mode>('preset')
  const [presetId, setPresetId] = useState<FleetPresetCategoryId>(FLEET_CATEGORIES[0].id)
  const [customName, setCustomName] = useState('')
  const [plate, setPlate] = useState('')
  const [model, setModel] = useState('')
  const [vin, setVin] = useState('')
  const [insuranceDate, setInsuranceDate] = useState<string>('')
  const [touched, setTouched] = useState(false)

  /** Текст, который показываем у «замка», когда категория заблокирована. */
  const lockedLabel = lockedCategory?.title ?? ''
  /** Иконку показываем только для preset-категорий; для кастомных — generic. */
  const lockedIconId: FleetCategoryId = lockedCategory?.id ?? 'light-trucks'

  const presetLabel = useMemo(
    () => FLEET_CATEGORIES.find((c) => c.id === presetId)?.title ?? '',
    [presetId],
  )

  /* Сброс формы и установка дефолтов при каждом открытии. */
  useEffect(() => {
    if (!open) return
    if (lockedCategory) {
      /* При блокировке категории режим не важен — показываем только поля. */
      setMode('preset')
      if ((FLEET_CATEGORIES as readonly FleetCategory[]).some((c) => c.id === lockedCategory.id)) {
        setPresetId(lockedCategory.id as FleetPresetCategoryId)
      }
    } else {
      setMode('preset')
      setPresetId(FLEET_CATEGORIES[0].id)
    }
    setCustomName('')
    setPlate('')
    setModel('')
    setVin('')
    const today = new Date().toISOString().slice(0, 10)
    setInsuranceDate(addYear(today, 1))
    setTouched(false)
    /* Фокус на первое поле после открытия — отдельный тик, чтобы модалка успела отрисоваться. */
    const id = window.setTimeout(() => firstInputRef.current?.focus(), 40)
    return () => window.clearTimeout(id)
  }, [open, lockedCategory])

  /* Закрытие по ESC + блокировка скролла тела. */
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  /* При переключении в «свой класс» — поставим фокус в поле названия. */
  useEffect(() => {
    if (!open) return
    if (mode === 'custom' && !lockedCategory) {
      const id = window.setTimeout(() => customNameRef.current?.focus(), 40)
      return () => window.clearTimeout(id)
    }
  }, [mode, open, lockedCategory])

  if (!open) return null

  const isPlateValid = plate.trim().length >= 3
  const isModelValid = model.trim().length >= 2
  const isVinValid = vin.trim().length >= 4
  /* Валидация класса: для preset всегда OK (дефолт уже выбран),
     для custom — нужно ≥2 символов имени. */
  const isCategoryValid = !!lockedCategory || mode === 'preset' || customName.trim().length >= 2
  const isValid = isPlateValid && isModelValid && isVinValid && isCategoryValid

  const handleSubmit = () => {
    setTouched(true)
    if (!isValid) return

    /* Определяем итоговую категорию */
    let finalCategoryId: FleetCategoryId
    let customTitleForParent: string | undefined
    if (lockedCategory) {
      finalCategoryId = lockedCategory.id
    } else if (mode === 'preset') {
      finalCategoryId = presetId
    } else {
      /* id создаст родитель через ensureCustomCategory — пока передаём сырое имя
         и временный маркер, чтобы родитель мог заменить при создании. */
      customTitleForParent = customName.trim()
      finalCategoryId = `__pending__:${customTitleForParent}`
    }

    const vehicle: FleetVehicle = {
      id: nextVehicleId(),
      categoryId: finalCategoryId,
      plate: plate.trim().toUpperCase(),
      model: model.trim(),
      vinOrFrame: vin.trim().toUpperCase(),
      repairs: [],
      maintenance: {},
      insurance: {
        validUntilIso: insuranceDate || addYear(new Date().toISOString().slice(0, 10), 1),
      },
      passes: [],
      schematicVariant: defaultSchematic(finalCategoryId),
    }
    onCreate(vehicle, customTitleForParent)
    onClose()
  }

  return (
    <div
      className={styles.backdrop}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-vehicle-title"
      >
        <header className={styles.head}>
          <div className={styles.headBody}>
            <p className={styles.kicker}>Новая единица парка</p>
            <h2 id="add-vehicle-title" className={styles.title}>
              Добавить технику
            </h2>
            <p className={styles.lead}>
              Достаточно госномера, модели и VIN — остальное заполните в карточке.
            </p>
          </div>
          <button
            type="button"
            className={styles.close}
            aria-label="Закрыть"
            onClick={onClose}
            title="Esc"
          >
            <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden>
              <path
                d="M5 5l10 10M15 5L5 15"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>

        <div className={styles.body}>
          {/* Класс техники */}
          <section className={styles.section} aria-labelledby="add-v-cat">
            <div className={styles.sectionHead}>
              <h3 id="add-v-cat" className={styles.sectionTitle}>
                Класс техники
              </h3>
              {!lockedCategory ? (
                <div className={styles.modeSwitch} role="tablist" aria-label="Тип класса">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === 'preset'}
                    className={`${styles.modeBtn} ${mode === 'preset' ? styles.modeBtnActive : ''}`}
                    onClick={() => setMode('preset')}
                  >
                    Из списка
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === 'custom'}
                    className={`${styles.modeBtn} ${mode === 'custom' ? styles.modeBtnActive : ''}`}
                    onClick={() => setMode('custom')}
                  >
                    <svg viewBox="0 0 20 20" width="12" height="12" aria-hidden>
                      <path
                        d="M10 4v12M4 10h12"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        fill="none"
                      />
                    </svg>
                    Свой класс
                  </button>
                </div>
              ) : null}
            </div>

            {lockedCategory ? (
              <p className={styles.lockedCategory}>
                <FleetCategoryIcon id={lockedIconId} size={18} />
                <span>{lockedLabel}</span>
                <em className={styles.lockedHint}>— определён по текущему разделу</em>
              </p>
            ) : mode === 'preset' ? (
              <div className={styles.categoryGrid} role="radiogroup" aria-label="Класс техники">
                {FLEET_CATEGORIES.map((c) => {
                  const active = c.id === presetId
                  return (
                    <button
                      key={c.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      className={`${styles.categoryChip} ${active ? styles.categoryChipActive : ''}`}
                      onClick={() => setPresetId(c.id)}
                    >
                      <span className={styles.categoryChipIcon} aria-hidden>
                        <FleetCategoryIcon id={c.id} size={16} />
                      </span>
                      <span className={styles.categoryChipLabel}>{c.shortTitle}</span>
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className={styles.customBlock}>
                <label className={styles.customField}>
                  <span className={styles.fieldLabel}>Название класса</span>
                  <input
                    ref={customNameRef}
                    className={`${styles.input} ${
                      touched && !isCategoryValid ? styles.inputInvalid : ''
                    }`}
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="Например: Автокраны"
                    autoComplete="off"
                    aria-invalid={touched && !isCategoryValid}
                  />
                </label>
                <p className={styles.customHint}>
                  Появится отдельным разделом на «Спецтехнике» — туда можно будет добавлять такие же
                  единицы. Пример: «Бетононасосы», «Манипуляторы», «Буровые».
                </p>
              </div>
            )}
            {!lockedCategory && mode === 'preset' ? (
              <p className={styles.presetHint}>
                Выбран: <strong>{presetLabel}</strong>
              </p>
            ) : null}
          </section>

          {/* Основные реквизиты */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Реквизиты</h3>
            <div className={styles.fields}>
              <label className={`${styles.field} ${styles.fieldPlate}`}>
                <span className={styles.fieldLabel}>Госномер</span>
                <input
                  ref={firstInputRef}
                  className={`${styles.input} ${touched && !isPlateValid ? styles.inputInvalid : ''}`}
                  value={plate}
                  onChange={(e) => setPlate(e.target.value.toUpperCase())}
                  placeholder="А 123 АА 777"
                  autoComplete="off"
                  aria-invalid={touched && !isPlateValid}
                />
              </label>
              <label className={`${styles.field} ${styles.fieldModel}`}>
                <span className={styles.fieldLabel}>Модель</span>
                <input
                  className={`${styles.input} ${touched && !isModelValid ? styles.inputInvalid : ''}`}
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="Например: КАМАЗ‑65115"
                  autoComplete="off"
                  aria-invalid={touched && !isModelValid}
                />
              </label>
              <label className={`${styles.field} ${styles.fieldVin}`}>
                <span className={styles.fieldLabel}>VIN / рама</span>
                <input
                  className={`${styles.input} ${touched && !isVinValid ? styles.inputInvalid : ''}`}
                  value={vin}
                  onChange={(e) => setVin(e.target.value.toUpperCase())}
                  placeholder="XTA21213..."
                  autoComplete="off"
                  aria-invalid={touched && !isVinValid}
                />
              </label>
              <label className={`${styles.field} ${styles.fieldDate}`}>
                <span className={styles.fieldLabel}>Страховка действует до</span>
                <input
                  className={styles.input}
                  type="date"
                  value={insuranceDate}
                  onChange={(e) => setInsuranceDate(e.target.value)}
                />
              </label>
            </div>
            {touched && !isValid ? (
              <p className={styles.errorNote}>
                {!isCategoryValid
                  ? 'Введите название класса техники — хотя бы 2 символа.'
                  : 'Заполните госномер, модель и VIN — это минимум для карточки.'}
              </p>
            ) : (
              <p className={styles.hint}>
                ТО, ремонты, пропуска и расходы — внесёте позже в карточке техники.
              </p>
            )}
          </section>
        </div>

        <footer className={styles.footer}>
          <button type="button" className={styles.cancel} onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            className={styles.submit}
            onClick={handleSubmit}
            disabled={touched && !isValid}
          >
            <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden>
              <path
                d="M10 4v12M4 10h12"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            Добавить в парк
          </button>
        </footer>
      </div>
    </div>
  )
}
