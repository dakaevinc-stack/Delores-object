import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { BrigadierStoredReport } from '../domain/brigadierReport'
import type { ProcurementRequest } from '../domain/procurementRequest'
import { getTelegramDailyReportsForSite } from '../data/dailyTelegramReports.mock'
import { getSiteDetailDashboard } from '../data/siteDetail.mock'
import { useAllSites } from '../lib/useAllSites'
import {
  loadBrigadierReports,
  materializeBrigadierReportForLocalStorage,
  saveBrigadierReports,
} from '../lib/brigadierReportsRepository'
import {
  loadProcurementRequests,
  saveProcurementRequests,
} from '../lib/procurementRequestsRepository'
import { BrigadierReportModal } from '../features/site-detail/BrigadierReportModal'
import { ProcurementRequestModal } from '../features/site-detail/ProcurementRequestModal'
import { SiteBrigadierSubmittedReportsSection } from '../features/site-detail/SiteBrigadierSubmittedSection'
import { SiteDailyTelegramReportsSection } from '../features/site-detail/SiteDailyTelegramReportsSection'
import { SiteObjectMediaDropSection } from '../features/site-detail/SiteObjectMediaDropSection'
import { SiteProcurementRequestsSection } from '../features/site-detail/SiteProcurementRequestsSection'
import { SiteDetailHeader } from '../features/site-detail/SiteDetailHeader'
import { SiteDetailKpiGrid } from '../features/site-detail/SiteDetailKpiGrid'
import { SiteReportingSection } from '../features/site-detail/SiteReportingSection'
import { SiteRisksSection } from '../features/site-detail/SiteRisksSection'
import { SiteScheduleSection } from '../features/site-detail/SiteScheduleSection'
import { SiteWorkCriteriaSection } from '../features/site-detail/SiteWorkCriteriaSection'
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

  useEffect(() => {
    brigadierReportsRef.current = brigadierReports
  }, [brigadierReports])

  useEffect(() => {
    if (!site) return
    setProcurementRequests(loadProcurementRequests(site.id))
    setBrigadierReports(loadBrigadierReports(site.id))
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
          URL.revokeObjectURL(a.previewUrl)
        }
      }
    }
  }, [])

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
  const telegramReports = getTelegramDailyReportsForSite(site.id)

  return (
    <div className={styles.page}>
      <SiteDetailHeader site={site} dashboard={dashboard} />

      <div className={styles.toolbar}>
        <button
          type="button"
          className={styles.toolbarCta}
          onClick={() =>
            document.getElementById('site-object-media')?.scrollIntoView({
              behavior: 'smooth',
              block: 'start',
            })
          }
        >
          Фото и видео без отчёта
        </button>
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

      <SiteObjectMediaDropSection key={site.id} siteId={site.id} />

      <SiteDetailKpiGrid kpis={dashboard.kpis} />
      <SiteWorkCriteriaSection criteria={dashboard.criteria} />

      <div className={styles.midGrid}>
        <SiteScheduleSection schedule={dashboard.schedule} />
        <SiteReportingSection reporting={dashboard.reporting} />
      </div>

      <SiteProcurementRequestsSection
        requests={procurementRequests}
        onCreate={() => {
          setProcurementKey((k) => k + 1)
          setProcurementOpen(true)
        }}
        onRemove={(id) =>
          setProcurementRequests((prev) => prev.filter((r) => r.id !== id))
        }
        onUpdateRequest={(id, patch) =>
          setProcurementRequests((prev) =>
            prev.map((r) => (r.id === id ? { ...r, ...patch } : r)),
          )
        }
      />

      <SiteBrigadierSubmittedReportsSection
        siteName={site.name}
        reports={brigadierReports}
        onRemoveReport={(id) =>
          setBrigadierReports((prev) => prev.filter((r) => r.id !== id))
        }
      />
      <SiteDailyTelegramReportsSection siteName={site.name} reports={telegramReports} />

      <SiteRisksSection risks={dashboard.risks} />

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
          onSubmit={async (report) => {
            const persisted = await materializeBrigadierReportForLocalStorage(report)
            setBrigadierReports((prev) => [persisted, ...prev])
          }}
        />
      ) : null}

      {procurementOpen ? (
        <ProcurementRequestModal
          key={procurementKey}
          onClose={() => setProcurementOpen(false)}
          siteId={site.id}
          siteName={site.name}
          onSubmit={(req) => setProcurementRequests((prev) => [req, ...prev])}
        />
      ) : null}
    </div>
  )
}
