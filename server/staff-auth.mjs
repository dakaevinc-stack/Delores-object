/**
 * Сессии сотрудников для API задач / медиа.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url))
const realPasswords = path.join(dir, 'staff-passwords.mjs')
const examplePasswords = path.join(dir, 'staff-passwords.example.mjs')
const passwordsUrl = pathToFileURL(
  fs.existsSync(realPasswords) ? realPasswords : examplePasswords,
).href
const { STAFF_PASSWORDS, STAFF_PROFILES } = await import(passwordsUrl)

export { STAFF_PASSWORDS, STAFF_PROFILES }

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

/**
 * @param {string} dataRoot
 */
export function sessionsFile(dataRoot) {
  return path.join(dataRoot, 'staff-sessions.json')
}

/**
 * @param {string} login
 * @param {string} password
 */
export function verifyStaffCredentials(login, password) {
  const user = String(login || '').trim()
  const pass = String(password || '')
  if (!user || !pass) return null
  const key = Object.keys(STAFF_PASSWORDS).find(
    (k) => k.toLocaleLowerCase('en-US') === user.toLocaleLowerCase('en-US'),
  )
  if (!key) return null
  if (STAFF_PASSWORDS[key] !== pass) return null
  const profile = STAFF_PROFILES[key]
  if (!profile) return null
  return {
    login: key,
    fullName: profile.fullName,
    duty: profile.duty,
    dutyLabel: profile.dutyLabel,
  }
}

/**
 * @param {string} dataRoot
 * @returns {Promise<Array<{ token: string, login: string, exp: number }>>}
 */
async function readSessions(dataRoot) {
  try {
    const raw = await fsPromises.readFile(sessionsFile(dataRoot), 'utf8')
    const j = JSON.parse(raw)
    if (!Array.isArray(j)) return []
    const now = Date.now()
    return j.filter(
      (s) =>
        s &&
        typeof s.token === 'string' &&
        typeof s.login === 'string' &&
        typeof s.exp === 'number' &&
        s.exp > now,
    )
  } catch (e) {
    if (/** @type {NodeJS.ErrnoException} */ (e).code === 'ENOENT') return []
    throw e
  }
}

/**
 * @param {string} dataRoot
 * @param {Array<{ token: string, login: string, exp: number }>} list
 */
async function writeSessions(dataRoot, list) {
  await fsPromises.mkdir(path.dirname(sessionsFile(dataRoot)), { recursive: true })
  await fsPromises.writeFile(sessionsFile(dataRoot), JSON.stringify(list, null, 2), 'utf8')
}

/**
 * @param {string} dataRoot
 * @param {string} login
 */
export async function createStaffSession(dataRoot, login) {
  const token = crypto.randomBytes(24).toString('hex')
  const exp = Date.now() + SESSION_TTL_MS
  const prev = await readSessions(dataRoot)
  const next = [{ token, login, exp }, ...prev.filter((s) => s.login !== login)].slice(0, 200)
  await writeSessions(dataRoot, next)
  return { token, exp }
}

/**
 * @param {string} dataRoot
 * @param {string} token
 * @returns {Promise<string | null>} login
 */
export async function resolveStaffToken(dataRoot, token) {
  const t = String(token || '').trim()
  if (!t || t.length < 16) return null
  const list = await readSessions(dataRoot)
  const hit = list.find((s) => s.token === t)
  return hit ? hit.login : null
}

/**
 * @param {import('node:http').IncomingMessage} req
 */
export function readBearerToken(req) {
  const h = String(req.headers.authorization || '')
  const m = /^Bearer\s+(\S+)/i.exec(h)
  if (m) return m[1]
  const alt = String(req.headers['x-deloresh-staff-token'] || '').trim()
  return alt || ''
}
