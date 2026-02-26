import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useDroppable, useDraggable } from '@dnd-kit/core'
import { format, addDays, subDays, addMonths, subMonths, addYears, subYears, startOfDay, startOfMonth, startOfWeek, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth, parseISO, isYesterday, isToday as isTodayFn } from 'date-fns'
import { pl } from 'date-fns/locale'
import { eventsApi } from '../../api/events'
import { parseTodoItems, setTodoChecked } from '../../lib/htmlUtils'
import { contactsApi } from '../../api/contacts'
import { useCalendarStore, DragGhost, CalendarView, useUndoStore } from '../../store/calendarStore'
import { templatesApi } from '../../api/templates'
import { Event, Contact, EisenhowerTask, Quadrant, getQuadrant } from '../../types'
import { tasksApi } from '../../api/tasks'
import { EventModal } from './EventModal'
import { IconRenderer } from '../ui/IconRenderer'
import { SettingsOverlay } from '../ui/SettingsOverlay'
import { AdminPanel } from '../ui/AdminPanel'
import { BestiaryOverlay } from '../bestiary/Bestiary'
import { getMe } from '../../api/auth'
import { MonthView, YearView } from './CalendarViews'

const HOUR_HEIGHT = 60  // px na godzinę

// ── Hook: aktualna minuta (odświeżana co 60s) ────────────────────────────────
function useNow() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])
  return now
}

// ── Linia "teraz" ─────────────────────────────────────────────────────────────
function NowLine({ now, hourStart, hourEnd }: { now: Date; hourStart: number; hourEnd: number }) {
  const h = now.getHours() + now.getMinutes() / 60
  if (h < hourStart || h > hourEnd) return null
  const top = (h - hourStart) * HOUR_HEIGHT
  return (
    <div
      className="absolute left-0 right-0 z-30 pointer-events-none"
      style={{ top: `${top}px` }}
    >
      <div className="relative" style={{ height: '2px' }}>
        {/* linia */}
        <div className="absolute inset-0" style={{ backgroundColor: '#ff2d55' }} />
        {/* trójkąt — left:0, wierzchołek (prawy koniec) na x=8, nakłada się na linię tym samym kolorem */}
        <div style={{
          position: 'absolute',
          left: 0,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 0, height: 0,
          borderTop: '5px solid transparent',
          borderBottom: '5px solid transparent',
          borderLeft: '8px solid #ff2d55',
        }} />
      </div>
    </div>
  )
}

// ── DatePickerPopover ────────────────────────────────────────────────────────
const DAYS_SHORT = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd']

function DatePickerPopover({
  anchorRef,
  value,
  onPick,
  onClose,
}: {
  anchorRef: React.RefObject<HTMLButtonElement>
  value: Date
  onPick: (d: Date) => void
  onClose: () => void
}) {
  const [viewDate, setViewDate] = useState(startOfMonth(value))
  const popRef = useRef<HTMLDivElement>(null)

  // Pozycja pod przyciskiem
  const [pos, setPos] = useState({ top: 0, left: 0 })
  useEffect(() => {
    if (anchorRef.current) {
      const r = anchorRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 6, left: r.left + r.width / 2 })
    }
  }, [anchorRef])

  // Zamknij po kliknięciu poza
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node) &&
          anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose, anchorRef])

  const gridStart = startOfWeek(viewDate, { weekStartsOn: 1 })
  const gridEnd = addDays(startOfWeek(addDays(endOfMonth(viewDate), 6), { weekStartsOn: 1 }), 6)
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd })

  return createPortal(
    <div
      ref={popRef}
      className="fixed z-[300] w-64 rounded-2xl shadow-2xl border border-gray-100 bg-white p-3 select-none"
      style={{ top: pos.top, left: pos.left, transform: 'translateX(-50%)' }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Nawigacja miesiąc */}
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => setViewDate(subMonths(viewDate, 1))}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 text-base"
        >‹</button>
        <span className="text-sm font-semibold text-gray-800 capitalize">
          {format(viewDate, 'LLLL yyyy', { locale: pl })}
        </span>
        <button
          onClick={() => setViewDate(addMonths(viewDate, 1))}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 text-base"
        >›</button>
      </div>

      {/* Nagłówki dni */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS_SHORT.map((d) => (
          <div key={d} className="text-center text-[10px] font-medium text-gray-400">{d}</div>
        ))}
      </div>

      {/* Siatka dni */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {days.map((day) => {
          const inMonth = isSameMonth(day, viewDate)
          const isSelected = isSameDay(day, value)
          const isNow = isTodayFn(day)
          return (
            <button
              key={day.toISOString()}
              onClick={() => { onPick(day); onClose() }}
              className={`h-8 w-full flex items-center justify-center rounded-lg text-xs font-medium transition-colors ${
                isSelected
                  ? 'bg-indigo-600 text-white'
                  : isNow
                  ? 'bg-indigo-50 text-indigo-600 font-bold'
                  : inMonth
                  ? 'text-gray-700 hover:bg-gray-100'
                  : 'text-gray-300 hover:bg-gray-50'
              }`}
            >
              {format(day, 'd')}
            </button>
          )
        })}
      </div>


    </div>,
    document.body
  )
}

// ── Ghost — podgląd w tle podczas przeciągania ──────────────────────────────
function GhostBlock({ ghost, hourStart, iconSet }: { ghost: DragGhost; hourStart: number; iconSet?: import('../../lib/iconSets').IconSetId }) {
  const top = ((ghost.startHour - hourStart) / 1) * HOUR_HEIGHT
  const height = Math.max((ghost.durationMin / 60) * HOUR_HEIGHT, 24)

  return (
    <div
      className="absolute left-1 right-1 rounded-md pointer-events-none z-20 flex flex-col justify-start px-1.5 py-0.5"
      style={{
        top: `${top}px`,
        height: `${height}px`,
        backgroundColor: ghost.color + '55',
        borderLeft: `3px solid ${ghost.color}`,
        border: `2px dashed ${ghost.color}99`,
        borderLeftWidth: '3px',
        borderLeftStyle: 'solid',
        borderLeftColor: ghost.color,
      }}
    >
      <div className="text-xs font-semibold truncate flex items-center gap-1" style={{ color: ghost.color }}>
        <IconRenderer icon={ghost.icon} size={11} iconSet={iconSet} />
        {ghost.title}
      </div>
      {height > 32 && (
        <div className="text-xs opacity-60" style={{ color: ghost.color }}>
          {String(Math.floor(ghost.startHour)).padStart(2,'0')}:{String(Math.round((ghost.startHour % 1) * 60)).padStart(2,'0')}
          {' – '}
          {String(Math.floor(ghost.startHour + ghost.durationMin / 60)).padStart(2,'0')}:{String(Math.round(((ghost.startHour + ghost.durationMin / 60) % 1) * 60)).padStart(2,'0')}
        </div>
      )}
    </div>
  )
}

const BG_STRIP_WIDTH = 10  // px — szerokość paska tła

