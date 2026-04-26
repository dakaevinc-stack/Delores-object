import type { BrigadierStoredReport } from '../domain/brigadierReport'
import type { ProcurementRequest } from '../domain/procurementRequest'
import { parseBrigadierReportsJson } from './brigadierReportsRepository'
import { parseProcurementRequestsJson } from './procurementRequestsRepository'

function apiBase(): string {
  const raw = import.meta.env.VITE_SITE_FORMS_API_BASE
  if (typeof raw === 'string') {
    const t = raw.trim()
    if (t) return t.replace(/\/+$/, '')
  }
  return ''
}

function writeHeaders(withJsonBody: boolean): HeadersInit {
  const h: Record<string, string> = {}
  if (withJsonBody) h['Content-Type'] = 'application/json'
  const secret = import.meta.env.VITE_SITE_FORMS_WRITE_SECRET
  if (typeof secret === 'string' && secret.trim()) {
    h['X-Deloresh-Write-Secret'] = secret.trim()
  }
  return h
}

function siteUrl(siteId: string, tail: string): string {
  const b = apiBase()
  return `${b}/api/sites/${encodeURIComponent(siteId)}${tail}`
}

/** Оба GET успешны — считаем, что API доступен для объекта. */
export async function fetchSiteFormsFromServer(siteId: string): Promise<{
  procurement: ProcurementRequest[]
  brigadier: BrigadierStoredReport[]
} | null> {
  try {
    const [procRes, brigRes] = await Promise.all([
      fetch(siteUrl(siteId, '/procurement-requests')),
      fetch(siteUrl(siteId, '/brigadier-reports')),
    ])
    if (!procRes.ok || !brigRes.ok) return null
    const procJson: unknown = await procRes.json()
    const brigJson: unknown = await brigRes.json()
    return {
      procurement: parseProcurementRequestsJson(procJson),
      brigadier: parseBrigadierReportsJson(brigJson),
    }
  } catch {
    return null
  }
}

export async function createProcurementRequestRemote(
  siteId: string,
  req: ProcurementRequest,
): Promise<boolean> {
  try {
    const res = await fetch(siteUrl(siteId, '/procurement-requests'), {
      method: 'POST',
      headers: writeHeaders(true),
      body: JSON.stringify(req),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function patchProcurementRequestRemote(
  siteId: string,
  id: string,
  patch: Partial<ProcurementRequest>,
): Promise<boolean> {
  try {
    const res = await fetch(siteUrl(siteId, `/procurement-requests/${encodeURIComponent(id)}`), {
      method: 'PATCH',
      headers: writeHeaders(true),
      body: JSON.stringify(patch),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function deleteProcurementRequestRemote(siteId: string, id: string): Promise<boolean> {
  try {
    const res = await fetch(siteUrl(siteId, `/procurement-requests/${encodeURIComponent(id)}`), {
      method: 'DELETE',
      headers: writeHeaders(false),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function createBrigadierReportRemote(
  siteId: string,
  report: BrigadierStoredReport,
): Promise<boolean> {
  try {
    const res = await fetch(siteUrl(siteId, '/brigadier-reports'), {
      method: 'POST',
      headers: writeHeaders(true),
      body: JSON.stringify(report),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function deleteBrigadierReportRemote(siteId: string, id: string): Promise<boolean> {
  try {
    const res = await fetch(siteUrl(siteId, `/brigadier-reports/${encodeURIComponent(id)}`), {
      method: 'DELETE',
      headers: writeHeaders(false),
    })
    return res.ok
  } catch {
    return false
  }
}
