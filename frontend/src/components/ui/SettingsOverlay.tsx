import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useCalendarStore, ViewMode, FirstDayOfWeek, Theme } from '../../store/calendarStore'
import { useAuthStore } from '../../store/authStore'
import { ICON_SETS } from '../../lib/iconSets'
import { IconRenderer, formatIconId } from '../ui/IconRenderer'
import { changePassword } from '../../api/auth'
import { eventsApi } from '../../api/events'

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

const HOUR_OPTIONS = Array.from({ length: 25 }, (_, i) => i) // 0–24

export function SettingsOverlay({ onClose }: { onClose: () => void }) {
  const isDemo = useAuthStore((s) => s.isDemo) || window.location.pathname.startsWith('/demo')
  const {
    viewMode, setViewMode,
    firstDayOfWeek, setFirstDayOfWeek,
    hourStart, setHourStart,
    hourEnd, setHourEnd,
    hideContactNotes, setHideContactNotes,
    contactPinHash, setContactPinHash,
    iconSet, setIconSet,
    theme, setTheme,
  } = useCalendarStore()

  const [hoursExpanded, setHoursExpanded] = useState(false)
  const [pwExpanded, setPwExpanded] = useState(false)

  // PIN prywatności
  const [pinMode, setPinMode] = useState<'idle' | 'set' | 'verify-change' | 'verify-remove'>('idle')
  const [pinInput, setPinInput] = useState('')
  const [pinNew, setPinNew] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)

  async function handleSetPin() {
    setPinError(null)
    if (pinNew.length < 4) { setPinError('Minimum 4 znaki'); return }
    if (pinNew !== pinConfirm) { setPinError('PIN-y nie są identyczne'); return }
    const hash = await sha256(pinNew)
    setContactPinHash(hash)
    setHideContactNotes(true)
    setPinMode('idle'); setPinNew(''); setPinConfirm('')
  }

  async function handleVerifyThenChange() {
    setPinError(null)
    const hash = await sha256(pinInput)
    if (hash !== contactPinHash) { setPinError('Nieprawidłowy PIN'); return }
    setPinInput(''); setPinMode('set')
  }

  async function handleVerifyThenRemove() {
    setPinError(null)
    const hash = await sha256(pinInput)
    if (hash !== contactPinHash) { setPinError('Nieprawidłowy PIN'); return }
    setContactPinHash(null)
    setHideContactNotes(false)
    setPinMode('idle'); setPinInput('')
  }

  // Zmiana hasła
  const [pwCurrent, setPwCurrent] = useState('')
  const [pwNew, setPwNew] = useState('')
  const [pwConfirm, setPwConfirm] = useState('')
  const [pwError, setPwError] = useState<string | null>(null)
  const [pwSuccess, setPwSuccess] = useState(false)
  const [pwLoading, setPwLoading] = useState(false)

  async function handleChangePassword() {
    setPwError(null)
    setPwSuccess(false)
    if (pwNew.length < 8) { setPwError('Nowe hasło musi mieć co najmniej 8 znaków'); return }
    if (pwNew !== pwConfirm) { setPwError('Hasła nie są identyczne'); return }
    setPwLoading(true)
    try {
      await changePassword(pwCurrent, pwNew)
      setPwSuccess(true)
      setPwCurrent(''); setPwNew(''); setPwConfirm('')
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setPwError(msg ?? 'Błąd zmiany hasła')
    } finally {
      setPwLoading(false)
    }
  }

  // Eksport / Import .ics
  const [icsExporting, setIcsExporting] = useState(false)
  const [icsExportError, setIcsExportError] = useState<string | null>(null)
  const [icsImporting, setIcsImporting] = useState(false)
  const [icsImportResult, setIcsImportResult] = useState<{ imported: number; skipped: number } | null>(null)
  const [icsImportError, setIcsImportError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleExportIcs() {
    setIcsExporting(true)
    setIcsExportError(null)
    try {
      await eventsApi.exportIcs()
    } catch {
      setIcsExportError('Nie udało się pobrać pliku .ics')
    } finally {
      setIcsExporting(false)
    }
  }

  async function handleImportIcs(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setIcsImporting(true)
    setIcsImportResult(null)
    setIcsImportError(null)
    try {
      const result = await eventsApi.importIcs(file)
      setIcsImportResult(result)
    } catch {
      setIcsImportError('Nie udało się zaimportować pliku .ics')
    } finally {
      setIcsImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const DAY_OPTIONS: { day: FirstDayOfWeek; label: string; full: string }[] = [
    { day: 1, label: 'Pn', full: 'Poniedziałek' },
    { day: 2, label: 'Wt', full: 'Wtorek' },
    { day: 3, label: 'Śr', full: 'Środa' },
    { day: 4, label: 'Cz', full: 'Czwartek' },
    { day: 5, label: 'Pt', full: 'Piątek' },
    { day: 6, label: 'Sb', full: 'Sobota' },
    { day: 0, label: 'Nd', full: 'Niedziela' },
  ]

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-slate-700">
          <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100">Ustawienia kalendarza</h2>
          <button
            onClick={onClose}
            className="text-gray-400 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-200 text-xl leading-none transition-colors"
          >✕</button>
        </div>

        <div className="overflow-y-auto px-6 py-5 space-y-8">

          {/* ── Wygląd ── */}
          <section>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Wygląd</h3>
            <div className="grid grid-cols-2 gap-2">
              {([
                { value: 'light' as Theme, icon: '☀️', label: 'Jasny', desc: 'Białe tło, ciemny tekst' },
                { value: 'dark' as Theme, icon: '🌙', label: 'Ciemny', desc: 'Ciemne tło, jasny tekst' },
              ]).map(({ value, icon, label, desc }) => (
                <button
                  key={value}
                  onClick={() => setTheme(value)}
                  className={`flex flex-col gap-1 px-4 py-3 rounded-xl border-2 transition-all text-left ${
                    theme === value
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950'
                      : 'border-gray-100 dark:border-gray-700 hover:border-gray-200 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={theme === value ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-500 dark:text-slate-400'}>
                      <IconRenderer icon={icon} iconSet={iconSet} size={20} />
                    </span>
                    <span className={`text-sm font-semibold ${theme === value ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-800 dark:text-gray-200'}`}>
                      {label} {theme === value && '✓'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-500 leading-snug">{desc}</p>
                </button>
              ))}
            </div>
          </section>

          {/* ── Tryb widoku ── */}
          <section>
            <h3 className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-3">Tryb widoku</h3>
            <div className="space-y-2">
              {([
                {
                  mode: 'dynamic' as ViewMode,
                  icon: '📅',
                  label: 'Dynamiczny',
                  desc: 'Zawsze zaczyna od wczoraj; etykiety: Wczoraj / Dziś / Jutro',
                },
                {
                  mode: 'static' as ViewMode,
                  icon: '📆',
                  label: 'Statyczny',
                  desc: 'Klasyczny tydzień z wybranym pierwszym dniem',
                },
              ]).map(({ mode, icon, label, desc }) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`w-full flex items-start gap-4 px-4 py-3 rounded-xl border-2 transition-all text-left ${
                    viewMode === mode
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950'
                      : 'border-gray-100 dark:border-slate-700 hover:border-gray-200 dark:hover:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700'
                  }`}
                >
                  <span className={`shrink-0 mt-0.5 ${viewMode === mode ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-500 dark:text-slate-400'}`}>
                    <IconRenderer icon={icon} iconSet={iconSet} size={22} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className={`font-semibold text-sm ${viewMode === mode ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-800 dark:text-slate-200'}`}>
                      {label} {viewMode === mode && '✓'}
                    </div>
                    <div className="text-xs text-gray-400 dark:text-slate-500 mt-0.5 leading-snug">{desc}</div>
                  </div>
                </button>
              ))}
            </div>

            {/* Pierwszy dzień tygodnia — tylko tryb statyczny */}
            {viewMode === 'static' && (
              <div className="mt-3">
                <p className="text-xs text-gray-500 dark:text-slate-400 font-medium mb-2">Pierwszy dzień tygodnia</p>
                <div className="flex flex-wrap gap-1.5">
                  {DAY_OPTIONS.map(({ day, label, full }) => (
                    <button
                      key={day}
                      onClick={() => setFirstDayOfWeek(day)}
                      title={full}
                      className={`text-xs px-3 py-1.5 rounded-full border-2 font-medium transition-all ${
                        firstDayOfWeek === day
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-400 hover:border-indigo-400 hover:text-indigo-600'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* ── Godziny dnia ── */}
          <section>
            <button
              onClick={() => setHoursExpanded(v => !v)}
              className="w-full flex items-center justify-between text-left group"
            >
              <h3 className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest">Godziny dnia</h3>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 dark:text-slate-400 font-medium">
                  {hourStart}:00 – {hourEnd}:00 ({hourEnd - hourStart}h)
                </span>
                <span className={`text-gray-400 dark:text-slate-500 text-xs transition-transform duration-200 ${hoursExpanded ? 'rotate-180' : ''}`}>▼</span>
              </div>
            </button>

            {hoursExpanded && (
              <div className="mt-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-slate-300 block mb-1.5">Początek dnia</label>
                    <div className="flex flex-wrap gap-1.5">
                      {[5, 6, 7, 8, 9, 10].map((h) => (
                        <button
                          key={h}
                          onClick={() => { if (h < hourEnd) setHourStart(h) }}
                          className={`text-xs px-2.5 py-1 rounded-full border-2 font-medium transition-all ${
                            hourStart === h
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : h >= hourEnd
                              ? 'border-gray-100 dark:border-slate-700 text-gray-300 dark:text-slate-600 cursor-not-allowed'
                              : 'border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-400 hover:border-indigo-400'
                          }`}
                        >
                          {h}:00
                        </button>
                      ))}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-gray-400 dark:text-slate-500">lub wpisz:</span>
                      <input
                        type="number"
                        min={0}
                        max={hourEnd - 1}
                        value={hourStart}
                        onChange={(e) => {
                          const v = Math.max(0, Math.min(hourEnd - 1, Number(e.target.value)))
                          setHourStart(v)
                        }}
                        className="w-16 border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      />
                      <span className="text-xs text-gray-400 dark:text-slate-500">:00</span>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-slate-300 block mb-1.5">Koniec dnia</label>
                    <div className="flex flex-wrap gap-1.5">
                      {[18, 20, 22, 23, 24].map((h) => (
                        <button
                          key={h}
                          onClick={() => { if (h > hourStart) setHourEnd(h) }}
                          className={`text-xs px-2.5 py-1 rounded-full border-2 font-medium transition-all ${
                            hourEnd === h
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : h <= hourStart
                              ? 'border-gray-100 dark:border-slate-700 text-gray-300 dark:text-slate-600 cursor-not-allowed'
                              : 'border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-400 hover:border-indigo-400'
                          }`}
                        >
                          {h}:00
                        </button>
                      ))}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-gray-400 dark:text-slate-500">lub wpisz:</span>
                      <input
                        type="number"
                        min={hourStart + 1}
                        max={24}
                        value={hourEnd}
                        onChange={(e) => {
                          const v = Math.max(hourStart + 1, Math.min(24, Number(e.target.value)))
                          setHourEnd(v)
                        }}
                        className="w-16 border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      />
                      <span className="text-xs text-gray-400 dark:text-slate-500">:00</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* ── Zestaw ikon ── */}
          <section>
            <h3 className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-3">Zestaw ikon aktywności</h3>
            <div className="grid grid-cols-2 gap-2">
              {ICON_SETS.map((set) => (
                <button
                  key={set.id}
                  onClick={() => setIconSet(set.id)}
                  className={`flex flex-col gap-2 px-4 py-3 rounded-xl border-2 transition-all text-left ${
                    iconSet === set.id
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950'
                      : 'border-gray-100 dark:border-slate-700 hover:border-gray-200 dark:hover:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-semibold ${iconSet === set.id ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-800 dark:text-slate-200'}`}>
                      {set.name} {iconSet === set.id && '✓'}
                    </span>
                  </div>
                  {/* Podgląd 5 ikon */}
                  <div className="flex gap-1.5 items-center">
                    {set.preview.map((ic) => {
                      const iconId = formatIconId(set.id, ic)
                      const isEmoji = !iconId.includes(':')
                      return (
                        <span
                          key={ic}
                          className={isEmoji ? '' : (iconSet === set.id ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-500 dark:text-slate-400')}
                        >
                          <IconRenderer icon={iconId} size={18} />
                        </span>
                      )
                    })}
                  </div>
                  <p className="text-xs text-gray-400 dark:text-slate-500 leading-snug">{set.description}</p>
                </button>
              ))}
            </div>
          </section>

          {/* ── Prywatność — ukryta w trybie demo ── */}
          {!isDemo && (
          <section>
            <h3 className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-3">Prywatność</h3>

            {/* Status + przyciski akcji */}
            <div className={`flex items-start gap-4 px-4 py-3 rounded-xl border-2 ${contactPinHash ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950' : 'border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-700'}`}>
              <span className={`shrink-0 mt-0.5 ${contactPinHash ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-500 dark:text-slate-400'}`}>
                <IconRenderer icon={contactPinHash ? '🔒' : '🔓'} iconSet={iconSet} size={22} />
              </span>
              <div className="flex-1 min-w-0">
                <div className={`font-semibold text-sm ${contactPinHash ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-700 dark:text-slate-200'}`}>
                  {contactPinHash ? 'Notatki i zainteresowania chronione PINem ✓' : 'Brak blokady prywatności'}
                </div>
                <div className="text-xs text-gray-400 dark:text-slate-500 mt-0.5 leading-snug">
                  {contactPinHash
                    ? 'Notatki i zainteresowania kontaktów są ukryte za PINem'
                    : 'Ustaw PIN aby chronić notatki i zainteresowania kontaktów'}
                </div>
                <div className="flex gap-2 mt-2 flex-wrap">
                  {!contactPinHash ? (
                    <button
                      onClick={() => { setPinMode('set'); setPinError(null); setPinNew(''); setPinConfirm('') }}
                      className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-3 py-1.5 font-medium transition-colors"
                    >
                      Ustaw PIN
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => { setPinMode('verify-change'); setPinError(null); setPinInput('') }}
                        className="text-xs bg-indigo-100 dark:bg-indigo-900/40 hover:bg-indigo-200 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 rounded-lg px-3 py-1.5 font-medium transition-colors"
                      >
                        Zmień PIN
                      </button>
                      <button
                        onClick={() => { setPinMode('verify-remove'); setPinError(null); setPinInput('') }}
                        className="text-xs bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 rounded-lg px-3 py-1.5 font-medium transition-colors"
                      >
                        Usuń PIN
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Formularze PIN — inline pod statusem */}
            {pinMode === 'set' && (
              <div className="mt-3 space-y-2 p-3 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700">
                <p className="text-xs font-semibold text-gray-600 dark:text-slate-300">Ustaw nowy PIN lub hasło</p>
                <input
                  type="password"
                  placeholder="Nowy PIN (min. 4 znaki)"
                  value={pinNew}
                  onChange={e => { setPinNew(e.target.value); setPinError(null) }}
                  className="w-full border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  autoFocus
                />
                <input
                  type="password"
                  placeholder="Powtórz PIN"
                  value={pinConfirm}
                  onChange={e => { setPinConfirm(e.target.value); setPinError(null) }}
                  className="w-full border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  onKeyDown={e => e.key === 'Enter' && handleSetPin()}
                />
                {pinError && <p className="text-xs text-red-500">{pinError}</p>}
                <div className="flex gap-2">
                  <button onClick={handleSetPin} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg py-1.5 text-xs font-semibold transition-colors">Zapisz PIN</button>
                  <button onClick={() => setPinMode('idle')} className="px-3 text-xs text-gray-400 hover:text-gray-600 transition-colors">Anuluj</button>
                </div>
              </div>
            )}

            {(pinMode === 'verify-change' || pinMode === 'verify-remove') && (
              <div className="mt-3 space-y-2 p-3 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700">
                <p className="text-xs font-semibold text-gray-600 dark:text-slate-300">
                  {pinMode === 'verify-change' ? 'Podaj obecny PIN aby go zmienić' : 'Podaj PIN aby go usunąć'}
                </p>
                <input
                  type="password"
                  placeholder="Obecny PIN"
                  value={pinInput}
                  onChange={e => { setPinInput(e.target.value); setPinError(null) }}
                  className="w-full border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && (pinMode === 'verify-change' ? handleVerifyThenChange() : handleVerifyThenRemove())}
                />
                {pinError && <p className="text-xs text-red-500">{pinError}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={pinMode === 'verify-change' ? handleVerifyThenChange : handleVerifyThenRemove}
                    className={`flex-1 text-white rounded-lg py-1.5 text-xs font-semibold transition-colors ${pinMode === 'verify-remove' ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                  >
                    {pinMode === 'verify-change' ? 'Dalej' : 'Usuń PIN'}
                  </button>
                   <button onClick={() => setPinMode('idle')} className="px-3 text-xs text-gray-400 hover:text-gray-600 transition-colors">Anuluj</button>
                </div>
              </div>
            )}
          </section>
          )}

          {/* ── Eksport / Import — ukryty w trybie demo ── */}
          {!isDemo && <section>
            <h3 className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-3">Eksport / Import kalendarza</h3>
            <div className="space-y-3">
              {/* Eksport */}
              <div className="flex items-center justify-between px-4 py-3 rounded-xl border-2 border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-700">
                <div className="flex-1 min-w-0 pr-3">
                  <div className="text-sm font-semibold text-gray-800 dark:text-slate-200">Eksportuj do .ics</div>
                  <div className="text-xs text-gray-400 dark:text-slate-500 mt-0.5 leading-snug">Pobierz wszystkie wydarzenia jako plik iCalendar</div>
                  {icsExportError && <p className="text-xs text-red-500 mt-1">{icsExportError}</p>}
                </div>
                <button
                  onClick={handleExportIcs}
                  disabled={icsExporting}
                  className="shrink-0 text-xs bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg px-3 py-1.5 font-medium transition-colors"
                >
                  {icsExporting ? 'Pobieranie…' : 'Pobierz .ics'}
                </button>
              </div>

              {/* Import — niedostępny w trybie demo */}
              {!isDemo && (
                <div className="flex items-center justify-between px-4 py-3 rounded-xl border-2 border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-700">
                  <div className="flex-1 min-w-0 pr-3">
                    <div className="text-sm font-semibold text-gray-800 dark:text-slate-200">Importuj z .ics</div>
                    <div className="text-xs text-gray-400 dark:text-slate-500 mt-0.5 leading-snug">Wczytaj wydarzenia z pliku iCalendar</div>
                    {icsImportResult && (
                      <p className="text-xs text-green-600 mt-1">
                        Zaimportowano: {icsImportResult.imported}
                        {icsImportResult.skipped > 0 && `, pominięto: ${icsImportResult.skipped}`}
                      </p>
                    )}
                    {icsImportError && <p className="text-xs text-red-500 mt-1">{icsImportError}</p>}
                  </div>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={icsImporting}
                    className="shrink-0 text-xs bg-gray-200 dark:bg-slate-600 hover:bg-gray-300 dark:hover:bg-slate-500 disabled:opacity-40 text-gray-700 dark:text-slate-200 rounded-lg px-3 py-1.5 font-medium transition-colors"
                  >
                    {icsImporting ? 'Importowanie…' : 'Wybierz plik'}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".ics,text/calendar"
                    className="hidden"
                    onChange={handleImportIcs}
                  />
                </div>
              )}
            </div>
          </section>}

          {/* ── Zmiana hasła — ukryta w trybie demo ── */}
          {!isDemo && (
            <section>
              <button
                onClick={() => setPwExpanded(v => !v)}
                className="w-full flex items-center justify-between text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest hover:text-gray-600 dark:hover:text-slate-300 transition-colors"
              >
                <span>Zmiana hasła</span>
                <span className="text-base leading-none">{pwExpanded ? '▲' : '▼'}</span>
              </button>
              {pwExpanded && (
                <div className="space-y-2 mt-3">
                  <input
                    type="password"
                    placeholder="Aktualne hasło"
                    value={pwCurrent}
                    onChange={e => setPwCurrent(e.target.value)}
                    className="w-full border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder:text-gray-400 dark:placeholder:text-slate-500"
                  />
                  <input
                    type="password"
                    placeholder="Nowe hasło (min. 8 zn., wielka litera, cyfra, znak specjalny)"
                    value={pwNew}
                    onChange={e => setPwNew(e.target.value)}
                    className="w-full border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder:text-gray-400 dark:placeholder:text-slate-500"
                  />
                  <input
                    type="password"
                    placeholder="Powtórz nowe hasło"
                    value={pwConfirm}
                    onChange={e => setPwConfirm(e.target.value)}
                    className="w-full border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder:text-gray-400 dark:placeholder:text-slate-500"
                  />
                  {pwError && <p className="text-xs text-red-500">{pwError}</p>}
                  {pwSuccess && <p className="text-xs text-green-600">Hasło zostało zmienione.</p>}
                  <button
                    onClick={handleChangePassword}
                    disabled={pwLoading || !pwCurrent || !pwNew || !pwConfirm}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl py-2 text-sm font-semibold transition-colors"
                  >
                    {pwLoading ? 'Zapisywanie…' : 'Zmień hasło'}
                  </button>
                </div>
              )}
            </section>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 dark:border-slate-700">
          <button
            onClick={onClose}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl py-2.5 text-sm font-semibold transition-colors"
          >
            Gotowe
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
