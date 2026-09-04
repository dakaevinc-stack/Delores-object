import { STAFF_DIRECTORY, type StaffMember } from '../domain/staffDirectory'

/** Кому можно назначить задачу (все, кроме пустого списка). */
export function listAssignableStaff(excludeLogin?: string): StaffMember[] {
  const ex = excludeLogin?.trim().toLocaleLowerCase('en-US')
  return STAFF_DIRECTORY.filter((m) => {
    if (!ex) return true
    return m.login.toLocaleLowerCase('en-US') !== ex
  }).sort((a, b) => a.fullName.localeCompare(b.fullName, 'ru'))
}
