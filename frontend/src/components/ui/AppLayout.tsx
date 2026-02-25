import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  DragMoveEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Sidebar } from '../sidebar/Sidebar'
import { WeeklyCalendar } from '../calendar/WeeklyCalendar'
import { ActivityTemplate, Event, Quadrant } from '../../types'
import { eventsApi } from '../../api/events'
import { useQuery } from '@tanstack/react-query'
import { templatesApi } from '../../api/templates'
import { useCalendarStore, useUndoStore } from '../../store/calendarStore'
import { useSettingsSync } from '../../hooks/useSettingsSync'
import { IconRenderer } from './IconRenderer'
import { arrayMove } from '@dnd-kit/sortable'

const HOUR_HEIGHT = 60

type ActiveDrag =
  | { type: 'template'; template: ActivityTemplate }
  | { type: 'calendar_event'; event: Event; durationMin: number; grabOffsetMin: number }
  | { type: 'eisenhower_widget' }
  | null

// ── Konfiguracja kwadrantów dla pickera ──────────────────────────────────────
const QUADRANT_OPTIONS: { id: Quadrant; label: string; color: string; icon: string }[] = [
  { id: 'do_first', label: 'Pilne · Ważne', color: '#ef4444', icon: '⚡' },
  { id: 'schedule', label: 'Niepilne · Ważne', color: '#3b82f6', icon: '📅' },
  { id: 'delegate', label: 'Pilne · Nieważne', color: '#eab308', icon: '🤝' },
  { id: 'eliminate', label: 'Niepilne · Nieważne', color: '#6b7280', icon: '🗑️' },
]

// ── QuadrantPicker — modal wyboru kwadrantu po dropie ────────────────────────
function QuadrantPicker({
  targetDate,
  targetHour,
  onSelect,
  onClose,
}: {
  targetDate: Date
  targetHour: number
  onSelect: (quadrant: Quadrant) => void
  onClose: () => void
}) {
  const iconSet = useCalendarStore((s) => s.iconSet)
  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} />
      {/* Modal */}
      <div
        className="relative rounded-xl shadow-2xl p-4 max-w-xs w-full border"
        style={{ backgroundColor: '#1a1a2e', borderColor: '#333' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-white mb-3 text-center">
          Wybierz kwadrant matrycy
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {QUADRANT_OPTIONS.map((q) => (
            <button
              key={q.id}
              className="rounded-lg px-3 py-3 text-left transition-all hover:brightness-125 border cursor-pointer"
              style={{
                backgroundColor: q.color + '18',
                borderColor: q.color + '55',
              }}
              onClick={() => onSelect(q.id)}
            >
              <div className="text-lg mb-0.5" style={{ color: q.color }}>
                <IconRenderer icon={q.icon} size={20} iconSet={iconSet} />
              </div>
              <div className="text-xs font-semibold" style={{ color: q.color }}>
                {q.label}
              </div>
            </button>
          ))}
        </div>
        <button
          className="mt-3 w-full text-xs py-1.5 rounded-md text-gray-400 hover:text-white transition-colors"
          style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
          onClick={onClose}
        >
          Anuluj
        </button>
      </div>
    </div>,
    document.body,
  )
}

function yToHour(clientY: number, columnRect: DOMRect, hourStart: number, hourEnd: number): number {
  const relY = clientY - columnRect.top
  const rawHour = hourStart + relY / HOUR_HEIGHT
  const snapped = Math.round(rawHour * 4) / 4   // snap 15 min
  // max: hourEnd - 0.25 żeby event mógł się zacząć max kwadrans przed końcem widoku
  return Math.max(hourStart, Math.min(hourEnd - 0.25, snapped))
}

/** Zwraca DOMRect kolumny dnia na podstawie danych z dropzone */
function getColumnRect(over: DragEndEvent['over']): { rect: DOMRect; dayIndex: number; date: Date } | null {
  if (!over) return null
  const d = over.data.current as { type: string; date: Date; dayIndex: number; columnRef: React.RefObject<HTMLDivElement> }
  if (d?.type !== 'calendar_day') return null
  const el = d.columnRef?.current
  if (!el) return null
  return { rect: el.getBoundingClientRect(), dayIndex: d.dayIndex, date: d.date }
}

