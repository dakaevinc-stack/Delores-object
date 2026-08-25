import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { BrigadierStoredReport } from '../domain/brigadierReport'
import type { ProcurementRequest } from '../domain/procurementRequest'
import type { SiteDeliveryPoint } from '../domain/siteDeliveryPoint'
import type { DriverTrip } from '../domain/driverTrip'
import { applyAcceptedQuantitiesToPlan, applyWorkEntriesToPlan } from '../domain/workPlan'
import { issuedQtyByPlanItemMap } from '../domain/workDayPlan'
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
import {
  loadSiteDeliveryPoint,
  saveSiteDeliveryPoint,
} from '../lib/siteDeliveryPointsRepository'
import { upsertDriverTrip } from '../lib/driverTripsRepository'
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
  putSiteDeliveryPointRemote,
  deleteSiteDeliveryPointRemote,
  putDriverTripRemote,
  uploadBrigadierAttachmentRemote,
} from '../lib/siteFormsApi'
import { useAllSites } from '../lib/useAllSites'
import { BrigadierReportModal } from '../features/site-detail/BrigadierReportModal'
import { ProcurementRequestModal } from '../features/site-detail/ProcurementRequestModal'
import { SiteBrigadierSubmittedReportsSection } from '../features/site-detail/SiteBrigadierSubmittedSection'
import { SiteProcurementRequestsSection } from '../features/site-detail/SiteProcurementRequestsSection'
import { SiteDetailHeader } from '../features/site-detail/SiteDetailHeader'
import { SiteDetailKpiGrid } from '../features/site-detail/SiteDetailKpiGrid'
import { SiteProjectHeaderCard } from '../features/site-detail/SiteProjectHeaderCard'
import { SiteReportingSection } from '../features/site-detail/SiteReportingSection'
import { SiteScheduleSection } from '../features/site-detail/SiteScheduleSection'
import { SiteWorkPlanSection } from '../features/site-detail/SiteWorkPlanSection'
import { SiteWorkDayPlanSection } from '../features/site-detail/SiteWorkDayPlanSection'
import { SiteMaterialConsumptionSection } from '../features/site-detail/SiteMaterialConsumptionSection'
import { ReportDeadlineBanner } from '../features/site-detail/ReportDeadlineBanner'
import { SiteDeliveryPointSection } from '../features/site-detail/SiteDeliveryPointSection'
import { SiteRoleZone } from '../features/site-detail/SiteRoleZone'
import { TodayDeliveriesBoard } from '../features/deliveries/TodayDeliveriesBoard'
import { getMaterialBudgetForSite } from '../data/materialBudgets'
import { loadWorkDayPlan } from '../lib/workDayPlanRepository'
import {
  zonesForDuty,
  type SitePageZoneId,
} from '../domain/sitePageZone'
import { useLocalSession } from '../lib/useLocalSession'
import styles from './ObjectDetailPage.module.css'

