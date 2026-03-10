/**
 * DemoPage — automatycznie loguje na konto demo i przekierowuje do /app.
 * Backend tworzy konto demo przy starcie i resetuje dane co godzinę.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import { useAuthStore } from '../../store/authStore'

export function DemoPage() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loginDemo() {
      try {
        const res = await api.post<{ access_token: string; refresh_token: string }>(
          '/auth/demo',
        )
        if (cancelled) return
        const { access_token, refresh_token } = res.data
        useAuthStore.getState().setTokens(access_token, refresh_token)
        useAuthStore.getState().setDemo(true)
        navigate('/app', { replace: true })
      } catch {
        if (!cancelled) setError('Nie udało się uruchomić demo. Spróbuj ponownie.')
      }
    }

    loginDemo()
    return () => { cancelled = true }
  }, [navigate])

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-red-600 font-semibold">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700"
        >
          Spróbuj ponownie
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-500">Uruchamiam demo…</p>
      </div>
    </div>
  )
}
