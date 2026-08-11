import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { BrigadierStoredReport } from '../domain/brigadierReport'
import type { ProcurementRequest } from '../domain/procurementRequest'
import { applyAcceptedQuantitiesToPlan, applyWorkEntriesToPlan } from '../domain/workPlan'
import { acceptedQtyByPlanItemMap } from '../domain/workDayPlan'
import { computeSiteLiveKpis, todayIsoMsk } from '../domain/siteKpis'
import { getSiteDetailDashboard } from '../data/siteDetail.mock'
import { getWorkPlanForSite } from '../data/workPlans'
import {
  loadBrigadierReports,
  materializeBrigadierReportForLocalStorage,
  saveBrigadierReports,
} from '../lib/brigadierReportsRepository'
import {
  loadProcurementRequests,
  saveProcurementRequests,
} from '../lib/procurementRequestsRepository'
import type { StoredSiteMedia } from '../lib/mediaRepository'
import {
  RemoteWriteFailure,
  createBrigadierReportRemote,
  createProcurementRequestRemote,
  deleteBrigadierReportRemote,
  deleteProcurementRequestRemote,
  describeRemoteWriteError,
  fetchSiteFormsFromServer,
  patchProcurementRequestRemote,
  uploadBrigadierAttachmentRemote,
} from '../lib/siteFormsApi'
import { useAllSites } from '../lib/useAllSites'
import { BrigadierReportModal } from '../features/site-detail/BrigadierReportModal'
import { ProcurementRequestModal } from '../features/site-detail/ProcurementRequestModal'
import { SiteBrigadierSubmittedReportsSection } from '../features/site-detail/SiteBrigadierSubmittedSection'
import { SiteObjectMediaDropSection } from '../features/site-detail/SiteObjectMediaDropSection'
import { SiteProcurementRequestsSection } from '../features/site-detail/SiteProcurementRequestsSection'
import { SiteDetailHeader } from '../features/site-detail/SiteDetailHeader'
import { SiteDetailKpiGrid } from '../features/site-detail/SiteDetailKpiGrid'
import { SiteReportingSection } from '../features/site-detail/SiteReportingSection'
import { SiteScheduleSection } from '../features/site-detail/SiteScheduleSection'
import { SiteWorkPlanSection } from '../features/site-detail/SiteWorkPlanSection'
import { loadWorkDayPlan } from '../lib/workDayPlanRepository'
import styles from './ObjectDetailPage.module.css'

