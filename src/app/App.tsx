import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { LoginIntroHost } from '../features/home/LoginIntroHost'
import { RequireAuth, RequireFleetAccess } from './RequireAuth'

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
const DriverCabinetPage = lazy(() =>
  import('../pages/DriverCabinetPage').then((m) => ({ default: m.DriverCabinetPage })),
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
      <LoginIntroHost />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route
          path="/spectehnika"
          element={
            <RequireAuth>
              <RequireFleetAccess>
                <FleetHubPage />
              </RequireFleetAccess>
            </RequireAuth>
          }
        />
        <Route
          path="/spectehnika/unit/:vehicleId"
          element={
            <RequireAuth>
              <RequireFleetAccess>
                <FleetVehiclePage />
              </RequireFleetAccess>
            </RequireAuth>
          }
        />
        <Route
          path="/spectehnika/:categoryId"
          element={
            <RequireAuth>
              <RequireFleetAccess>
                <FleetCategoryPage />
              </RequireFleetAccess>
            </RequireAuth>
          }
        />
        <Route
          path="/objects/new"
          element={
            <RequireAuth>
              <AddObjectPage />
            </RequireAuth>
          }
        />
        <Route
          path="/objects/:siteId"
          element={
            <RequireAuth>
              <ObjectDetailPage />
            </RequireAuth>
          }
        />
        <Route
          path="/driver"
          element={
            <RequireAuth>
              <DriverCabinetPage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
