import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MOSCOW_MAP_CENTER } from '../../domain/siteDeliveryPoint'
import styles from './DeliveryPointMap.module.css'

type Props = {
  lat: number | null
  lng: number | null
  /** Вторая метка (погрузка) — синяя. */
  accentLat?: number | null
  accentLng?: number | null
  /** Если false — клики по карте не принимают. */
  editable?: boolean
  /** Можно ли тащить основную (красную) метку. */
  draggable?: boolean
  /** Можно ли тащить синюю метку погрузки. */
  accentDraggable?: boolean
  compact?: boolean
  /** Растянуть на всю высоту родителя (один экран карты). */
  fill?: boolean
  ariaLabel?: string
  onPick?: (lat: number, lng: number) => void
  /** Перенос синей метки (погрузка). */
  onAccentPick?: (lat: number, lng: number) => void
}

function makeIcon(accent: boolean) {
  return L.divIcon({
    className: styles.pinWrap,
    html: `<span class="${accent ? styles.pinAccent : styles.pin}"></span>`,
    iconSize: [28, 40],
    iconAnchor: [14, 38],
  })
}

export function DeliveryPointMap({
  lat,
  lng,
  accentLat = null,
  accentLng = null,
  editable = true,
  draggable,
  accentDraggable = false,
  compact = false,
  fill = false,
  ariaLabel = 'Карта',
  onPick,
  onAccentPick,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const accentRef = useRef<L.Marker | null>(null)
  const onPickRef = useRef(onPick)
  const onAccentPickRef = useRef(onAccentPick)
  const editableRef = useRef(editable)
  const canDrag = draggable ?? editable

  useEffect(() => {
    onPickRef.current = onPick
  }, [onPick])

  useEffect(() => {
    onAccentPickRef.current = onAccentPick
  }, [onAccentPick])

  useEffect(() => {
    editableRef.current = editable
  }, [editable])

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
    map.setView(start, lat != null ? 16 : 11)

    map.on('click', (e: L.LeafletMouseEvent) => {
      if (!editableRef.current) return
      onPickRef.current?.(e.latlng.lat, e.latlng.lng)
    })

    mapRef.current = map
    const syncSize = () => map.invalidateSize({ animate: false })
    const t = window.setTimeout(syncSize, 0)
    const t2 = window.setTimeout(syncSize, 200)
    const t3 = window.setTimeout(syncSize, 600)
    const ro = new ResizeObserver(syncSize)
    ro.observe(el)

    return () => {
      window.clearTimeout(t)
      window.clearTimeout(t2)
      window.clearTimeout(t3)
      ro.disconnect()
      map.remove()
      mapRef.current = null
      markerRef.current = null
      accentRef.current = null
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
    const icon = makeIcon(false)

    if (!markerRef.current) {
      const marker = L.marker(here, { icon, draggable: canDrag })
      marker.addTo(map)
      marker.on('dragend', () => {
        const p = marker.getLatLng()
        onPickRef.current?.(p.lat, p.lng)
      })
      markerRef.current = marker
    } else {
      markerRef.current.setLatLng(here)
      markerRef.current.setIcon(icon)
      if (markerRef.current.dragging) {
        if (canDrag) markerRef.current.dragging.enable()
        else markerRef.current.dragging.disable()
      }
    }

    const z = map.getZoom()
    map.setView(here, z < 14 ? 16 : z, { animate: true })
  }, [lat, lng, canDrag])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (accentLat == null || accentLng == null) {
      accentRef.current?.remove()
      accentRef.current = null
      return
    }

    const here = L.latLng(accentLat, accentLng)
    const icon = makeIcon(true)

    if (!accentRef.current) {
      const marker = L.marker(here, {
        icon,
        draggable: accentDraggable,
        interactive: true,
      })
      marker.addTo(map)
      marker.on('dragend', () => {
        const p = marker.getLatLng()
        onAccentPickRef.current?.(p.lat, p.lng)
      })
      accentRef.current = marker
    } else {
      accentRef.current.setLatLng(here)
      accentRef.current.setIcon(icon)
      if (accentRef.current.dragging) {
        if (accentDraggable) accentRef.current.dragging.enable()
        else accentRef.current.dragging.disable()
      }
    }
  }, [accentLat, accentLng, accentDraggable])

  return (
    <div className={`${styles.frame} ${compact ? styles.compact : ''} ${fill ? styles.fill : ''}`}>
      <div ref={rootRef} className={styles.map} role="application" aria-label={ariaLabel} />
    </div>
  )
}