export function AppLayout() {
  const qc = useQueryClient()
  const setDragGhost = useCalendarStore((s) => s.setDragGhost)
  const iconSet = useCalendarStore((s) => s.iconSet)
  const templateOrder = useCalendarStore((s) => s.templateOrder)
  const setTemplateOrder = useCalendarStore((s) => s.setTemplateOrder)
  const hourStart = useCalendarStore((s) => s.hourStart)
  const hourEnd = useCalendarStore((s) => s.hourEnd)
  const { push: undoPush } = useUndoStore()

  // Sync ustawień z backendem (pobierz przy logowaniu, zapisz przy zmianach)
  useSettingsSync()

  const [activeDrag, setActiveDrag] = useState<ActiveDrag>(null)
  // Aktualny over — potrzebny do ghost preview
  const [currentOver, setCurrentOver] = useState<DragEndEvent['over'] | null>(null)

  // ── QuadrantPicker state — po dropie widgetu Eisenhowera na kalendarz ──────
  const [quadrantPicker, setQuadrantPicker] = useState<{
    targetDate: Date
    targetHour: number
  } | null>(null)

  // Śledzimy clientY kursora przez natywny pointermove — dokładne, niezależne od scroll
  const cursorYRef = useRef(0)
  const activeDragRef = useRef<ActiveDrag>(null)
  const currentOverRef = useRef<DragEndEvent['over'] | null>(null)
  // Refy dla hourStart/hourEnd — żeby updateGhostFromRefs (w useEffect) miał świeże wartości
  const hourStartRef = useRef(hourStart)
  const hourEndRef = useRef(hourEnd)
  hourStartRef.current = hourStart
  hourEndRef.current = hourEnd

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      cursorYRef.current = e.clientY
      updateGhostFromRefs()
    }
    document.addEventListener('pointermove', onMove)
    return () => document.removeEventListener('pointermove', onMove)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  const { data: templates = [] } = useQuery({
    queryKey: ['activity-templates'],
    queryFn: templatesApi.list,
  })

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
    onSuccess: (_, { id, before }) => {
      if (before) undoPush({ type: 'update', eventId: id, before })
      qc.invalidateQueries({ queryKey: ['events'] })
    },
  })

  // ── Aktualizuj ghost z refów (wołane z pointermove lub onDragOver) ──────────
  const updateGhostFromRefs = () => {
    const drag = activeDragRef.current
    const over = currentOverRef.current
    const curY = cursorYRef.current
    const hs = hourStartRef.current
    const he = hourEndRef.current
    if (!drag || !over) { setDragGhost(null); return }
    const col = getColumnRect(over)
    if (!col) { setDragGhost(null); return }

    const startHour = yToHour(curY, col.rect, hs, he)

    if (drag.type === 'template') {
      setDragGhost({
        dayIndex: col.dayIndex,
        startHour,
        durationMin: drag.template.default_duration,
        color: drag.template.color,
        icon: drag.template.icon,
        title: drag.template.name,
      })
    } else if (drag.type === 'calendar_event') {
      const ev = drag.event
      const offsetHour = (drag.grabOffsetMin ?? 0) / 60
      const adjustedStart = yToHour(curY, col.rect, hs, he) - offsetHour
      const snappedStart = Math.round(adjustedStart * 4) / 4   // snap 15 min
      const clampedStart = Math.max(hs, Math.min(he - 0.25, snappedStart))
      setDragGhost({
        dayIndex: col.dayIndex,
        startHour: clampedStart,
        durationMin: drag.durationMin,
        color: ev.activity_template?.color ?? '#6366f1',
        icon: ev.activity_template?.icon ?? '📅',
        title: ev.title,
      })
    } else if (drag.type === 'eisenhower_widget') {
      setDragGhost({
        dayIndex: col.dayIndex,
        startHour,
        durationMin: 60,
        color: '#8b5cf6',
        icon: '📋',
        title: 'Matryca Eisenhowera',
      })
    }
  }

  const handleDragStart = (e: DragStartEvent) => {
    const data = e.active.data.current as { type: string; [key: string]: unknown }
    const native = e.activatorEvent as PointerEvent
    cursorYRef.current = native?.clientY ?? 0

    let drag: ActiveDrag = null
    if (data?.type === 'template') {
      drag = { type: 'template', template: data.template as ActivityTemplate }
    } else if (data?.type === 'calendar_event') {
      drag = { type: 'calendar_event', event: data.event as Event, durationMin: data.durationMin as number, grabOffsetMin: data.grabOffsetMin as number ?? 0 }
    } else if (data?.type === 'eisenhower_widget') {
      drag = { type: 'eisenhower_widget' }
    }
    activeDragRef.current = drag
    setActiveDrag(drag)
    updateGhostFromRefs()
  }

  // handleDragMove nie jest potrzebny — pointermove robi to samo dokładniej
  const handleDragMove = (_e: DragMoveEvent) => { /* obsługiwane przez pointermove */ }

  const handleDragOver = (e: { over: DragEndEvent['over'] }) => {
    currentOverRef.current = e.over
    setCurrentOver(e.over)
    updateGhostFromRefs()
  }

  const handleDragEnd = (e: DragEndEvent) => {
    setDragGhost(null)
    setCurrentOver(null)
    activeDragRef.current = null
    currentOverRef.current = null
    const drag = activeDrag
    setActiveDrag(null)

    const { over, active } = e
    if (!over) return

    const overData = over.data.current as {
      type: string; date: Date; dayIndex: number; columnRef: React.RefObject<HTMLDivElement>
    } | undefined
    const activeData = active.data.current as { type: string; [key: string]: unknown } | undefined

    // Sortowanie szablonów — dropped na inny szablon (nie na kalendarz)
    if (activeData?.type === 'template' && overData?.type !== 'calendar_day') {
      const activeId = e.active.id as number
      const overId = e.over?.id as number
      if (activeId !== overId && typeof activeId === 'number' && typeof overId === 'number') {
        const ids = templates.map((t) => t.id)
        // Zastosuj zapisaną kolejność jeśli istnieje
        const orderedIds = templateOrder.length > 0
          ? [...templateOrder, ...ids.filter(id => !templateOrder.includes(id))]
          : ids
        const oldIdx = orderedIds.indexOf(activeId)
        const newIdx = orderedIds.indexOf(overId)
        if (oldIdx !== -1 && newIdx !== -1) {
          setTemplateOrder(arrayMove(orderedIds, oldIdx, newIdx))
        }
      }
      return
    }

    if (!overData || overData.type !== 'calendar_day') return

    // Wylicz docelową godzinę z aktualnego clientY kursora
    // Dla eventów: odejmij grabOffsetMin żeby event nie skakał na górę
    let targetHour = hourStart
    const colEl = overData.columnRef?.current
    if (colEl) {
      const rect = colEl.getBoundingClientRect()
      const rawHour = yToHour(cursorYRef.current || rect.top + 60, rect, hourStart, hourEnd)
      const grabOffsetHour = (activeData?.type === 'calendar_event'
        ? ((activeData.grabOffsetMin as number) ?? 0)
        : 0) / 60
      const adjusted = rawHour - grabOffsetHour
      const snapped = Math.round(adjusted * 4) / 4
      targetHour = Math.max(hourStart, Math.min(hourEnd - 0.25, snapped))
    }

    const targetDate = new Date(overData.date)
    targetDate.setHours(Math.floor(targetHour), Math.round((targetHour % 1) * 60), 0, 0)

    if (activeData?.type === 'template') {
      const tpl = activeData.template as ActivityTemplate
      const end = new Date(targetDate)
      end.setMinutes(end.getMinutes() + tpl.default_duration)
      createMut.mutate({
        title: tpl.name,
        description: tpl.description || undefined,
        start_datetime: targetDate.toISOString(),
        end_datetime: end.toISOString(),
        activity_template_id: tpl.id,
        is_background: tpl.is_background,
      } as Parameters<typeof eventsApi.create>[0])

    } else if (activeData?.type === 'calendar_event') {
      const event = activeData.event as Event
      const durationMin = activeData.durationMin as number
      const end = new Date(targetDate)
      end.setMinutes(end.getMinutes() + durationMin)
      updateMut.mutate({
        id: event.id,
        data: {
          start_datetime: targetDate.toISOString(),
          end_datetime: end.toISOString(),
        },
        before: {
          start_datetime: event.start_datetime,
          end_datetime: event.end_datetime,
        },
      })
    } else if (activeData?.type === 'eisenhower_widget') {
      // Otwórz picker kwadrantu — event zostanie stworzony po wyborze
      setQuadrantPicker({ targetDate, targetHour })
    }
  }

  const handleDragCancel = () => {
    setDragGhost(null)
    setCurrentOver(null)
    setActiveDrag(null)
    activeDragRef.current = null
    currentOverRef.current = null
  }

  // ── DragOverlay — "duch" przy kursorze ──────────────────────────────────────
  const overlayContent = (() => {
    if (!activeDrag) return null
    if (activeDrag.type === 'template') {
      const t = activeDrag.template
      return (
        <div className="px-3 py-2 rounded-lg text-sm font-semibold shadow-2xl pointer-events-none flex items-center gap-2"
          style={{ backgroundColor: t.color + '33', color: t.color, borderLeft: `3px solid ${t.color}` }}>
          <IconRenderer icon={t.icon} size={16} iconSet={iconSet} />
          {t.name}
        </div>
      )
    }
    if (activeDrag.type === 'calendar_event') {
      // Dla eventów kalendarza nie pokazujemy DragOverlay przy kursorze —
      // podgląd jest renderowany jako GhostBlock bezpośrednio w kolumnie docelowej.
      return null
    }
    if (activeDrag.type === 'eisenhower_widget') {
      return (
        <div className="px-3 py-2 rounded-lg text-sm font-semibold shadow-2xl pointer-events-none flex items-center gap-2"
          style={{ backgroundColor: 'rgba(139,92,246,0.25)', color: '#8b5cf6', borderLeft: '3px solid #8b5cf6' }}>
          📋 Matryca Eisenhowera
        </div>
      )
    }
    return null
  })()

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex h-screen overflow-hidden bg-gray-50">
        <Sidebar />
        <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <WeeklyCalendar />
        </main>
      </div>

      <DragOverlay dropAnimation={null}>
        {overlayContent}
      </DragOverlay>

      {/* QuadrantPicker — po dropie widgetu Eisenhowera na kalendarz */}
      {quadrantPicker && (
        <QuadrantPicker
          targetDate={quadrantPicker.targetDate}
          targetHour={quadrantPicker.targetHour}
          onClose={() => setQuadrantPicker(null)}
          onSelect={(quadrant) => {
            const { targetDate, targetHour } = quadrantPicker
            const start = new Date(targetDate)
            start.setHours(Math.floor(targetHour), Math.round((targetHour % 1) * 60), 0, 0)
            const end = new Date(start)
            end.setMinutes(end.getMinutes() + 60) // 1h domyślnie
            const qCfg = QUADRANT_OPTIONS.find((q) => q.id === quadrant)!
            createMut.mutate({
              title: qCfg.label,
              start_datetime: start.toISOString(),
              end_datetime: end.toISOString(),
              is_background: false,
              eisenhower_quadrant: quadrant,
              color: qCfg.color,
              icon: qCfg.icon,
            } as Parameters<typeof eventsApi.create>[0])
            setQuadrantPicker(null)
          }}
        />
      )}
    </DndContext>
  )
}
