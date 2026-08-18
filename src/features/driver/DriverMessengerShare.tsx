import { useState } from 'react'
import { maxShareUrl, telegramShareUrl, whatsappShareUrl } from '../../domain/driverShare'
import styles from './DriverMessengerShare.module.css'

type Props = {
  text: string
  mapsUrl: string
  compact?: boolean
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

export function DriverMessengerShare({ text, mapsUrl, compact = false }: Props) {
  const [copied, setCopied] = useState(false)
  const canSystemShare = typeof navigator !== 'undefined' && 'share' in navigator

  const markCopied = () => {
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  const handleCopy = async () => {
    if (await copyText(text)) markCopied()
  }

  const handleMax = async () => {
    await copyText(text)
    markCopied()
    window.open(maxShareUrl(text), '_blank', 'noopener,noreferrer')
  }

  const handleMore = async () => {
    try {
      await navigator.share({ title: 'Маршрут водителю', text, url: mapsUrl })
    } catch {
      if (await copyText(text)) markCopied()
    }
  }

  return (
    <div className={compact ? styles.wrapCompact : styles.wrap}>
      {compact ? null : <p className={styles.label}>Кинуть водителю</p>}
      <div className={styles.grid}>
        <a className={`${styles.btn} ${styles.wa}`} href={whatsappShareUrl(text)} target="_blank" rel="noreferrer">
          WhatsApp
        </a>
        <a
          className={`${styles.btn} ${styles.tg}`}
          href={telegramShareUrl(text, mapsUrl)}
          target="_blank"
          rel="noreferrer"
        >
          Telegram
        </a>
        <button type="button" className={`${styles.btn} ${styles.max}`} onClick={() => void handleMax()}>
          Max
        </button>
        <a className={`${styles.btn} ${styles.maps}`} href={mapsUrl} target="_blank" rel="noreferrer">
          Яндекс.Карты
        </a>
        <button type="button" className={`${styles.btn} ${styles.copy}`} onClick={() => void handleCopy()}>
          {copied ? 'Скопировано' : 'Скопировать'}
        </button>
        {canSystemShare ? (
          <button type="button" className={`${styles.btn} ${styles.copy}`} onClick={() => void handleMore()}>
            Ещё…
          </button>
        ) : null}
      </div>
    </div>
  )
}
