/**
 * ПРИМЕР для локальной разработки.
 * Скопируйте в staff-passwords.mjs и задайте реальные пароли.
 * Файл staff-passwords.mjs в git не коммитится.
 * Публичный список ФИО/ролей: src/domain/staffDirectory.ts
 */
export const STAFF_PASSWORDS = {
  Aramyan: 'local-dev-only',
  Dakaev: 'local-dev-only',
  Minasyan: 'local-dev-only',
  Gulikyan: 'local-dev-only',
  Kuchukyan: 'local-dev-only',
  Martynov: 'local-dev-only',
  Isaev: 'local-dev-only',
  Cheremisinov: 'local-dev-only',
  Gevenyan: 'local-dev-only',
  Egoyan: 'local-dev-only',
  Petrosyan: 'local-dev-only',
  'Petrosyan.A': 'local-dev-only',
  Khazanyan: 'local-dev-only',
  'Aramyan.G': 'local-dev-only',
  Sanamyan: 'local-dev-only',
  'Egoyan.A': 'local-dev-only',
  'Aramyan.Y': 'local-dev-only',
  Ismatov: 'local-dev-only',
  'Kuchukyan.A': 'local-dev-only',
  Mkoyan: 'local-dev-only',
  Ummatov: 'local-dev-only',
  Barsegyan: 'local-dev-only',
  Zakaryan: 'local-dev-only',
  Voskanyan: 'local-dev-only',
  'Gulikyan.D': 'local-dev-only',
  Nazaretyan: 'local-dev-only',
}

/** @type {Record<string, { fullName: string, duty: string, dutyLabel: string }>} */
export const STAFF_PROFILES = {
  Aramyan: {
    fullName: 'Арамян Норайр Геворкович',
    duty: 'manager',
    dutyLabel: 'Генеральный директор',
  },
  Dakaev: {
    fullName: 'Дакаев Ибрагим Мансурович',
    duty: 'deputy',
    dutyLabel: 'Заместитель генерального директора',
  },
  Minasyan: {
    fullName: 'Минасян Армен Лаврентьевич',
    duty: 'deputy',
    dutyLabel: 'Заместитель генерального директора по строительству',
  },
  Gulikyan: {
    fullName: 'Гуликян Татевос Жораевич',
    duty: 'manager',
    dutyLabel: 'Начальник участка',
  },
  Kuchukyan: {
    fullName: 'Кучукян Гагик Мальчикович',
    duty: 'manager',
    dutyLabel: 'Начальник участка',
  },
  Martynov: {
    fullName: 'Мартынов Николай Александрович',
    duty: 'manager',
    dutyLabel: 'Начальник отдела',
  },
  Isaev: {
    fullName: 'Исаев Дмитрий Владимирович',
    duty: 'pto',
    dutyLabel: 'Начальник отдела ПТО',
  },
  Cheremisinov: {
    fullName: 'Черемисинов Кирилл Денисович',
    duty: 'pto',
    dutyLabel: 'Инженер',
  },
  Gevenyan: {
    fullName: 'Гевенян Георгий Амлетович',
    duty: 'brigadier',
    dutyLabel: 'Бригадир',
  },
  Egoyan: {
    fullName: 'Егоян Валико Вараздатович',
    duty: 'brigadier',
    dutyLabel: 'Бригадир',
  },
  Petrosyan: {
    fullName: 'Петросян Арман Юрьевич',
    duty: 'brigadier',
    dutyLabel: 'Бригадир',
  },
  'Petrosyan.A': {
    fullName: 'Петросян Арекназ Валериковна',
    duty: 'supply',
    dutyLabel: 'Снабженец',
  },
  Khazanyan: {
    fullName: 'Хзанян Татевос Вачикович',
    duty: 'dispatcher',
    dutyLabel: 'Диспетчер',
  },
  'Aramyan.G': {
    fullName: 'Арамян Геворк Карапетович',
    duty: 'driver',
    dutyLabel: 'Водитель грузового автомобиля',
  },
  Sanamyan: {
    fullName: 'Санамян Амбарцум Овсепович',
    duty: 'driver',
    dutyLabel: 'Водитель грузового автомобиля',
  },
  'Egoyan.A': {
    fullName: 'Егоян Арташес Михакович',
    duty: 'driver',
    dutyLabel: 'Машинист экскаватора-погрузчика',
  },
  'Aramyan.Y': {
    fullName: 'Арамян Юрий Валикоевич',
    duty: 'driver',
    dutyLabel: 'Машинист катка самоходного',
  },
  Ismatov: {
    fullName: 'Исматов Жамшид Урал Угли',
    duty: 'driver',
    dutyLabel: 'Тракторист',
  },
  'Kuchukyan.A': {
    fullName: 'Кучукян Артём Арамович',
    duty: 'driver',
    dutyLabel: 'Тракторист',
  },
  Mkoyan: {
    fullName: 'Мкоян Вардан Аршалуйсович',
    duty: 'driver',
    dutyLabel: 'Тракторист',
  },
  Ummatov: {
    fullName: 'Умматов Султонмурат Коржавевич',
    duty: 'driver',
    dutyLabel: 'Тракторист',
  },
  Barsegyan: {
    fullName: 'Барсегян Гурген Вагинакович',
    duty: 'driver',
    dutyLabel: 'Помощник машиниста фрезы дорожной',
  },
  Zakaryan: {
    fullName: 'Закарян Гурген Рубикович',
    duty: 'driver',
    dutyLabel: 'Водитель легкового автомобиля',
  },
  Voskanyan: {
    fullName: 'Восканян Амбарцум Карапетович',
    duty: 'driver',
    dutyLabel: 'Механизатор',
  },
  'Gulikyan.D': {
    fullName: 'Гуликян Джоник Джоникович',
    duty: 'driver',
    dutyLabel: 'Механизатор',
  },
  Nazaretyan: {
    fullName: 'Назаретян Радик Врежович',
    duty: 'driver',
    dutyLabel: 'Механизатор',
  },
}
