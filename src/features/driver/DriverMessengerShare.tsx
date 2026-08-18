import { useState } from 'react'
import { maxShareUrl, telegramShareUrl, whatsappShareUrl } from '../../domain/driverShare'
import styles from './DriverMessengerShare.module.css'

type Props = {
  text: string
  mapsUrl: string
  compact?: boolean
  disabled?: boolean
}

async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      /* fallback */
    }
  }
  if (typeof document === 'undefined') return false
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  document.body.removeChild(ta)
  return ok
}

export function DriverMessengerShare({ text, mapsUrl, compact = false, disabled = false }: Props) {
  const [copied, setCopied] = useState(false)
  const canSystemShare = typeof navigator !== 'undefined' && 'share' in navigator

  const markCopied = () => {
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  const handleCopy = async () => {
    if (disabled) return
    if (await copyText(text)) markCopied()
  }

  const handleMax = async () => {
    if (disabled) return
    await copyText(text)
    markCopied()
    window.open(maxShareUrl(text), '_blank', 'noopener,noreferrer')
  }

  const handleMore = async () => {
    if (disabled) return
    try {
      await navigator.share({ title: 'Маршрут водителю', text, url: mapsUrl })
    } catch {
      if (await copyText(text)) markCopied()
    }
  }

  return (
    <div className={compact ? styles.wrapCompact : styles.wrap}>
      {compact ? null : <p className={styles.label}>Кинуть водителю</p>}
      <div className={styles.grid} aria-disabled={disabled}>
        <a
          className={`${styles.btn} ${styles.wa} ${disabled ? styles.btnOff : ''}`}
          href={disabled ? undefined : whatsappShareUrl(text)}
          target="_blank"
          rel="noreferrer"
          aria-disabled={disabled}
          onClick={(e) => {
            if (disabled) e.preventDefault()
          }}
        >
          WhatsApp
        </a>
        <a
          className={`${styles.btn} ${styles.tg} ${disabled ? styles.btnOff : ''}`}
          href={disabled ? undefined : telegramShareUrl(text, mapsUrl)}
          target="_blank"
          rel="noreferrer"
          aria-disabled={disabled}
          onClick={(e) => {
            if (disabled) e.preventDefault()
          }}
        >
          Telegram
        </a>
        <button
          type="button"
          className={`${styles.btn} ${styles.max} ${disabled ? styles.btnOff : ''}`}
          disabled={disabled}
          onClick={() => void handleMax()}
        >
          Max
        </button>
        <a
          className={`${styles.btn} ${styles.maps} ${disabled ? styles.btnOff : ''}`}
          href={disabled ? undefined : mapsUrl}
          target="_blank"
          rel="noreferrer"
          aria-disabled={disabled}
          onClick={(e) => {
            if (disabled) e.preventDefault()
          }}
        >
          Яндекс.Карты
        </a>
        <button
          type="button"
          className={`${styles.btn} ${styles.copy} ${disabled ? styles.btnOff : ''}`}
          disabled={disabled}
          onClick={() => void handleCopy()}
        >
          {copied ? 'Скопировано' : 'Скопировать'}
        </button>
        {canSystemShare ? (
          <button
            type="button"
            className={`${styles.btn} ${styles.copy} ${disabled ? styles.btnOff : ''}`}
            disabled={disabled}
            onClick={() => void handleMore()}
          >
            Ещё…
          </button>
        ) : null}
      </div>
    </div>
  )
}

