import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { FleetAddVehicleModal } from './FleetAddVehicleModal'

describe('FleetAddVehicleModal — страховка', () => {
  it('не выдумывает срок ОСАГО, если дату не вводили', () => {
    const onCreate = vi.fn()
    render(<FleetAddVehicleModal open onClose={() => undefined} onCreate={onCreate} />)

    fireEvent.change(screen.getByLabelText('Госномер'), { target: { value: 'А123АА777' } })
    fireEvent.change(screen.getByLabelText('Модель'), { target: { value: 'КАМАЗ-65115' } })
    fireEvent.change(screen.getByLabelText('VIN / рама'), { target: { value: 'XTA21213000000001' } })
    expect(screen.getByText(/Нет данных/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Добавить в парк' }))

    expect(onCreate).toHaveBeenCalledTimes(1)
    const vehicle = onCreate.mock.calls[0]![0]
    expect(vehicle.insurance.validUntilIso).toBeUndefined()
  })
})