// ── Pasek "Proces w tle" — wąski strip po prawej stronie kolumny ──────────────
function BgStrip({
  event,
  hourStart,
  onRightClick,
  onDelete,
  iconSet,
}: {
  event: Event
  hourStart: number
  onRightClick: (e: Event) => void
  onDelete: (e: Event) => void
  iconSet?: import('../../lib/iconSets').IconSetId
}) {
  const startDt = parseISO(event.start_datetime)
  const endDt = parseISO(event.end_datetime)
  const durationMin = (endDt.getTime() - startDt.getTime()) / 60000
  const grabOffsetMinRef = useRef(0)

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `cal-event-${event.id}`,
    data: {
      type: 'calendar_event',
      event,
      durationMin,
      get grabOffsetMin() { return grabOffsetMinRef.current },
    },
  })

  const combinedListeners = {
    ...listeners,
    onPointerDown: (e: React.PointerEvent) => {
      const blockRect = (e.currentTarget as HTMLElement).closest('[data-bg-block]')?.getBoundingClientRect()
        ?? (e.currentTarget as HTMLElement).getBoundingClientRect()
      const offsetPx = e.clientY - blockRect.top
      grabOffsetMinRef.current = Math.max(0, (offsetPx / HOUR_HEIGHT) * 60)
      listeners?.onPointerDown?.(e)
    },
  }

  const startMin = (startDt.getHours() - hourStart) * 60 + startDt.getMinutes()
  const top = (startMin / 60) * HOUR_HEIGHT
  const height = Math.max((durationMin / 60) * HOUR_HEIGHT, 24)
  const color = event.color ?? event.activity_template?.color ?? '#6366f1'
  const icon = event.icon ?? event.activity_template?.icon ?? '📅'

  const [tooltip, setTooltip] = useState<{ x: number; y: number } | null>(null)
  const tooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current)
    const mx = e.clientX; const my = e.clientY
    tooltipTimerRef.current = setTimeout(() => setTooltip({ x: mx, y: my }), 400)
  }, [])

  const handleMouseLeave = useCallback(() => {
    if (tooltipTimerRef.current) { clearTimeout(tooltipTimerRef.current); tooltipTimerRef.current = null }
    setTooltip(null)
  }, [])

  useEffect(() => {
    if (isDragging) {
      setTooltip(null)
      if (tooltipTimerRef.current) { clearTimeout(tooltipTimerRef.current); tooltipTimerRef.current = null }
    }
  }, [isDragging])

  return (
    <>
      {/* Gradient glow — pod kafelkami, intensywny */}
      <div
        className="absolute pointer-events-none z-[8]"
        style={{
          top: `${top}px`,
          right: '2px',
          width: '40px',
          height: `${height}px`,
          background: `linear-gradient(to left, ${color}ff, ${color}00)`,
          borderRadius: '4px',
        }}
      />
      {/* Wąski pasek klikalny — drag, right-click, middle-click delete */}
      <div
        ref={setNodeRef}
        {...combinedListeners}
        {...attributes}
        data-bg-block
        onMouseDown={(e) => { if (e.button === 1) { e.preventDefault(); e.stopPropagation(); onDelete(event) } }}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onRightClick(event) }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="absolute z-[13] cursor-grab select-none overflow-hidden"
        style={{
          top: `${top}px`,
          right: '2px',
          width: `${BG_STRIP_WIDTH}px`,
          height: `${height}px`,
          opacity: isDragging ? 0.4 : 1,
          backgroundColor: color,
          borderRadius: '4px',
        }}
      >
        {height > 40 && (
          <div className="flex items-center justify-center h-full pointer-events-none">
            <IconRenderer icon={icon} size={8} iconSet={iconSet} className="opacity-80" />
          </div>
        )}
      </div>
      {/* Tooltip — portal do body */}
      {tooltip && !isDragging && (
        <EventTooltip x={tooltip.x} y={tooltip.y} event={event} durationMin={durationMin} />
      )}
    </>
  )
}

