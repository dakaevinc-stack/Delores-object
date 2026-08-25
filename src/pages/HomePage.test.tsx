import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { HomePage } from './HomePage'
import { clearLocalSession } from '../lib/localSession'
import { signOutLocalSession } from '../lib/useLocalSession'

describe('Маршрут главной', () => {
  afterEach(() => {
    signOutLocalSession()
    clearLocalSession()
  })

  it('без сессии показывает бренд и форму, без KPI и объектов', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<HomePage />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(
      screen.getByRole('img', { name: /Деловые Решения/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 1, name: /Вход в систему/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('form', { name: /Вход в систему/i }),
    ).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Логин')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Пароль')).toBeInTheDocument()
    expect(screen.queryByText('Действующие объекты')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Открыть парк техники/i)).not.toBeInTheDocument()
  })

  it('после входа показывает KPI и объекты', async () => {
    Element.prototype.scrollIntoView = vi.fn()
    vi.useFakeTimers()

    const { container } = render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<HomePage />} />
        </Routes>
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByPlaceholderText('Логин'), {
      target: { value: 'Dakaev' },
    })
    fireEvent.change(screen.getByPlaceholderText('Пароль'), {
      target: { value: 'Ameda095' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Войти/i }))

    await act(async () => {
      vi.advanceTimersByTime(250)
    })
    vi.useRealTimers()

    await waitFor(() => {
      expect(screen.getByText('Действующие объекты')).toBeInTheDocument()
    })

    const kpiNormal = container.querySelector(
      'button[data-kpi-status="normal"]',
    )
    expect(kpiNormal).toBeTruthy()
    fireEvent.click(kpiNormal!)

    expect(
      screen.getByRole('tab', { name: 'Нормально' }),
    ).toHaveAttribute('aria-selected', 'true')
    expect(kpiNormal).toHaveAttribute('aria-pressed', 'true')
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
  })
})
