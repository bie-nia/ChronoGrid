import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { startOfWeek, addWeeks, subWeeks, addDays, subDays } from 'date-fns'
import type { IconSetId } from '../lib/iconSets'
import type { Event } from '../types'

// Ghost — podgląd eventu podczas dragu
export interface DragGhost {
  dayIndex: number
  startHour: number
  durationMin: number
  color: string
  icon: string
  title: string
}

export type ScrollMode = 'vertical' | 'horizontal'
export type CalendarView = 'week' | 'month' | 'year'
export type Theme = 'light' | 'dark'

// ── Undo stack ────────────────────────────────────────────────────────────────

export type UndoAction =
  | { type: 'create';  eventId: number }                            // cofnięcie = delete
  | { type: 'update';  eventId: number; before: Partial<Event> }   // cofnięcie = update z before
  | { type: 'delete';  event: Event }                              // cofnięcie = create

const MAX_UNDO = 20

interface UndoState {
  stack: UndoAction[]
  push: (action: UndoAction) => void
  pop: () => UndoAction | undefined
}

export const useUndoStore = create<UndoState>()((set, get) => ({
  stack: [],
  push: (action) =>
    set((s) => ({ stack: [action, ...s.stack].slice(0, MAX_UNDO) })),
  pop: () => {
    const [head, ...rest] = get().stack
    if (!head) return undefined
    set({ stack: rest })
    return head
  },
}))

/** Dynamiczny: zawsze zaczyna od wczoraj (dzień względem dziś)
 *  Statyczny: klasyczny tydzień z wybranym pierwszym dniem */
export type ViewMode = 'dynamic' | 'static'

/** 0 = Nd, 1 = Pn, 2 = Wt, 3 = Śr, 4 = Czw, 5 = Pt, 6 = Sb */
export type FirstDayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6

/** Oblicza weekStart na podstawie trybu i ustawień */
function computeWeekStart(viewMode: ViewMode, firstDayOfWeek: FirstDayOfWeek): Date {
  if (viewMode === 'dynamic') {
    return subDays(new Date(), 1) // wczoraj jako pierwszy dzień
  }
  return startOfWeek(new Date(), { weekStartsOn: firstDayOfWeek })
}

interface CalendarState {
  weekStart: Date
  selectedTemplateId: number | null
  dragGhost: DragGhost | null
  scrollMode: ScrollMode
  viewMode: ViewMode
  firstDayOfWeek: FirstDayOfWeek
  hourStart: number   // godzina początku dnia (0-23)
  hourEnd: number     // godzina końca dnia (1-24)
  calendarView: CalendarView // aktywny widok kalendarza
  hideContactNotes: boolean  // ukryj notatki kontaktu za pinem
  contactPinHash: string | null  // SHA-256 hash PINu/hasła (null = brak blokady)
  iconSet: IconSetId         // aktywna biblioteka ikon
  templateOrder: number[]    // kolejność aktywności (tablica ID)
  theme: Theme               // motyw: jasny / ciemny

  nextWeek: () => void
  prevWeek: () => void
  stepForward: (days: number) => void
  stepBack: (days: number) => void
  setWeekStart: (date: Date) => void
  goToToday: () => void
  setTemplate: (id: number | null) => void
  setDragGhost: (ghost: DragGhost | null) => void
  setScrollMode: (mode: ScrollMode) => void
  setViewMode: (mode: ViewMode) => void
  setFirstDayOfWeek: (day: FirstDayOfWeek) => void
  setHourStart: (h: number) => void
  setHourEnd: (h: number) => void
  setCalendarView: (view: CalendarView) => void
  setHideContactNotes: (v: boolean) => void
  setContactPinHash: (hash: string | null) => void
  setIconSet: (id: IconSetId) => void
  setTemplateOrder: (ids: number[]) => void
  setTheme: (theme: Theme) => void
}

export const useCalendarStore = create<CalendarState>()(
  persist(
    (set, get) => ({
      weekStart: computeWeekStart('dynamic', 1), // domyślny tryb = dynamic = wczoraj
      selectedTemplateId: null,
      dragGhost: null,
      scrollMode: 'vertical',
      viewMode: 'dynamic',
      firstDayOfWeek: 1,
      hourStart: 8,
      hourEnd: 22,
      calendarView: 'week' as CalendarView,
      hideContactNotes: false,
      contactPinHash: null,
      iconSet: 'emoji' as IconSetId,
      templateOrder: [],
      theme: 'light' as Theme,

      nextWeek: () => set((s) => ({ weekStart: addWeeks(s.weekStart, 1) })),
      prevWeek: () => set((s) => ({ weekStart: subWeeks(s.weekStart, 1) })),
      stepForward: (n) => set((s) => ({ weekStart: addDays(s.weekStart, n) })),
      stepBack: (n) => set((s) => ({ weekStart: subDays(s.weekStart, n) })),
      setWeekStart: (date) => set({ weekStart: date }),
      goToToday: () => {
        const { viewMode, firstDayOfWeek } = get()
        set({ weekStart: computeWeekStart(viewMode, firstDayOfWeek) })
      },
      setTemplate: (id) => set({ selectedTemplateId: id }),
      setDragGhost: (ghost) => set({ dragGhost: ghost }),
      setScrollMode: (mode) => set({ scrollMode: mode }),
      setViewMode: (mode) =>
        set((s) => ({
          viewMode: mode,
          weekStart: computeWeekStart(mode, s.firstDayOfWeek),
        })),
      setFirstDayOfWeek: (day) =>
        set((s) => ({
          firstDayOfWeek: day,
          weekStart: s.viewMode === 'static'
            ? startOfWeek(new Date(), { weekStartsOn: day })
            : s.weekStart,
        })),
      setHourStart: (h) => set({ hourStart: h }),
      setHourEnd: (h) => set({ hourEnd: h }),
      setCalendarView: (view) => set({ calendarView: view }),
      setHideContactNotes: (v) => set({ hideContactNotes: v }),
      setContactPinHash: (hash) => set({ contactPinHash: hash }),
      setIconSet: (id) => set({ iconSet: id }),
      setTemplateOrder: (ids) => set({ templateOrder: ids }),
      setTheme: (theme) => {
        set({ theme })
        document.documentElement.classList.toggle('dark', theme === 'dark')
      },
    }),
    {
      name: 'adhd-calendar-settings',
      // Persystujemy tylko ustawienia, nie stan tymczasowy
      partialize: (s) => ({
        scrollMode: s.scrollMode,
        viewMode: s.viewMode,
        firstDayOfWeek: s.firstDayOfWeek,
        hourStart: s.hourStart,
        hourEnd: s.hourEnd,
        calendarView: s.calendarView,
        hideContactNotes: s.hideContactNotes,
        contactPinHash: s.contactPinHash,
        iconSet: s.iconSet,
        templateOrder: s.templateOrder,
        theme: s.theme,
      }),
      // Po rehydracji — przelicz weekStart na podstawie zapisanego viewMode
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.weekStart = computeWeekStart(state.viewMode, state.firstDayOfWeek)
          // Widok dzienny został usunięty — cofnij do tygodniowego
          if ((state.calendarView as string) === 'day') state.calendarView = 'week'
          // Przywróć klasę dark na <html>
          document.documentElement.classList.toggle('dark', state.theme === 'dark')
        }
      },
    }
  )
)