// ── Tooltip eventu kalendarza — portal do body ───────────────────────────────
function EventTooltip({
  x, y, event, durationMin,
}: {
  x: number; y: number; event: Event; durationMin: number
}) {
  const TIP_W = 260
  const TIP_H = 80
  const OFFSET_X = 14
  const OFFSET_Y = 18

  const left = x + OFFSET_X + TIP_W > window.innerWidth ? x - TIP_W - OFFSET_X : x + OFFSET_X
  const top = y + OFFSET_Y + TIP_H > window.innerHeight ? y - TIP_H - 6 : y + OFFSET_Y

  const startDt = parseISO(event.start_datetime)
  const endDt = parseISO(event.end_datetime)
  const hours = Math.floor(durationMin / 60)
  const mins = Math.round(durationMin % 60)
  const durationStr = hours > 0 && mins > 0
    ? `${hours}h ${mins}min`
    : hours > 0
    ? `${hours}h`
    : `${mins}min`

  const color = event.color ?? event.activity_template?.color ?? '#6366f1'
  const rawDesc = event.description?.trim() || event.activity_template?.description?.trim()
  const desc = rawDesc
    ? rawDesc
        .replace(/<\/li>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/\n+/g, '\n')
        .trim()
    : undefined

  return createPortal(
    <div className="fixed z-[200] pointer-events-none" style={{ left, top, maxWidth: TIP_W }}>
      <div
        className="rounded-xl px-3 py-2.5 shadow-2xl border space-y-1"
        style={{
          backgroundColor: 'rgba(12,12,22,0.97)',
          borderColor: color + '50',
          backdropFilter: 'blur(8px)',
        }}
      >
        {/* Godziny + czas trwania */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold" style={{ color: '#ffffffdd' }}>
            {format(startDt, 'HH:mm')} – {format(endDt, 'HH:mm')}
          </span>
          <span className="text-xs" style={{ color: color + 'cc' }}>
            {durationStr}
          </span>
        </div>

        {/* Opis */}
        {desc && (
          <div
            className="text-xs leading-relaxed"
            style={{ color: 'rgba(255,255,255,0.6)', whiteSpace: 'pre-line' }}
          >
            {desc.length > 300 ? desc.slice(0, 300) + '…' : desc}
          </div>
        )}

        {/* Lokalizacja */}
        {event.location && (
          <div className="text-xs flex items-center gap-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
            <span>📍</span> {event.location}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

// ── Blok eventu — lewy drag, prawy = modal, dolna krawędź = resize ───────────
function EventBlock({
  event,
  columnRef,
  hourStart,
  onRightClick,
  onDelete,
  onResizeEnd,
  iconSet,
  rightOffset = 4,
}: {
  event: Event
  columnRef: React.RefObject<HTMLDivElement>
  hourStart: number
  onRightClick: (e: Event) => void
  onDelete: (e: Event) => void
  onResizeEnd: (event: Event, newDurationMin: number) => void
  iconSet?: import('../../lib/iconSets').IconSetId
  rightOffset?: number
}) {
  const startDt = parseISO(event.start_datetime)
  const endDt = parseISO(event.end_datetime)
  const startMinutes = (startDt.getHours() - hourStart) * 60 + startDt.getMinutes()
  const durationMin = (endDt.getTime() - startDt.getTime()) / 60000
  const top = (startMinutes / 60) * HOUR_HEIGHT

  const [resizeDur, setResizeDur] = useState<number | null>(null)
  const displayDur = resizeDur ?? durationMin
  const height = Math.max((displayDur / 60) * HOUR_HEIGHT, 24)

  const color = event.color ?? event.activity_template?.color ?? '#6366f1'
  const icon = event.icon ?? event.activity_template?.icon ?? '📅'

  const grabOffsetMinRef = useRef(0)

  // Tooltip state
  const [tooltip, setTooltip] = useState<{ x: number; y: number } | null>(null)
  const tooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleMouseEnter = useCallback(() => {
    // Timer startuje w handleMouseMove
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current)
    const mx = e.clientX
    const my = e.clientY
    tooltipTimerRef.current = setTimeout(() => setTooltip({ x: mx, y: my }), 400)
  }, [])

  const handleMouseLeave = useCallback(() => {
    if (tooltipTimerRef.current) { clearTimeout(tooltipTimerRef.current); tooltipTimerRef.current = null }
    setTooltip(null)
  }, [])

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `cal-event-${event.id}`,
    data: {
      type: 'calendar_event',
      event,
      durationMin,
      get grabOffsetMin() { return grabOffsetMinRef.current },
    },
  })

  // Ukryj tooltip gdy zaczyna się drag
  useEffect(() => {
    if (isDragging) {
      setTooltip(null)
      if (tooltipTimerRef.current) { clearTimeout(tooltipTimerRef.current); tooltipTimerRef.current = null }
    }
  }, [isDragging])

  // Łączymy nasz onPointerDown z listenerem dnd-kit
  const combinedListeners = {
    ...listeners,
    onPointerDown: (e: React.PointerEvent) => {
      // Ukryj tooltip przy kliknięciu
      setTooltip(null)
      if (tooltipTimerRef.current) { clearTimeout(tooltipTimerRef.current); tooltipTimerRef.current = null }
      // Zapisz offset przed oddaniem kontroli do dnd-kit
      const blockRect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const offsetPx = e.clientY - blockRect.top
      grabOffsetMinRef.current = Math.max(0, (offsetPx / HOUR_HEIGHT) * 60)
      // Wywołaj oryginalny listener dnd-kit
      listeners?.onPointerDown?.(e)
    },
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setTooltip(null)
    onRightClick(event)
  }

  // ── Resize handle ─────────────────────────────────────────────────────────
  const handleResizePointerDown = (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const startClientY = e.clientY
    const startDur = durationMin

    const onMove = (me: PointerEvent) => {
      const colRect = columnRef.current?.getBoundingClientRect()
      if (!colRect) return
      const deltaY = me.clientY - startClientY
      const deltaMins = (deltaY / HOUR_HEIGHT) * 60
      const rawMins = startDur + deltaMins
      const snapped = Math.round(rawMins / 15) * 15
      setResizeDur(Math.max(15, snapped))
    }

    const onUp = (me: PointerEvent) => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      const deltaY = me.clientY - startClientY
      const deltaMins = (deltaY / HOUR_HEIGHT) * 60
      const rawMins = startDur + deltaMins
      const snapped = Math.round(rawMins / 15) * 15
      const finalDur = Math.max(15, snapped)
      setResizeDur(null)
      onResizeEnd(event, finalDur)
    }

    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }

  const displayEnd = new Date(startDt.getTime() + displayDur * 60000)

  return (
    <>
      <div
        ref={setNodeRef}
        {...combinedListeners}
        {...attributes}
        onContextMenu={handleContextMenu}
        onMouseDown={(e) => { if (e.button === 1) { e.preventDefault(); onDelete(event) } }}
        onMouseEnter={handleMouseEnter}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="absolute left-1 rounded-md overflow-hidden select-none z-10 transition-opacity"
        style={{
          top: `${top}px`,
          right: `${rightOffset}px`,
          height: `${height}px`,
          opacity: isDragging ? 0.35 : 1,
          backgroundColor: color + 'dd',
          borderLeft: `3px solid ${color}`,
          cursor: 'grab',
        }}
      >
        <div className="px-1.5 py-0.5 h-full flex flex-col justify-start pointer-events-none">
          <div className="text-white text-xs font-semibold leading-snug truncate flex items-center gap-1">
            <IconRenderer icon={icon} size={12} className="shrink-0" iconSet={iconSet} />
            {event.title}
          </div>
          {height > 34 && (
            <div className="text-white/75 text-xs truncate">
              {format(startDt, 'HH:mm')}–{format(displayEnd, 'HH:mm')}
            </div>
          )}
          {event.location && height > 52 && (
            <div className="text-white/60 text-xs truncate flex items-center gap-0.5"><IconRenderer icon="📍" iconSet={iconSet} size={10} className="shrink-0 opacity-75" />{event.location}</div>
          )}
        </div>
        {/* Uchwyt resize */}
        <div
          className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize z-20 flex items-center justify-center group/resize"
          style={{ pointerEvents: 'all' }}
          onPointerDown={handleResizePointerDown}
        >
          <div className="w-8 h-0.5 rounded-full bg-white/40 group-hover/resize:bg-white/80 transition-colors" />
        </div>
      </div>
      {/* Tooltip — portal do body */}
      {tooltip && !isDragging && (
        <EventTooltip x={tooltip.x} y={tooltip.y} event={event} durationMin={durationMin} />
      )}
    </>
  )
}

// ── Konfiguracja kolorów kwadrantów ───────────────────────────────────────────
const QUADRANT_COLORS: Record<string, { color: string; label: string }> = {
  do_first: { color: '#ef4444', label: 'Pilne · Ważne' },
  schedule: { color: '#3b82f6', label: 'Niepilne · Ważne' },
  delegate: { color: '#eab308', label: 'Pilne · Nieważne' },
  eliminate: { color: '#6b7280', label: 'Niepilne · Nieważne' },
}

// ── Blok kwadrantu Eisenhowera na kalendarzu ────────────────────────────────
function EisenhowerCalendarBlock({
  event,
  columnRef,
  hourStart,
  onRightClick,
  onDelete,
  onResizeEnd,
  iconSet,
  rightOffset = 4,
  tasks,
  onTaskStatusChange,
  eventColorMap,
}: {
  event: Event
  columnRef: React.RefObject<HTMLDivElement>
  hourStart: number
  onRightClick: (e: Event) => void
  onDelete: (e: Event) => void
  onResizeEnd: (event: Event, newDurationMin: number) => void
  iconSet?: import('../../lib/iconSets').IconSetId
  rightOffset?: number
  tasks: EisenhowerTask[]
  onTaskStatusChange: (taskId: number, newStatus: 'todo' | 'in_progress' | 'done') => void
  eventColorMap?: Record<number, { color: string; icon: string; title: string }>
}) {
  const quadrant = event.eisenhower_quadrant as Quadrant
  const qConfig = QUADRANT_COLORS[quadrant] || { color: '#8b5cf6', label: 'Matryca' }
  const quadrantTasks = tasks.filter(
    (t) => getQuadrant(t) === quadrant && t.status !== 'done',
  )
  const doneTasks = tasks.filter(
    (t) => getQuadrant(t) === quadrant && t.status === 'done',
  )

  const startDt = parseISO(event.start_datetime)
  const endDt = parseISO(event.end_datetime)
  const startMinutes = (startDt.getHours() - hourStart) * 60 + startDt.getMinutes()
  const durationMin = (endDt.getTime() - startDt.getTime()) / 60000
  const top = (startMinutes / 60) * HOUR_HEIGHT

  const [resizeDur, setResizeDur] = useState<number | null>(null)
  const displayDur = resizeDur ?? durationMin
  const height = Math.max((displayDur / 60) * HOUR_HEIGHT, 60)

  const grabOffsetMinRef = useRef(0)

  // Tooltip state
  const [tooltip, setTooltip] = useState<{ x: number; y: number } | null>(null)
  const tooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `cal-event-${event.id}`,
    data: {
      type: 'calendar_event',
      event,
      durationMin,
      get grabOffsetMin() { return grabOffsetMinRef.current },
    },
  })

  const combinedListeners = {
    ...listeners,
    onPointerDown: (e: React.PointerEvent) => {
      setTooltip(null)
      if (tooltipTimerRef.current) { clearTimeout(tooltipTimerRef.current); tooltipTimerRef.current = null }
      const blockRect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const offsetPx = e.clientY - blockRect.top
      grabOffsetMinRef.current = Math.max(0, (offsetPx / HOUR_HEIGHT) * 60)
      listeners?.onPointerDown?.(e)
    },
  }

  useEffect(() => {
    if (isDragging) {
      setTooltip(null)
      if (tooltipTimerRef.current) { clearTimeout(tooltipTimerRef.current); tooltipTimerRef.current = null }
    }
  }, [isDragging])

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setTooltip(null)
    onRightClick(event)
  }

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current)
    const mx = e.clientX
    const my = e.clientY
    tooltipTimerRef.current = setTimeout(() => setTooltip({ x: mx, y: my }), 400)
  }, [])

  const handleMouseLeave = useCallback(() => {
    if (tooltipTimerRef.current) { clearTimeout(tooltipTimerRef.current); tooltipTimerRef.current = null }
    setTooltip(null)
  }, [])

  // Resize handle
  const handleResizePointerDown = (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const startClientY = e.clientY
    const startDur = durationMin

    const onMove = (me: PointerEvent) => {
      const colRect = columnRef.current?.getBoundingClientRect()
      if (!colRect) return
      const deltaY = me.clientY - startClientY
      const deltaMins = (deltaY / HOUR_HEIGHT) * 60
      const rawMins = startDur + deltaMins
      const snapped = Math.round(rawMins / 15) * 15
      setResizeDur(Math.max(15, snapped))
    }

    const onUp = (me: PointerEvent) => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      const deltaY = me.clientY - startClientY
      const deltaMins = (deltaY / HOUR_HEIGHT) * 60
      const rawMins = startDur + deltaMins
      const snapped = Math.round(rawMins / 15) * 15
      const finalDur = Math.max(15, snapped)
      setResizeDur(null)
      onResizeEnd(event, finalDur)
    }

    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }

  // Cyklicznie status: todo → in_progress → done → todo
  const cycleStatus = (task: EisenhowerTask) => {
    const next = task.status === 'todo' ? 'in_progress'
      : task.status === 'in_progress' ? 'done'
      : 'todo'
    onTaskStatusChange(task.id, next)
  }

  // Ikona statusu
  const StatusIcon = ({ task }: { task: EisenhowerTask }) => {
    const color = qConfig.color
    if (task.status === 'done') {
      return (
        <div
          className="w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0"
          style={{ backgroundColor: color }}
        >
          <span style={{ color: '#ffffff', fontSize: '8px', lineHeight: '1' }}>✓</span>
        </div>
      )
    }
    if (task.status === 'in_progress') {
      return (
        <div
          className="w-3.5 h-3.5 rounded-full shrink-0"
          style={{
            background: `linear-gradient(to right, ${color} 50%, transparent 50%)`,
            border: `2px solid ${color}`,
          }}
        />
      )
    }
    return (
      <div
        className="w-3.5 h-3.5 rounded-full shrink-0"
        style={{ border: `2px solid ${color}` }}
      />
    )
  }

  return (
    <>
    <div
      ref={setNodeRef}
      {...combinedListeners}
      {...attributes}
      onContextMenu={handleContextMenu}
      onMouseDown={(e) => { if (e.button === 1) { e.preventDefault(); onDelete(event) } }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="absolute left-1 rounded-md overflow-hidden select-none z-10 transition-opacity"
      style={{
        top: `${top}px`,
        right: `${rightOffset}px`,
        height: `${height}px`,
        opacity: isDragging ? 0.35 : 1,
        backgroundColor: qConfig.color + '40',
        borderLeft: `3px solid ${qConfig.color}`,
        border: `1px solid ${qConfig.color}66`,
        borderLeftWidth: '3px',
        borderLeftColor: qConfig.color,
        cursor: 'grab',
      }}
    >
      {/* Nagłówek */}
      <div
        className="flex items-center gap-1.5 px-1.5 py-0.5"
        style={{ borderBottom: `1px solid ${qConfig.color}33` }}
      >
        <div
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: qConfig.color }}
        />
        <span
          className="text-xs font-bold truncate"
          style={{ color: qConfig.color }}
        >
          {qConfig.label}
        </span>
        <span
          className="text-xs font-medium ml-auto"
          style={{ color: qConfig.color + '99' }}
        >
          {quadrantTasks.length}
        </span>
      </div>

      {/* Lista zadań — scrollowalna */}
      <div
        className="overflow-y-auto px-1"
        style={{ maxHeight: `${height - 24}px` }}
      >
        {quadrantTasks.map((task) => {
          const src = task.linked_event_id ? eventColorMap?.[task.linked_event_id] : undefined
          return (
            <div
              key={task.id}
              className="flex items-center gap-1.5 py-1 px-1.5 my-0.5 rounded cursor-pointer hover:brightness-125 transition-all"
              style={{
                pointerEvents: 'all',
                backgroundColor: src ? src.color + '28' : qConfig.color + '28',
                borderLeft: src ? `3px solid ${src.color}` : `1px solid ${qConfig.color}38`,
                borderTop: `1px solid ${src ? src.color + '30' : qConfig.color + '30'}`,
                borderRight: `1px solid ${src ? src.color + '30' : qConfig.color + '30'}`,
                borderBottom: `1px solid ${src ? src.color + '30' : qConfig.color + '30'}`,
              }}
              title={src ? `${src.title}: ${task.title}` : task.title}
              onClick={(e) => { e.stopPropagation(); cycleStatus(task) }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <StatusIcon task={task} />
              {src && (
                <IconRenderer icon={src.icon} size={10} iconSet={iconSet} />
              )}
              <span
                className="text-xs truncate"
                style={{ color: src ? src.color + 'dd' : '#ffffffcc' }}
              >
                {task.title}
              </span>
            </div>
          )
        })}
        {doneTasks.length > 0 && (
          <div className="mt-0.5 pt-0.5" style={{ borderTop: `1px solid ${qConfig.color}22` }}>
            <span className="text-xs" style={{ color: qConfig.color + '66' }}>
              ✓ {doneTasks.length} ukończone
            </span>
          </div>
        )}
        {quadrantTasks.length === 0 && doneTasks.length === 0 && (
          <div className="py-1">
            <span className="text-xs" style={{ color: '#ffffff44' }}>
              Brak zadań
            </span>
          </div>
        )}
      </div>

      {/* Resize handle */}
      <div
        className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize z-20 flex items-center justify-center group/resize"
        style={{ pointerEvents: 'all' }}
        onPointerDown={handleResizePointerDown}
      >
        <div className="w-8 h-0.5 rounded-full transition-colors" style={{ backgroundColor: qConfig.color + '55' }} />
      </div>
    </div>
    {/* Tooltip — portal do body */}
    {tooltip && !isDragging && (
      <EventTooltip x={tooltip.x} y={tooltip.y} event={event} durationMin={durationMin} />
    )}
    </>
  )
}

