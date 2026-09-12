import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { FleetVehiclePage } from './FleetVehiclePage'
import { FLEET_VEHICLES } from '../data/fleet.mock'

/**
 * Дымовой рендер карточек техники на реальных данных из учётных таблиц.
 * Данные там неполные по своей природе (у части машин нет срока ОСАГО,
 * у прицепов его не должно быть вовсе), и страница обязана это переживать
 * и честно писать «нет данных», а не падать и не показывать «в норме».
 */

function renderVehicle(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/spectehnika/unit/${id}`]}>
      <Routes>
        <Route path="/spectehnika/unit/:vehicleId" element={<FleetVehiclePage />} />
      </Routes>
    </MemoryRouter>,
  )
}

function byPlate(plate: string) {
  const vehicle = FLEET_VEHICLES.find((v) => v.plate === plate)
  if (!vehicle) throw new Error(`в парке нет машины ${plate}`)
  return vehicle
}

describe('Карточка техники на данных из таблиц', () => {
  it('машина с полным набором документов открывается', () => {
    const v = byPlate('К 877 ТУ 799')
    renderVehicle(v.id)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/КАМАЗ/i)
    expect(screen.getByText(v.vinOrFrame)).toBeInTheDocument()
    // полис из таблицы, а не выдуманный
    expect(screen.getAllByText(/ХХХ 0691473369/).length).toBeGreaterThan(0)
  })

  it('без срока ОСАГО пишет «нет данных», а не «в норме»', () => {
    const v = FLEET_VEHICLES.find(
      (x) => !x.insurance.notRequired && !x.insurance.validUntilIso,
    )
    expect(v, 'в парке должна быть машина без срока ОСАГО — иначе проверка бессмысленна').toBeDefined()
    renderVehicle(v!.id)

    expect(screen.getAllByText(/Нет данных/i).length).toBeGreaterThan(0)
    expect(screen.queryByText('В норме')).not.toBeInTheDocument()
  })

  it('у прицепа ОСАГО показано как «не требуется»', () => {
    const v = FLEET_VEHICLES.find((x) => x.insurance.notRequired)
    expect(v).toBeDefined()
    renderVehicle(v!.id)

    expect(screen.getAllByText(/Не требуется/i).length).toBeGreaterThan(0)
  })

  it('спецтехника показывает наработку, а не пробег', () => {
    const v = FLEET_VEHICLES.find(
      (x) => x.categoryId === 'excavators' && x.specs?.engineHours != null,
    )
    expect(v).toBeDefined()
    renderVehicle(v!.id)

    expect(screen.getByText('Наработка')).toBeInTheDocument()
    expect(screen.queryByText('Пробег')).not.toBeInTheDocument()
  })

  it('отметка из учётной таблицы видна в карточке', () => {
    const v = FLEET_VEHICLES.find((x) => (x.notes ?? '').includes('нерабочем'))
    expect(v, 'в таблице есть машина с отметкой про двигатель').toBeDefined()
    renderVehicle(v!.id)

    expect(screen.getByText(/Отметка в учёте/i)).toBeInTheDocument()
  })

  /* Тяжёлая проверка: рендерит весь парк, поэтому лимит времени свой. */
  it(
    'открываются все 80 карточек парка',
    () => {
      for (const v of FLEET_VEHICLES) {
        const { unmount } = renderVehicle(v.id)
        expect(screen.getByRole('heading', { level: 1 }), v.plate).toBeInTheDocument()
        unmount()
      }
    },
    30_000,
  )
})
