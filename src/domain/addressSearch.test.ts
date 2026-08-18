import { describe, expect, it } from 'vitest'
import { parseNominatimReverse, parseNominatimSearch } from './addressSearch'

describe('addressSearch', () => {
  it('собирает короткий адрес из ответа Nominatim', () => {
    const hits = parseNominatimSearch([
      {
        lat: '55.501',
        lon: '37.56',
        display_name: 'улица Вокзальная, 12, Щербинка, Москва, Россия',
        address: {
          road: 'улица Вокзальная',
          house_number: '12',
          city: 'Щербинка',
        },
      },
    ])
    expect(hits).toEqual([
      { label: 'улица Вокзальная, 12, Щербинка', lat: 55.501, lng: 37.56 },
    ])
  })

  it('обратный геокодер отдаёт ту же подпись', () => {
    expect(
      parseNominatimReverse({
        display_name: 'длинная строка',
        address: { road: 'Брусилова', house_number: '1', city: 'Москва' },
      }),
    ).toBe('Брусилова, 1, Москва')
  })
})