export function ObjectDetailPage() {
  const { siteId } = useParams()
  const session = useLocalSession()
  const sites = useAllSites()
  const site = sites.find((s) => s.id === siteId)

  const [composerOpen, setComposerOpen] = useState(false)
  const [composerKey, setComposerKey] = useState(0)
  const [procurementOpen, setProcurementOpen] = useState(false)
  const [procurementKey, setProcurementKey] = useState(0)
  const [editingRequest, setEditingRequest] = useState<ProcurementRequest | null>(null)
  const [brigadierReports, setBrigadierReports] = useState<BrigadierStoredReport[]>([])
  const [procurementRequests, setProcurementRequests] = useState<ProcurementRequest[]>([])
  const [procurementFilterAuthor, setProcurementFilterAuthor] = useState<string | null>(null)
  const brigadierReportsRef = useRef<BrigadierStoredReport[]>([])
  const procurementRequestsRef = useRef<ProcurementRequest[]>([])
  const [remoteFormsActive, setRemoteFormsActive] = useState(false)
  const [remoteObjectMediaActive, setRemoteObjectMediaActive] = useState(false)
  const remoteFormsRef = useRef(false)
  const [formsApiMessage, setFormsApiMessage] = useState<string | null>(null)
  const [objectMediaManifest, setObjectMediaManifest] = useState<StoredSiteMedia[]>([])
  const [deliveryPoint, setDeliveryPoint] = useState<SiteDeliveryPoint | null>(null)
  const [deliveryPointRemoteActive, setDeliveryPointRemoteActive] = useState(false)
  const deliveryPointRemoteRef = useRef(false)

  useEffect(() => {
    remoteFormsRef.current = remoteFormsActive
  }, [remoteFormsActive])

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [siteId])

  useEffect(() => {
    deliveryPointRemoteRef.current = deliveryPointRemoteActive
  }, [deliveryPointRemoteActive])

  useEffect(() => {
    brigadierReportsRef.current = brigadierReports
  }, [brigadierReports])

  useEffect(() => {
    procurementRequestsRef.current = procurementRequests
  }, [procurementRequests])

  const deliveryPointMigratedRef = useRef(false)

  const applyDeliveryPointFromServer = useCallback(
    async (
      remoteAvailable: boolean,
      remotePoint: SiteDeliveryPoint | null,
      opts?: { allowMigrateLocal?: boolean },
    ) => {
      if (!site) return
      setDeliveryPointRemoteActive(remoteAvailable)
      if (!remoteAvailable) return

      // Сервер — источник правды: null на сервере = точка снята везде.
      if (remotePoint) {
        setDeliveryPoint(remotePoint)
        saveSiteDeliveryPoint(site.id, remotePoint)
        return
      }

      // Однократный перенос старой локальной точки, если на сервере ещё пусто.
      if (opts?.allowMigrateLocal && !deliveryPointMigratedRef.current) {
        deliveryPointMigratedRef.current = true
        const local = loadSiteDeliveryPoint(site.id)
        if (local) {
          const ok = await putSiteDeliveryPointRemote(site.id, local)
          if (ok) {
            setDeliveryPoint(local)
            setDeliveryPointRemoteActive(true)
            return
          }
        }
      }

      setDeliveryPoint(null)
      saveSiteDeliveryPoint(site.id, null)
    },
    [site],
  )

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
      await applyDeliveryPointFromServer(
        bundle.deliveryPointRemoteAvailable,
        bundle.deliveryPoint,
        { allowMigrateLocal: false },
      )
    }
  }, [site, applyDeliveryPointFromServer])

  const handleUpdateProcurementRequest = useCallback(
    async (id: string, patch: Partial<ProcurementRequest>): Promise<boolean> => {
      if (!site) return false
      const previous = procurementRequestsRef.current
      const next = previous.map((r) => (r.id === id ? { ...r, ...patch } : r))
      setProcurementRequests(next)
      saveProcurementRequests(site.id, next)
      if (!remoteFormsRef.current) return true
      const ok = await patchProcurementRequestRemote(site.id, id, patch)
      if (!ok) {
        setFormsApiMessage('Не удалось сохранить изменения заявки на сервере.')
        setProcurementRequests(previous)
        void resyncFormsFromServer()
        return false
      }
      return true
    },
    [site, resyncFormsFromServer],
  )

  const handleSaveDeliveryPoint = useCallback(
    async (next: SiteDeliveryPoint | null) => {
      if (!site) return
      const previous = deliveryPoint
      setDeliveryPoint(next)
      saveSiteDeliveryPoint(site.id, next)
      const ok = next
        ? await putSiteDeliveryPointRemote(site.id, next)
        : await deleteSiteDeliveryPointRemote(site.id)
      if (ok) {
        setDeliveryPointRemoteActive(true)
        return
      }
      setFormsApiMessage(
        'Точка сохранена на этом устройстве, на сервер не ушла — на другом ноуте её не будет.',
      )
      if (deliveryPointRemoteRef.current) {
        setDeliveryPoint(previous)
        saveSiteDeliveryPoint(site.id, previous)
      }
    },
    [site, deliveryPoint],
  )

  const handleAssignTrip = useCallback(
    async (trip: DriverTrip) => {
      upsertDriverTrip(trip)
      const result = await putDriverTripRemote(trip)
      if (!result.ok && remoteFormsRef.current) {
        setFormsApiMessage('Рейс записан на этом устройстве, на сервер не ушёл.')
      }
      return result
    },
    [],
  )

  useEffect(() => {
    if (!site) return
    let cancelled = false
    deliveryPointMigratedRef.current = false
    setFormsApiMessage(null)
    setRemoteFormsActive(false)
    setRemoteObjectMediaActive(false)
    setObjectMediaManifest([])
    setDeliveryPointRemoteActive(false)
    setDeliveryPoint(loadSiteDeliveryPoint(site.id))
    setProcurementRequests(loadProcurementRequests(site.id))
    setBrigadierReports(loadBrigadierReports(site.id))

    void (async () => {
      const bundle = await fetchSiteFormsFromServer(site.id)
      if (cancelled) return
      if (!bundle) {
        setRemoteFormsActive(false)
        setRemoteObjectMediaActive(false)
        setObjectMediaManifest([])
        setDeliveryPointRemoteActive(false)
        return
      }
      setRemoteFormsActive(true)
      setRemoteObjectMediaActive(bundle.objectMediaRemoteAvailable)
      setObjectMediaManifest(bundle.objectMediaManifest)
      setProcurementRequests(bundle.procurement)
      setBrigadierReports(bundle.brigadier)
      saveProcurementRequests(site.id, bundle.procurement)
      saveBrigadierReports(site.id, bundle.brigadier)
      await applyDeliveryPointFromServer(
        bundle.deliveryPointRemoteAvailable,
        bundle.deliveryPoint,
        { allowMigrateLocal: true },
      )
    })()

    return () => {
      cancelled = true
    }
  }, [site, applyDeliveryPointFromServer])

  useEffect(() => {
    if (!site) return
    saveProcurementRequests(site.id, procurementRequests)
  }, [procurementRequests, site])

  useEffect(() => {
    if (!site) return
    const t = window.setInterval(() => {
      if (procurementOpen || composerOpen) return
      void resyncFormsFromServer()
    }, 12_000)
    return () => window.clearInterval(t)
  }, [site, procurementOpen, composerOpen, resyncFormsFromServer])

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
  // Пересчёт, когда дневные задания занимают объём в справке.
  const [dayPlanRevision, setDayPlanRevision] = useState(0)
  const workPlan = useMemo(() => {
    if (!basePlan || !site) return null
    const withReports = applyWorkEntriesToPlan(basePlan, brigadierReports)
    const dayQty = issuedQtyByPlanItemMap(loadWorkDayPlan(site.id).assignments)
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
  const materialBudget = getMaterialBudgetForSite(site.id)

  // Реальный KPI считаем по `workPlan` + срокам объекта, чтобы сетка
  // не показывала «синтетические» mock-проценты, а двигалась вместе
  // с фактом из бригадирских отчётов и календарным графиком.
  const liveKpis = (() => {
    const startIso = site.startDateIso ?? dashboard.kpis.startDateIso
    const endIso = site.endDateIso ?? dashboard.kpis.endDateIso
    return computeSiteLiveKpis(workPlan, startIso, endIso, todayIsoMsk())
  })()

  // Зоны по должности из сессии; без сессии RequireAuth уже уводит на /.
  const visibleZones = zonesForDuty(session?.duty ?? 'manager')
  const showObjectSummary = visibleZones.includes('manager')

  const openProcurementComposer = () => {
    setEditingRequest(null)
    setProcurementKey((k) => k + 1)
    setProcurementOpen(true)
  }

  const openBrigadierComposer = () => {
    setComposerKey((k) => k + 1)
    setComposerOpen(true)
  }

  const objectSummary = (
    <section
      className={styles.summaryPanel}
      aria-labelledby="object-summary-heading"
      data-site-zone="summary"
    >
      <div className={styles.summaryRail} aria-hidden />
      <div className={styles.summaryGlow} aria-hidden />

      <header className={styles.summaryPanelHead}>
        <div className={styles.summaryHeadCopy}>
          <p className={styles.summaryKicker}>
            <img className={styles.summaryKickerMark} src="/brand-chevron.svg" alt="" aria-hidden />
            Сводка
          </p>
          <h2 className={styles.summaryTitle} id="object-summary-heading">
            Сводка по объекту
          </h2>
          <p className={styles.summaryLead}>
            Прогресс, сроки и отклонение от плана — по графику работ и отчётам бригадира.
          </p>
        </div>
      </header>

      <div className={styles.summaryPanelBody}>
        {workPlan ? (
          <SiteWorkPlanSection
            plan={workPlan}
            windowStartIso={liveKpis.startIso}
            windowEndIso={liveKpis.endIso}
          />
        ) : null}
        <SiteDetailKpiGrid kpis={liveKpis} embedded />
        <div className={styles.midGrid}>
          <SiteScheduleSection
            kpis={liveKpis}
            basePlan={basePlan}
            reports={brigadierReports}
          />
          <SiteReportingSection reports={brigadierReports} todayIso={liveKpis.todayIso} />
        </div>
      </div>
    </section>
  )

  const renderZone = (zone: SitePageZoneId) => {
    switch (zone) {
      case 'manager':
        // Только шапка проекта + PDF/DWG. Сводка идёт после зоны бригадира.
        return (
          <SiteRoleZone
            key={zone}
            zone="manager"
            actions={<SiteProjectHeaderCard siteId={site.id} canUpload />}
          />
        )

      case 'brigadier':
        return (
          <SiteRoleZone
            key={zone}
            zone="brigadier"
            layout="panel"
            actions={
              <>
                <button
                  type="button"
                  className={styles.toolbarCta}
                  onClick={openProcurementComposer}
                >
                  Заявка снабженцу
                </button>
                <button
                  type="button"
                  className={styles.toolbarCta}
                  onClick={openBrigadierComposer}
                >
                  Ввод отчёта
                </button>
              </>
            }
          >
            {workPlan ? (
              <SiteWorkDayPlanSection
                siteId={site.id}
                siteName={site.name}
                workPlan={workPlan}
                role="brigadier"
                embedded
                showIntro={false}
                onAssignmentsChange={() => setDayPlanRevision((n) => n + 1)}
              />
            ) : null}
            <TodayDeliveriesBoard
              requests={procurementRequests}
              variant="site"
              deliveryPoints={deliveryPoint ? new Map([[site.id, deliveryPoint]]) : undefined}
              onUpdateRequest={(id, patch) => {
                void handleUpdateProcurementRequest(id, patch)
              }}
            />
            <SiteBrigadierSubmittedReportsSection
              siteId={site.id}
              siteName={site.name}
              reports={brigadierReports}
              serverBacked={remoteFormsActive}
              objectMediaManifest={objectMediaManifest}
              objectMediaServerBacked={remoteObjectMediaActive}
              onObjectMediaSyncError={(msg) => setFormsApiMessage(msg)}
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
          </SiteRoleZone>
        )

      case 'supply':
        return (
          <SiteRoleZone key={zone} zone="supply" layout="panel">
            <SiteProcurementRequestsSection
              requests={procurementRequests}
              selectedAuthor={procurementFilterAuthor}
              onSelectAuthor={setProcurementFilterAuthor}
              deliveryPoint={deliveryPoint}
              showCreateButton={false}
              onCreate={openProcurementComposer}
              onEdit={(req) => {
                setEditingRequest(req)
                setProcurementKey((k) => k + 1)
                setProcurementOpen(true)
              }}
              onRemove={async (id) => {
                if (remoteFormsRef.current) {
                  const ok = await deleteProcurementRequestRemote(site.id, id)
                  if (!ok) {
                    setFormsApiMessage(
                      'Не удалось удалить заявку на сервере. Проверьте сеть или права.',
                    )
                    void resyncFormsFromServer()
                    return
                  }
                }
                setProcurementRequests((prev) => prev.filter((r) => r.id !== id))
              }}
              onUpdateRequest={(id, patch) => {
                void handleUpdateProcurementRequest(id, patch)
              }}
            />
            {materialBudget ? (
              <SiteMaterialConsumptionSection
                budget={materialBudget}
                requests={procurementRequests}
              />
            ) : null}
          </SiteRoleZone>
        )

      case 'dispatcher':
        return (
          <SiteRoleZone key={zone} zone="dispatcher" layout="panel">
            <SiteDeliveryPointSection
              key={`${site.id}-trip`}
              siteId={site.id}
              siteName={site.name}
              address={site.address}
              point={deliveryPoint}
              serverBacked={deliveryPointRemoteActive}
              onSave={handleSaveDeliveryPoint}
              onAssignTrip={handleAssignTrip}
              assignerRole="dispatcher"
            />
          </SiteRoleZone>
        )
    }
  }

  return (
    <div className={styles.page}>
      <SiteDetailHeader site={site} dashboard={dashboard} />

      <ReportDeadlineBanner
        reports={brigadierReports}
        todayIso={liveKpis.todayIso}
        onOpenComposer={openBrigadierComposer}
      />

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

      {visibleZones.flatMap((zone) => {
        const nodes = [renderZone(zone)]
        // Сводка — после бригадира (под «Документы проекта» → «Смена»).
        // Если зоны бригадира нет — сразу после проекта.
        if (showObjectSummary) {
          if (zone === 'brigadier') {
            nodes.push(<div key="object-summary">{objectSummary}</div>)
          } else if (zone === 'manager' && !visibleZones.includes('brigadier')) {
            nodes.push(<div key="object-summary">{objectSummary}</div>)
          }
        }
        return nodes
      })}

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
          onClose={() => {
            setProcurementOpen(false)
            setEditingRequest(null)
          }}
          siteId={site.id}
          siteName={site.name}
          initial={editingRequest}
          onSubmit={async (req) => {
            const exists = procurementRequestsRef.current.some((r) => r.id === req.id)
            if (exists) {
              const ok = await handleUpdateProcurementRequest(req.id, {
                items: [...req.items],
                note: req.note,
                urgent: req.urgent,
                neededByIso: req.neededByIso,
                createdBy: req.createdBy,
                unloadPoint: req.unloadPoint,
              })
              if (!ok) {
                throw new RemoteWriteFailure('Не удалось сохранить изменения заявки на сервере.')
              }
              return
            }
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
