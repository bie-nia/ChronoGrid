import { useState, useEffect, useRef, useMemo } from 'react'
import { format } from 'date-fns'
import { DescriptionField } from '../ui/DescriptionField'
import { Event, ActivityTemplate } from '../../types'
import { eventsApi } from '../../api/events'
import { useQueryClient } from '@tanstack/react-query'
import { useCalendarStore } from '../../store/calendarStore'
import { IconRenderer, formatIconId } from '../ui/IconRenderer'
import { getIconSetConfig } from '../../lib/iconSets'

const COLOR_OPTIONS = [
  '#6366f1', '#3b82f6', '#0ea5e9', '#06b6d4',
  '#14b8a6', '#10b981', '#22c55e', '#84cc16',
  '#eab308', '#f59e0b', '#f97316', '#ef4444',
  '#f43f5e', '#ec4899', '#d946ef', '#a855f7',
  '#8b5cf6', '#7c3aed', '#64748b', '#1e293b',
]

interface EventModalProps {
  mode: 'create' | 'edit'
  event?: Event
  defaultStart?: string
  defaultTemplateId?: number
  templates: ActivityTemplate[]
  onClose: () => void
  onSave: (data: Partial<Event>) => void
  onDelete?: () => void
  /** offsetDays — jednorazowo za X dni; repeatWeeks — co tydzień przez X tygodni (0 = na zawsze) */
  onPin?: (cfg: { offsetDays?: number; repeatWeeks?: number }) => void
}

function toLocalDatetimeInput(isoStr: string): string {
  const d = new Date(isoStr)
  return format(d, "yyyy-MM-dd'T'HH:mm")
}

function fromLocalDatetimeInput(local: string): string {
  return new Date(local).toISOString()
}

