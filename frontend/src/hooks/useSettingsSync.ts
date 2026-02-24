import { useEffect, useRef } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { settingsApi } from '../api/settings'
import { useCalendarStore, ScrollMode, ViewMode, FirstDayOfWeek } from '../store/calendarStore'
import { useAuthStore } from '../store/authStore'

/**
 * Synchronizuje ustawienia kalendarza z backendem:
 * - przy montowaniu: pobiera ustawienia i aplikuje do store
 * - przy zmianie ustawień w store: debounce 800ms, potem PUT /settings
 */
export function useSettingsSync() {
  const token = useAuthStore((s) => s.accessToken)
  const {
    scrollMode, viewMode, firstDayOfWeek, hourStart, hourEnd,
    setScrollMode, setViewMode, setFirstDayOfWeek, setHourStart, setHourEnd,
  } = useCalendarStore()

  const initializedRef = useRef(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Pobierz ustawienia z backendu (tylko gdy zalogowany)
  const { data: remoteSettings } = useQuery({
    queryKey: ['user-settings'],
    queryFn: settingsApi.get,
    enabled: !!token,
    staleTime: Infinity, // pobierz raz
  })

  // Aplikuj ustawienia z backendu do store (tylko raz po załadowaniu)
  useEffect(() => {
    if (!remoteSettings || initializedRef.current) return
    initializedRef.current = true

    setScrollMode(remoteSettings.scroll_mode as ScrollMode)
    setViewMode(remoteSettings.view_mode as ViewMode)
    setFirstDayOfWeek(remoteSettings.first_day_of_week as FirstDayOfWeek)
    setHourStart(remoteSettings.hour_start)
    setHourEnd(remoteSettings.hour_end)
  }, [remoteSettings])

  // Mutation do zapisu
  const saveMut = useMutation({ mutationFn: settingsApi.put })

  // Przy każdej zmianie ustawień — debounced PUT
  useEffect(() => {
    if (!token || !initializedRef.current) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveMut.mutate({
        scroll_mode: scrollMode,
        view_mode: viewMode,
        first_day_of_week: firstDayOfWeek,
        hour_start: hourStart,
        hour_end: hourEnd,
      })
    }, 800)

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [scrollMode, viewMode, firstDayOfWeek, hourStart, hourEnd, token])
}
