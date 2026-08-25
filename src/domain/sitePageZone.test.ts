import { describe, expect, it } from 'vitest'
import {
  SITE_DUTY_CAPABILITIES,
  SITE_PAGE_ZONE_ORDER,
  SITE_PAGE_ZONES,
  ZONES_BY_DUTY,
  zonesForDuty,
} from './sitePageZone'

describe('sitePageZone', () => {
  it('порядок зон на полном экране: сводка → смена → материалы → рейс', () => {
    expect(SITE_PAGE_ZONE_ORDER).toEqual([
      'manager',
      'brigadier',
      'supply',
      'dispatcher',
    ])
  })

  it('руководитель и зам видят все зоны, остальные — только свою', () => {
    expect(zonesForDuty('manager')).toEqual(SITE_PAGE_ZONE_ORDER)
    expect(zonesForDuty('deputy')).toEqual(SITE_PAGE_ZONE_ORDER)
    expect(ZONES_BY_DUTY.pto).toEqual(SITE_PAGE_ZONE_ORDER)
    expect(ZONES_BY_DUTY.brigadier).toEqual(['brigadier'])
    expect(ZONES_BY_DUTY.supply).toEqual(['supply'])
    expect(ZONES_BY_DUTY.dispatcher).toEqual(['dispatcher'])
    expect(ZONES_BY_DUTY.driver).toEqual([])
  })

  it('бригадир не ставит рейс, диспетчер — ставит', () => {
    expect(SITE_DUTY_CAPABILITIES.brigadier.assignDriverTrip).toBe(false)
    expect(SITE_DUTY_CAPABILITIES.brigadier.editUnloadPoint).toBe(true)
    expect(SITE_DUTY_CAPABILITIES.brigadier.orderMaterial).toBe(true)
    expect(SITE_DUTY_CAPABILITIES.dispatcher.assignDriverTrip).toBe(true)
    expect(SITE_DUTY_CAPABILITIES.dispatcher.editUnloadPoint).toBe(false)
    expect(SITE_DUTY_CAPABILITIES.manager.assignDriverTrip).toBe(true)
    expect(SITE_DUTY_CAPABILITIES.deputy.assignDriverTrip).toBe(true)
    expect(SITE_DUTY_CAPABILITIES.driver.seeAllZones).toBe(false)
  })

  it('у зон есть подписи для шапки страницы', () => {
    expect(SITE_PAGE_ZONES.manager.kicker).toBe('Проект')
    expect(SITE_PAGE_ZONES.manager.title).toBe('Документы проекта')
    expect(SITE_PAGE_ZONES.brigadier.kicker).toBe('Бригадир')
    expect(SITE_PAGE_ZONES.supply.kicker).toBe('Снабжение')
    expect(SITE_PAGE_ZONES.dispatcher.kicker).toBe('Диспетчер')
  })
})
