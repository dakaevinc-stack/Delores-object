import { planFactGapPoints } from '../domain/executiveDashboard'
import { resolveSiteStatus } from '../domain/objectStatus'
import type {
  ScheduleCurvePoint,
  ScheduleTrend,
  SiteDetailCriterion,
  SiteDetailDashboard,
  SiteDetailKpis,
  SiteDetailMeta,
  SiteDetailReporting,
  SiteDetailSchedule,
  SiteRiskCategory,
  SiteRiskRow,
  WorkCriterionKind,
} from '../domain/siteDetailDashboard'
import type { ConstructionSite, SiteStatus } from '../types/constructionSite'

const CRITERION_DEF: readonly {
  id: WorkCriterionKind
  name: string
  basePlan: number
}[] = [
  { id: 'curb', name: 'Бортовой камень', basePlan: 300 },
  { id: 'pipes', name: 'Трубы', basePlan: 420 },
  { id: 'gravel', name: 'Щебень', basePlan: 1800 },
  { id: 'sand', name: 'Песок', basePlan: 960 },
  { id: 'asphalt', name: 'Асфальт', basePlan: 2400 },
] as const

function hashId(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i += 1) {
    h = (Math.imul(31, h) + id.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

function criterionStatus(
  plan: number,
  fact: number,
): { status: SiteStatus; lagReason?: string } {
  if (plan <= 0) return { status: 'normal' }
  const ratio = fact / plan
  const deviation = fact - plan
  if (ratio < 0.72 || deviation <= -Math.max(60, plan * 0.22)) {
    return {
      status: 'critical',
      lagReason: 'Сильное отставание от плана по объёму',
    }
  }
  if (ratio < 0.88 || deviation <= -Math.max(25, plan * 0.1)) {
    return {
      status: 'attention',
      lagReason: 'Отставание от дневного графика',
    }
  }
  return { status: 'normal' }
}

function buildCurve(site: ConstructionSite): ScheduleCurvePoint[] {
  const h = hashId(site.id)
  const fact0 = site.executive.factPercent
  const plan0 = site.executive.planPercent
  const labels = ['Старт', 'Нед. 2', 'Нед. 4', 'Нед. 6', 'Сейчас']
  return labels.map((label, i) => {
    const t = i / (labels.length - 1)
    const wobble = ((h >> (i * 3)) % 5) - 2
    const planAlong = Math.min(100, Math.round(plan0 * t + wobble * 0.4))
    const factAlong = Math.min(
      100,
      Math.round(fact0 * Math.pow(t, 0.92) + (i === labels.length - 1 ? 0 : wobble - 1)),
    )
    return { label, planAlongTime: planAlong, factAlongTime: factAlong }
  })
}

function deadlineLabel(status: SiteStatus, onTrack: boolean): string {
  if (status === 'critical') return 'Критично по срокам'
  if (status === 'attention') return onTrack ? 'На контроле' : 'Риск срыва графика'
  return onTrack ? 'В графике' : 'Лёгкое отставание'
}

function buildRisks(site: ConstructionSite, status: SiteStatus): SiteRiskRow[] {
  const h = hashId(site.id)
  // На свежем пользовательском объекте рисков ещё нет.
  const base = site.isUserCreated
    ? 0
    : status === 'critical'
      ? 5
      : status === 'attention'
        ? 3
        : site.executive.hasOpenRisks
          ? 2
          : h % 2

  const templates: { category: SiteRiskCategory; title: string }[] = [
    { category: 'critical_notice', title: 'Критические замечания технадзора' },
    { category: 'equipment', title: 'Нехватка асфальтоукладчика на смену' },
    { category: 'materials', title: 'Задержка поставки люков и решёток' },
    { category: 'idle', title: 'Простой бригады из‑за переноса поставки' },
    { category: 'weather', title: 'Погодное окно: осадки по прогнозу' },
    { category: 'breakdown_org', title: 'Согласование выезда спецтехники' },
  ]

  return templates.map((t, i) => {
    const active = i < base
    const severity: SiteStatus = !active
      ? 'normal'
      : t.category === 'critical_notice' && status === 'critical'
        ? 'critical'
        : 'attention'
    return {
      id: `${site.id}-risk-${i}`,
      category: t.category,
      title: t.title,
      active,
      severity,
    }
  })
}

function buildCriteria(site: ConstructionSite): SiteDetailCriterion[] {
  const status = resolveSiteStatus(site)
  const h = hashId(site.id)
  const gap = planFactGapPoints(site)

  // Пользовательский объект: критерии приходят из формы, факт = 0 на старте.
  if (site.criteriaDefinitions && site.criteriaDefinitions.length > 0) {
    return site.criteriaDefinitions.map((def) => {
      const plan = Math.max(0, Math.round(def.planUnits))
      return {
        id: def.id,
        name: def.name,
        planUnits: plan,
        factUnits: 0,
        deviationUnits: -plan,
        completionPercent: 0,
        status: 'normal',
        lagReason: undefined,
      }
    })
  }

  // Только что заведённый пользовательский объект без ручных критериев:
  // берём стандартный список, но факт = 0, статус — нормальный.
  if (site.isUserCreated) {
    return CRITERION_DEF.map((def) => ({
      id: def.id,
      name: def.name,
      planUnits: def.basePlan,
      factUnits: 0,
      deviationUnits: -def.basePlan,
      completionPercent: 0,
      status: 'normal',
      lagReason: undefined,
    }))
  }

  const factor =
    status === 'critical' ? 0.78 : status === 'attention' ? 0.88 + (h % 7) * 0.004 : 0.96

  return CRITERION_DEF.map((def, i) => {
    let plan = def.basePlan
    let fact = Math.round(plan * (factor + (i % 4) * 0.012 - (gap > 0 ? 0.04 : 0)))

    if (site.id === 'brusilova' && def.id === 'curb') {
      plan = 300
      fact = 250
    }

    fact = Math.min(plan + 200, Math.max(0, fact))
    const deviationUnits = fact - plan
    const completionPercent =
      plan <= 0 ? 0 : Math.min(100, Math.round((fact / plan) * 100))
    const { status: rowStatus, lagReason } = criterionStatus(plan, fact)

    return {
      id: def.id,
      name: def.name,
      planUnits: plan,
      factUnits: fact,
      deviationUnits,
      completionPercent,
      status: rowStatus,
      lagReason: rowStatus === 'normal' ? undefined : lagReason,
    }
  })
}

function buildReporting(site: ConstructionSite, status: SiteStatus): SiteDetailReporting {
  // Только что заведённый объект — пустая отчётность.
  if (site.isUserCreated) {
    return {
      dailyReportSubmitted: false,
      photoReportUploaded: false,
      videoReportUploaded: false,
      foremanCommentPresent: false,
      problemFlagsCount: 0,
    }
  }
  const h = hashId(site.id)
  const stressed = status !== 'normal'
  return {
    dailyReportSubmitted: !stressed || (h % 5) !== 0,
    photoReportUploaded: !stressed || (h % 4) !== 0,
    videoReportUploaded: (h % 3) === 0 ? false : true,
    foremanCommentPresent: (h % 6) !== 1,
    problemFlagsCount: stressed ? 1 + (h % 3) : h % 2,
  }
}

function buildMeta(site: ConstructionSite): SiteDetailMeta {
  const code = `DR-${site.id.slice(0, 4).toUpperCase()}-${(hashId(site.id) % 900) + 100}`
  return {
    objectCode: code,
    addressNote: site.address?.trim()
      ? site.address.trim()
      : 'Учётный участок · управленческий срез',
  }
}

function buildKpis(site: ConstructionSite): SiteDetailKpis {
  const status = resolveSiteStatus(site)
  const gap = planFactGapPoints(site)
  const h = hashId(site.id)
  const baseStart = new Date('2025-09-01T00:00:00')
  const start = site.startDateIso
    ? new Date(`${site.startDateIso}T00:00:00`)
    : (() => {
        const d = new Date(baseStart)
        d.setDate(d.getDate() + (h % 40))
        return d
      })()
  const end = site.endDateIso
    ? new Date(`${site.endDateIso}T00:00:00`)
    : (() => {
        const d = new Date(start)
        d.setDate(d.getDate() + 180 + (h % 50))
        return d
      })()
  const now = new Date('2026-04-19T12:00:00')
  const daysTo = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86400000))

  const onTrack = gap <= 1 && status === 'normal'
  const deadlineStatus: SiteStatus =
    gap >= 12 || status === 'critical'
      ? 'critical'
      : gap >= 4 || status === 'attention'
        ? 'attention'
        : 'normal'

  return {
    completionPercent: site.executive.factPercent,
    planToDatePercent: site.executive.planPercent,
    factToDatePercent: site.executive.factPercent,
    deviationPoints: gap,
    startDateIso: start.toISOString().slice(0, 10),
    endDateIso: end.toISOString().slice(0, 10),
    daysToCompletion: daysTo,
    openIssuesCount:
      status === 'critical' ? 5 + (h % 4) : status === 'attention' ? 2 + (h % 3) : h % 2,
    deadlineStatus,
    deadlineLabel: deadlineLabel(deadlineStatus, onTrack),
  }
}

