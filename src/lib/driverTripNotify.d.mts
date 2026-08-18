export function normalizeDriverName(name: string): string

export function namesMatchDriver(tripName: string, driverName: string): boolean

export function yandexMapsRouteUrl(point: { lat: number; lng: number }): string

export function formatDriverTripNotifyText(trip: {
  siteName?: string
  vehiclePlate?: string
  driverName?: string
  cargoNote?: string
  pickup?: { address?: string; hint?: string }
  cargo?: Array<{ title?: string; quantity?: number | null; unitLabel?: string }>
  point?: {
    lat?: number
    lng?: number
    address?: string
    hint?: string
  }
}): string

export type DriverTelegramCommand =
  | { type: 'stop' }
  | { type: 'start' }
  | { type: 'bind'; name: string }
  | { type: 'help' }

export function parseDriverTelegramCommand(text: string): DriverTelegramCommand | null
