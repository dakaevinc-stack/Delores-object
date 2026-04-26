import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { addUserSite, listAllSites } from '../lib/sitesRepository'
import type { ConstructionSite } from '../types/constructionSite'
import styles from './AddObjectPage.module.css'

/**
 * Стандартный список видов работ — по факту суточных отчётов с объектов.
 * Чек-бокс выбирает вид работ; «Добавить работу вручную» — своя строка.
 */
const DEFAULT_WORK_TYPES: readonly string[] = [
  'Подготовка площадки',
  'Устройство основания',
  'Бортовой камень',
  'Асфальтобетонное покрытие',
  'Устройство тротуаров',
  'Инженерные сети',
  'Ограждения и знаки',
  'Демонтаж',
]

type WorkRow = {
  id: string
  name: string
  /** Строка из стандартного списка, которую можно снять галкой; пользовательские строки не выключаются — только удаляются. */
  preset: boolean
  checked: boolean
}

function makeInitialWorks(): WorkRow[] {
  return DEFAULT_WORK_TYPES.map((name, i) => ({
    id: `work-${i + 1}`,
    name,
    preset: true,
    checked: false,
  }))
}

function slugifyRu(s: string): string {
  const map: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh',
    з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
    п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts',
    ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu',
    я: 'ya',
  }
  const lower = s.toLowerCase().trim()
  let out = ''
  for (const ch of lower) {
    if (/[a-z0-9]/.test(ch)) out += ch
    else if (map[ch] !== undefined) out += map[ch]
    else if (/\s|[-_]/.test(ch)) out += '-'
  }
  out = out.replace(/-+/g, '-').replace(/^-|-$/g, '')
  return out || 'obj'
}

function ensureUniqueId(base: string): string {
  const existing = new Set(listAllSites().map((s) => s.id))
  if (!existing.has(base)) return base
  let i = 2
  while (existing.has(`${base}-${i}`)) i += 1
  return `${base}-${i}`
}

