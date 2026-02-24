import { api } from './client'
import { Event } from '../types'

export const eventsApi = {
  list: async (weekStart?: string, days?: number): Promise<Event[]> => {
    const params: Record<string, string | number> = {}
    if (weekStart) params.week_start = weekStart
    if (days) params.days = days
    const res = await api.get<Event[]>('/events', { params })
    return res.data
  },

  // Pobierz wszystkie eventy użytkownika (bez filtra dat) — dla TODO panel w Eisenhower
  listAll: async (): Promise<Event[]> => {
    const res = await api.get<Event[]>('/events')
    return res.data
  },

  // Pobierz eventy dla widoku miesiąca (month_start = pierwszy dzień miesiąca, days=42 = 6 tygodni)
  listMonth: async (monthStart: string): Promise<Event[]> => {
    const res = await api.get<Event[]>('/events', { params: { week_start: monthStart, days: 42 } })
    return res.data
  },

  // Pobierz eventy dla widoku roku (year_start = 1 stycznia, days=366)
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
    title: string
    start_datetime: string
    end_datetime: string
    description?: string
    location?: string
    activity_template_id?: number
    interval_days: number
    occurrences: number
  }): Promise<Event[]> => {
    const res = await api.post<Event[]>('/events/recurring', data)
    return res.data
  },
}
