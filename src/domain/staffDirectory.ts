import type { SiteDutyRole } from './sitePageZone'

/**
 * Локальный справочник сотрудников (MVP до серверного auth).
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
  readonly password: string
  readonly fullName: string
  readonly duty: SiteDutyRole
  /** Подпись должности в UI. */
  readonly dutyLabel: string
}

export const STAFF_DIRECTORY: readonly StaffMember[] = [
  // —— Руководство ——
  {
    login: 'Aramyan',
    password: 'Ara4806',
    fullName: 'Арамян Норайр Геворкович',
    duty: 'manager',
    dutyLabel: 'Генеральный директор',
  },
  {
    login: 'Dakaev',
    password: 'Ameda095',
    fullName: 'Дакаев Ибрагим Мансурович',
    duty: 'deputy',
    dutyLabel: 'Заместитель генерального директора',
  },
  {
    login: 'Minasyan',
    password: 'Min4807',
    fullName: 'Минасян Армен Лаврентьевич',
    duty: 'deputy',
    dutyLabel: 'Заместитель генерального директора по строительству',
  },
  // —— Начальники участков / отделов (полный объект) ——
  {
    login: 'Gulikyan',
    password: 'Gul4804',
    fullName: 'Гуликян Татевос Жораевич',
    duty: 'manager',
    dutyLabel: 'Начальник участка',
  },
  {
    login: 'Kuchukyan',
    password: 'Kuc4805',
    fullName: 'Кучукян Гагик Мальчикович',
    duty: 'manager',
    dutyLabel: 'Начальник участка',
  },
  {
    login: 'Martynov',
    password: 'Mar4810',
    fullName: 'Мартынов Николай Александрович',
    duty: 'manager',
    dutyLabel: 'Начальник отдела',
  },
  // —— ПТО ——
  {
    login: 'Isaev',
    password: 'Isa4808',
    fullName: 'Исаев Дмитрий Владимирович',
    duty: 'pto',
    dutyLabel: 'Начальник отдела ПТО',
  },
  {
    login: 'Cheremisinov',
    password: 'Che4809',
    fullName: 'Черемисинов Кирилл Денисович',
    duty: 'pto',
    dutyLabel: 'Инженер',
  },
  // —— Бригадиры ——
  {
    login: 'Gevenyan',
    password: 'Gev4801',
    fullName: 'Гевенян Георгий Амлетович',
    duty: 'brigadier',
    dutyLabel: 'Бригадир',
  },
  {
    login: 'Egoyan',
    password: 'Ego4802',
    fullName: 'Егоян Валико Вараздатович',
    duty: 'brigadier',
    dutyLabel: 'Бригадир',
  },
  {
    login: 'Petrosyan',
    password: 'Pet4803',
    fullName: 'Петросян Арман Юрьевич',
    duty: 'brigadier',
    dutyLabel: 'Бригадир',
  },
  // —— Снабжение ——
  {
    login: 'Petrosyan.A',
    password: 'Pet4825',
    fullName: 'Петросян Арекназ Валериковна',
    duty: 'supply',
    dutyLabel: 'Снабженец',
  },
  // —— Диспетчер ——
  {
    login: 'Khazanyan',
    password: 'Kha4811',
    fullName: 'Хзанян Татевос Вачикович',
    duty: 'dispatcher',
    dutyLabel: 'Диспетчер',
  },
  // —— Водители / машинисты / трактористы / механизаторы ——
  {
    login: 'Aramyan.G',
    password: 'Ara4812',
    fullName: 'Арамян Геворк Карапетович',
    duty: 'driver',
    dutyLabel: 'Водитель грузового автомобиля',
  },
  {
    login: 'Sanamyan',
    password: 'San4813',
    fullName: 'Санамян Амбарцум Овсепович',
    duty: 'driver',
    dutyLabel: 'Водитель грузового автомобиля',
  },
  {
    login: 'Egoyan.A',
    password: 'Ego4814',
    fullName: 'Егоян Арташес Михакович',
    duty: 'driver',
    dutyLabel: 'Машинист экскаватора-погрузчика',
  },
  {
    login: 'Aramyan.Y',
    password: 'Ara4815',
    fullName: 'Арамян Юрий Валикоевич',
    duty: 'driver',
    dutyLabel: 'Машинист катка самоходного',
  },
  {
    login: 'Ismatov',
    password: 'Ism4816',
    fullName: 'Исматов Жамшид Урал Угли',
    duty: 'driver',
    dutyLabel: 'Тракторист',
  },
  {
    login: 'Kuchukyan.A',
    password: 'Kuc4817',
    fullName: 'Кучукян Артём Арамович',
    duty: 'driver',
    dutyLabel: 'Тракторист',
  },
  {
    login: 'Mkoyan',
    password: 'Mko4818',
    fullName: 'Мкоян Вардан Аршалуйсович',
    duty: 'driver',
    dutyLabel: 'Тракторист',
  },
  {
    login: 'Ummatov',
    password: 'Umm4819',
    fullName: 'Умматов Султонмурат Коржавевич',
    duty: 'driver',
    dutyLabel: 'Тракторист',
  },
  {
    login: 'Barsegyan',
    password: 'Bar4820',
    fullName: 'Барсегян Гурген Вагинакович',
    duty: 'driver',
    dutyLabel: 'Помощник машиниста фрезы дорожной',
  },
  {
    login: 'Zakaryan',
    password: 'Zak4821',
    fullName: 'Закарян Гурген Рубикович',
    duty: 'driver',
    dutyLabel: 'Водитель легкового автомобиля',
  },
  {
    login: 'Voskanyan',
    password: 'Vos4822',
    fullName: 'Восканян Амбарцум Карапетович',
    duty: 'driver',
    dutyLabel: 'Механизатор',
  },
  {
    login: 'Gulikyan.D',
    password: 'Gul4823',
    fullName: 'Гуликян Джоник Джоникович',
    duty: 'driver',
    dutyLabel: 'Механизатор',
  },
  {
    login: 'Nazaretyan',
    password: 'Naz4824',
    fullName: 'Назаретян Радик Врежович',
    duty: 'driver',
    dutyLabel: 'Механизатор',
  },
]

export function findStaffByCredentials(
  login: string,
  password: string,
): StaffMember | null {
  const user = login.trim()
  if (!user || !password) return null
  const userLower = user.toLocaleLowerCase('en-US')
  return (
    STAFF_DIRECTORY.find(
      (member) =>
        member.login.toLocaleLowerCase('en-US') === userLower &&
        member.password === password,
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
