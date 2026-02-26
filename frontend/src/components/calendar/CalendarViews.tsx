/**
 * CalendarViews — widoki: miesiac, rok
 * Uzywane przez WeeklyCalendar gdy calendarView !== 'week'
 */

import {
  format, addDays,
  startOfMonth, endOfMonth, startOfWeek, isSameDay, isSameMonth,
  parseISO, isToday, getMonth, getYear, eachDayOfInterval,
} from 'date-fns'
import { pl } from 'date-fns/locale'
import { useQuery } from '@tanstack/react-query'
import { eventsApi } from '../../api/events'
import { Event } from '../../types'
import { useCalendarStore } from '../../store/calendarStore'
import { IconRenderer } from '../ui/IconRenderer'

// ── Helpers ───────────────────────────────────────────────────────────────────

function eventColor(ev: Event): string {
  return ev.color ?? ev.activity_template?.color ?? '#6366f1'
}

function eventIcon(ev: Event): string {
  return ev.icon ?? ev.activity_template?.icon ?? '📅'
}

function eventTitle(ev: Event): string {
  return ev.title
}

// ─────────────────────────────────────────────────────────────────────────────
// WIDOK MIESIACA
// ─────────────────────────────────────────────────────────────────────────────
const WEEKDAYS = ['Pn', 'Wt', 'Sr', 'Czw', 'Pt', 'Sob', 'Nd']

