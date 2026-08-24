import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { HomePage } from './HomePage'

describe('Маршрут главной', () => {
  it('рендерит бренд и форму входа', () => {
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
      screen.getByRole('heading', { level: 1, name: /Управленческий обзор/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('form', { name: /Вход в систему/i }),
    ).toBeInTheDocument()
  })
})