export function EventModal({
  mode,
  event,
  defaultStart,
  defaultTemplateId,
  templates,
  onClose,
  onSave,
  onDelete,
  onPin,
}: EventModalProps) {
  const qc = useQueryClient()
  const iconSet = useCalendarStore((s) => s.iconSet)
  const iconSetConfig = useMemo(() => getIconSetConfig(iconSet), [iconSet])
  const colorInputRef = useRef<HTMLInputElement>(null)

  const defaultStartStr = defaultStart
    ? toLocalDatetimeInput(defaultStart)
    : toLocalDatetimeInput(new Date().toISOString())

  const defaultEnd = defaultStart
    ? (() => {
        const d = new Date(defaultStart)
        d.setMinutes(d.getMinutes() + 60)
        return toLocalDatetimeInput(d.toISOString())
      })()
    : toLocalDatetimeInput(new Date().toISOString())

  const [title, setTitle] = useState(event?.title ?? '')
  const [startDt, setStartDt] = useState(event ? toLocalDatetimeInput(event.start_datetime) : defaultStartStr)
  const [endDt, setEndDt] = useState(event ? toLocalDatetimeInput(event.end_datetime) : defaultEnd)
  const [templateId] = useState<number | ''>(
    event?.activity_template_id ?? defaultTemplateId ?? '',
  )

  // Kolor, ikona, opis — z szablonu jeśli nie nadpisane per-event
  const selectedTplForInit = templates.find((t) => t.id === (event?.activity_template_id ?? defaultTemplateId))

  const [description, setDescription] = useState(event?.description ?? selectedTplForInit?.description ?? '')
  const [location, setLocation] = useState(event?.location ?? '')
  const [isBackground, setIsBackground] = useState(event?.is_background ?? false)
  const [color, setColor] = useState<string>(event?.color ?? selectedTplForInit?.color ?? '#6366f1')
  const [icon, setIcon] = useState<string>(event?.icon ?? selectedTplForInit?.icon ?? '')
  const [iconSearch, setIconSearch] = useState('')
  const [iconPickerOpen, setIconPickerOpen] = useState(false)

  const filteredIcons = useMemo(() => {
    const q = iconSearch.toLowerCase()
    if (!q) return iconSetConfig.icons.slice(0, 48)
    return iconSetConfig.icons.filter(ic => ic.toLowerCase().includes(q)).slice(0, 48)
  }, [iconSetConfig, iconSearch])

  // Zaawansowane (daty + czas trwania)
  const [advOpen, setAdvOpen] = useState(false)

  // Czas trwania w minutach — synchronizowany z startDt/endDt
  const calcDuration = () => {
    const s = new Date(startDt)
    const e = new Date(endDt)
    return Math.max(15, Math.round((e.getTime() - s.getTime()) / 60000))
  }
  const [durationMin, setDurationMin] = useState<number>(calcDuration)

  const handleStartChange = (val: string) => {
    setStartDt(val)
    // Przesuń koniec zachowując czas trwania
    const newEnd = new Date(new Date(val).getTime() + durationMin * 60000)
    setEndDt(format(newEnd, "yyyy-MM-dd'T'HH:mm"))
  }

  const handleEndChange = (val: string) => {
    setEndDt(val)
    // Przelicz czas trwania
    const dur = Math.max(15, Math.round((new Date(val).getTime() - new Date(startDt).getTime()) / 60000))
    setDurationMin(dur)
  }

  const handleDurationChange = (mins: number) => {
    const clamped = Math.max(15, mins)
    setDurationMin(clamped)
    // Przesuń koniec
    const newEnd = new Date(new Date(startDt).getTime() + clamped * 60000)
    setEndDt(format(newEnd, "yyyy-MM-dd'T'HH:mm"))
  }

  const DURATION_PRESETS = [15, 30, 45, 60, 90, 120, 180]

  // ── Pin ────────────────────────────────────────────────────────────────────
  const [pinOpen, setPinOpen] = useState(false)
  const [pinMode, setPinMode] = useState<'once' | 'weekly'>('once')
  const [pinCustomVal, setPinCustomVal] = useState<string>('')
  const [pinShowCustom, setPinShowCustom] = useState(false)
  const [pinShowDate, setPinShowDate] = useState(false)
  const [pinDD, setPinDD] = useState('')
  const [pinMM, setPinMM] = useState('')
  const [pinYY, setPinYY] = useState('')
  const [pinDateError, setPinDateError] = useState('')
  const pinMMRef = useRef<HTMLInputElement>(null)
  const pinYYRef = useRef<HTMLInputElement>(null)
  // tryb create: zapamiętaj config do zastosowania po zapisie
  const [pinCfgOnCreate, setPinCfgOnCreate] = useState<{ offsetDays?: number; repeatWeeks?: number } | null>(null)
  const pinPanelRef = useRef<HTMLDivElement>(null)

  // Zamknij Pin panel klikając poza nim
  useEffect(() => {
    if (!pinOpen) return
    const handler = (e: MouseEvent) => {
      if (pinPanelRef.current && !pinPanelRef.current.contains(e.target as Node)) {
        setPinOpen(false)
        setPinShowCustom(false)
        setPinShowDate(false)
        setPinCustomVal('')
        setPinDD(''); setPinMM(''); setPinYY(''); setPinDateError('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [pinOpen])

  // Escape zamyka modal
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const handlePinSelect = (val: number) => {
    const cfg = pinMode === 'once'
      ? { offsetDays: val }
      : { repeatWeeks: val }
    // W obu trybach tylko zapamiętaj — wykona się po kliknięciu Zapisz/Utwórz
    setPinCfgOnCreate(cfg)
    setPinOpen(false)
  }

  const handlePinDate = () => {
    setPinDateError('')
    const dd = parseInt(pinDD), mm = parseInt(pinMM), yy = parseInt(pinYY)
    // Walidacja — czy pola są wypełnione
    if (!pinDD || !pinMM || !pinYY) { setPinDateError('Wypełnij wszystkie pola'); return }
    // Walidacja — zakres
    if (mm < 1 || mm > 12) { setPinDateError('Miesiąc: 1–12'); return }
    if (dd < 1 || dd > 31) { setPinDateError('Dzień: 1–31'); return }
    if (yy < 2024 || yy > 2099) { setPinDateError('Rok: 2024–2099'); return }
    // Walidacja — czy data istnieje (np. 31 lutego)
    const target = new Date(yy, mm - 1, dd)
    if (target.getFullYear() !== yy || target.getMonth() !== mm - 1 || target.getDate() !== dd) {
      setPinDateError('Ta data nie istnieje'); return
    }
    target.setHours(0, 0, 0, 0)
    const eventStart = new Date(startDt)
    eventStart.setHours(0, 0, 0, 0)
    const diffDays = Math.round((target.getTime() - eventStart.getTime()) / (24 * 60 * 60 * 1000))
    if (diffDays <= 0) { setPinDateError('Data musi być po dacie eventu'); return }
    if (pinMode === 'once') {
      handlePinSelect(diffDays)
    } else {
      const weeks = Math.floor(diffDays / 7)
      if (weeks <= 0) { setPinDateError('Za mało czasu na pełny tydzień'); return }
      handlePinSelect(weeks)
    }
    setPinShowDate(false)
    setPinDD(''); setPinMM(''); setPinYY(''); setPinDateError('')
  }

  const handleSave = async () => {
    if (!title.trim() || !startDt || !endDt) return
    const data = {
      title: title.trim(),
      start_datetime: fromLocalDatetimeInput(startDt),
      end_datetime: fromLocalDatetimeInput(endDt),
      activity_template_id: templateId !== '' ? templateId : undefined,
      description: description || undefined,
      location: location || undefined,
      is_background: isBackground,
      color,
      icon: icon || undefined,
    }

    if (pinCfgOnCreate !== null && mode === 'edit') {
      // edit: najpierw zapisz zmiany, potem wykonaj pin
      onSave(data)
      onPin?.(pinCfgOnCreate)
      return
    }

    if (mode === 'create' && pinCfgOnCreate !== null) {
      const created = await eventsApi.create(data as Parameters<typeof eventsApi.create>[0])
      const { offsetDays, repeatWeeks } = pinCfgOnCreate
      if (offsetDays !== undefined) {
        // jednorazowo — 1 kopia przesunięta o offsetDays dni
        const newStart = new Date(new Date(created.start_datetime).getTime() + offsetDays * 24 * 60 * 60 * 1000)
        const newEnd   = new Date(new Date(created.end_datetime).getTime()   + offsetDays * 24 * 60 * 60 * 1000)
        await eventsApi.create({
          title: created.title,
          start_datetime: newStart.toISOString(),
          end_datetime: newEnd.toISOString(),
          activity_template_id: created.activity_template_id,
          description: created.description,
          location: created.location,
          color: created.color,
          icon: created.icon,
        } as Parameters<typeof eventsApi.create>[0])
      } else if (repeatWeeks !== undefined) {
        // co tydzień — jeden request do /events/recurring
        const count = repeatWeeks === 0 ? 52 * 10 : repeatWeeks
        await eventsApi.createRecurring({
          title: created.title,
          start_datetime: new Date(new Date(created.start_datetime).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          end_datetime:   new Date(new Date(created.end_datetime).getTime()   + 7 * 24 * 60 * 60 * 1000).toISOString(),
          interval_days: 7,
          occurrences: count,
          activity_template_id: created.activity_template_id,
          description: created.description,
          location: created.location,
        })
      }
      qc.invalidateQueries({ queryKey: ['events'] })
      onClose()
    } else {
      onSave(data)
    }
  }

  const accentColor = color

  const PIN_PRESETS_ONCE = [
    { v: 1,  label: 'Jutro' },
    { v: 2,  label: 'Za 2 dni' },
    { v: 3,  label: 'Za 3 dni' },
    { v: 7,  label: 'Za tydzień' },
    { v: 14, label: 'Za 2 tygodnie' },
    { v: 30, label: 'Za miesiąc' },
  ]
  const PIN_PRESETS_WEEKLY = [
    { v: 1,  label: 'Przez 1 tydzień' },
    { v: 2,  label: 'Przez 2 tygodnie' },
    { v: 4,  label: 'Przez 4 tygodnie' },
    { v: 8,  label: 'Przez 8 tygodni' },
    { v: 12, label: 'Przez 12 tygodni' },
  ]

  const pinCfgLabel = (cfg: { offsetDays?: number; repeatWeeks?: number }) => {
    if (cfg.offsetDays !== undefined) {
      const d = cfg.offsetDays
      if (d === 1) return 'jutro'
      if (d % 7 === 0) return `za ${d / 7} tydz.`
      return `za ${d} dni`
    }
    if (cfg.repeatWeeks !== undefined) {
      return cfg.repeatWeeks === 0 ? 'co tydz. ∞' : `co tydz. ×${cfg.repeatWeeks}`
    }
    return ''
  }

  const modalRef = useRef<HTMLDivElement>(null)

  return (
    <div
      className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div ref={modalRef} className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden">
        {/* Header — biały z kolorowym paskiem po lewej */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-1 h-6 rounded-full" style={{ backgroundColor: accentColor }} />
            <h2 className="font-bold text-gray-900 dark:text-slate-100 text-base">
              {mode === 'create' ? 'Nowe wydarzenie' : 'Edytuj wydarzenie'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors text-lg leading-none"
          >×</button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto max-h-[80vh]">
          {/* Tytuł */}
          <input
            autoFocus
            placeholder="Tytuł wydarzenia"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
            className="w-full text-lg font-bold bg-transparent border-0 border-b-2 border-gray-200 dark:border-slate-600 py-1 focus:outline-none placeholder:font-normal placeholder:text-gray-300 dark:placeholder:text-slate-600 text-gray-900 dark:text-slate-100 transition-colors"
            style={{ '--tw-border-opacity': '1' } as React.CSSProperties}
            onFocus={e => e.currentTarget.style.borderBottomColor = accentColor}
            onBlur={e => e.currentTarget.style.borderBottomColor = ''}
          />

          {/* Lokalizacja */}
          <div className="relative">
            <label className="absolute top-2 left-3 text-xs font-medium text-gray-400 dark:text-slate-500 pointer-events-none">Lokalizacja</label>
            <input
              placeholder="Sala, adres..."
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 rounded-xl px-3 pt-6 pb-2 text-sm text-gray-900 dark:text-slate-100 placeholder:text-gray-300 dark:placeholder:text-slate-600 focus:outline-none transition-all"
              onFocus={e => e.currentTarget.style.borderColor = accentColor}
              onBlur={e => e.currentTarget.style.borderColor = ''}
            />
          </div>

          {/* Opis — klikalne pole otwierające duży edytor */}
          <DescriptionField
            value={description}
            onChange={setDescription}
            accentColor={accentColor}
            modalRef={modalRef}
          />

          {/* ── Ikona + Kolor w jednym wierszu ── */}
          <div className="flex gap-3 items-start">
            {/* Ikona */}
            <div className="shrink-0">
              <label className="text-xs text-gray-500 dark:text-slate-400 block mb-1">Ikona</label>
              <button
                type="button"
                onClick={() => setIconPickerOpen(v => !v)}
                className="w-10 h-10 rounded-xl flex items-center justify-center border-2 border-gray-200 dark:border-slate-600 hover:border-indigo-400 transition-colors"
                style={{ backgroundColor: color + '22', borderColor: iconPickerOpen ? color : undefined, color }}
              >
                {icon ? <IconRenderer icon={icon} size={20} iconSet={iconSet} /> : <span className="text-gray-400 text-lg">?</span>}
              </button>
            </div>

            {/* Kolor */}
            <div className="flex-1">
              <label className="text-xs text-gray-500 dark:text-slate-400 block mb-1">Kolor</label>
              <div className="flex flex-wrap gap-1.5">
                {COLOR_OPTIONS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`w-5 h-5 rounded-full border-2 transition-all ${
                      color === c ? 'border-gray-800 scale-125 shadow' : 'border-transparent hover:scale-110'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
                {/* Custom */}
                <button
                  type="button"
                  title="Własny kolor"
                  onClick={() => colorInputRef.current?.click()}
                  className={`w-5 h-5 rounded-full border-2 transition-all flex items-center justify-center text-xs font-bold ${
                    !COLOR_OPTIONS.includes(color)
                      ? 'border-gray-800 scale-125 shadow'
                      : 'border-dashed border-gray-400 hover:scale-110 text-gray-400'
                  }`}
                  style={!COLOR_OPTIONS.includes(color) ? { backgroundColor: color } : {}}
                >
                  {COLOR_OPTIONS.includes(color) && '+'}
                </button>
                <input ref={colorInputRef} type="color" value={color} onChange={(e) => setColor(e.target.value)} className="sr-only" />
              </div>
            </div>
          </div>

          {/* Picker ikon — rozwija się pod wierszem ikona+kolor */}
          {iconPickerOpen && (
            <div className="border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 rounded-xl p-2 space-y-2">
              <input
                type="text"
                placeholder={`Szukaj w ${iconSetConfig.name}...`}
                value={iconSearch}
                onChange={(e) => setIconSearch(e.target.value)}
                className="w-full border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300"
                autoFocus
              />
              <div className="grid grid-cols-8 gap-1 max-h-32 overflow-y-auto">
                {filteredIcons.map((iconName) => {
                  const iconId = formatIconId(iconSet, iconName)
                  const isSelected = icon === iconId
                  return (
                    <button
                      key={iconName}
                      type="button"
                      title={iconName}
                      onClick={() => { setIcon(iconId); setIconPickerOpen(false) }}
                      className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all text-slate-700 dark:text-slate-200 ${
                        isSelected ? 'ring-2 scale-110' : 'hover:bg-gray-100 dark:hover:bg-slate-600'
                      }`}
                      style={isSelected ? { backgroundColor: color + '22', color, outline: `2px solid ${color}` } : {}}
                    >
                      <IconRenderer icon={iconId} size={16} />
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Czas trwania ── */}
          <div>
            <label className="text-xs text-gray-500 dark:text-slate-400 block mb-1.5">Czas trwania</label>
            <div className="flex flex-wrap gap-1.5 items-center">
              {DURATION_PRESETS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => handleDurationChange(m)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                    durationMin === m
                      ? 'text-white border-transparent'
                      : 'border-gray-200 dark:border-slate-600 text-gray-500 dark:text-slate-400 hover:border-indigo-400'
                  }`}
                  style={durationMin === m ? { backgroundColor: color } : {}}
                >
                  {m >= 60 ? `${m / 60}h` : `${m}m`}
                </button>
              ))}
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={15}
                  max={1440}
                  step={15}
                  value={durationMin}
                  onChange={(e) => handleDurationChange(parseInt(e.target.value) || 15)}
                  className="w-14 border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 rounded-lg px-1.5 py-1 text-xs text-center focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
                <span className="text-xs text-gray-400 dark:text-slate-500">min</span>
              </div>
            </div>
          </div>

          {/* ── Pin — wysuwany panel (oba tryby) ── */}
          <div className="border border-gray-100 dark:border-slate-700 rounded-xl overflow-hidden" ref={pinPanelRef}>
            <button
              type="button"
              onClick={() => { setPinOpen((v) => !v); setPinShowCustom(false); setPinCustomVal('') }}
              className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
            >
              <span className="font-medium text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                <IconRenderer icon="📌" iconSet={iconSet} size={14} /> Pin — duplikuj wydarzenie
                {mode === 'create' && pinCfgOnCreate !== null && (
                  <span className="text-indigo-400 font-normal">· {pinCfgLabel(pinCfgOnCreate)}</span>
                )}
              </span>
              <span className={`text-gray-400 dark:text-slate-500 transition-transform duration-200 ${pinOpen ? 'rotate-180' : ''}`}>▾</span>
            </button>

            {pinOpen && (
              <div className="border-t border-gray-100 dark:border-slate-700 px-3 py-3 space-y-2">
                {/* Przełącznik trybu */}
                <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-slate-600 text-xs mb-1">
                  <button
                    type="button"
                    onClick={() => { setPinMode('once'); setPinShowCustom(false); setPinShowDate(false); setPinCustomVal(''); setPinDD(''); setPinMM(''); setPinYY(''); setPinDateError('') }}
                    className="flex-1 py-1.5 transition-colors"
                    style={pinMode === 'once' ? { backgroundColor: accentColor, color: 'white' } : { color: '#6b7280' }}
                  >
                    Jednorazowo
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPinMode('weekly'); setPinShowCustom(false); setPinShowDate(false); setPinCustomVal(''); setPinDD(''); setPinMM(''); setPinYY(''); setPinDateError('') }}
                    className="flex-1 py-1.5 transition-colors"
                    style={pinMode === 'weekly' ? { backgroundColor: accentColor, color: 'white' } : { color: '#6b7280' }}
                  >
                    Co tydzień
                  </button>
                </div>

                {/* Presety */}
                {(pinMode === 'once' ? PIN_PRESETS_ONCE : PIN_PRESETS_WEEKLY).map(({ v, label }) => (
                  <button
                    key={v}
                    onClick={() => handlePinSelect(v)}
                    className="w-full text-left px-3 py-1.5 text-xs text-gray-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-700 dark:hover:text-indigo-300 rounded-lg transition-colors"
                  >
                    {label}
                  </button>
                ))}

                {/* Na zawsze — tylko tryb weekly */}
                {pinMode === 'weekly' && (
                  <button
                    onClick={() => handlePinSelect(0)}
                    className="w-full text-left px-3 py-1.5 text-xs font-medium text-indigo-700 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-colors border-t border-gray-100 dark:border-slate-700 pt-2"
                  >
                    <span className="inline-flex items-center gap-1"><IconRenderer icon="♾️" iconSet={iconSet} size={13} /> Na zawsze</span>
                  </button>
                )}

                {/* Do daty */}
                <div className="border-t border-gray-100 dark:border-slate-700 pt-2 mt-1 space-y-1">
                  {!pinShowDate ? (
                    <button
                      onClick={() => { setPinShowDate(true); setPinShowCustom(false); setPinDateError('') }}
                      className="w-full text-left px-3 py-1.5 text-xs text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-lg transition-colors"
                    >
                      <span className="inline-flex items-center gap-1">
                        <svg width="12" height="12" viewBox="0 0 15 15" fill="none" className="inline"><path d="M4.5 1a.5.5 0 0 1 .5.5V2h5v-.5a.5.5 0 0 1 1 0V2h1.5A1.5 1.5 0 0 1 14 3.5v9a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 1 12.5v-9A1.5 1.5 0 0 1 2.5 2H4v-.5a.5.5 0 0 1 .5-.5zM2 4.5v8a.5.5 0 0 0 .5.5h10a.5.5 0 0 0 .5-.5v-8H2z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"/></svg>
                        Do daty...
                      </span>
                    </button>
                  ) : (
                    <div className="px-3 pt-1 space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        {/* DD */}
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={2}
                          autoFocus
                          placeholder="DD"
                          value={pinDD}
                          onChange={(e) => {
                            const v = e.target.value.replace(/\D/g, '').slice(0, 2)
                            setPinDD(v); setPinDateError('')
                            if (v.length === 2) pinMMRef.current?.focus()
                          }}
                          onKeyDown={(e) => { if (e.key === 'Enter') handlePinDate() }}
                          className="w-10 border border-indigo-300 rounded-lg px-1.5 py-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-indigo-400"
                        />
                        <span className="text-gray-400 text-xs">/</span>
                        {/* MM */}
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={2}
                          ref={pinMMRef}
                          placeholder="MM"
                          value={pinMM}
                          onChange={(e) => {
                            const v = e.target.value.replace(/\D/g, '').slice(0, 2)
                            setPinMM(v); setPinDateError('')
                            if (v.length === 2) pinYYRef.current?.focus()
                          }}
                          onKeyDown={(e) => { if (e.key === 'Enter') handlePinDate() }}
                          className="w-10 border border-indigo-300 rounded-lg px-1.5 py-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-indigo-400"
                        />
                        <span className="text-gray-400 text-xs">/</span>
                        {/* YYYY */}
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={4}
                          ref={pinYYRef}
                          placeholder="RRRR"
                          value={pinYY}
                          onChange={(e) => {
                            const v = e.target.value.replace(/\D/g, '').slice(0, 4)
                            setPinYY(v); setPinDateError('')
                          }}
                          onKeyDown={(e) => { if (e.key === 'Enter') handlePinDate() }}
                          className="w-14 border border-indigo-300 rounded-lg px-1.5 py-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-indigo-400"
                        />
                        <button
                          onClick={handlePinDate}
                          disabled={!pinDD || !pinMM || !pinYY}
                          className="text-xs text-white rounded-lg px-3 py-1 disabled:opacity-40 transition-colors ml-1"
                          style={{ backgroundColor: accentColor }}
                        >
                          OK
                        </button>
                      </div>
                      {pinDateError && (
                        <p className="text-xs text-red-500 px-1">{pinDateError}</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Custom */}
                {!pinShowCustom ? (
                  <button
                    onClick={() => { setPinShowCustom(true); setPinShowDate(false) }}
                    className="w-full text-left px-3 py-1.5 text-xs text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-lg transition-colors"
                  >
                    <span className="inline-flex items-center gap-1"><IconRenderer icon="✏️" iconSet={iconSet} size={13} /> Custom...</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-2 px-3 pt-1">
                    <input
                      type="number"
                      min={1}
                      max={3650}
                      autoFocus
                      placeholder={pinMode === 'once' ? 'dni' : 'tygodni'}
                      value={pinCustomVal}
                      onChange={(e) => setPinCustomVal(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const v = parseInt(pinCustomVal)
                          if (v > 0) handlePinSelect(v)
                        }
                      }}
                      className="w-20 border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 rounded-lg px-2 py-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    />
                    <span className="text-xs text-gray-500 dark:text-slate-400">{pinMode === 'once' ? 'dni' : 'tygodni'}</span>
                    <button
                      onClick={() => { const v = parseInt(pinCustomVal); if (v > 0) handlePinSelect(v) }}
                      disabled={!pinCustomVal || parseInt(pinCustomVal) < 1}
                      className="text-xs text-white rounded-lg px-3 py-1 disabled:opacity-40 transition-colors"
                      style={{ backgroundColor: accentColor }}
                    >
                      OK
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Zaawansowane — daty, czas trwania, proces w tle */}
          <div className="border border-gray-100 dark:border-slate-700 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setAdvOpen((v) => !v)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
            >
              <span className="font-medium text-gray-600 dark:text-slate-300 flex items-center gap-1.5">
                Zaawansowane
                {isBackground && <span className="text-indigo-500 font-normal">· Proces w tle</span>}
              </span>
              <span className={`transition-transform duration-200 ${advOpen ? 'rotate-180' : ''}`}>▾</span>
            </button>
            {advOpen && (
              <div className="px-3 pb-3 pt-2 border-t border-gray-100 dark:border-slate-700 space-y-3">

                {/* Początek + Koniec */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="relative">
                    <label className="absolute top-1.5 left-3 text-xs font-medium text-gray-400 dark:text-slate-500 pointer-events-none">Początek</label>
                    <input
                      type="datetime-local"
                      value={startDt}
                      onChange={(e) => handleStartChange(e.target.value)}
                      className="w-full border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 rounded-xl px-3 pt-5 pb-1.5 text-xs focus:outline-none transition-all"
                      onFocus={e => e.currentTarget.style.borderColor = accentColor}
                      onBlur={e => e.currentTarget.style.borderColor = ''}
                    />
                  </div>
                  <div className="relative">
                    <label className="absolute top-1.5 left-3 text-xs font-medium text-gray-400 dark:text-slate-500 pointer-events-none">Koniec</label>
                    <input
                      type="datetime-local"
                      value={endDt}
                      onChange={(e) => handleEndChange(e.target.value)}
                      className="w-full border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 rounded-xl px-3 pt-5 pb-1.5 text-xs focus:outline-none transition-all"
                      onFocus={e => e.currentTarget.style.borderColor = accentColor}
                      onBlur={e => e.currentTarget.style.borderColor = ''}
                    />
                  </div>
                </div>

                {/* Proces w tle */}
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <div className="relative shrink-0">
                    <input
                      type="checkbox"
                      checked={isBackground}
                      onChange={(e) => setIsBackground(e.target.checked)}
                      className="sr-only"
                    />
                    <div className={`w-9 h-5 rounded-full transition-colors ${isBackground ? 'bg-indigo-500' : 'bg-gray-200 dark:bg-slate-600'}`} />
                    <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${isBackground ? 'translate-x-4' : ''}`} />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-700 dark:text-slate-200">Proces w tle</p>
                    <p className="text-xs text-gray-400 dark:text-slate-500">Wyświetlany przezroczyście, nie blokuje czasu</p>
                  </div>
                </label>

              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1 flex-wrap">
            {onDelete && (
              <button
                onClick={onDelete}
                className="px-3 py-2 text-xs text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/50 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                Usuń
              </button>
            )}
            <button
              onClick={onClose}
              className="px-3 py-2 text-xs text-gray-600 dark:text-slate-400 border border-gray-200 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors ml-auto"
            >
              Anuluj
            </button>
            <button
              onClick={handleSave}
              disabled={!title.trim()}
              className="px-4 py-2 text-xs text-white rounded-lg disabled:opacity-50 transition-colors font-medium"
              style={{ backgroundColor: accentColor }}
            >
              {mode === 'create'
                ? (pinCfgOnCreate !== null
                    ? <span className="inline-flex items-center gap-1"><IconRenderer icon="📌" iconSet={iconSet} size={12} />Utwórz + pin</span>
                    : 'Utwórz')
                : (pinCfgOnCreate !== null
                    ? <span className="inline-flex items-center gap-1"><IconRenderer icon="📌" iconSet={iconSet} size={12} />Zapisz + pin</span>
                    : 'Zapisz')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}


