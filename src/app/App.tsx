import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

const HomePage = lazy(() =>
  import('../pages/HomePage').then((m) => ({ default: m.HomePage })),
)
const FleetHubPage = lazy(() =>
  import('../pages/FleetHubPage').then((m) => ({ default: m.FleetHubPage })),
)
const FleetCategoryPage = lazy(() =>
  import('../pages/FleetCategoryPage').then((m) => ({ default: m.FleetCategoryPage })),
)
const FleetVehiclePage = lazy(() =>
  import('../pages/FleetVehiclePage').then((m) => ({ default: m.FleetVehiclePage })),
)
const AddObjectPage = lazy(() =>
  import('../pages/AddObjectPage').then((m) => ({ default: m.AddObjectPage })),
)
const ObjectDetailPage = lazy(() =>
  import('../pages/ObjectDetailPage').then((m) => ({ default: m.ObjectDetailPage })),
)

function RouteFallback() {
  return (
    <div className="route-loading" role="status" aria-live="polite">
      <span className="route-loading__dot" aria-hidden />
      Загрузка…
    </div>
  )
}

export function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/spectehnika" element={<FleetHubPage />} />
        <Route path="/spectehnika/unit/:vehicleId" element={<FleetVehiclePage />} />
        <Route path="/spectehnika/:categoryId" element={<FleetCategoryPage />} />
        <Route path="/objects/new" element={<AddObjectPage />} />
        <Route path="/objects/:siteId" element={<ObjectDetailPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