// ── Kolumna dnia — dropzone z pozycją kursora ────────────────────────────────
function DayColumn({
  date,
  dayIndex,
  events,
  ghost,
  isToday,
  now,
  hourStart,
  hourEnd,
  onSlotClick,
  onEventRightClick,
  onEventDelete,
  onEventResizeEnd,
  iconSet,
  eisenhowerTasks,
  onTaskStatusChange,
  eisenhowerEventColorMap,
}: {
  date: Date
  dayIndex: number
  events: Event[]
  ghost: DragGhost | null
  isToday: boolean
  now: Date
  hourStart: number
  hourEnd: number
  onSlotClick: (date: Date, hour: number) => void
  onEventRightClick: (e: Event) => void
  onEventDelete: (e: Event) => void
  onEventResizeEnd: (event: Event, newDurationMin: number) => void
  iconSet?: import('../../lib/iconSets').IconSetId
  eisenhowerTasks: EisenhowerTask[]
  onTaskStatusChange: (taskId: number, newStatus: 'todo' | 'in_progress' | 'done') => void
  eisenhowerEventColorMap?: Record<number, { color: string; icon: string; title: string }>
}) {
  const columnRef = useRef<HTMLDivElement>(null)

  // Dropzone — przyjmuje szablony, taski eisenhowera i przesuwane eventy.
  // Przekazuje też `columnRef` i `date` żeby AppLayout mógł wyliczyć godzinę.
  const { setNodeRef, isOver } = useDroppable({
    id: `day-${dayIndex}`,
    data: { type: 'calendar_day', date, dayIndex, columnRef },
  })

  // Łączymy oba refy
  const setRefs = (el: HTMLDivElement | null) => {
    (columnRef as React.MutableRefObject<HTMLDivElement | null>).current = el
    setNodeRef(el)
  }

  return (
    <div
      ref={setRefs}
      className={`relative border-l border-gray-100 transition-colors overflow-hidden ${isOver ? 'bg-indigo-50/50' : ''}`}
      style={{ height: `${(hourEnd - hourStart) * HOUR_HEIGHT}px` }}
    >
      {/* Linie godzinowe */}
      {Array.from({ length: hourEnd - hourStart }, (_, i) => (
        <div
          key={i}
          className="absolute w-full border-t border-gray-100 pointer-events-none"
          style={{ top: `${i * HOUR_HEIGHT}px` }}
        />
      ))}
      {/* Linie półgodzinowe */}
      {Array.from({ length: hourEnd - hourStart }, (_, i) => (
        <div
          key={`h${i}`}
          className="absolute w-full border-t border-gray-50 pointer-events-none"
          style={{ top: `${i * HOUR_HEIGHT + HOUR_HEIGHT / 2}px` }}
        />
      ))}

      {/* Klikalne sloty (co 30 min) */}
      {Array.from({ length: (hourEnd - hourStart) * 2 }, (_, i) => {
        const hour = hourStart + Math.floor(i / 2) + (i % 2 === 1 ? 0.5 : 0)
        return (
          <div
            key={`slot${i}`}
            className="absolute w-full hover:bg-indigo-50/40 cursor-pointer transition-colors"
            style={{ top: `${(i * HOUR_HEIGHT) / 2}px`, height: `${HOUR_HEIGHT / 2}px` }}
            onClick={() => onSlotClick(date, hour)}
          />
        )
      })}

      {/* Ghost — podgląd podczas drag */}
      {ghost && <GhostBlock ghost={ghost} hourStart={hourStart} iconSet={iconSet} />}

      {/* Linia "teraz" */}
      {isToday && <NowLine now={now} hourStart={hourStart} hourEnd={hourEnd} />}

      {/* Paski "Proces w tle" — wąski strip po prawej, klikalny */}
      {events.filter(ev => ev.is_background).map((ev) => (
        <BgStrip
          key={`bg-${ev.id}`}
          event={ev}
          hourStart={hourStart}
          onRightClick={onEventRightClick}
          onDelete={onEventDelete}
          iconSet={iconSet}
        />
      ))}

      {/* Eventy normalne — zwężone tylko gdy nakładają się czasowo z eventem tła */}
      {events.filter(ev => !ev.is_background && !ev.eisenhower_quadrant).map((ev) => {
        const evStart = parseISO(ev.start_datetime).getTime()
        const evEnd = parseISO(ev.end_datetime).getTime()
        const overlaps = events.some(bg =>
          bg.is_background &&
          evStart < parseISO(bg.end_datetime).getTime() &&
          evEnd > parseISO(bg.start_datetime).getTime()
        )
        return (
          <EventBlock
            key={ev.id}
            event={ev}
            columnRef={columnRef}
            hourStart={hourStart}
            onRightClick={onEventRightClick}
            onDelete={onEventDelete}
            onResizeEnd={onEventResizeEnd}
            iconSet={iconSet}
            rightOffset={overlaps ? BG_STRIP_WIDTH + 4 : 4}
          />
        )
      })}

      {/* Bloki Eisenhowera — eventy z eisenhower_quadrant */}
      {events.filter(ev => !!ev.eisenhower_quadrant).map((ev) => {
        const evStart = parseISO(ev.start_datetime).getTime()
        const evEnd = parseISO(ev.end_datetime).getTime()
        const overlaps = events.some(bg =>
          bg.is_background &&
          evStart < parseISO(bg.end_datetime).getTime() &&
          evEnd > parseISO(bg.start_datetime).getTime()
        )
        return (
          <EisenhowerCalendarBlock
            key={`eis-${ev.id}`}
            event={ev}
            columnRef={columnRef}
            hourStart={hourStart}
            onRightClick={onEventRightClick}
            onDelete={onEventDelete}
            onResizeEnd={onEventResizeEnd}
            iconSet={iconSet}
            rightOffset={overlaps ? BG_STRIP_WIDTH + 4 : 4}
            tasks={eisenhowerTasks}
            onTaskStatusChange={onTaskStatusChange}
            eventColorMap={eisenhowerEventColorMap}
          />
        )
      })}
    </div>
  )
}