export function ObjectDetailPage() {
  const { siteId } = useParams()
  const sites = useAllSites()
  const site = sites.find((s) => s.id === siteId)

  const [composerOpen, setComposerOpen] = useState(false)
  const [composerKey, setComposerKey] = useState(0)
  const [procurementOpen, setProcurementOpen] = useState(false)
  const [procurementKey, setProcurementKey] = useState(0)
  const [brigadierReports, setBrigadierReports] = useState<BrigadierStoredReport[]>([])
  const [procurementRequests, setProcurementRequests] = useState<ProcurementRequest[]>([])
  const brigadierReportsRef = useRef<BrigadierStoredReport[]>([])
  const procurementRequestsRef = useRef<ProcurementRequest[]>([])
  const [remoteFormsActive, setRemoteFormsActive] = useState(false)
  const [remoteObjectMediaActive, setRemoteObjectMediaActive] = useState(false)
  const remoteFormsRef = useRef(false)
  const [formsApiMessage, setFormsApiMessage] = useState<string | null>(null)
  const [objectMediaManifest, setObjectMediaManifest] = useState<StoredSiteMedia[]>([])

  useEffect(() => {
    remoteFormsRef.current = remoteFormsActive
  }, [remoteFormsActive])

  useEffect(() => {
    brigadierReportsRef.current = brigadierReports
  }, [brigadierReports])

  useEffect(() => {
    procurementRequestsRef.current = procurementRequests
  }, [procurementRequests])

  const resyncFormsFromServer = useCallback(async () => {
    if (!site || !remoteFormsRef.current) return
    const bundle = await fetchSiteFormsFromServer(site.id)
    if (bundle) {
      setProcurementRequests(bundle.procurement)
      setBrigadierReports(bundle.brigadier)
      setRemoteObjectMediaActive(bundle.objectMediaRemoteAvailable)
      setObjectMediaManifest(bundle.objectMediaManifest)
      saveProcurementRequests(site.id, bundle.procurement)
      saveBrigadierReports(site.id, bundle.brigadier)
    }
  }, [site])

  useEffect(() => {
    if (!site) return
    let cancelled = false
    setFormsApiMessage(null)
    setRemoteFormsActive(false)
    setRemoteObjectMediaActive(false)
    setObjectMediaManifest([])
    setProcurementRequests(loadProcurementRequests(site.id))
    setBrigadierReports(loadBrigadierReports(site.id))

    void (async () => {
      const bundle = await fetchSiteFormsFromServer(site.id)
      if (cancelled) return
      if (!bundle) {
        setRemoteFormsActive(false)
        setRemoteObjectMediaActive(false)
        setObjectMediaManifest([])
        return
      }
      setRemoteFormsActive(true)
      setRemoteObjectMediaActive(bundle.objectMediaRemoteAvailable)
      setObjectMediaManifest(bundle.objectMediaManifest)
      setProcurementRequests(bundle.procurement)
      setBrigadierReports(bundle.brigadier)
      saveProcurementRequests(site.id, bundle.procurement)
      saveBrigadierReports(site.id, bundle.brigadier)
    })()

    return () => {
      cancelled = true
    }
  }, [site])

  useEffect(() => {
    if (!site) return
    saveProcurementRequests(site.id, procurementRequests)
  }, [procurementRequests, site])

  useEffect(() => {
    if (!site) return
    saveBrigadierReports(site.id, brigadierReports)
  }, [brigadierReports, site])

  useEffect(() => {
    return () => {
      for (const r of brigadierReportsRef.current) {
        for (const a of r.attachments) {
          if (a.previewUrl.startsWith('blob:')) URL.revokeObjectURL(a.previewUrl)
        }
      }
    }
  }, [])

  const basePlan = site ? getWorkPlanForSite(site.id) : null
  // Пересчёт при приёмке дневных этапов (localStorage → факт в плане).
  const [dayPlanRevision, setDayPlanRevision] = useState(0)
  const workPlan = useMemo(() => {
    if (!basePlan || !site) return null
    const withReports = applyWorkEntriesToPlan(basePlan, brigadierReports)
    const dayQty = acceptedQtyByPlanItemMap(loadWorkDayPlan(site.id).assignments)
    return applyAcceptedQuantitiesToPlan(withReports, dayQty)
  }, [basePlan, brigadierReports, site, dayPlanRevision])

  if (!site) {
    return (
      <div className={styles.page}>
        <div className={styles.notFound}>
          <h1 className={styles.notFoundTitle}>Объект не найден</h1>
          <p className={styles.notFoundText}>
            Проверьте ссылку или вернитесь на главный экран.
          </p>
          <Link className={styles.backBtn} to="/">
            На главный экран
          </Link>
        </div>
      </div>
    )
  }

  const dashboard = getSiteDetailDashboard(site)

  // Реальный KPI считаем по `workPlan` + срокам объекта, чтобы сетка
  // не показывала «синтетические» mock-проценты, а двигалась вместе
  // с фактом из бригадирских отчётов и календарным графиком.
  const liveKpis = (() => {
    const startIso = site.startDateIso ?? dashboard.kpis.startDateIso
    const endIso = site.endDateIso ?? dashboard.kpis.endDateIso
    return computeSiteLiveKpis(workPlan, startIso, endIso, todayIsoMsk())
  })()

  return (
    <div className={styles.page}>
      <SiteDetailHeader site={site} dashboard={dashboard} />

      {formsApiMessage ? (
        <div className={styles.syncBanner} role="alert">
          <p className={styles.syncBannerText}>{formsApiMessage}</p>
          <button
            type="button"
            className={styles.syncBannerClose}
            onClick={() => setFormsApiMessage(null)}
          >
            Закрыть
          </button>
        </div>
      ) : null}

      <div className={styles.toolbar}>
        <button
          type="button"
          className={styles.toolbarCta}
          onClick={() => {
            setProcurementKey((k) => k + 1)
            setProcurementOpen(true)
          }}
        >
          Заявка снабженцу
        </button>
        <button
          type="button"
          className={styles.toolbarCta}
          onClick={() => {
            setComposerKey((k) => k + 1)
            setComposerOpen(true)
          }}
        >
          Ввод отчёта
        </button>
      </div>

      <SiteBrigadierSubmittedReportsSection
        siteId={site.id}
        siteName={site.name}
        reports={brigadierReports}
        serverBacked={remoteFormsActive}
        onRemoveReport={async (id) => {
          if (remoteFormsRef.current) {
            const ok = await deleteBrigadierReportRemote(site.id, id)
            if (!ok) {
              setFormsApiMessage('Не удалось удалить отчёт на сервере.')
              void resyncFormsFromServer()
              return
            }
          }
          setBrigadierReports((prev) => {
            const row = prev.find((r) => r.id === id)
            if (row) {
              for (const a of row.attachments) {
                if (a.previewUrl.startsWith('blob:')) URL.revokeObjectURL(a.previewUrl)
              }
            }
            return prev.filter((r) => r.id !== id)
          })
        }}
      />

      <SiteObjectMediaDropSection
        key={site.id}
        siteId={site.id}
        serverBacked={remoteObjectMediaActive}
        serverManifest={objectMediaManifest}
        onRemoteSyncError={(msg) => setFormsApiMessage(msg)}
      />

      <SiteDetailKpiGrid kpis={liveKpis} />

      {workPlan ? (
        <SiteWorkPlanSection
          plan={workPlan}
          siteId={site.id}
          siteName={site.name}
          windowStartIso={liveKpis.startIso}
          windowEndIso={liveKpis.endIso}
          onDayPlanChange={() => setDayPlanRevision((n) => n + 1)}
        />
      ) : null}

      <div className={styles.midGrid}>
        <SiteScheduleSection
          kpis={liveKpis}
          basePlan={basePlan}
          reports={brigadierReports}
        />
        <SiteReportingSection reports={brigadierReports} todayIso={liveKpis.todayIso} />
      </div>

      <SiteProcurementRequestsSection
        requests={procurementRequests}
        serverBacked={remoteFormsActive}
        onCreate={() => {
          setProcurementKey((k) => k + 1)
          setProcurementOpen(true)
        }}
        onRemove={async (id) => {
          if (remoteFormsRef.current) {
            const ok = await deleteProcurementRequestRemote(site.id, id)
            if (!ok) {
              setFormsApiMessage('Не удалось удалить заявку на сервере. Проверьте сеть или права.')
              void resyncFormsFromServer()
              return
            }
          }
          setProcurementRequests((prev) => prev.filter((r) => r.id !== id))
        }}
        onUpdateRequest={async (id, patch) => {
          const previous = procurementRequestsRef.current
          const next = previous.map((r) => (r.id === id ? { ...r, ...patch } : r))
          setProcurementRequests(next)
          if (!remoteFormsRef.current) return
          const ok = await patchProcurementRequestRemote(site.id, id, patch)
          if (!ok) {
            setFormsApiMessage('Не удалось сохранить изменения заявки на сервере.')
            setProcurementRequests(previous)
            void resyncFormsFromServer()
          }
        }}
      />

      <footer className={styles.footer}>
        <p className={styles.footerNote}>
          Показаны демонстрационные показатели. После подключения учётных систем те же блоки
          заполнятся фактическими данными объекта без изменения структуры экрана.
        </p>
      </footer>

      {composerOpen ? (
        <BrigadierReportModal
          key={composerKey}
          onClose={() => setComposerOpen(false)}
          siteId={site.id}
          siteName={site.name}
          plan={workPlan}
          onSubmit={async (report) => {
            // 1) Сначала — пока живы оригинальные blob:URL — заливаем
            //    каждый файл на сервер отдельным запросом. Так JSON
            //    отчёта остаётся лёгким и других устройств не «душит»
            //    мегабайтами base64.
            const uploadResults = new Map<string, boolean>()
            if (remoteFormsRef.current) {
              for (const a of report.attachments) {
                try {
                  const resp = await fetch(a.previewUrl)
                  const blob = await resp.blob()
                  const ok = await uploadBrigadierAttachmentRemote(
                    site.id,
                    report.id,
                    a.id,
                    blob,
                  )
                  uploadResults.set(a.id, ok)
                } catch {
                  uploadResults.set(a.id, false)
                }
              }
            }

            // 2) Локально материализуем (для немедленного показа на
            //    этом устройстве и работы оффлайн). Сжимает фото в
            //    data: URL; для крупного видео ставит previewUrl=''
            //    и notPersisted=true. Это ВСЁ ещё актуально как
            //    fallback для оффлайн-устройств.
            const persisted = await materializeBrigadierReportForLocalStorage(report)

            // 3) Если blob успешно ушёл на сервер — снимаем флаг
            //    notPersisted: на других устройствах файл подтянется
            //    через серверный URL.
            const adjustedAttachments = persisted.attachments.map((a) => {
              const uploaded = uploadResults.get(a.id) === true
              if (uploaded) {
                return { ...a, notPersisted: false }
              }
              if (remoteFormsRef.current && uploadResults.get(a.id) === false && !a.previewUrl) {
                return { ...a, notPersisted: true }
              }
              return a
            })
            const persistedFinal = { ...persisted, attachments: adjustedAttachments }

            // 4) JSON отчёта на сервер: previewUrl пустой, blobs
            //    хранятся отдельно в /attachments/.../blob.
            if (remoteFormsRef.current) {
              const lightReport: BrigadierStoredReport = {
                ...persistedFinal,
                attachments: persistedFinal.attachments.map((a) => ({
                  ...a,
                  previewUrl: '',
                  notPersisted: uploadResults.get(a.id) === false,
                })),
              }
              const result = await createBrigadierReportRemote(site.id, lightReport)
              if (!result.ok) {
                throw new RemoteWriteFailure(
                  describeRemoteWriteError(result, 'отчёт'),
                )
              }
            }

            setBrigadierReports((prev) => [persistedFinal, ...prev])
          }}
        />
      ) : null}

      {procurementOpen ? (
        <ProcurementRequestModal
          key={procurementKey}
          onClose={() => setProcurementOpen(false)}
          siteId={site.id}
          siteName={site.name}
          onSubmit={async (req) => {
            if (remoteFormsRef.current) {
              const result = await createProcurementRequestRemote(site.id, req)
              if (!result.ok) {
                throw new RemoteWriteFailure(
                  describeRemoteWriteError(result, 'заявку'),
                )
              }
            }
            setProcurementRequests((prev) => [req, ...prev])
          }}
        />
      ) : null}
    </div>
  )
}
