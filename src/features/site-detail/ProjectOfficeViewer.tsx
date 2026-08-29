import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import mammoth from 'mammoth'
import type { ProjectOpenMode } from '../../lib/projectFileOpen'
import styles from './ProjectOfficeViewer.module.css'

type Props = {
  name: string
  url: string
  mode: Exclude<ProjectOpenMode, 'pdf' | 'dwg' | 'download'>
  resolveBlob: () => Promise<Blob | null>
  onClose: () => void
}

export function ProjectOfficeViewer({ name, url, mode, resolveBlob, onClose }: Props) {
  const [html, setHtml] = useState<string | null>(null)
  const [text, setText] = useState<string | null>(null)
  const [sheetNames, setSheetNames] = useState<string[]>([])
  const [activeSheet, setActiveSheet] = useState(0)
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setHtml(null)
    setText(null)
    setWorkbook(null)

    void (async () => {
      try {
        if (mode === 'image') {
          if (!cancelled) setLoading(false)
          return
        }

        const blob = await resolveBlob()
        if (!blob) throw new Error('blob_missing')
        const buffer = await blob.arrayBuffer()

        if (mode === 'spreadsheet') {
          const wb = XLSX.read(buffer, { type: 'array' })
          if (cancelled) return
          setWorkbook(wb)
          setSheetNames(wb.SheetNames)
          setActiveSheet(0)
          const sheet = wb.Sheets[wb.SheetNames[0]]
          setHtml(XLSX.utils.sheet_to_html(sheet, { id: 'sheet-preview' }))
        } else if (mode === 'word') {
          const result = await mammoth.convertToHtml({ arrayBuffer: buffer })
          if (cancelled) return
          setHtml(result.value || '<p>Документ пуст.</p>')
        } else if (mode === 'text') {
          const value = new TextDecoder('utf-8').decode(buffer)
          if (cancelled) return
          setText(value)
        }
        if (!cancelled) setLoading(false)
      } catch {
        if (!cancelled) {
          setError('Не удалось открыть файл в браузере. Скачайте и откройте на компьютере.')
          setLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [mode, name, resolveBlob, url])

  useEffect(() => {
    if (!workbook || mode !== 'spreadsheet') return
    const sheetName = workbook.SheetNames[activeSheet]
    if (!sheetName) return
    const sheet = workbook.Sheets[sheetName]
    setHtml(XLSX.utils.sheet_to_html(sheet, { id: 'sheet-preview' }))
  }, [activeSheet, mode, workbook])

  return (
    <div className={styles.screen} role="dialog" aria-modal="true" aria-label={name}>
      <div className={styles.viewer}>
        <div className={styles.head}>
          <div>
            <p className={styles.kicker}>Документ</p>
            <p className={styles.title}>{name}</p>
          </div>
          <div className={styles.actions}>
            {mode === 'spreadsheet' && sheetNames.length > 1 ? (
              <select
                className={styles.sheetSelect}
                value={activeSheet}
                onChange={(e) => setActiveSheet(Number(e.target.value))}
                aria-label="Лист Excel"
              >
                {sheetNames.map((sheet, i) => (
                  <option key={sheet} value={i}>
                    {sheet}
                  </option>
                ))}
              </select>
            ) : null}
            <a className={styles.btn} href={url} download={name}>
              Скачать
            </a>
            <button type="button" className={styles.btnClose} onClick={onClose}>
              Закрыть
            </button>
          </div>
        </div>

        <div className={styles.body}>
          {loading ? <p className={styles.status}>Открываем…</p> : null}
          {error ? (
            <div className={styles.errorBox}>
              <p className={styles.status}>{error}</p>
              <a className={styles.btn} href={url} download={name}>
                Скачать файл
              </a>
            </div>
          ) : null}
          {!loading && !error && mode === 'image' ? (
            <img className={styles.image} src={url} alt={name} />
          ) : null}
          {!loading && !error && html ? (
            <div className={styles.html} dangerouslySetInnerHTML={{ __html: html }} />
          ) : null}
          {!loading && !error && text != null ? (
            <pre className={styles.text}>{text}</pre>
          ) : null}
        </div>
      </div>
    </div>
  )
}
