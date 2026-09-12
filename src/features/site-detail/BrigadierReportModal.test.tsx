import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { BrigadierReportModal } from './BrigadierReportModal'

describe('BrigadierReportModal — объём выполненной работы', () => {
  it('не сохраняет отрицательный объём по работе без плана', () => {
    const onSubmit = vi.fn()
    render(
      <BrigadierReportModal
        onClose={() => undefined}
        siteId="audit-site"
        siteName="Аудит"
        author={{ login: 'Dakaev', name: 'Дакаев' }}
        onSubmit={onSubmit}
      />,
    )

    fireEvent.click(screen.getByRole('checkbox', { name: /Установка бортового камня \(БК\) — бетон/ }))
    fireEvent.change(screen.getByLabelText(/Объём: Установка бортового камня/), {
      target: { value: '-5' },
    })
    fireEvent.change(screen.getByLabelText(/Ответственный за смену/), {
      target: { value: 'Иванов' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить отчёт' }))

    expect(screen.getByText('Объём должен быть больше нуля')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('принимает 10,5 и отдаёт число 10.5', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(
      <BrigadierReportModal
        onClose={() => undefined}
        siteId="audit-site"
        siteName="Аудит"
        author={{ login: 'Dakaev', name: 'Дакаев' }}
        onSubmit={onSubmit}
      />,
    )

    fireEvent.click(screen.getByRole('checkbox', { name: /Установка бортового камня \(БК\) — бетон/ }))
    fireEvent.change(screen.getByLabelText(/Объём: Установка бортового камня/), {
      target: { value: '10,5' },
    })
    fireEvent.change(screen.getByLabelText(/Ответственный за смену/), {
      target: { value: 'Иванов' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить отчёт' }))

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    const report = onSubmit.mock.calls[0]![0]
    expect(report.lines[0]?.text).toMatch(/10\.5/)
    expect(report.lines[0]?.text).not.toMatch(/-5/)
    expect(report.responsible).toBe('Иванов')
    expect(report.authorLogin).toBe('Dakaev')
    expect(report.authorName).toBe('Дакаев')
  })

  it('не сохраняет отчёт с пустым ответственным', () => {
    const onSubmit = vi.fn()
    render(
      <BrigadierReportModal
        onClose={() => undefined}
        siteId="audit-site"
        siteName="Аудит"
        author={{ login: 'Dakaev', name: 'Дакаев' }}
        onSubmit={onSubmit}
      />,
    )

    fireEvent.click(screen.getByRole('checkbox', { name: /Установка бортового камня \(БК\) — бетон/ }))
    fireEvent.change(screen.getByLabelText(/Объём: Установка бортового камня/), {
      target: { value: '10' },
    })
    fireEvent.change(screen.getByLabelText(/Ответственный за смену/), {
      target: { value: '—' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить отчёт' }))

    expect(screen.getByText('Укажите ответственного за смену')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('исправление сохраняет автора и прежний объём', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(
      <BrigadierReportModal
        onClose={() => undefined}
        siteId="site-x"
        siteName="Аудит"
        author={{ login: 'Dakaev', name: 'Дакаев' }}
        initial={{
          id: 'rep-1',
          siteId: 'site-x',
          reportedAtIso: '2026-09-10T10:00:00.000Z',
          lines: [],
          problems: [],
          responsible: 'Иванов',
          authorLogin: 'Brigadier',
          authorName: 'Бригадир',
          comment: '',
          attachments: [],
          workEntries: [
            { id: 'w1', planNumber: '1.1', planTitle: 'Бетон', qty: 10, unit: 'm3' },
          ],
        }}
        onSubmit={onSubmit}
      />,
    )

    fireEvent.change(screen.getByLabelText(/Что исправляем/), {
      target: { value: 'Ошиблись в объёме' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить исправление' }))

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    const report = onSubmit.mock.calls[0]![0]
    expect(report.id).toBe('rep-1')
    expect(report.authorLogin).toBe('Brigadier')
    expect(report.revisions?.[0]?.workEntries[0]?.qty).toBe(10)
    expect(report.revisions?.[0]?.reason).toBe('Ошиблись в объёме')
  })
})
