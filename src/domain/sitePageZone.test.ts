import { describe, expect, it } from 'vitest'
import { SITE_PAGE_ZONES, ZONES_BY_SITE_ROLE } from './sitePageZone'

describe('sitePageZone', () => {
  it('у каждой должности свой набор зон, руководитель видит все', () => {
    expect(ZONES_BY_SITE_ROLE.brigadier).toEqual(['brigadier'])
    expect(ZONES_BY_SITE_ROLE.supply).toEqual(['supply'])
    expect(ZONES_BY_SITE_ROLE.dispatcher).toEqual(['dispatcher'])
    expect(ZONES_BY_SITE_ROLE.manager).toEqual(['manager', 'brigadier', 'supply', 'dispatcher'])
  })

  it('у зон есть подписи для шапки страницы', () => {
    expect(SITE_PAGE_ZONES.manager.kicker).toBe('Руководитель')
    expect(SITE_PAGE_ZONES.brigadier.kicker).toBe('Бригадир')
    expect(SITE_PAGE_ZONES.supply.kicker).toBe('Снабжение')
    expect(SITE_PAGE_ZONES.dispatcher.kicker).toBe('Диспетчер')
  })
})
