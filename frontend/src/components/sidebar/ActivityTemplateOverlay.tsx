import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ActivityTemplate } from '../../types'
import { useCalendarStore } from '../../store/calendarStore'
import { getIconSetConfig } from '../../lib/iconSets'
import { IconRenderer, formatIconId, isReactIcon } from '../ui/IconRenderer'
import { DescriptionField } from '../ui/DescriptionField'

const COLOR_OPTIONS = [
  '#6366f1', '#3b82f6', '#0ea5e9', '#06b6d4',
  '#14b8a6', '#10b981', '#22c55e', '#84cc16',
  '#eab308', '#f59e0b', '#f97316', '#ef4444',
  '#f43f5e', '#ec4899', '#d946ef', '#a855f7',
  '#8b5cf6', '#7c3aed', '#64748b', '#1e293b',
]

const QUICK_DURATIONS = [15, 30, 45, 60, 90, 120]

type FormData = { name: string; color: string; icon: string; default_duration: number; description: string; is_background: boolean }

interface Props {
  /** Jeśli podane — tryb edycji; brak — tryb tworzenia */
  template?: ActivityTemplate
  onSave: (data: FormData) => void
  onDelete?: () => void
  onClose: () => void
}

export function ActivityTemplateOverlay({ template, onSave, onDelete, onClose }: Props) {
  const isEdit = !!template
  const iconSet = useCalendarStore((s) => s.iconSet)
  const iconSetConfig = useMemo(() => getIconSetConfig(iconSet), [iconSet])

  // Wyszukiwanie ikon
  const [iconSearch, setIconSearch] = useState('')
  const filteredIcons = useMemo(() => {
    const q = iconSearch.toLowerCase()
    if (!q) return iconSetConfig.icons.slice(0, 60)
    return iconSetConfig.icons.filter(ic => ic.toLowerCase().includes(q)).slice(0, 60)
  }, [iconSetConfig, iconSearch])

  const [form, setForm] = useState<FormData>({
    name: template?.name ?? '',
    color: template?.color ?? '#6366f1',
    icon: template?.icon ?? '⭐',
    default_duration: template?.default_duration ?? 60,
    description: template?.description ?? '',
    is_background: template?.is_background ?? false,
  })

  const colorInputRef = useRef<HTMLInputElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)

  // czy użytkownik wpisuje custom czas
  const isCustomDuration = !QUICK_DURATIONS.includes(form.default_duration)
  const [showCustomInput, setShowCustomInput] = useState(isCustomDuration)

  // Zamknij na Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const handleSave = () => {
    if (!form.name.trim()) return
    onSave(form)
    onClose()
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div ref={modalRef} className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-1 h-6 rounded-full" style={{ backgroundColor: form.color }} />
            <h2 className="text-base font-bold text-gray-900 dark:text-slate-100">
              {isEdit ? 'Edytuj aktywność' : 'Nowa aktywność'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors text-lg leading-none"
            title="Zamknij"
          >✕</button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5 overflow-y-auto max-h-[80vh]">
          {/* Podgląd */}
          <div className="flex items-center gap-3 p-3 rounded-xl" style={{ backgroundColor: form.color + '18', borderLeft: `4px solid ${form.color}` }}>
            <span className="text-3xl shrink-0" style={{ color: form.color }}>
              <IconRenderer icon={form.icon} size={30} iconSet={iconSet} />
            </span>
            <div>
              <p className="font-semibold text-sm" style={{ color: form.color }}>{form.name || 'Podgląd...'}</p>
              <p className="text-xs text-gray-400 dark:text-slate-500">{form.default_duration} min</p>
            </div>
          </div>

          {/* Nazwa */}
          <div className="relative">
            <label className="absolute top-2 left-3 text-xs font-medium text-gray-400 dark:text-slate-500 pointer-events-none z-10">Nazwa</label>
            <input
              placeholder="Np. Nauka, Trening, Spotkanie..."
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
              className="w-full border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 rounded-xl px-3 pt-6 pb-2 text-sm text-gray-900 dark:text-slate-100 placeholder:text-gray-300 dark:placeholder:text-slate-600 focus:outline-none transition-all"
              onFocus={e => e.currentTarget.style.borderColor = form.color}
              onBlur={e => e.currentTarget.style.borderColor = ''}
            />
          </div>

          {/* Opis */}
          <DescriptionField
            value={form.description}
            onChange={(html) => setForm({ ...form, description: html })}
            accentColor={form.color}
            modalRef={modalRef}
          />

          {/* Ikona */}
          <div>
            <p className="text-xs font-medium text-gray-400 dark:text-slate-500 mb-2">
              Ikona <span className="text-gray-300 dark:text-slate-600">— {iconSetConfig.name}</span>
            </p>

            {/* Wyszukiwarka ikon */}
            <div className="relative mb-2">
              <label className="absolute top-2 left-3 text-xs font-medium text-gray-400 dark:text-slate-500 pointer-events-none z-10">Szukaj</label>
              <input
                type="text"
                placeholder={`Szukaj w ${iconSetConfig.name}...`}
                value={iconSearch}
                onChange={(e) => setIconSearch(e.target.value)}
                className="w-full border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 rounded-xl px-3 pt-6 pb-2 text-sm text-gray-900 dark:text-slate-100 placeholder:text-gray-300 dark:placeholder:text-slate-600 focus:outline-none transition-all"
                onFocus={e => e.currentTarget.style.borderColor = form.color}
                onBlur={e => e.currentTarget.style.borderColor = ''}
              />
            </div>

            {/* Siatka ikon */}
            <div className="grid grid-cols-8 gap-1 max-h-40 overflow-y-auto p-1 border border-gray-100 dark:border-slate-700 rounded-xl bg-gray-50/50 dark:bg-slate-700/50">
              {filteredIcons.map((iconName) => {
                const iconId = formatIconId(iconSet, iconName)
                const isSelected = form.icon === iconId
                return (
                  <button
                    key={iconName}
                    type="button"
                    title={iconName}
                    onClick={() => setForm({ ...form, icon: iconId })}
                    className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all text-slate-700 dark:text-slate-200 ${
                      isSelected ? 'scale-110 shadow-sm' : 'hover:bg-white dark:hover:bg-slate-600 hover:shadow-sm'
                    }`}
                    style={isSelected ? { backgroundColor: form.color + '22', color: form.color, outline: `2px solid ${form.color}`, outlineOffset: '1px' } : {}}
                  >
                    <IconRenderer icon={iconId} size={18} />
                  </button>
                )
              })}
              {filteredIcons.length === 0 && (
                <div className="col-span-8 text-xs text-gray-400 dark:text-slate-500 text-center py-4">Brak wyników</div>
              )}
            </div>
          </div>

          {/* Kolor */}
          <div>
            <p className="text-xs font-medium text-gray-400 dark:text-slate-500 mb-2">Kolor</p>
            <div className="flex gap-2 flex-wrap">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm({ ...form, color: c })}
                  className={`w-7 h-7 rounded-full border-2 transition-all ${
                    form.color === c ? 'border-gray-800 scale-125 shadow-md' : 'border-transparent hover:scale-110'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
              {/* Własny kolor */}
              <button
                type="button"
                title="Własny kolor"
                onClick={() => colorInputRef.current?.click()}
                className={`w-7 h-7 rounded-full border-2 transition-all flex items-center justify-center text-xs font-bold ${
                  !COLOR_OPTIONS.includes(form.color)
                    ? 'border-gray-800 scale-125 shadow-md'
                    : 'border-dashed border-gray-400 hover:scale-110 text-gray-400 hover:text-gray-600'
                }`}
                style={!COLOR_OPTIONS.includes(form.color) ? { backgroundColor: form.color } : {}}
              >
                {COLOR_OPTIONS.includes(form.color) && '+'}
              </button>
              <input
                ref={colorInputRef}
                type="color"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                className="sr-only"
              />
            </div>
          </div>

          {/* Czas trwania */}
          <div>
            <p className="text-xs font-medium text-gray-400 dark:text-slate-500 mb-2">Domyślny czas trwania</p>
            <div className="flex gap-1.5 flex-wrap items-center">
              {QUICK_DURATIONS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setForm({ ...form, default_duration: m }); setShowCustomInput(false) }}
                  className="text-xs px-2.5 py-1 rounded-full border transition-all"
                  style={!showCustomInput && form.default_duration === m
                    ? { backgroundColor: form.color, color: 'white', borderColor: form.color }
                    : {}}
                  onMouseEnter={e => { if (showCustomInput || form.default_duration !== m) e.currentTarget.style.borderColor = form.color }}
                  onMouseLeave={e => { if (showCustomInput || form.default_duration !== m) e.currentTarget.style.borderColor = '' }}
                >
                  {m}m
                </button>
              ))}
              <button
                type="button"
                onClick={() => setShowCustomInput(true)}
                className="text-xs px-2.5 py-1 rounded-full border transition-all"
                style={showCustomInput ? { backgroundColor: form.color, color: 'white', borderColor: form.color } : {}}
              >
                Custom
              </button>
            </div>
            {showCustomInput && (
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="number"
                  min={1}
                  max={480}
                  step={5}
                  autoFocus
                  value={form.default_duration}
                  onChange={(e) => setForm({ ...form, default_duration: Math.max(1, Number(e.target.value)) })}
                  className="w-20 border rounded-lg px-2 py-1 text-sm font-semibold text-center focus:outline-none transition-all"
                  style={{ borderColor: form.color }}
                />
                <span className="text-sm text-gray-400 dark:text-slate-500">minut</span>
              </div>
            )}
          </div>

          {/* Proces w tle */}
          <div>
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <div className="relative shrink-0">
                <input
                  type="checkbox"
                  checked={form.is_background}
                  onChange={(e) => setForm({ ...form, is_background: e.target.checked })}
                  className="sr-only"
                />
                <div
                  className={`w-10 h-5 rounded-full transition-colors ${!form.is_background ? 'bg-gray-200 dark:bg-slate-600' : ''}`}
                  style={{ backgroundColor: form.is_background ? form.color : undefined }}
                />
                <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.is_background ? 'translate-x-5' : ''}`} />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-slate-200">Proces w tle</p>
                <p className="text-xs text-gray-400 dark:text-slate-500">Event będzie wyświetlany przezroczyście w kalendarzu</p>
              </div>
            </label>
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 dark:border-slate-700 flex gap-3 flex-wrap">
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="px-4 py-2.5 text-sm font-medium text-red-500 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
            >
              Usuń
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex-1 border border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-400 rounded-xl py-2.5 text-sm font-medium hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
          >
            Anuluj
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!form.name.trim()}
            className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-white transition-all disabled:opacity-40"
            style={{ backgroundColor: form.color }}
          >
            {isEdit ? 'Zapisz zmiany' : 'Utwórz aktywność'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
