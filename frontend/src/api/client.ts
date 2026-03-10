import axios, { AxiosError } from 'axios'
import { useAuthStore } from '../store/authStore'

export const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export const api = axios.create({
  baseURL: `${BASE_URL}/api/v1`,
  headers: { 'Content-Type': 'application/json' },
})

// ── Request interceptor — dołącz access token ────────────────────────────────
api.interceptors.request.use((config) => {
  const stored = localStorage.getItem('access_token')
  if (stored) {
    config.headers.Authorization = `Bearer ${stored}`
  }
  return config
})

// ── Response interceptor — obsługa 401 z automatycznym refresh ───────────────
let isRefreshing = false
let failedQueue: Array<{
  resolve: (value: string) => void
  reject: (reason: unknown) => void
}> = []

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (token) resolve(token)
    else reject(error)
  })
  failedQueue = []
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const originalRequest = error.config as typeof error.config & { _retry?: boolean }

    // Jeśli 401 i nie próbowaliśmy jeszcze odświeżyć
    if (error.response?.status === 401 && !originalRequest?._retry) {
      const refreshToken = localStorage.getItem('refresh_token')

      // Tryb demo — nie wylogowuj, ignoruj 401
      if (useAuthStore.getState().accessToken === 'demo-token') {
        return Promise.reject(error)
      }

      // Brak refresh tokenu — wyloguj od razu
      if (!refreshToken) {
        useAuthStore.getState().logout()
        return Promise.reject(error)
      }

      // Jeśli już trwa refresh — kolejkuj żądania
      if (isRefreshing) {
        return new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        }).then((newAccessToken) => {
          if (originalRequest) {
            originalRequest.headers = originalRequest.headers ?? {}
            originalRequest.headers['Authorization'] = `Bearer ${newAccessToken}`
          }
          return api(originalRequest!)
        })
      }

      originalRequest!._retry = true
      isRefreshing = true

      try {
        // Odśwież tokeny
        const response = await axios.post(`${BASE_URL}/api/v1/auth/refresh`, {
          refresh_token: refreshToken,
        })
        const { access_token, refresh_token: new_refresh } = response.data

        useAuthStore.getState().setTokens(access_token, new_refresh)
        processQueue(null, access_token)

        // Ponów oryginalne żądanie z nowym tokenem
        if (originalRequest) {
          originalRequest.headers = originalRequest.headers ?? {}
          originalRequest.headers['Authorization'] = `Bearer ${access_token}`
        }
        return api(originalRequest!)
      } catch (refreshError) {
        processQueue(refreshError, null)
        useAuthStore.getState().logout()
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  },
)
