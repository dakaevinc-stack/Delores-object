import type { SiteDutyRole } from './sitePageZone'

/**
 * Публичный справочник сотрудников (ФИО/роли). Пароли только на сервере.
 * Логин — латиница, фамилия с заглавной буквы (`Dakaev`).
 * Однофамильцы: `Aramyan.G` (первая буква имени).
 *
 * Роли → что видно на объекте:
 *   manager / deputy / pto — все зоны
 *   brigadier — смена
 *   supply — материалы и заявки
 *   dispatcher — рейсы
 *   driver — кабинет /driver
 */

export type StaffMember = {
  readonly login: string
  readonly fullName: string
  readonly duty: SiteDutyRole
  /** Подпись должности в UI. */
  readonly dutyLabel: string
}

export const STAFF_DIRECTORY: readonly StaffMember[] = [
  // —— Руководство ——
  {
    login: 'Aramyan',
    fullName: 'Арамян Норайр Геворкович',
    duty: 'manager',
    dutyLabel: 'Генеральный директор',
  },
  {
    login: 'Dakaev',
    fullName: 'Дакаев Ибрагим Мансурович',
    duty: 'deputy',
    dutyLabel: 'Заместитель генерального директора',
  },
  {
    login: 'Minasyan',
    fullName: 'Минасян Армен Лаврентьевич',
    duty: 'deputy',
    dutyLabel: 'Заместитель генерального директора по строительству',
  },
  // —— Начальники участков / отделов (полный объект) ——
  {
    login: 'Gulikyan',
    fullName: 'Гуликян Татевос Жораевич',
    duty: 'manager',
    dutyLabel: 'Начальник участка',
  },
  {
    login: 'Kuchukyan',
    fullName: 'Кучукян Гагик Мальчикович',
    duty: 'manager',
    dutyLabel: 'Начальник участка',
  },
  {
    login: 'Martynov',
    fullName: 'Мартынов Николай Александрович',
    duty: 'manager',
    dutyLabel: 'Начальник отдела',
  },
  // —— ПТО ——
  {
    login: 'Isaev',
    fullName: 'Исаев Дмитрий Владимирович',
    duty: 'pto',
    dutyLabel: 'Начальник отдела ПТО',
  },
  {
    login: 'Cheremisinov',
    fullName: 'Черемисинов Кирилл Денисович',
    duty: 'pto',
    dutyLabel: 'Инженер',
  },
  // —— Бригадиры ——
  {
    login: 'Gevenyan',
    fullName: 'Гевенян Георгий Амлетович',
    duty: 'brigadier',
    dutyLabel: 'Бригадир',
  },
  {
    login: 'Egoyan',
    fullName: 'Егоян Валико Вараздатович',
    duty: 'brigadier',
    dutyLabel: 'Бригадир',
  },
  {
    login: 'Petrosyan',
    fullName: 'Петросян Арман Юрьевич',
    duty: 'brigadier',
    dutyLabel: 'Бригадир',
  },
  // —— Снабжение ——
  {
    login: 'Petrosyan.A',
    fullName: 'Петросян Арекназ Валериковна',
    duty: 'supply',
    dutyLabel: 'Снабженец',
  },
  // —— Диспетчер ——
  {
    login: 'Khazanyan',
    fullName: 'Хзанян Татевос Вачикович',
    duty: 'dispatcher',
    dutyLabel: 'Диспетчер',
  },
  // —— Водители / машинисты / трактористы / механизаторы ——
  {
    login: 'Aramyan.G',
    fullName: 'Арамян Геворк Карапетович',
    duty: 'driver',
    dutyLabel: 'Водитель грузового автомобиля',
  },
  {
    login: 'Sanamyan',
    fullName: 'Санамян Амбарцум Овсепович',
    duty: 'driver',
    dutyLabel: 'Водитель грузового автомобиля',
  },
  {
    login: 'Egoyan.A',
    fullName: 'Егоян Арташес Михакович',
    duty: 'driver',
    dutyLabel: 'Машинист экскаватора-погрузчика',
  },
  {
    login: 'Aramyan.Y',
    fullName: 'Арамян Юрий Валикоевич',
    duty: 'driver',
    dutyLabel: 'Машинист катка самоходного',
  },
  {
    login: 'Ismatov',
    fullName: 'Исматов Жамшид Урал Угли',
    duty: 'driver',
    dutyLabel: 'Тракторист',
  },
  {
    login: 'Kuchukyan.A',
    fullName: 'Кучукян Артём Арамович',
    duty: 'driver',
    dutyLabel: 'Тракторист',
  },
  {
    login: 'Mkoyan',
    fullName: 'Мкоян Вардан Аршалуйсович',
    duty: 'driver',
    dutyLabel: 'Тракторист',
  },
  {
    login: 'Ummatov',
    fullName: 'Умматов Султонмурат Коржавевич',
    duty: 'driver',
    dutyLabel: 'Тракторист',
  },
  {
    login: 'Barsegyan',
    fullName: 'Барсегян Гурген Вагинакович',
    duty: 'driver',
    dutyLabel: 'Помощник машиниста фрезы дорожной',
  },
  {
    login: 'Zakaryan',
    fullName: 'Закарян Гурген Рубикович',
    duty: 'driver',
    dutyLabel: 'Водитель легкового автомобиля',
  },
  {
    login: 'Voskanyan',
    fullName: 'Восканян Амбарцум Карапетович',
    duty: 'driver',
    dutyLabel: 'Механизатор',
  },
  {
    login: 'Gulikyan.D',
    fullName: 'Гуликян Джоник Джоникович',
    duty: 'driver',
    dutyLabel: 'Механизатор',
  },
  {
    login: 'Nazaretyan',
    fullName: 'Назаретян Радик Врежович',
    duty: 'driver',
    dutyLabel: 'Механизатор',
  },
]

export function findStaffByLogin(login: string): StaffMember | null {
  const user = login.trim()
  if (!user) return null
  const userLower = user.toLocaleLowerCase('en-US')
  return (
    STAFF_DIRECTORY.find(
      (member) => member.login.toLocaleLowerCase('en-US') === userLower,
    ) ?? null
  )
}

/** ФИО водителей / машинистов из штатного списка (для назначения рейса). */
export function listStaffDriverNames(): string[] {
  return STAFF_DIRECTORY.filter((m) => m.duty === 'driver')
    .map((m) => m.fullName)
    .sort((a, b) => a.localeCompare(b, 'ru'))
}

export type StaffFieldLeaderOption = {
  readonly fullName: string
  readonly dutyLabel: string
  readonly group: 'brigadier' | 'site_manager'
}

/**
 * Бригадиры и начальники участков — для выбора ФИО в заявке на материалы.
 */
export function listStaffBrigadierAndSiteManagerOptions(): StaffFieldLeaderOption[] {
  return STAFF_DIRECTORY.filter(
    (m) => m.duty === 'brigadier' || m.dutyLabel === 'Начальник участка',
  )
    .map((m) => ({
      fullName: m.fullName,
      dutyLabel: m.dutyLabel,
      group: m.duty === 'brigadier' ? ('brigadier' as const) : ('site_manager' as const),
    }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName, 'ru'))
}
