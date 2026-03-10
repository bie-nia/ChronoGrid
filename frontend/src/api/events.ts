import { api, BASE_URL } from './client'
import { Event } from '../types'

// Implementacja — podmieniana w trybie demo
export const _eventsImpl = {
  list: async (weekStart?: string, days?: number): Promise<Event[]> => {
    const params: Record<string, string | number> = {}
    if (weekStart) params.week_start = weekStart
    if (days) params.days = days
    const res = await api.get<Event[]>('/events', { params })
    return res.data
  },

  listAll: async (): Promise<Event[]> => {
    const res = await api.get<Event[]>('/events')
    return res.data
  },

  listMonth: async (monthStart: string): Promise<Event[]> => {
    const res = await api.get<Event[]>('/events', { params: { week_start: monthStart, days: 42 } })
    return res.data
  },

  listYear: async (yearStart: string): Promise<Event[]> => {
    const res = await api.get<Event[]>('/events', { params: { week_start: yearStart, days: 366 } })
    return res.data
  },

  create: async (data: Partial<Event>): Promise<Event> => {
    const res = await api.post<Event>('/events', data)
    return res.data
  },

  update: async (id: number, data: Partial<Event>): Promise<Event> => {
    const res = await api.put<Event>(`/events/${id}`, data)
    return res.data
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/events/${id}`)
  },

  createFromTask: async (taskId: number, data: Partial<Event>): Promise<Event> => {
    const res = await api.post<Event>(`/events/from-task/${taskId}`, data)
    return res.data
  },

  createRecurring: async (data: {
    title: string; start_datetime: string; end_datetime: string
    description?: string; location?: string; activity_template_id?: number
    interval_days: number; occurrences: number
  }): Promise<Event[]> => {
    const res = await api.post<Event[]>('/events/recurring', data)
    return res.data
  },

  exportIcs: async (fromDate?: string, toDate?: string): Promise<void> => {
    const params = new URLSearchParams()
    if (fromDate) params.set('from_date', fromDate)
    if (toDate) params.set('to_date', toDate)
    const token = localStorage.getItem('access_token')
    const url = `${BASE_URL}/api/v1/events/export.ics${params.toString() ? '?' + params.toString() : ''}`
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!resp.ok) throw new Error('Błąd eksportu')
    const blob = await resp.blob()
    const objUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objUrl; a.download = 'adhd-calendar.ics'; a.click()
    URL.revokeObjectURL(objUrl)
  },

  importIcs: async (file: File): Promise<{ imported: number; skipped: number }> => {
    const formData = new FormData()
    formData.append('file', file)
    const res = await api.post<{ imported: number; skipped: number; event_ids: number[] }>(
      '/events/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } },
    )
    return res.data
  },
}

// Proxy — każde wywołanie zawsze idzie przez aktualną implementację w _eventsImpl
// Dzięki temu podmiana _eventsImpl.create w demo działa nawet gdy queryFn/mutationFn
// skopiowały referencję do eventsApi.create przy montowaniu komponentu.
export const eventsApi = new Proxy(_eventsImpl, {
  get(target, prop) {
    return (...args: unknown[]) => (target[prop as keyof typeof target] as (...a: unknown[]) => unknown)(...args)
  },
}) as typeof _eventsImpl
