import { useId, useState, type FormEvent } from 'react'
import {
  clearLocalSession,
  loadLocalSession,
  saveLocalSession,
  sessionInitials,
  type LocalSession,
} from '../../lib/localSession'
import styles from './MastheadSignIn.module.css'

type Props = {
  className?: string
}

function UserIcon() {
  return (
    <svg viewBox="0 0 20 20" width="15" height="15" fill="none" aria-hidden focusable="false">
      <circle cx="10" cy="7" r="3.2" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M4.5 16.2c.7-2.7 2.9-4.2 5.5-4.2s4.8 1.5 5.5 4.2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg viewBox="0 0 20 20" width="15" height="15" fill="none" aria-hidden focusable="false">
      <rect x="4.5" y="8.5" width="11" height="7.5" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M7.2 8.5V6.8a2.8 2.8 0 0 1 5.6 0v1.7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg viewBox="0 0 20 20" width="15" height="15" fill="none" aria-hidden focusable="false">
      <path
        d="M2 10s3-4.6 8-4.6S18 10 18 10s-3 4.6-8 4.6S2 10 2 10z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="10" r="2.1" stroke="currentColor" strokeWidth="1.4" />
      {off && (
        <path d="M4 16 16 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      )}
    </svg>
  )
}

export function MastheadSignIn({ className }: Props) {
  const uid = useId()
  const loginId = `${uid}-login`
  const passwordId = `${uid}-password`
  const [session, setSession] = useState<LocalSession | null>(() => loadLocalSession())
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [reveal, setReveal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const user = login.trim()
    if (!user || !password) {
      setMessage('Укажите логин и пароль')
      return
    }
    setBusy(true)
    setMessage(null)
    // Клиентский профиль до корпоративного SSO/сессии на сервере.
    window.setTimeout(() => {
      const next = saveLocalSession(user)
      setSession(next)
      setPassword('')
      setBusy(false)
    }, 280)
  }

  function onSignOut() {
    clearLocalSession()
    setSession(null)
    setMessage(null)
  }

  if (session) {
    return (
      <div
        className={[styles.session, className].filter(Boolean).join(' ')}
        aria-label={`Профиль: ${session.login}`}
      >
        <span className={styles.sessionAvatar} aria-hidden>
          {sessionInitials(session.login)}
        </span>
        <div className={styles.sessionCopy}>
          <p className={styles.sessionKicker}>В системе</p>
          <p className={styles.sessionName}>{session.login}</p>
        </div>
        <button className={styles.signOut} type="button" onClick={onSignOut}>
          Выйти
        </button>
      </div>
    )
  }

  return (
    <form
      className={[styles.form, className].filter(Boolean).join(' ')}
      onSubmit={onSubmit}
      noValidate
      aria-label="Вход в систему"
    >
      <div className={styles.field}>
        <label className={styles.srOnly} htmlFor={loginId}>
          Логин
        </label>
        <span className={styles.fieldIcon} aria-hidden>
          <UserIcon />
        </span>
        <input
          id={loginId}
          className={styles.input}
          name="login"
          type="text"
          placeholder="Логин"
          autoComplete="username"
          inputMode="text"
          spellCheck={false}
          value={login}
          onChange={(e) => {
            setLogin(e.target.value)
            if (message) setMessage(null)
          }}
          disabled={busy}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.srOnly} htmlFor={passwordId}>
          Пароль
        </label>
        <span className={styles.fieldIcon} aria-hidden>
          <LockIcon />
        </span>
        <input
          id={passwordId}
          className={`${styles.input} ${styles.inputWithAction}`}
          name="password"
          type={reveal ? 'text' : 'password'}
          placeholder="Пароль"
          autoComplete="current-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value)
            if (message) setMessage(null)
          }}
          disabled={busy}
        />
        <button
          className={styles.reveal}
          type="button"
          onClick={() => setReveal((v) => !v)}
          aria-label={reveal ? 'Скрыть пароль' : 'Показать пароль'}
          aria-pressed={reveal}
          disabled={busy}
        >
          <EyeIcon off={reveal} />
        </button>
      </div>

      <div className={styles.actions}>
        <button className={styles.submit} type="submit" disabled={busy}>
          <span>{busy ? 'Вход…' : 'Войти'}</span>
          <span className={styles.submitArrow} aria-hidden>
            <svg viewBox="0 0 20 20" width="13" height="13" fill="none">
              <path
                d="M4 10h11M10 5l5 5-5 5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </button>

        {message ? (
          <p className={styles.message} role="status">
            {message}
          </p>
        ) : (
          <p className={styles.hint}>Корпоративный доступ</p>
        )}
      </div>
    </form>
  )
}
