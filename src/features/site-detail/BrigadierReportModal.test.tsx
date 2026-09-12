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
        onSubmit={onSubmit}
      />,
    )

    fireEvent.click(screen.getByRole('checkbox', { name: /Установка бортового камня \(БК\) — бетон/ }))
    fireEvent.change(screen.getByLabelText(/Объём: Установка бортового камня/), {
      target: { value: '-5' },
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
        onSubmit={onSubmit}
      />,
    )

    fireEvent.click(screen.getByRole('checkbox', { name: /Установка бортового камня \(БК\) — бетон/ }))
    fireEvent.change(screen.getByLabelText(/Объём: Установка бортового камня/), {
      target: { value: '10,5' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить отчёт' }))

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    const report = onSubmit.mock.calls[0]![0]
    expect(report.lines[0]?.text).toMatch(/10\.5/)
    expect(report.lines[0]?.text).not.toMatch(/-5/)
  })
})
