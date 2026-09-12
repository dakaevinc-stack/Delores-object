import { describe, expect, it } from 'vitest'
import { isPositivePerformedQty, parsePerformedQty } from './brigadierReport'

describe('parsePerformedQty', () => {
  it('принимает дробь с запятой и точкой', () => {
    expect(parsePerformedQty('10,5')).toEqual({ ok: true, value: 10.5 })
    expect(parsePerformedQty('10.5')).toEqual({ ok: true, value: 10.5 })
    expect(parsePerformedQty(' 3 ')).toEqual({ ok: true, value: 3 })
  })

  it('отклоняет пустое, ноль, минус и нечисло', () => {
    expect(parsePerformedQty('')).toEqual({ ok: false, reason: 'empty' })
    expect(parsePerformedQty('   ')).toEqual({ ok: false, reason: 'empty' })
    expect(parsePerformedQty('0')).toEqual({ ok: false, reason: 'not-positive' })
    expect(parsePerformedQty('-5')).toEqual({ ok: false, reason: 'not-positive' })
    expect(parsePerformedQty('-5 м')).toEqual({ ok: false, reason: 'not-a-number' })
    expect(parsePerformedQty('нет')).toEqual({ ok: false, reason: 'not-a-number' })
  })

  it('isPositivePerformedQty не пропускает мусор в факт плана', () => {
    expect(isPositivePerformedQty(10.5)).toBe(true)
    expect(isPositivePerformedQty(0)).toBe(false)
    expect(isPositivePerformedQty(-5)).toBe(false)
    expect(isPositivePerformedQty(Number.NaN)).toBe(false)
  })
})
