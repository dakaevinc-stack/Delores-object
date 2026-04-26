import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { HomePage } from './HomePage'

describe('Маршрут главной', () => {
  it('рендерит заголовок «Деловые Решения»', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<HomePage />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(
      screen.getByRole('heading', { level: 1, name: /Деловые Решения/i }),
    ).toBeInTheDocument()
  })
})
