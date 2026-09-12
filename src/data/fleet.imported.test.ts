import { describe, expect, it } from 'vitest'

import { FLEET_CATEGORIES, FLEET_VEHICLES } from './fleet.mock'
import { FLEET_IMPORT_META, IMPORTED_FLEET } from './fleet.imported'

/**
 * Данные парка приходят из рабочих таблиц заказчика (см. scripts/fleet-excel).
 * Эти проверки ловят два вида беды:
 *   — импорт потерял или удвоил данные (сверка с контрольными суммами таблиц);
 *   — в парк снова просочились придуманные значения вместо фактических.
 */

/**
 * Сумма всех строк бортового журнала — сходится с итогами «Итого» на каждом
 * из листов таблицы. Сводка «Содержание» показывает 24 794 854,28 ₽, потому
 * что её формула по Sany 330 ссылается на одну строку вместо суммы; верна
 * именно эта, большая цифра.
 */
const JOURNAL_TOTAL_RUB = 25168870.47

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

describe('импорт парка из учётных таблиц', () => {
  it('состав парка не изменился незаметно', () => {
    expect(IMPORTED_FLEET).toHaveLength(80)
    expect(FLEET_VEHICLES).toHaveLength(80)
    expect(FLEET_IMPORT_META.unitCount).toBe(IMPORTED_FLEET.length)
  })

  it('госномера и VIN не дублируются', () => {
    const plates = IMPORTED_FLEET.map((u) => u.plateKey)
    expect(new Set(plates).size).toBe(plates.length)

    const vins = IMPORTED_FLEET.map((u) => u.vinOrFrame).filter((v) => v.length > 0)
    expect(new Set(vins).size).toBe(vins.length)
  })

  it('id техники уникальны и не зависят от порядка в списке', () => {
    const ids = FLEET_VEHICLES.map((v) => v.id)
    expect(new Set(ids).size).toBe(ids.length)
    // id собран из категории и латинского номера — при добавлении машины
    // в середину списка чужие id не сдвигаются
    const kamaz = FLEET_VEHICLES.find((v) => v.plate === 'К 877 ТУ 799')
    expect(kamaz?.id).toBe('dump-trucks-k877ty799')
  })

  it('каждая единица отнесена к существующему классу техники', () => {
    const known = new Set(FLEET_CATEGORIES.map((c) => c.id))
    for (const unit of IMPORTED_FLEET) {
      expect(known.has(unit.categoryId as never), `${unit.plate}: ${unit.categoryId}`).toBe(true)
    }
  })

  it('у каждой единицы есть модель, а номер — если он присвоен', () => {
    /* Единственная машина без госномера — прицеп 71491, у него по таблице
       «ПТС не оформлен должным образом». Опознаётся по VIN. */
    const withoutPlate = IMPORTED_FLEET.filter((u) => u.plate.length === 0)
    expect(withoutPlate.map((u) => u.vinOrFrame)).toEqual(['Х89714911L0FM4073'])
    for (const unit of IMPORTED_FLEET) {
      expect(unit.model.length, unit.plateKey).toBeGreaterThan(0)
      expect(unit.plateKey.length, unit.model).toBeGreaterThan(0)
    }
  })

  it('габариты сцепок взяты из листа «тралы»', () => {
    const semi = IMPORTED_FLEET.find((u) => u.plate === 'ЕО 7112 77')
    expect(semi?.dimensions).toEqual({
      lengthCm: 11200,
      maxMassKg: 56300,
      payloadKg: 45000,
      axleCount: 3,
    })
    const tanker = IMPORTED_FLEET.find((u) => u.plate === 'ХХ 0555 77')
    expect(tanker?.dimensions?.payloadKg).toBe(54500)
    expect(tanker?.dimensions?.axleCount).toBe(4)
  })

  it('VIN отсутствует только там, где его нет в таблице', () => {
    const withoutVin = IMPORTED_FLEET.filter((u) => u.vinOrFrame.length === 0).map((u) => u.plate)
    expect(withoutVin).toEqual(['Т 443 МУ 977'])
  })

  it('однотипные КАМАЗы не склеены по похожему VIN', () => {
    /* У машин из одной партии совпадают первые 13 знаков VIN
       (XTC652005K1407605 и XTC652005K1409565) — сверка идёт по всем 17. */
    const kamaz = IMPORTED_FLEET.filter((u) => u.vinOrFrame.startsWith('XTC652005'))
    expect(kamaz.length).toBeGreaterThanOrEqual(6)
    expect(new Set(kamaz.map((u) => u.vinOrFrame)).size).toBe(kamaz.length)
    expect(IMPORTED_FLEET.find((u) => u.plate === 'М 320 КО 977')?.vinOrFrame).toBe(
      'XTC652005K1407605',
    )
    expect(IMPORTED_FLEET.find((u) => u.plate === 'Н 487 АА 977')?.vinOrFrame).toBe(
      'XTC652005К1409565(6)',
    )
  })

  it('сумма ремонтов совпадает с итогами бортового журнала', () => {
    const sum = IMPORTED_FLEET.flatMap((u) => u.repairs).reduce(
      (acc, r) => acc + (r.costRub ?? 0),
      0,
    )
    expect(Math.round(sum * 100) / 100).toBe(JOURNAL_TOTAL_RUB)
    expect(FLEET_IMPORT_META.repairSumRub).toBe(JOURNAL_TOTAL_RUB)
  })

  it('в ремонтах те же суммы после переноса в карточки техники', () => {
    const sum = FLEET_VEHICLES.flatMap((v) => v.repairs).reduce(
      (acc, r) => acc + (r.costRub ?? 0),
      0,
    )
    expect(Math.round(sum * 100) / 100).toBe(JOURNAL_TOTAL_RUB)
  })

  it('у каждой записи о ремонте есть дата и название', () => {
    for (const unit of IMPORTED_FLEET) {
      for (const r of unit.repairs) {
        expect(r.dateIso, `${unit.plate}: ${r.title}`).toMatch(ISO_DATE)
        expect(r.title.length, `${unit.plate}: ${r.id}`).toBeGreaterThan(0)
        // журнал — это оплаченные документы, открытых работ там нет
        expect(r.open).toBe(false)
      }
    }
  })

  it('все даты документов — корректные ISO-даты', () => {
    for (const unit of IMPORTED_FLEET) {
      const dates = [
        unit.insurance.validUntilIso,
        unit.technicalInspection?.validUntilIso,
        unit.registrationCertificateIssuedIso,
        unit.vehiclePassportIssuedIso,
        unit.leaseEndIso,
        unit.meter?.asOfIso,
        ...unit.passes.map((p) => p.validUntilIso),
      ].filter((d): d is string => typeof d === 'string')
      for (const d of dates) {
        expect(d, `${unit.plate}: ${d}`).toMatch(ISO_DATE)
        expect(Number.isNaN(new Date(d).getTime()), `${unit.plate}: ${d}`).toBe(false)
      }
    }
  })

  it('показания счётчика всегда с датой снятия', () => {
    for (const unit of IMPORTED_FLEET) {
      if (!unit.meter) continue
      expect(unit.meter.value, unit.plate).toBeGreaterThan(0)
      expect(unit.meter.asOfIso, unit.plate).toMatch(ISO_DATE)
    }
  })

  it('километры и моточасы не перепутаны между видами техники', () => {
    const hoursOnly = new Set([
      'front-loaders',
      'mini-loaders',
      'backhoes',
      'excavators',
      'rollers',
      'pavers',
      'cold-mills',
    ])
    for (const v of FLEET_VEHICLES) {
      if (!v.specs) continue
      if (hoursOnly.has(v.categoryId)) {
        expect(v.specs.odometerKm, v.plate).toBeUndefined()
      } else {
        expect(v.specs.engineHours, v.plate).toBeUndefined()
      }
    }
  })

  it('ОСАГО «не требуется» — только у прицепов', () => {
    const exempt = FLEET_VEHICLES.filter((v) => v.insurance.notRequired)
    for (const v of exempt) expect(v.categoryId, v.plate).toBe('trailers')
  })

  it('в парке не осталось придуманных данных', () => {
    const dump = JSON.stringify(FLEET_VEHICLES)
    for (const marker of ['демо', 'Страховой партнёр', 'ПС-', 'АУДИТ']) {
      expect(dump.includes(marker), `в данных парка найдено «${marker}»`).toBe(false)
    }
  })

  it('страховщик и премия не выдумываются', () => {
    for (const v of FLEET_VEHICLES) {
      expect(v.insurance.insurer, v.plate).toBeUndefined()
      expect(v.insurance.annualPremiumRub, v.plate).toBeUndefined()
    }
  })

  it('данные КАМАЗа К 877 ТУ 799 совпадают с таблицей', () => {
    const v = FLEET_VEHICLES.find((x) => x.plate === 'К 877 ТУ 799')
    expect(v).toBeDefined()
    expect(v?.vinOrFrame).toBe('XTC652005L1424014')
    expect(v?.insurance.policyNumber).toBe('ХХХ 0691473369')
    expect(v?.insurance.validUntilIso).toBe('2027-09-04')
    expect(v?.technicalInspection?.cardNumber).toBe('127811052401512')
    expect(v?.technicalInspection?.validUntilIso).toBe('2025-11-26')
    expect(v?.specs?.registrationCertificate).toBe('99 59 398181')
    expect(v?.specs?.registrationCertificateIssuedIso).toBe('2023-08-01')
    expect(v?.specs?.ownership).toBe('owned')
    expect(v?.specs?.tachograph).toBe('yes')
    expect(v?.specs?.platon).toBe('no')
  })

  it('перерегистрированные машины собраны в одну запись', () => {
    // LADA 4X4: в бортовом журнале «Н 481 ОУ 797», в реестре «С 905 СС 99» —
    // один VIN, значит одна машина и один набор ремонтов
    const lada = IMPORTED_FLEET.filter((u) => u.vinOrFrame === 'XTA212140R2478441')
    expect(lada).toHaveLength(1)
    expect(lada[0].plate).toBe('С 905 СС 99')

    // Тот же случай у автобуса Ford Transit и экскаватора SANY
    expect(IMPORTED_FLEET.filter((u) => u.vinOrFrame === 'Z6FXXXESGXJJ06015')).toHaveLength(1)
    expect(IMPORTED_FLEET.filter((u) => u.plateKey === '77РМ6820')).toHaveLength(0)
  })

  it('машины из бортового журнала подхвачены, даже если их нет в реестре ТС', () => {
    const fromJournal = IMPORTED_FLEET.filter((u) => u.source === 'бортовой журнал')
    expect(fromJournal.map((u) => u.plate).sort()).toEqual([
      '77 РВ 6778',
      'А 497 АС 799',
      'Е 881 ТО 790',
      'Н 078 АМ 977',
      'Х 316 ОЕ 797',
    ])
  })
})