// ── Główny komponent kalendarza ───────────────────────────────────────────────
export function WeeklyCalendar() {
  const qc = useQueryClient()
  const now = useNow()
  const {
    weekStart, nextWeek, prevWeek, goToToday, setWeekStart,
    selectedTemplateId, dragGhost,
    viewMode,
    hourStart, hourEnd,
    iconSet,
    calendarView, setCalendarView,
  } = useCalendarStore()
  const { push: undoPush, pop: undoPop } = useUndoStore()
  const [modalData, setModalData] = useState<{
    mode: 'create' | 'edit'
    event?: Event
    defaultStart?: string
    defaultTemplateId?: number
  } | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [adminOpen, setAdminOpen] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 })
  const [datePickerOpen, setDatePickerOpen] = useState(false)
  const datePickerBtnRef = useRef<HTMLButtonElement>(null)

  // Śledź pozycję kursora podczas dragu (do pływającego tooltipa)
  useEffect(() => {
    if (!dragGhost) return
    const handler = (e: PointerEvent) => setCursorPos({ x: e.clientX, y: e.clientY })
    window.addEventListener('pointermove', handler)
    return () => window.removeEventListener('pointermove', handler)
  }, [dragGhost])
  const [bestiaryContactId, setBestiaryContactId] = useState<number | null>(null)

  // Pobierz info o aktualnym użytkowniku (is_admin)
  useEffect(() => {
    getMe().then(me => setIsAdmin(me.is_admin)).catch(() => {})
  }, [])
  const [bdPopover, setBdPopover] = useState<{ contacts: typeof contacts; rect: DOMRect } | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const calendarWrapRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(1200)

  // Mierz szerokość kontenera kalendarza (ResizeObserver)
  useEffect(() => {
    const el = calendarWrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width)
    })
    ro.observe(el)
    setContainerWidth(el.getBoundingClientRect().width)
    return () => ro.disconnect()
  }, [])

  // Liczba widocznych dni — ile kolumn mieści się przy min. szerokości kolumny
  const MIN_COL_PX = 160
  const visibleDaysCount = Math.max(1, Math.min(8, Math.floor((containerWidth - 48) / MIN_COL_PX)))

  // Zamknij popover urodzin klikając poza nim
  useEffect(() => {
    if (!bdPopover) return
    const h = () => setBdPopover(null)
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [bdPopover])

  const today = startOfDay(new Date())
  // W trybie dynamicznym przy < 7 kolumnach: jeśli weekStart jest w przeszłości,
  // zacznij od dziś żeby nie pokazywać wczoraj/początku tygodnia.
  // W trybie statycznym zawsze zaczynamy od weekStart (wybrany pierwszy dzień tygodnia).
  const daysStart = (viewMode === 'dynamic' && visibleDaysCount < 7 && weekStart < today)
    ? today
    : weekStart

  // Czy dzisiejszy dzień jest widoczny w aktualnym oknie kalendarza?
  const todayVisible = today >= daysStart && today <= addDays(daysStart, visibleDaysCount - 1)

  // "Widok przesunięty w przeszłość" = zaczyna się wcześniej niż wczoraj (domyślny start dynamic)
  const yesterday = subDays(today, 1)
  const viewShiftedBack = daysStart < yesterday

  // Nawigacja do przodu:
  // jeśli w trybie dynamic, widok był przesunięty w przeszłość i dziś już jest widoczny
  // → snap back do domyślnego układu (wczoraj jako pierwszy dzień)
  const navigateForward = useCallback(() => {
    if (viewMode === 'dynamic' && viewShiftedBack && todayVisible) {
      goToToday()
    } else if (visibleDaysCount < 7) {
      setWeekStart(addDays(daysStart, visibleDaysCount))
    } else {
      nextWeek()
    }
  }, [viewMode, viewShiftedBack, todayVisible, visibleDaysCount, daysStart, goToToday, setWeekStart, nextWeek])

  // Scroll poziomy kółkiem (tilt lewo/prawo) → zmiana tygodnia
  // Scroll pionowy → normalne przewijanie godzin
  useEffect(() => {
    // W widoku tygodniowym: scroll container; w miesiąc/rok: cały wrapper
    const el = calendarView === 'week' ? scrollContainerRef.current : calendarWrapRef.current
    if (!el) return

    let lastTime = 0
    const handler = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault()
        const now = Date.now()
        if (now - lastTime < 400) return
        lastTime = now
        if (e.deltaX > 0) {
          if (calendarView === 'month') setWeekStart(addMonths(weekStart, 1))
          else if (calendarView === 'year') setWeekStart(addYears(weekStart, 1))
          else navigateForward()
        } else {
          if (calendarView === 'month') setWeekStart(subMonths(weekStart, 1))
          else if (calendarView === 'year') setWeekStart(subYears(weekStart, 1))
          else visibleDaysCount < 7 ? setWeekStart(subDays(daysStart, visibleDaysCount)) : prevWeek()
        }
      }
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [navigateForward, prevWeek, visibleDaysCount, daysStart, weekStart, setWeekStart, calendarView])

  // Klawisze strzałek: ←/→ → nawigacja, ↑/↓ → scroll godzin (tylko w widoku tygodnia)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Nie przechwytuj gdy użytkownik pisze w input/textarea
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return

      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        if (calendarView === 'month') setWeekStart(subMonths(weekStart, 1))
        else if (calendarView === 'year') setWeekStart(subYears(weekStart, 1))
        else visibleDaysCount < 7 ? setWeekStart(subDays(daysStart, visibleDaysCount)) : prevWeek()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        if (calendarView === 'month') setWeekStart(addMonths(weekStart, 1))
        else if (calendarView === 'year') setWeekStart(addYears(weekStart, 1))
        else navigateForward()
      } else {
        const el = scrollContainerRef.current
        if (!el) return
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          el.scrollBy({ top: -80, behavior: 'smooth' })
        } else if (e.key === 'ArrowDown') {
          e.preventDefault()
          el.scrollBy({ top: 80, behavior: 'smooth' })
        }
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [navigateForward, prevWeek, visibleDaysCount, daysStart, setWeekStart, calendarView])
  const weekStartStr = format(daysStart, 'yyyy-MM-dd')
  const days = Array.from({ length: visibleDaysCount }, (_, i) => addDays(daysStart, i))

  // Etykieta dnia — w trybie dynamicznym: Wczoraj/Dziś/Jutro/poj. nazwa; w statycznym: skrót dnia tygodnia
  const dayLabel = (day: Date): string => {
    if (viewMode === 'dynamic') {
      if (isYesterday(day)) return 'Wczoraj'
      if (isTodayFn(day)) return 'Dziś'
      if (isSameDay(day, addDays(new Date(), 1))) return 'Jutro'
    }
    return format(day, 'EEE', { locale: pl })
  }

  const { data: events = [] } = useQuery({
    queryKey: ['events', weekStartStr, visibleDaysCount],
    queryFn: () => eventsApi.list(weekStartStr, visibleDaysCount),
  })

  const { data: templates = [] } = useQuery({
    queryKey: ['activity-templates'],
    queryFn: templatesApi.list,
  })

  const { data: contacts = [] } = useQuery({
    queryKey: ['contacts'],
    queryFn: contactsApi.list,
  })

  // Eisenhower tasks — potrzebne do renderowania bloków kwadrantów na kalendarzu
  const { data: eisenhowerTasks = [] } = useQuery({
    queryKey: ['eisenhower-tasks'],
    queryFn: tasksApi.list,
  })

  // Mapa eventId → {color, icon, title} — do kolorowania tasków po aktywności źródłowej
  // Cache shared z EisenhowerMatrix (ten sam queryKey 'events-all')
  const { data: allEventsForTaskColors = [] } = useQuery({
    queryKey: ['events-all'],
    queryFn: eventsApi.listAll,
    staleTime: 30_000,
  })
  const eisenhowerEventColorMap: Record<number, { color: string; icon: string; title: string }> = {}
  allEventsForTaskColors.forEach((ev: Event) => {
    eisenhowerEventColorMap[ev.id] = {
      color: ev.activity_template?.color ?? ev.color ?? '#6366f1',
      icon: ev.activity_template?.icon ?? ev.icon ?? '📅',
      title: ev.activity_template?.name ?? ev.title,
    }
  })

  const taskPatchMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<EisenhowerTask> }) =>
      tasksApi.patch(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['eisenhower-tasks'] }),
  })

  const handleTaskStatusChange = (taskId: number, newStatus: 'todo' | 'in_progress' | 'done') => {
    taskPatchMut.mutate({ id: taskId, data: { status: newStatus } })
    // Synchronizuj checkbox w opisie eventu (zaznacz gdy done, odznacz gdy cofnięty)
    const task = eisenhowerTasks.find((t) => t.id === taskId)
    if (task?.linked_event_id && task.title) {
      const allEvs = qc.getQueryData<Event[]>(['events-all'])
      const ev = allEvs?.find((e) => e.id === task.linked_event_id)
      if (ev?.description) {
        const newHtml = setTodoChecked(ev.description, task.title, newStatus === 'done')
        if (newHtml) {
          eventsApi.update(task.linked_event_id, { description: newHtml })
            .then(() => {
              qc.invalidateQueries({ queryKey: ['events-all'] })
              qc.invalidateQueries({ queryKey: ['events'] })
            })
        }
      }
    }
  }

  // Kontakty z urodzinami w danym dniu
  const birthdayContactsForDay = (day: Date): Contact[] => {
    return contacts.filter((c) => {
      if (!c.birthday) return false
      const bd = new Date(c.birthday)
      return bd.getMonth() === day.getMonth() && bd.getDate() === day.getDate()
    })
  }

  const createMut = useMutation({
    mutationFn: eventsApi.create,
    onSuccess: (created) => {
      undoPush({ type: 'create', eventId: created.id })
      qc.invalidateQueries({ queryKey: ['events'] })
    },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data, before }: { id: number; data: Partial<Event>; before?: Partial<Event> }) =>
      eventsApi.update(id, data),
    onSuccess: (updatedEvent, { id, data, before }) => {
      if (before) undoPush({ type: 'update', eventId: id, before })
      qc.invalidateQueries({ queryKey: ['events'] })
      qc.invalidateQueries({ queryKey: ['activity-templates'] })
      // Sync checkbox→task: jeśli opis się zmienił, zaktualizuj statusy tasków w matrycy
      if (data.description !== undefined) {
        qc.invalidateQueries({ queryKey: ['events-all'] })
        // Pobierz taski z cache i zsynchronizuj statusy
        const tasks = qc.getQueryData<EisenhowerTask[]>(['eisenhower-tasks']) ?? []
        if (tasks.length && data.description) {
          parseTodoItems(data.description).forEach((todo: { text: string; checked: boolean }) => {
            const linked = tasks.find(
              (t) => t.linked_event_id === updatedEvent.id &&
                     t.title.toLowerCase().trim() === todo.text.toLowerCase().trim()
            )
            if (!linked) return
            if (todo.checked && linked.status !== 'done') {
              tasksApi.patch(linked.id, { status: 'done' })
                .then(() => qc.invalidateQueries({ queryKey: ['eisenhower-tasks'] }))
            } else if (!todo.checked && linked.status === 'done') {
              tasksApi.patch(linked.id, { status: 'todo' })
                .then(() => qc.invalidateQueries({ queryKey: ['eisenhower-tasks'] }))
            }
          })
        }
      }
    },
  })

  const handleSlotClick = (date: Date, hour: number) => {
    const hh = Math.floor(hour)
    const mm = hour % 1 === 0 ? 0 : 30
    const dt = new Date(date)
    dt.setHours(hh, mm, 0, 0)
    const dtEnd = new Date(dt)
    const tpl = templates.find((t) => t.id === selectedTemplateId)
    dtEnd.setMinutes(dtEnd.getMinutes() + (tpl?.default_duration ?? 60))
    setModalData({
      mode: 'create',
      defaultStart: dt.toISOString(),
      defaultTemplateId: selectedTemplateId ?? undefined,
    })
  }

  const eventsByDay = (day: Date) =>
    events.filter((e) => isSameDay(parseISO(e.start_datetime), day))

  // ── Ctrl+Z — cofanie ostatniej akcji ────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key !== 'z') return
      // Nie cofaj gdy user pisze w polu tekstowym
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return
      e.preventDefault()
      const action = undoPop()
      if (!action) return
      if (action.type === 'create') {
        await eventsApi.delete(action.eventId)
      } else if (action.type === 'update') {
        await eventsApi.update(action.eventId, action.before)
      } else if (action.type === 'delete') {
        const { id: _id, ...rest } = action.event
        await eventsApi.create(rest as Parameters<typeof eventsApi.create>[0])
      }
      qc.invalidateQueries({ queryKey: ['events'] })
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [undoPop, qc])

  return (
    <div ref={calendarWrapRef} className="flex flex-col h-full min-h-0 bg-white">
      {/* Nawigacja — wycentrowana */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center px-4 py-3 border-b border-gray-100 shrink-0">
        {/* Lewa strona — pusty spacer */}
        <div />
        {/* Środek — nawigacja (zależna od aktywnego widoku) */}
        <div className="flex items-center">
          <button
            onClick={() => {
              if (calendarView === 'month') setWeekStart(subMonths(weekStart, 1))
              else if (calendarView === 'year') setWeekStart(subYears(weekStart, 1))
              else if (visibleDaysCount < 7) setWeekStart(subDays(daysStart, visibleDaysCount))
              else prevWeek()
            }}
            className="w-10 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-600 text-lg font-light shrink-0"
          >‹</button>
          <button
            ref={datePickerBtnRef}
            onClick={() => setDatePickerOpen((o) => !o)}
            className={`font-semibold text-gray-800 text-sm min-w-[220px] text-center shrink-0 transition-colors cursor-pointer rounded-lg px-3 py-1 ${datePickerOpen ? 'bg-gray-100 text-indigo-600' : 'hover:bg-gray-50 hover:text-indigo-600'}`}
            title="Kliknij aby przejść do daty"
          >
            {calendarView === 'week' && (
              <>
                {format(daysStart, 'd MMMM', { locale: pl })} –{' '}
                {format(addDays(daysStart, visibleDaysCount - 1), 'd MMMM yyyy', { locale: pl })}
              </>
            )}
            {calendarView === 'month' && (
              <span className="capitalize">{format(weekStart, 'LLLL yyyy', { locale: pl })}</span>
            )}
            {calendarView === 'year' && format(weekStart, 'yyyy')}
          </button>
          {datePickerOpen && (
            <DatePickerPopover
              anchorRef={datePickerBtnRef}
              value={weekStart}
              onPick={(d) => { setWeekStart(d); setCalendarView('week') }}
              onClose={() => setDatePickerOpen(false)}
            />
          )}
          <button
            onClick={() => {
              if (calendarView === 'month') setWeekStart(addMonths(weekStart, 1))
              else if (calendarView === 'year') setWeekStart(addYears(weekStart, 1))
              else navigateForward()
            }}
            className="w-10 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-600 text-lg font-light shrink-0"
          >›</button>
        </div>
        {/* Prawa strona — przyciski */}
        <div className="flex items-center gap-2 justify-end">
          <button
            onClick={goToToday}
            className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium"
          >
            Dziś
          </button>
          {/* Przełącznik widoków */}
          <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
            {(['week', 'month', 'year'] as CalendarView[]).map((v) => (
              <button
                key={v}
                onClick={() => setCalendarView(v)}
                className={`px-2.5 py-1.5 transition-colors ${
                  calendarView === v
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                {{ week: 'Tydzień', month: 'Miesiąc', year: 'Rok' }[v]}
              </button>
            ))}
          </div>
          {/* Przycisk panelu admina — widoczny tylko dla adminów */}
          {isAdmin && (
            <button
              onClick={() => setAdminOpen(true)}
              title="Panel administratora"
              className={`w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 transition-colors ${adminOpen ? 'bg-gray-100' : ''}`}
            >
              <IconRenderer icon="🛡️" iconSet={iconSet} size={16} />
            </button>
          )}
          {/* Przycisk ustawień — otwiera overlay */}
          <button
            onClick={() => setSettingsOpen(true)}
            title="Ustawienia kalendarza"
            className={`w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 transition-colors ${settingsOpen ? 'bg-gray-100' : ''}`}
          >
            <IconRenderer icon="⚙️" iconSet={iconSet} size={16} />
          </button>
        </div>
      </div>

      {/* Widok miesięczny */}
      {calendarView === 'month' && (
        <MonthView
          anchorDate={weekStart}
          onDayClick={(d) => { setWeekStart(d); setCalendarView('week') }}
        />
      )}

      {/* Widok roczny */}
      {calendarView === 'year' && (
        <YearView
          anchorDate={weekStart}
          onDayClick={(d) => { setWeekStart(d); setCalendarView('week') }}
        />
      )}

      {/* Widok tygodniowy (domyslny) */}
      {calendarView === 'week' && (
      <div
        ref={scrollContainerRef}
        className="flex-1 min-h-0 overflow-auto"
      >
        <div>

          {/* Nagłówki dni — sticky top */}
          <div
            className="grid border-b border-gray-100 sticky top-0 z-20 bg-white"
            style={{ gridTemplateColumns: `48px repeat(${visibleDaysCount}, 1fr)` }}
          >
            <div />
            {days.map((day, i) => {
              const isToday = isSameDay(day, new Date())
              const bdContacts = birthdayContactsForDay(day)
              return (
                <div key={i} className="text-center py-2 relative">
                  <div className="text-xs text-gray-400 uppercase tracking-wide">{dayLabel(day)}</div>
                  <div
                    className={`text-sm font-semibold mt-0.5 w-7 h-7 mx-auto flex items-center justify-center rounded-full relative ${
                      isToday ? 'bg-indigo-600 text-white' : 'text-gray-700'
                    }`}
                  >
                    {format(day, 'd')}
                  </div>
                  {/* Miniaturowe nazwy solenizantów pod datą — klikalne */}
                  {bdContacts.length > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                        setBdPopover({ contacts: bdContacts, rect })
                      }}
                      className="text-xs text-red-500 font-medium mt-0.5 truncate px-1 hover:text-red-400 transition-colors w-full"
                    >
                      <span className="inline-flex items-center gap-1"><IconRenderer icon="🎂" iconSet={iconSet} size={12} />{bdContacts[0].name}{bdContacts.length > 1 ? ` +${bdContacts.length - 1}` : ''}</span>
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          {/* Siatka z osią czasu i kolumnami dni */}
          <div className="grid" style={{ gridTemplateColumns: `48px repeat(${visibleDaysCount}, 1fr)` }}>
            {/* Oś czasu — sticky left */}
            <div className="border-r border-gray-100 sticky left-0 bg-white z-10">
              {Array.from({ length: hourEnd - hourStart }, (_, i) => (
                <div
                  key={i}
                  className="flex items-start justify-end pr-2 pt-1 text-xs text-gray-400 select-none"
                  style={{ height: `${HOUR_HEIGHT}px` }}
                >
                  {`${hourStart + i}:00`}
                </div>
              ))}
            </div>

            {/* Kolumny dni */}
            {days.map((day, i) => (
              <DayColumn
                key={i}
                date={day}
                dayIndex={i}
                events={eventsByDay(day)}
                ghost={dragGhost?.dayIndex === i ? dragGhost : null}
                isToday={isSameDay(day, now)}
                now={now}
                hourStart={hourStart}
                hourEnd={hourEnd}
                onSlotClick={handleSlotClick}
                iconSet={iconSet}
                onEventRightClick={(ev) => setModalData({ mode: 'edit', event: ev })}
                onEventDelete={async (ev) => {
                  undoPush({ type: 'delete', event: ev })
                  await eventsApi.delete(ev.id)
                  qc.invalidateQueries({ queryKey: ['events'] })
                }}
                onEventResizeEnd={(ev, newDur) => {
                  const start = parseISO(ev.start_datetime)
                  const end = new Date(start.getTime() + newDur * 60000)
                  updateMut.mutate({
                    id: ev.id,
                    data: { end_datetime: end.toISOString() },
                    before: { end_datetime: ev.end_datetime },
                  })
                }}
                eisenhowerTasks={eisenhowerTasks}
                onTaskStatusChange={handleTaskStatusChange}
                eisenhowerEventColorMap={eisenhowerEventColorMap}
              />
            ))}
          </div>

        </div>
      </div>
      )} {/* koniec calendarView === 'week' */}

      {/* Modal */}
      {modalData && (
        <EventModal
          mode={modalData.mode}
          event={modalData.event}
          defaultStart={modalData.defaultStart}
          defaultTemplateId={modalData.defaultTemplateId}
          templates={templates}
          onClose={() => setModalData(null)}
          onSave={(data) => {
            if (modalData.mode === 'create') {
              createMut.mutate(data as Parameters<typeof eventsApi.create>[0])
            } else if (modalData.event) {
              const ev = modalData.event
              updateMut.mutate({
                id: ev.id,
                data,
                before: {
                  title: ev.title,
                  start_datetime: ev.start_datetime,
                  end_datetime: ev.end_datetime,
                  description: ev.description,
                  location: ev.location,
                  color: ev.color,
                  icon: ev.icon,
                  activity_template_id: ev.activity_template_id,
                },
              })
            }
            setModalData(null)
          }}
          onDelete={
            modalData.mode === 'edit' && modalData.event
              ? async () => {
                  undoPush({ type: 'delete', event: modalData.event! })
                  await eventsApi.delete(modalData.event!.id)
                  qc.invalidateQueries({ queryKey: ['events'] })
                  setModalData(null)
                }
              : undefined
          }
          onPin={
            modalData.mode === 'edit' && modalData.event
              ? async (cfg) => {
                  const ev = modalData.event!
                  if (cfg.offsetDays !== undefined) {
                    const newStart = new Date(parseISO(ev.start_datetime).getTime() + cfg.offsetDays * 24 * 60 * 60 * 1000)
                    const newEnd   = new Date(parseISO(ev.end_datetime).getTime()   + cfg.offsetDays * 24 * 60 * 60 * 1000)
                    await eventsApi.create({
                      title: ev.title,
                      start_datetime: newStart.toISOString(),
                      end_datetime: newEnd.toISOString(),
                      activity_template_id: ev.activity_template_id,
                      description: ev.description,
                      location: ev.location,
                      color: ev.color,
                      icon: ev.icon,
                    } as Parameters<typeof eventsApi.create>[0])
                  } else if (cfg.repeatWeeks !== undefined) {
                    const count = cfg.repeatWeeks === 0 ? 52 * 10 : cfg.repeatWeeks
                    await eventsApi.createRecurring({
                      title: ev.title,
                      start_datetime: new Date(parseISO(ev.start_datetime).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                      end_datetime:   new Date(parseISO(ev.end_datetime).getTime()   + 7 * 24 * 60 * 60 * 1000).toISOString(),
                      interval_days: 7,
                      occurrences: count,
                      activity_template_id: ev.activity_template_id,
                      description: ev.description,
                      location: ev.location,
                    })
                  }
                  qc.invalidateQueries({ queryKey: ['events'] })
                }
              : undefined
          }
         />
      )}

      {/* Overlay ustawień */}
      {settingsOpen && (
        <SettingsOverlay onClose={() => setSettingsOpen(false)} />
      )}

      {/* Panel admina */}
      {adminOpen && (
        <AdminPanel onClose={() => setAdminOpen(false)} />
      )}

      {/* Bestiary otwarty na konkretnym kontakcie */}
      {bestiaryContactId !== null && (
        <BestiaryOverlay
          initialContactId={bestiaryContactId}
          onClose={() => setBestiaryContactId(null)}
        />
      )}

      {/* Popover urodzin */}
      {bdPopover && (
        <div
          className="fixed z-[80] bg-gray-900 border border-white/20 rounded-2xl shadow-2xl overflow-hidden min-w-[180px]"
          style={{
            top: bdPopover.rect.bottom + 6,
            left: Math.min(bdPopover.rect.left, window.innerWidth - 200),
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-2 border-b border-white/10">
            <p className="text-xs font-bold text-white/50 uppercase tracking-wider flex items-center gap-1">Urodziny dziś <IconRenderer icon="🎂" iconSet={iconSet} size={12} /></p>
          </div>
          {bdPopover.contacts.map((c) => (
            <button
              key={c.id}
              onClick={() => { setBdPopover(null); setBestiaryContactId(c.id) }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-white/10 transition-colors text-left"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500/40 to-purple-500/40 flex items-center justify-center text-sm font-bold text-indigo-300 shrink-0 overflow-hidden border border-white/10">
                {c.photo_url
                  ? <img src={c.photo_url} alt={c.name} className="w-full h-full object-cover" />
                  : c.name[0].toUpperCase()
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white/90 truncate">{c.name}</p>
                {c.phone && <p className="text-xs text-white/30 truncate">{c.phone}</p>}
              </div>
              <span className="text-white/20 text-xs shrink-0">→</span>
            </button>
          ))}
        </div>
      )}

      {/* Pływający tooltip z godzinami podczas dragu */}
      {dragGhost && createPortal(
        (() => {
          const endHour = dragGhost.startHour + dragGhost.durationMin / 60
          const fmt = (h: number) =>
            `${String(Math.floor(h)).padStart(2,'0')}:${String(Math.round((h % 1) * 60)).padStart(2,'0')}`
          const durationH = Math.floor(dragGhost.durationMin / 60)
          const durationM = dragGhost.durationMin % 60
          const durationStr = durationH > 0
            ? (durationM > 0 ? `${durationH}h ${durationM}m` : `${durationH}h`)
            : `${durationM}m`
          return (
            <div
              className="fixed pointer-events-none z-[200] flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold text-white shadow-xl"
              style={{
                left: cursorPos.x + 14,
                top: cursorPos.y + 14,
                backgroundColor: dragGhost.color,
              }}
            >
              <span>{fmt(dragGhost.startHour)} – {fmt(endHour)}</span>
              <span className="opacity-60 font-normal">{durationStr}</span>
            </div>
          )
        })(),
        document.body
      )}
    </div>
  )
}
