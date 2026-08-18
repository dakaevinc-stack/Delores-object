import { beforeEach, describe, expect, it } from 'vitest'
import {
  loadSiteDeliveryPoint,
  saveSiteDeliveryPoint,
} from './siteDeliveryPointsRepository'

describe('siteDeliveryPointsRepository', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('сохраняет и читает точку объекта', () => {
    const point = {
      lat: 55.5,
      lng: 37.56,
      hint: 'Западные ворота',
      address: 'Брусилова',
      updatedAtIso: '2026-08-17T16:00:00.000Z',
    }
    saveSiteDeliveryPoint('brusilova', point)
    expect(loadSiteDeliveryPoint('brusilova')).toEqual(point)
  })

  it('удаляет точку', () => {
    saveSiteDeliveryPoint('brusilova', {
      lat: 55.5,
      lng: 37.56,
      hint: '',
      address: '',
      updatedAtIso: '2026-08-17T16:00:00.000Z',
    })
    saveSiteDeliveryPoint('brusilova', null)
    expect(loadSiteDeliveryPoint('brusilova')).toBeNull()
  })
})
