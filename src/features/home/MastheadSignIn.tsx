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

export function MastheadSignIn({ className }: Props) {
  const uid = useId()
  const loginId = `${uid}-login`
  const [session, setSession] = useState<LocalSession | null>(() => loadLocalSession())
  const [login, setLogin] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const user = login.trim()
    if (!user) {
      setMessage('Укажите ФИО или логин')
      return
    }
    setBusy(true)
    setMessage(null)
    // Пока нет корпоративных учёток — достаточно имени на этом устройстве.
    window.setTimeout(() => {
      const next = saveLocalSession(user)
      setSession(next)
      setBusy(false)
    }, 220)
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
      aria-label="Представиться в системе"
    >
      <div className={styles.field}>
        <label className={styles.srOnly} htmlFor={loginId}>
          ФИО или логин
        </label>
        <span className={styles.fieldIcon} aria-hidden>
          <UserIcon />
        </span>
        <input
          id={loginId}
          className={styles.input}
          name="login"
          type="text"
          placeholder="ФИО или логин"
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
          <p className={styles.hint}>Пароль пока не нужен</p>
        )}
      </div>
    </form>
  )
}
