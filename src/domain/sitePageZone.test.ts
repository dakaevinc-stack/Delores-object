import { describe, expect, it } from 'vitest'
import { SITE_DUTY_CAPABILITIES, SITE_PAGE_ZONES, ZONES_BY_DUTY } from './sitePageZone'

describe('sitePageZone', () => {
  it('руководитель видит все зоны, остальные — только свою', () => {
    expect(ZONES_BY_DUTY.brigadier).toEqual(['brigadier'])
    expect(ZONES_BY_DUTY.supply).toEqual(['supply'])
    expect(ZONES_BY_DUTY.dispatcher).toEqual(['dispatcher'])
    expect(ZONES_BY_DUTY.manager).toEqual(['manager', 'brigadier', 'supply', 'dispatcher'])
  })

  it('бригадир не ставит рейс, диспетчер — ставит', () => {
    expect(SITE_DUTY_CAPABILITIES.brigadier.assignDriverTrip).toBe(false)
    expect(SITE_DUTY_CAPABILITIES.brigadier.editUnloadPoint).toBe(true)
    expect(SITE_DUTY_CAPABILITIES.brigadier.orderMaterial).toBe(true)
    expect(SITE_DUTY_CAPABILITIES.dispatcher.assignDriverTrip).toBe(true)
    expect(SITE_DUTY_CAPABILITIES.dispatcher.editUnloadPoint).toBe(false)
    expect(SITE_DUTY_CAPABILITIES.manager.assignDriverTrip).toBe(true)
  })

  it('у зон есть подписи для шапки страницы', () => {
    expect(SITE_PAGE_ZONES.manager.kicker).toBe('')
    expect(SITE_PAGE_ZONES.manager.title).toBe('Сводка по объекту')
    expect(SITE_PAGE_ZONES.brigadier.kicker).toBe('Бригадир')
    expect(SITE_PAGE_ZONES.supply.kicker).toBe('Снабжение')
    expect(SITE_PAGE_ZONES.dispatcher.kicker).toBe('Диспетчер')
  })
})
