import { describe, expect, it } from 'vitest'
import {
  buildCkkbHandoverFileName,
  ckkbHandoverFolderId,
  ckkbHandoverFolderName,
  kindNeedsHandoverDoc,
} from './ckkbHandoverDocs'

describe('ckkbHandoverDocs', () => {
  it('builds per-site folder names', () => {
    expect(ckkbHandoverFolderName('Брусилова')).toBe('Сдача ЦККБ Брусилова')
    expect(ckkbHandoverFolderName('пос. Кирпичного завода')).toBe('Сдача ЦККБ Кирпичного завода')
    expect(ckkbHandoverFolderId('brusilova')).toBe('ckkb-handover-brusilova')
  })

  it('requires docs only for accepted and ckkb', () => {
    expect(kindNeedsHandoverDoc('accepted')).toBe(true)
    expect(kindNeedsHandoverDoc('ckkb')).toBe(true)
    expect(kindNeedsHandoverDoc('issue')).toBe(false)
    expect(kindNeedsHandoverDoc('note')).toBe(false)
  })

  it('labels photo files with status, number, area and note', () => {
    const name = buildCkkbHandoverFileName('IMG_1234.jpg', {
      statusLabel: 'ЦККБ',
      areaM2: 142.4,
      note: 'участок А',
      markNumber: 12,
      markId: 'm-abc123xyz',
    })
    expect(name).toContain('ЦККБ')
    expect(name).toContain('№12')
    expect(name).toContain('142м2')
    expect(name).toContain('участок-А')
    expect(name).not.toContain('отм-')
    expect(name.endsWith('.jpg')).toBe(true)
  })
})
