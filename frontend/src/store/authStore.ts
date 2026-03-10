import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  isDemo: boolean
  setTokens: (accessToken: string, refreshToken: string) => void
  setAccessToken: (accessToken: string) => void
  setDemo: (v: boolean) => void
  logout: () => void
  isAuthenticated: () => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      isDemo: false,

      setTokens: (accessToken, refreshToken) => {
        localStorage.setItem('access_token', accessToken)
        localStorage.setItem('refresh_token', refreshToken)
        set({ accessToken, refreshToken })
      },

      setAccessToken: (accessToken) => {
        localStorage.setItem('access_token', accessToken)
        set({ accessToken })
      },

      setDemo: (v: boolean) => set({ isDemo: v }),

      logout: () => {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        set({ accessToken: null, refreshToken: null, isDemo: false })
      },

      isAuthenticated: () => !!get().accessToken || get().isDemo,
    }),
    {
      name: 'auth-store',
      // isDemo nigdy nie trafia do localStorage — resetuje się przy odświeżeniu strony
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      }),
    },
  ),
)
