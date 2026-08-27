const KEY = 'deloresh-remembered-login:v1'

export function loadRememberedLogin(): string {
  try {
    if (typeof localStorage === 'undefined') return ''
    return (localStorage.getItem(KEY) ?? '').trim()
  } catch {
    return ''
  }
}

export function saveRememberedLogin(login: string): void {
  try {
    if (typeof localStorage === 'undefined') return
    const t = login.trim()
    if (!t) return
    localStorage.setItem(KEY, t)
  } catch {
    /* private mode / quota */
  }
}