function scheduleTrend(site: ConstructionSite): ScheduleTrend {
  const gap = planFactGapPoints(site)
  if (gap >= 6) return 'worsening'
  if (gap <= 0) return 'improving'
  return 'flat'
}

/**
 * Собирает управленческий экран объекта из базового `ConstructionSite` и эвристик.
 * Позже этот слой заменится загрузкой детальных срезов (критерии, отчёты, риски) с API.
 */
export function getSiteDetailDashboard(site: ConstructionSite): SiteDetailDashboard {
  const status = resolveSiteStatus(site)
  const gap = planFactGapPoints(site)
  const curve = buildCurve(site)
  const last = curve[curve.length - 1]
  const onTrack = gap <= 2

  const schedule: SiteDetailSchedule = {
    onTrack,
    planProgressAlongTime: last.planAlongTime,
    factProgressAlongTime: last.factAlongTime,
    trend: scheduleTrend(site),
    narrative:
      gap >= 8
        ? 'Факт заметно отстаёт от плановой кривой по календарю — нужен корректирующий план.'
        : gap >= 3
          ? 'Динамика мягко проседает относительно плана; контрольные точки на этой неделе решают.'
          : 'Движение по графику в пределах нормы; отклонения точечные.',
    curve,
    timelineStatus: status,
  }

  return {
    meta: buildMeta(site),
    statusReason: site.executive.summaryLine,
    kpis: buildKpis(site),
    criteria: buildCriteria(site),
    schedule,
    reporting: buildReporting(site, status),
    risks: buildRisks(site, status),
  }
}
