import { useState, type ReactNode } from 'react'
import { maxShareUrl, openTelegramApp, telegramSharePayload, whatsappShareUrl } from '../../domain/driverShare'
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

function IconWa() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12.04 2C6.58 2 2.15 6.4 2.15 11.84c0 1.99.59 3.84 1.61 5.4L2 22l4.92-1.7a9.86 9.86 0 0 0 5.12 1.4h.01c5.46 0 9.89-4.4 9.89-9.84C21.94 6.4 17.5 2 12.04 2zm5.5 13.98c-.23.64-1.33 1.17-1.85 1.24-.47.07-1.07.1-1.73-.11-.4-.12-.91-.28-1.57-.55-2.76-1.19-4.56-3.97-4.7-4.15-.13-.18-1.1-1.46-1.1-2.79 0-1.32.69-1.97.94-2.24.24-.27.53-.34.71-.34h.51c.16 0 .38-.06.59.45.23.54.77 1.88.84 2.02.07.13.11.3.02.48-.09.18-.14.3-.27.46-.14.16-.29.35-.41.47-.14.14-.28.29-.12.56.16.27.7 1.15 1.5 1.86 1.03.92 1.9 1.2 2.17 1.34.27.13.43.11.59-.07.16-.18.68-.79.86-1.06.18-.27.36-.22.61-.13.24.09 1.54.73 1.8.86.27.14.44.2.51.31.07.11.07.64-.16 1.28z"
      />
    </svg>
  )
}

function IconTg() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        fill="currentColor"
        d="M21.94 4.46c-.2-.82-.78-1.14-1.58-.9L3.4 9.72c-.86.28-.85.84-.15 1.06l4.33 1.35 1.67 5.2c.21.66.38.91.82.91.38 0 .55-.18.76-.39l2.52-2.45 4.73 3.49c.87.48 1.5.23 1.71-.8l3.1-14.55.01-.08zm-3.3 2.62-8.53 7.75-.34 3.4-1.56-4.9 10.43-6.25z"
      />
    </svg>
  )
}

function IconMax() {
  // Фирменный знак MAX (speech-bubble mark), viewBox оригинала 720×720.
  return (
    <svg viewBox="0 0 720 720" width="22" height="22" aria-hidden="true">
      <path
        fill="currentColor"
        d="M350.4,9.6C141.8,20.5,4.1,184.1,12.8,390.4c3.8,90.3,40.1,168,48.7,253.7,2.2,22.2-4.2,49.6,21.4,59.3,31.5,11.9,79.8-8.1,106.2-26.4,9-6.1,17.6-13.2,24.2-22,27.3,18.1,53.2,35.6,85.7,43.4,143.1,34.3,299.9-44.2,369.6-170.3C799.6,291.2,622.5-4.6,350.4,9.6h0ZM269.4,504c-11.3,8.8-22.2,20.8-34.7,27.7-18.1,9.7-23.7-.4-30.5-16.4-21.4-50.9-24-137.6-11.5-190.9,16.8-72.5,72.9-136.3,150-143.1,78-6.9,150.4,32.7,183.1,104.2,72.4,159.1-112.9,316.2-256.4,218.6h0Z"
      />
    </svg>
  )
}

function IconCopy() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
      <rect x="8" y="8" width="11" height="11" rx="2.2" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M6.5 15.5H5.8A2.3 2.3 0 0 1 3.5 13.2V5.8A2.3 2.3 0 0 1 5.8 3.5h7.4a2.3 2.3 0 0 1 2.3 2.3v.7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

function IconMore() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
      <circle cx="18" cy="5" r="2.2" fill="currentColor" />
      <circle cx="6" cy="12" r="2.2" fill="currentColor" />
      <circle cx="18" cy="19" r="2.2" fill="currentColor" />
      <path
        d="M7.8 11.2 16.2 6.3M7.8 12.8l8.4 5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  )
}

function ShareTile({
  className,
  href,
  disabled,
  onClick,
  icon,
  label,
  asButton,
}: {
  className: string
  href?: string
  disabled?: boolean
  onClick?: () => void
  icon: ReactNode
  label: string
  asButton?: boolean
}) {
  const cls = `${styles.tile} ${className} ${disabled ? styles.tileOff : ''}`
  const body = (
    <>
      <span className={styles.glyph} aria-hidden>
        {icon}
      </span>
      <span className={styles.tileLabel}>{label}</span>
    </>
  )

  if (asButton) {
    return (
      <button type="button" className={cls} disabled={disabled} onClick={onClick} title={label}>
        {body}
      </button>
    )
  }

  // tg:// / whatsapp:// — только _self, иначе браузер уходит в пустую вкладку вместо приложения.
  const customProtocol = Boolean(href && !/^https?:/i.test(href))

  return (
    <a
      className={cls}
      href={disabled ? undefined : href}
      target={customProtocol ? '_self' : '_blank'}
      rel="noreferrer"
      title={label}
      aria-disabled={disabled}
      onClick={(e) => {
        if (disabled) e.preventDefault()
        onClick?.()
      }}
    >
      {body}
    </a>
  )
}

export function DriverMessengerShare({ text, mapsUrl, compact = false, disabled = false }: Props) {
  const [copied, setCopied] = useState(false)
  const [tgReady, setTgReady] = useState(false)
  const canSystemShare = typeof navigator !== 'undefined' && 'share' in navigator

  const markCopied = () => {
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2200)
  }

  const handleCopy = async () => {
    if (disabled) return
    if (await copyText(text)) markCopied()
  }

  const handleTelegram = async () => {
    if (disabled) return
    const payload = telegramSharePayload(text, mapsUrl)
    const ok = await copyText(payload)
    if (ok) {
      markCopied()
      setTgReady(true)
      window.setTimeout(() => setTgReady(false), 12000)
    }
    openTelegramApp(text, mapsUrl)
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
      {compact ? null : (
        <div className={styles.head}>
          <p className={styles.kicker}>
            <span className={styles.kickerMark} aria-hidden />
            Маршрут
          </p>
          <div className={styles.headCopy}>
            <p className={styles.title}>Передать водителю</p>
            <p className={styles.lead}>Адрес объекта и ссылка на карту — одним сообщением</p>
          </div>
        </div>
      )}
      {tgReady ? (
        <p className={styles.tgTip} role="status">
          Сообщение скопировано. Откройте Telegram, выберите чат водителя и вставьте текст.
        </p>
      ) : null}
      <div className={styles.grid} aria-label={compact ? 'Отправить водителю' : undefined} aria-disabled={disabled}>
        <ShareTile
          className={styles.wa}
          href={whatsappShareUrl(text)}
          disabled={disabled}
          icon={<IconWa />}
          label="WhatsApp"
        />
        <ShareTile
          className={styles.tg}
          asButton
          disabled={disabled}
          onClick={() => void handleTelegram()}
          icon={<IconTg />}
          label="Telegram"
        />
        <ShareTile
          className={styles.max}
          asButton
          disabled={disabled}
          onClick={() => void handleMax()}
          icon={<IconMax />}
          label="Max"
        />
        <ShareTile
          className={styles.copy}
          asButton
          disabled={disabled}
          onClick={() => void handleCopy()}
          icon={<IconCopy />}
          label={copied ? 'Готово' : 'Копировать'}
        />
        {canSystemShare ? (
          <ShareTile
            className={styles.more}
            asButton
            disabled={disabled}
            onClick={() => void handleMore()}
            icon={<IconMore />}
            label="Ещё"
          />
        ) : null}
      </div>
    </div>
  )
}