export function MonthView({
  anchorDate,
  onDayClick,
}: {
  anchorDate: Date
  onDayClick: (d: Date) => void
}) {
  const { iconSet } = useCalendarStore()
  const monthStart = startOfMonth(anchorDate)
  // Pierwszy dzien siatki — poniedzialek tygodnia zawierajacego 1. dzien miesiaca
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const monthEnd = endOfMonth(anchorDate)
  // Ostatni dzien siatki — niedziela tygodnia zawierajacego ostatni dzien miesiaca
  const gridEnd = startOfWeek(addDays(monthEnd, 7 - 1), { weekStartsOn: 1 })
  const gridDays = eachDayOfInterval({ start: gridStart, end: addDays(gridEnd, 6) }).slice(0, 42)

  const monthStartStr = format(gridStart, 'yyyy-MM-dd')

  const { data: events = [] } = useQuery({
    queryKey: ['events-month', format(anchorDate, 'yyyy-MM')],
    queryFn: () => eventsApi.listMonth(monthStartStr),
  })

  const eventsForDay = (day: Date) =>
    events.filter(
      (e) => isSameDay(parseISO(e.start_datetime), day) && !e.is_background
    )

  return (
    <div className="flex flex-col flex-1 min-h-0 p-3 gap-1">
      {/* Naglowki dni tygodnia */}
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-center text-[11px] font-medium text-gray-400 py-1">{d}</div>
        ))}
      </div>

      {/* Siatka dni */}
      <div className="grid grid-cols-7 flex-1 min-h-0 gap-px bg-gray-100 rounded-xl overflow-hidden">
        {gridDays.map((day) => {
          const dayEvs = eventsForDay(day)
          const inMonth = isSameMonth(day, anchorDate)
          const today = isToday(day)
          // Zbierz unikalne kolory aktywnosci dla tego dnia
          const colors = [...new Set(dayEvs.map(eventColor))].slice(0, 5)

          return (
            <div
              key={day.toISOString()}
              onClick={() => onDayClick(day)}
              className={`bg-white flex flex-col p-1.5 cursor-pointer hover:bg-indigo-50 transition-colors min-h-[80px] ${!inMonth ? 'opacity-40' : ''}`}
            >
              {/* Numer dnia */}
              <div className={`text-xs font-semibold mb-1 w-6 h-6 flex items-center justify-center rounded-full ${
                today ? 'bg-indigo-600 text-white' : 'text-gray-700'
              }`}>
                {format(day, 'd')}
              </div>

              {/* Paski kolorow aktywnosci */}
              {colors.length > 0 && (
                <div className="flex gap-0.5 flex-wrap mb-1">
                  {colors.map((c, i) => (
                    <div key={i} className="h-1.5 rounded-full flex-1 min-w-[8px] max-w-[24px]" style={{ backgroundColor: c }} />
                  ))}
                </div>
              )}

              {/* Lista eventow (max 3) */}
              <div className="flex flex-col gap-0.5 overflow-hidden">
                {dayEvs.slice(0, 3).map((ev) => (
                  <div
                    key={ev.id}
                    className="flex items-center gap-0.5 rounded px-1 py-0.5"
                    style={{ backgroundColor: eventColor(ev) + '22' }}
                  >
                    <IconRenderer icon={eventIcon(ev)} size={9} iconSet={iconSet} />
                    <span className="text-[10px] truncate font-medium" style={{ color: eventColor(ev) }}>
                      {eventTitle(ev)}
                    </span>
                  </div>
                ))}
                {dayEvs.length > 3 && (
                  <span className="text-[10px] text-gray-400 pl-1">+{dayEvs.length - 3}</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// WIDOK ROKU
// ─────────────────────────────────────────────────────────────────────────────
const MONTH_NAMES_SHORT = [
  'Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze',
  'Lip', 'Sie', 'Wrz', 'Paz', 'Lis', 'Gru',
]

function MiniMonth({
  year,
  monthIndex,
  events,
  onDayClick,
}: {
  year: number
  monthIndex: number
  events: Event[]
  onDayClick: (d: Date) => void
}) {
  const monthDate = new Date(year, monthIndex, 1)
  const gridStart = startOfWeek(monthDate, { weekStartsOn: 1 })
  const monthEnd = endOfMonth(monthDate)
  const days = eachDayOfInterval({ start: gridStart, end: addDays(endOfMonth(monthDate), 6 - monthEnd.getDay() || 7) })
    .slice(0, 35)

  const eventsForDay = (day: Date) =>
    events.filter((e) => isSameDay(parseISO(e.start_datetime), day) && !e.is_background)

  // 5 wierszy dni + 1 wiersz nagłówków = 6 wierszy
  const rowCount = days.length / 7  // 5
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="text-xs font-semibold text-gray-600 mb-1 text-center shrink-0">
        {MONTH_NAMES_SHORT[monthIndex]}
      </div>
      {/* Nagłówki dni tygodnia */}
      <div className="grid grid-cols-7 shrink-0">
        {['P','W','S','C','Pi','So','N'].map((d) => (
          <div key={d} className="text-center text-[8px] text-gray-400 pb-0.5">{d}</div>
        ))}
      </div>
      {/* Siatka dni — rozciąga się na całą dostępną wysokość */}
      <div
        className="grid grid-cols-7 flex-1 min-h-0"
        style={{ gridTemplateRows: `repeat(${rowCount}, 1fr)` }}
      >
        {days.map((day) => {
          const inMonth = getMonth(day) === monthIndex && getYear(day) === year
          const dayEvs = eventsForDay(day)
          const colors = [...new Set(dayEvs.map(eventColor))].slice(0, 3)
          const today = isToday(day)

          return (
            <div
              key={day.toISOString()}
              onClick={() => inMonth && onDayClick(day)}
              className={`flex flex-col items-center justify-center gap-px ${inMonth ? 'cursor-pointer' : 'cursor-default'}`}
            >
              {/* Numer dnia */}
              <div className={`text-[10px] w-5 h-5 flex items-center justify-center rounded-full font-medium ${
                today ? 'bg-indigo-600 text-white font-bold' :
                inMonth ? 'text-gray-700' : 'text-gray-300'
              }`}>
                {inMonth ? format(day, 'd') : ''}
              </div>
              {/* Kropeczki aktywnosci */}
              <div className="flex gap-px justify-center">
                {colors.map((c, i) => (
                  <div
                    key={i}
                    className="w-1 h-1 rounded-full"
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function YearView({
  anchorDate,
  onDayClick,
}: {
  anchorDate: Date
  onDayClick: (d: Date) => void
}) {
  const year = getYear(anchorDate)
  const yearStart = format(new Date(year, 0, 1), 'yyyy-MM-dd')

  const { data: events = [] } = useQuery({
    queryKey: ['events-year', year],
    queryFn: () => eventsApi.listYear(yearStart),
  })

  return (
    <div className="flex flex-col flex-1 min-h-0 p-4">
      {/* Siatka 4x3 mini-kalendarzy — wypełnia całą dostępną wysokość */}
      <div className="grid grid-cols-4 grid-rows-3 gap-4 flex-1 min-h-0">
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className="bg-gray-50 rounded-xl p-3 border border-gray-100 flex flex-col min-h-0">
            <MiniMonth
              year={year}
              monthIndex={i}
              events={events}
              onDayClick={onDayClick}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
