import { describe, expect, it } from 'vitest'
import {
  canReceiveOnSite,
  canSupplyApprove,
  canSupplyCancel,
  isVisibleToMaterialReceiver,
} from './procurementRequest'

describe('видимость заявки для приёмщика', () => {
  it('черновик и отказ снабжения скрыты, согласованная видна', () => {
    expect(isVisibleToMaterialReceiver({ status: 'pending' })).toBe(false)
    expect(isVisibleToMaterialReceiver({ status: 'rejected' })).toBe(false)
    expect(isVisibleToMaterialReceiver({ status: 'cancelled' })).toBe(false)
    expect(isVisibleToMaterialReceiver({ status: 'approved' })).toBe(true)
    expect(isVisibleToMaterialReceiver({ status: 'accepted' })).toBe(true)
    expect(isVisibleToMaterialReceiver({ status: 'refused' })).toBe(true)
  })

  it('снабжение согласовывает черновик и может снять согласованную', () => {
    expect(canSupplyApprove({ status: 'pending' })).toBe(true)
    expect(canSupplyApprove({ status: 'approved' })).toBe(false)
    expect(canSupplyCancel({ status: 'approved' })).toBe(true)
    expect(canSupplyCancel({ status: 'accepted' })).toBe(false)
    expect(canReceiveOnSite({ status: 'approved', receipt: null })).toBe(true)
    expect(canReceiveOnSite({ status: 'pending', receipt: null })).toBe(false)
  })
})
