import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import { useCalendarStore } from './store/calendarStore'
import { LoginPage } from './components/ui/LoginPage'
import { AppLayout } from './components/ui/AppLayout'
import { LandingPage } from './components/ui/LandingPage'
import { DemoPage } from './components/ui/DemoPage'

/** Guard: przekieruj do /login jeśli nie zalogowany */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.accessToken)
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

/** Guard: jeśli zalogowany (ale nie demo) → /app */
function PublicOnly({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.accessToken)
  const isDemo = useAuthStore((s) => s.isDemo)
  if (token && !isDemo) return <Navigate to="/app" replace />
  return <>{children}</>
}

export default function App() {
  const theme = useCalendarStore((s) => s.theme)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  return (
    <Routes>
      {/* Strona powitalna */}
      <Route path="/" element={<LandingPage />} />

      {/* Demo — auto-login na konto demo, przekierowanie do /app */}
      <Route path="/demo" element={<DemoPage />} />

      {/* Logowanie — jeśli już zalogowany → /app */}
      <Route
        path="/login"
        element={
          <PublicOnly>
            <LoginPage />
          </PublicOnly>
        }
      />

      {/* Aplikacja — wymaga logowania */}
      <Route
        path="/app"
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      />

      {/* Stara trasa / fallback dla zalogowanych */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
