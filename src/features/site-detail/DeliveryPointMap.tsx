import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MOSCOW_MAP_CENTER } from '../../domain/siteDeliveryPoint'
import styles from './DeliveryPointMap.module.css'

type Props = {
  lat: number | null
  lng: number | null
  /** Если false — только смотрим, пин не двигаем. */
  editable?: boolean
  compact?: boolean
  onPick?: (lat: number, lng: number) => void
}

export function DeliveryPointMap({ lat, lng, editable = true, compact = false, onPick }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const onPickRef = useRef(onPick)

  useEffect(() => {
    onPickRef.current = onPick
  }, [onPick])

  useEffect(() => {
    const el = rootRef.current
    if (!el) return

    const map = L.map(el, {
      zoomControl: true,
      attributionControl: true,
    })
    map.attributionControl.setPrefix(false)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map)

    const start =
      lat != null && lng != null
        ? L.latLng(lat, lng)
        : L.latLng(MOSCOW_MAP_CENTER.lat, MOSCOW_MAP_CENTER.lng)
    map.setView(start, lat != null ? 16 : 10)

    map.on('click', (e: L.LeafletMouseEvent) => {
      if (!editable) return
      onPickRef.current?.(e.latlng.lat, e.latlng.lng)
    })

    mapRef.current = map
    const t = window.setTimeout(() => map.invalidateSize(), 80)

    return () => {
      window.clearTimeout(t)
      map.remove()
      mapRef.current = null
      markerRef.current = null
    }
    // Карту создаём один раз; координаты двигают маркер отдельным эффектом.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (lat == null || lng == null) {
      markerRef.current?.remove()
      markerRef.current = null
      return
    }

    const here = L.latLng(lat, lng)
    const icon = L.divIcon({
      className: styles.pinWrap,
      html: `<span class="${styles.pin}"></span>`,
      iconSize: [28, 40],
      iconAnchor: [14, 38],
    })

    if (!markerRef.current) {
      const marker = L.marker(here, { icon, draggable: editable })
      marker.addTo(map)
      marker.on('dragend', () => {
        const p = marker.getLatLng()
        onPickRef.current?.(p.lat, p.lng)
      })
      markerRef.current = marker
    } else {
      markerRef.current.setLatLng(here)
      if (markerRef.current.dragging) {
        if (editable) markerRef.current.dragging.enable()
        else markerRef.current.dragging.disable()
      }
    }

    const z = map.getZoom()
    map.setView(here, z < 14 ? 16 : z, { animate: true })
  }, [lat, lng, editable])

  return (
    <div className={`${styles.frame} ${compact ? styles.compact : ''}`}>
      <div ref={rootRef} className={styles.map} role="application" aria-label="Карта точки разгрузки" />
    </div>
  )
}
