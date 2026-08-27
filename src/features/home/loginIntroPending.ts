const KEY = 'deloresh-pending-login-intro:v1'
const EVENT = 'deloresh-login-intro'

/** Запросить брендовый ролик после успешного «Войти» (переживает редирект /driver). */
export function requestLoginIntro(): void {
  try {
    sessionStorage.setItem(KEY, '1')
  } catch {
    /* private mode */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(EVENT))
  }
}

export function clearLoginIntroPending(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* private mode */
  }
}

export function consumeLoginIntroPending(): boolean {
  try {
    if (sessionStorage.getItem(KEY) !== '1') return false
    sessionStorage.removeItem(KEY)
    return true
  } catch {
    return false
  }
}

export function peekLoginIntroPending(): boolean {
  try {
    return sessionStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function subscribeLoginIntroRequest(onRequest: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const handler = () => onRequest()
  window.addEventListener(EVENT, handler)
  return () => window.removeEventListener(EVENT, handler)
}
