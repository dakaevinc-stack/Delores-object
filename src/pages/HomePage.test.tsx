import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { HomePage } from './HomePage'
import { ObjectsHubPage } from './ObjectsHubPage'
import { clearLocalSession } from '../lib/localSession'
import { signOutLocalSession } from '../lib/useLocalSession'

describe('Маршрут главной', () => {
  afterEach(() => {
    signOutLocalSession()
    clearLocalSession()
  })

  it('без сессии показывает бренд и форму, без хабов и объектов', () => {
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
    expect(screen.queryByRole('heading', { name: 'Объекты' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Открыть парк техники/i)).not.toBeInTheDocument()
  })

  it('после входа показывает хабы и ведёт в список объектов по ссылке', async () => {
    vi.useFakeTimers()

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/objects" element={<ObjectsHubPage />} />
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
      expect(screen.getByRole('heading', { name: 'Объекты' })).toBeInTheDocument()
    })

    expect(screen.getByLabelText(/Открыть парк техники/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Открыть панель приёмки/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/Поиск и фильтры по списку/i)).not.toBeInTheDocument()

    fireEvent.click(screen.getByLabelText(/Открыть список объектов/i))

    await waitFor(() => {
      expect(screen.getByLabelText(/Поиск и фильтры по списку/i)).toBeInTheDocument()
    })
    expect(screen.getByRole('heading', { level: 1, name: 'Объекты' })).toBeInTheDocument()
  })
})