export function AddObjectPage() {
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [startDateIso, setStartDateIso] = useState('')
  const [endDateIso, setEndDateIso] = useState('')
  const [responsibleFio, setResponsibleFio] = useState('')
  const [works, setWorks] = useState<WorkRow[]>(makeInitialWorks)
  const [errors, setErrors] = useState<{ name?: string; endDate?: string }>({})
  const customInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const toggleWork = (id: string) => {
    setWorks((prev) =>
      prev.map((w) => (w.id === id ? { ...w, checked: !w.checked } : w)),
    )
  }

  const updateWorkName = (id: string, value: string) => {
    setWorks((prev) => prev.map((w) => (w.id === id ? { ...w, name: value } : w)))
  }

  const removeWork = (id: string) => {
    setWorks((prev) => prev.filter((w) => w.id !== id))
  }

  const addCustomWork = () => {
    const id = `custom-${Date.now().toString(36)}`
    setWorks((prev) => [...prev, { id, name: '', preset: false, checked: true }])
    // Фокус на новое поле
    setTimeout(() => {
      customInputRefs.current[id]?.focus()
    }, 0)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const nextErrors: typeof errors = {}
    if (!name.trim()) nextErrors.name = 'Укажите название объекта.'
    if (startDateIso && endDateIso && endDateIso < startDateIso) {
      nextErrors.endDate = 'Завершение не может быть раньше старта.'
    }
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    const selected = works.filter((w) => w.checked && w.name.trim())
    const stages = selected.map((w, i) => ({
      id: `stage-${i + 1}-${slugifyRu(w.name).slice(0, 16)}`,
      name: w.name.trim(),
      planPercent: 0,
      factPercent: 0,
    }))

    const baseId = slugifyRu(name)
    const id = ensureUniqueId(baseId)

    const site: ConstructionSite = {
      id,
      name: name.trim(),
      status: 'normal',
      executive: {
        planPercent: 0,
        factPercent: 0,
        summaryLine: 'Объект заведён — ожидает первый отчёт с площадки.',
        hasOpenRisks: false,
        stages,
      },
      address: address.trim() || undefined,
      startDateIso: startDateIso || undefined,
      endDateIso: endDateIso || undefined,
      responsibleFio: responsibleFio.trim() || undefined,
      createdAtIso: new Date().toISOString(),
      isUserCreated: true,
    }

    addUserSite(site)
    navigate(`/objects/${site.id}`)
  }

  return (
    <div className={styles.page}>
      <nav className={styles.nav} aria-label="Навигация">
        <Link className={styles.crumb} to="/">
          Управленческий обзор
        </Link>
        <span className={styles.sep} aria-hidden>
          /
        </span>
        <span className={styles.current}>Новый объект</span>
      </nav>

      <header className={styles.header}>
        <h1 className={styles.title}>Добавить объект</h1>
        <p className={styles.lead}>
          Заполните основные сведения и отметьте виды работ на площадке. Остальное —
          отчёты, фото, критерии — докрутится в карточке объекта.
        </p>
      </header>

      <form className={styles.form} onSubmit={handleSubmit}>
        <label className={styles.field}>
          <span className={styles.label}>
            Название объекта<span className={styles.required}>*</span>
          </span>
          <input
            className={`${styles.input} ${errors.name ? styles.inputError : ''}`}
            type="text"
            placeholder="Например: Проезд к вл. 28Б"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              if (errors.name) setErrors({ ...errors, name: undefined })
            }}
            autoFocus
          />
          {errors.name ? (
            <span className={styles.errorText} role="alert">
              {errors.name}
            </span>
          ) : null}
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Адрес</span>
          <input
            className={styles.input}
            type="text"
            placeholder="Например: ул. Вокзальная, Щербинка"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </label>

        <div className={styles.row2}>
          <label className={styles.field}>
            <span className={styles.label}>Старт работ</span>
            <input
              className={styles.input}
              type="date"
              value={startDateIso}
              max={endDateIso || undefined}
              onChange={(e) => setStartDateIso(e.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Плановое завершение</span>
            <input
              className={`${styles.input} ${errors.endDate ? styles.inputError : ''}`}
              type="date"
              value={endDateIso}
              min={startDateIso || undefined}
              onChange={(e) => {
                setEndDateIso(e.target.value)
                if (errors.endDate) setErrors({ ...errors, endDate: undefined })
              }}
            />
            {errors.endDate ? (
              <span className={styles.errorText} role="alert">
                {errors.endDate}
              </span>
            ) : null}
          </label>
        </div>

        <label className={styles.field}>
          <span className={styles.label}>Ответственный на площадке</span>
          <input
            className={styles.input}
            type="text"
            placeholder="ФИО — например: Петросян А. Ю."
            autoComplete="name"
            value={responsibleFio}
            onChange={(e) => setResponsibleFio(e.target.value)}
          />
        </label>

        <div className={styles.divider} />

        <div className={styles.worksBlock}>
          <span className={styles.label}>Виды работ на объекте</span>
          <ul className={styles.workList}>
            {works.map((w) => (
              <li key={w.id} className={styles.workRow}>
                <label className={styles.workLabel}>
                  <input
                    type="checkbox"
                    className={styles.checkbox}
                    checked={w.checked}
                    onChange={() => toggleWork(w.id)}
                    aria-label={w.name || 'Новый вид работ'}
                  />
                  {w.preset ? (
                    <span className={styles.workName}>{w.name}</span>
                  ) : (
                    <input
                      ref={(el) => {
                        customInputRefs.current[w.id] = el
                      }}
                      type="text"
                      className={styles.workInput}
                      placeholder="Название работы"
                      value={w.name}
                      onChange={(e) => updateWorkName(w.id, e.target.value)}
                    />
                  )}
                </label>
                {!w.preset ? (
                  <button
                    type="button"
                    className={styles.removeBtn}
                    onClick={() => removeWork(w.id)}
                    aria-label="Удалить работу"
                  >
                    ×
                  </button>
                ) : null}
              </li>
            ))}
          </ul>

          <button type="button" className={styles.addBtn} onClick={addCustomWork}>
            + Добавить работу вручную
          </button>
        </div>

        <div className={styles.actions}>
          <Link className={styles.btnGhost} to="/">
            Отмена
          </Link>
          <button type="submit" className={styles.btnPrimary}>
            Создать объект
          </button>
        </div>
      </form>
    </div>
  )
}
