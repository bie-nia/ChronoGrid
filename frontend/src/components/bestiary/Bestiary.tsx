import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { contactsApi } from '../../api/contacts'
import { BASE_URL } from '../../api/client'
import { Contact } from '../../types'
import { useCalendarStore } from '../../store/calendarStore'
import { IconRenderer } from '../ui/IconRenderer'

/** Buduje pełny URL do zdjęcia — obsługuje /uploads/... i zewnętrzne URL */
function resolvePhotoUrl(url: string | undefined): string | undefined {
  if (!url) return undefined
  if (url.startsWith('/')) return `${BASE_URL}${url}`
  return url
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// ── PinGate — formularz weryfikacji PIN przed dostępem do prywatnych danych ──
function PinGate({ onUnlock, label = 'Podaj PIN aby wyświetlić' }: { onUnlock: () => void; label?: string }) {
  const pinHash = useCalendarStore((s) => s.contactPinHash)
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    if (!pinHash) { onUnlock(); return }
    setLoading(true)
    setError(null)
    const hash = await sha256(value)
    setLoading(false)
    if (hash === pinHash) {
      onUnlock()
    } else {
      setError('Nieprawidłowy PIN')
      setValue('')
    }
  }

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-6 px-4">
      <span className="text-4xl">🔒</span>
      <p className="text-white/60 text-sm text-center">{label}</p>
      <input
        type="text"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        value={value}
        onChange={e => { setValue(e.target.value); setError(null) }}
        onKeyDown={e => e.key === 'Enter' && handleSubmit()}
        placeholder="PIN lub hasło"
        autoFocus
        className="w-full max-w-[200px] bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white text-center placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-400 tracking-widest"
        style={{ WebkitTextSecurity: 'disc' } as React.CSSProperties}
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button
        onClick={handleSubmit}
        disabled={!value || loading}
        className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg px-5 py-1.5 text-sm font-semibold transition-colors"
      >
        Odblokuj
      </button>
    </div>
  )
}

// ── Sprawdzenie czy dzisiaj są urodziny ────────────────────────────────────────
export function isBirthdayToday(birthday: string): boolean {
  const today = new Date()
  const bd = new Date(birthday)
  return bd.getMonth() === today.getMonth() && bd.getDate() === today.getDate()
}

// ── Ile dni do urodzin ────────────────────────────────────────────────────────
function daysUntilBirthday(birthday: string): number {
  const today = new Date()
  const bd = new Date(birthday)
  const next = new Date(today.getFullYear(), bd.getMonth(), bd.getDate())
  if (next < today) next.setFullYear(today.getFullYear() + 1)
  return Math.round((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

// ── Avatar ─────────────────────────────────────────────────────────────────────
function Avatar({ contact, size = 'md' }: { contact?: Partial<Contact>; size?: 'sm' | 'md' | 'lg' }) {
  const cls = size === 'sm' ? 'w-9 h-9 text-sm' : size === 'lg' ? 'w-20 h-20 text-3xl' : 'w-11 h-11 text-base'
  const name = contact?.name ?? ''
  return (
    <div className={`${cls} rounded-full bg-gradient-to-br from-indigo-500/30 to-purple-500/30 flex items-center justify-center shrink-0 overflow-hidden font-bold text-indigo-300 relative border border-white/10`}>
      {contact?.photo_url ? (
        <img src={resolvePhotoUrl(contact.photo_url)} alt={name} className="w-full h-full object-cover"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
      ) : (
        <span>{name ? name[0].toUpperCase() : '?'}</span>
      )}
    </div>
  )
}

// ── Formularz kontaktu (inline w prawym panelu) ───────────────────────────────
function ContactForm({
  contact,
  onSave,
  onCancel,
  onDelete,
}: {
  contact?: Contact
  onSave: (data: Omit<Contact, 'id' | 'user_id' | 'created_at'>) => void
  onCancel: () => void
  onDelete?: () => void
}) {
  const [name, setName] = useState(contact?.name ?? '')
  const [phone, setPhone] = useState(contact?.phone ?? '')
  const [notes, setNotes] = useState(contact?.notes ?? '')
  const [interests, setInterests] = useState(contact?.interests ?? '')
  const [photoUrl, setPhotoUrl] = useState(contact?.photo_url ?? '')
  const [photoUploading, setPhotoUploading] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()
  const pinHash = useCalendarStore((s) => s.contactPinHash)
  // Dla istniejącego kontaktu z notatkami/zainteresowaniami — PIN wymagany przed edycją
  const needsPin = !!pinHash && !!(contact?.notes || contact?.interests)
  const [editPrivateUnlocked, setEditPrivateUnlocked] = useState(!needsPin)

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !contact?.id) return
    setPhotoError(null)
    setPhotoUploading(true)
    try {
      const updated = await contactsApi.uploadPhoto(contact.id, file)
      setPhotoUrl(updated.photo_url ?? '')
      qc.invalidateQueries({ queryKey: ['contacts'] })
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setPhotoError(msg ?? 'Błąd uploadu zdjęcia')
    } finally {
      setPhotoUploading(false)
      // Resetuj input żeby można wybrać ten sam plik ponownie
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // Data urodzin rozbita na DD / MM / YYYY
  const parseBirthday = (iso?: string) => {
    if (!iso) return { dd: '', mm: '', yyyy: '' }
    const [y, m, d] = iso.split('-')
    return { dd: d ?? '', mm: m ?? '', yyyy: y ?? '' }
  }
  const init = parseBirthday(contact?.birthday)
  const [bdDay, setBdDay] = useState(init.dd)
  const [bdMonth, setBdMonth] = useState(init.mm)
  const [bdYear, setBdYear] = useState(init.yyyy)

  // Złożony ISO string, gdy wszystkie pola wypełnione
  const birthdayISO = bdDay && bdMonth && bdYear && bdYear.length === 4
    ? `${bdYear}-${bdMonth.padStart(2, '0')}-${bdDay.padStart(2, '0')}`
    : ''

  const handleSave = () => {
    if (!name.trim()) return
    onSave({
      name: name.trim(),
      phone: phone.trim() || undefined,
      notes: notes.trim() || undefined,
      interests: interests.trim() || undefined,
      birthday: birthdayISO || undefined,
    })
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* Avatar + imię */}
        <div className="flex items-center gap-4">
          {/* Klikalne kółko z avatarem — upload zdjęcia */}
          <div className="relative shrink-0 group">
            <Avatar contact={{ name, photo_url: photoUrl }} size="lg" />
            {contact?.id ? (
              <>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={photoUploading}
                  className="absolute inset-0 rounded-full flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer disabled:cursor-wait"
                  title="Zmień zdjęcie"
                >
                  <span className="text-white text-xs font-medium">
                    {photoUploading ? '...' : '📷'}
                  </span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                  className="hidden"
                  onChange={handlePhotoSelect}
                />
              </>
            ) : (
              <div
                className="absolute inset-0 rounded-full flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-default"
                title="Zapisz kontakt, aby dodać zdjęcie"
              >
                <span className="text-white/60 text-[10px] text-center px-1 leading-tight">Zapisz najpierw</span>
              </div>
            )}
          </div>
          <div className="flex-1 space-y-1.5">
            <input
              autoFocus
              placeholder="Imię i nazwisko *"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-400 font-medium"
            />
            {photoError && (
              <p className="text-xs text-red-400">{photoError}</p>
            )}
          </div>
        </div>

        <div>
          <label className="text-xs text-white/40 font-medium block mb-1.5">📞 Telefon</label>
          <input
            type="tel"
            placeholder="+48 000 000 000"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>

        <div>
          <label className="text-xs text-white/40 font-medium block mb-1.5">🎂 Data urodzin</label>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              placeholder="DD"
              min={1} max={31}
              value={bdDay}
              onChange={(e) => setBdDay(e.target.value)}
              className="w-14 bg-white/10 border border-white/20 rounded-lg px-2 py-2 text-sm text-white text-center placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-indigo-400 [appearance:textfield]"
            />
            <span className="text-white/30">/</span>
            <input
              type="number"
              placeholder="MM"
              min={1} max={12}
              value={bdMonth}
              onChange={(e) => setBdMonth(e.target.value)}
              className="w-14 bg-white/10 border border-white/20 rounded-lg px-2 py-2 text-sm text-white text-center placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-indigo-400 [appearance:textfield]"
            />
            <span className="text-white/30">/</span>
            <input
              type="number"
              placeholder="RRRR"
              min={1900} max={2100}
              value={bdYear}
              onChange={(e) => setBdYear(e.target.value)}
              className="w-20 bg-white/10 border border-white/20 rounded-lg px-2 py-2 text-sm text-white text-center placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-indigo-400 [appearance:textfield]"
            />
          </div>
          {birthdayISO && (
            <p className="text-xs text-white/30 mt-1">
              {isBirthdayToday(birthdayISO) ? '🎉 Dzisiaj!' : `Za ${daysUntilBirthday(birthdayISO)} dni`}
            </p>
          )}
        </div>

        {/* Sekcja prywatna — za PINem jeśli ustawiony */}
        {editPrivateUnlocked ? (
          <>
            {pinHash && (
              <p className="text-xs text-white/30 flex items-center gap-1">🔓 Sekcja prywatna odblokowana</p>
            )}
            <div>
              <label className="text-xs text-white/40 font-medium block mb-1.5">⭐ Zainteresowania</label>
              <input
                placeholder="np. fotografia, góry, gotowanie..."
                value={interests}
                onChange={(e) => setInterests(e.target.value)}
                className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <div>
              <label className="text-xs text-white/40 font-medium block mb-1.5">📝 Notatki</label>
              <textarea
                placeholder="Notatki o osobie..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={7}
                className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
              />
            </div>
          </>
        ) : (
          <PinGate
            onUnlock={() => setEditPrivateUnlocked(true)}
            label="Podaj PIN aby edytować notatki i zainteresowania"
          />
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-white/10 flex items-center gap-2">
        {onDelete && (
          <button
            onClick={onDelete}
            className="text-xs text-red-400 border border-red-400/30 rounded-lg px-3 py-1.5 hover:bg-red-400/10 transition-colors"
          >
            Usuń
          </button>
        )}
        <div className="flex-1" />
        <button
          onClick={onCancel}
          className="text-xs text-white/50 border border-white/20 rounded-lg px-3 py-1.5 hover:bg-white/5 transition-colors"
        >
          Anuluj
        </button>
        <button
          onClick={handleSave}
          disabled={!name.trim()}
          className="text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg px-4 py-1.5 font-semibold transition-colors"
        >
          Zapisz
        </button>
      </div>
    </div>
  )
}

// ── Widok szczegółów kontaktu ─────────────────────────────────────────────────
function ContactDetail({
  contact,
  onEdit,
}: {
  contact: Contact
  onEdit: () => void
}) {
  const pinHash = useCalendarStore((s) => s.contactPinHash)
  const [privateUnlocked, setPrivateUnlocked] = useState(false)
  const hasPrivate = !!(contact.notes || contact.interests)
  const isToday = contact.birthday ? isBirthdayToday(contact.birthday) : false
  const daysLeft = contact.birthday ? daysUntilBirthday(contact.birthday) : null

  // Gdy zmieniony kontakt — zresetuj odblokowanie
  useEffect(() => { setPrivateUnlocked(false) }, [contact.id])

  const showPrivate = !pinHash || privateUnlocked

  return (
    <div className="flex flex-col h-full relative">
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Avatar + imię */}
        <div className="flex items-center gap-4">
          <Avatar contact={contact} size="lg" />
          <div>
            <h3 className="text-white font-bold text-lg leading-snug">{contact.name}</h3>
            {isToday && <p className="text-red-400 text-sm font-medium">🎂 Dzisiaj urodziny!</p>}
            {!isToday && daysLeft !== null && daysLeft <= 30 && (
              <p className={`text-sm ${daysLeft <= 7 ? 'text-orange-400 font-medium' : 'text-white/40'}`}>
                🎂 Za {daysLeft} {daysLeft === 1 ? 'dzień' : 'dni'}
              </p>
            )}
          </div>
        </div>

        {contact.phone && (
          <div>
            <p className="text-xs text-white/30 uppercase tracking-wider mb-1">Telefon</p>
            <a href={`tel:${contact.phone}`} className="text-indigo-300 hover:text-indigo-200 text-sm font-medium">
              {contact.phone}
            </a>
          </div>
        )}

        {contact.birthday && (
          <div>
            <p className="text-xs text-white/30 uppercase tracking-wider mb-1">Data urodzin</p>
            <p className="text-white/80 text-sm">
              {new Date(contact.birthday).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
        )}

        {/* Sekcja prywatna — zainteresowania + notatki */}
        {hasPrivate && (
          showPrivate ? (
            <>
              {pinHash && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-white/30">🔓 Odblokowano</span>
                  <button
                    onClick={() => setPrivateUnlocked(false)}
                    className="text-xs text-white/20 hover:text-white/50 transition-colors"
                  >
                    Zablokuj ponownie
                  </button>
                </div>
              )}
              {contact.interests && (
                <div>
                  <p className="text-xs text-white/30 uppercase tracking-wider mb-1">Zainteresowania</p>
                  <p className="text-white/70 text-sm leading-relaxed">{contact.interests}</p>
                </div>
              )}
              {contact.notes && (
                <div>
                  <p className="text-xs text-white/30 uppercase tracking-wider mb-1">Notatki</p>
                  <p className="text-white/70 text-sm leading-relaxed whitespace-pre-wrap">{contact.notes}</p>
                </div>
              )}
            </>
          ) : (
            <PinGate
              onUnlock={() => setPrivateUnlocked(true)}
              label="Podaj PIN aby zobaczyć notatki i zainteresowania"
            />
          )
        )}
      </div>

      {/* Okrągły przycisk edycji w prawym dolnym rogu */}
      <button
        onClick={onEdit}
        className="absolute bottom-4 right-4 w-11 h-11 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center shadow-lg transition-all hover:scale-110 text-base"
        title="Edytuj kontakt"
      >
        ✏️
      </button>
    </div>
  )
}

// ── Wiersz na liście ──────────────────────────────────────────────────────────
function ContactRow({
  contact,
  selected,
  onClick,
}: {
  contact: Contact
  selected: boolean
  onClick: () => void
}) {
  const isToday = contact.birthday ? isBirthdayToday(contact.birthday) : false
  const daysLeft = contact.birthday ? daysUntilBirthday(contact.birthday) : null
  const soon = daysLeft !== null && daysLeft <= 7 && !isToday

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-2.5 transition-colors text-left ${
        selected ? 'bg-indigo-600/20 border-r-2 border-indigo-500' : 'hover:bg-white/5'
      }`}
    >
      <div className="relative shrink-0">
        <Avatar contact={contact} size="sm" />
        {isToday && <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-red-500 animate-pulse border-2 border-gray-950" />}
        {soon && !isToday && <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-orange-400 border-2 border-gray-950" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-white/90 truncate">
          {contact.name} {isToday && '🎂'}
        </div>
        {contact.phone && <div className="text-xs text-white/30 truncate">{contact.phone}</div>}
      </div>
    </button>
  )
}

// ── Główny overlay ────────────────────────────────────────────────────────────
export function BestiaryOverlay({ onClose, initialContactId }: { onClose: () => void; initialContactId?: number }) {
  const qc = useQueryClient()

  const [selectedId, setSelectedId] = useState<number | null>(initialContactId ?? null)
  const [mode, setMode] = useState<'view' | 'edit' | 'new'>(initialContactId ? 'view' : 'view')
  const [search, setSearch] = useState('')

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const { data: contacts = [] } = useQuery({
    queryKey: ['contacts'],
    queryFn: contactsApi.list,
  })

  const createMut = useMutation({
    mutationFn: contactsApi.create,
    onSuccess: (newContact) => {
      qc.invalidateQueries({ queryKey: ['contacts'] })
      setSelectedId(newContact.id)
      setMode('view')
    },
  })
  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Contact> }) => contactsApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contacts'] })
      setMode('view')
    },
  })
  const deleteMut = useMutation({
    mutationFn: contactsApi.delete,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contacts'] })
      setSelectedId(null)
      setMode('view')
    },
  })

  const filtered = contacts.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.phone ?? '').includes(search)
  )

  const sorted = [...filtered].sort((a, b) => {
    const aToday = a.birthday ? isBirthdayToday(a.birthday) : false
    const bToday = b.birthday ? isBirthdayToday(b.birthday) : false
    if (aToday && !bToday) return -1
    if (!aToday && bToday) return 1
    const aDays = a.birthday ? daysUntilBirthday(a.birthday) : 999
    const bDays = b.birthday ? daysUntilBirthday(b.birthday) : 999
    if (aDays <= 7 && bDays > 7) return -1
    if (aDays > 7 && bDays <= 7) return 1
    return a.name.localeCompare(b.name, 'pl')
  })

  const selected = contacts.find((c) => c.id === selectedId) ?? null

  // Gdy kliknięto kontakt na liście — przejdź do widoku
  const handleSelect = (c: Contact) => {
    setSelectedId(c.id)
    setMode('view')
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-4xl h-[85vh] flex rounded-3xl overflow-hidden bg-gray-950 shadow-2xl border border-white/10">

        {/* ── Lewa: lista kontaktów ── */}
        <div className="w-72 shrink-0 flex flex-col border-r border-white/10">
          {/* Nagłówek listy */}
          <div className="px-4 pt-4 pb-3 border-b border-white/10 space-y-2 shrink-0">
            <div className="flex items-center justify-between">
              <h2 className="text-white font-bold text-base">📖 Bestiariusz</h2>
              <button onClick={onClose} className="text-white/30 hover:text-white text-xl leading-none">×</button>
            </div>
            <button
              onClick={() => { setSelectedId(null); setMode('new') }}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl py-2 transition-colors"
            >
              + Dodaj kontakt
            </button>
            <input
              placeholder="Szukaj..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white/10 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>

          {/* Lista */}
          <div className="flex-1 overflow-y-auto">
            {sorted.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-white/20 text-xs italic px-4 text-center">
                {contacts.length === 0 ? 'Brak kontaktów.' : 'Brak wyników.'}
              </div>
            ) : (
              sorted.map((c) => (
                <ContactRow
                  key={c.id}
                  contact={c}
                  selected={selectedId === c.id && mode !== 'new'}
                  onClick={() => handleSelect(c)}
                />
              ))
            )}
          </div>
        </div>

        {/* ── Prawa: szczegóły / formularz ── */}
        <div className="flex-1 min-w-0 flex flex-col">
          {mode === 'new' && (
            <>
              <div className="px-5 py-3 border-b border-white/10 shrink-0">
                <h3 className="text-white font-semibold text-sm">Nowy kontakt</h3>
              </div>
              <div className="flex-1 min-h-0">
                <ContactForm
                  onSave={(data) => createMut.mutate(data)}
                  onCancel={() => setMode('view')}
                />
              </div>
            </>
          )}

          {mode === 'edit' && selected && (
            <>
              <div className="px-5 py-3 border-b border-white/10 shrink-0">
                <h3 className="text-white font-semibold text-sm">Edytuj kontakt</h3>
              </div>
              <div className="flex-1 min-h-0">
                <ContactForm
                  contact={selected}
                  onSave={(data) => updateMut.mutate({ id: selected.id, data })}
                  onCancel={() => setMode('view')}
                  onDelete={() => deleteMut.mutate(selected.id)}
                />
              </div>
            </>
          )}

          {mode === 'view' && selected && (
            <>
              <div className="px-5 py-3 border-b border-white/10 shrink-0">
                <h3 className="text-white font-semibold text-sm">Szczegóły</h3>
              </div>
              <div className="flex-1 min-h-0 relative">
                <ContactDetail
                  contact={selected}
                  onEdit={() => setMode('edit')}
                />
              </div>
            </>
          )}

          {mode === 'view' && !selected && (
            <div className="flex-1 flex flex-col items-center justify-center text-white/20 text-sm gap-2">
              <span className="text-5xl">👈</span>
              Wybierz kontakt z listy
            </div>
          )}
        </div>

      </div>
    </div>,
    document.body,
  )
}

// ── Kompaktowy przycisk w sidebarze ──────────────────────────────────────────
export function Bestiary() {
  const [open, setOpen] = useState(false)
  const iconSet = useCalendarStore((s) => s.iconSet)
  const { data: contacts = [] } = useQuery({
    queryKey: ['contacts'],
    queryFn: contactsApi.list,
  })
  const todayBirthdays = contacts.filter((c) => c.birthday && isBirthdayToday(c.birthday))

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-between group hover:bg-gray-50 rounded-lg px-1 py-1 transition-colors"
      >
        <div className="flex items-center gap-1.5">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1"><IconRenderer icon="📖" iconSet={iconSet} size={13} /> Bestiariusz</h2>
          {todayBirthdays.length > 0 && (
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          )}
        </div>
        <span className="text-xs text-indigo-600 group-hover:text-indigo-800 font-medium">
          {contacts.length > 0 ? `${contacts.length} kontaktów →` : 'Otwórz →'}
        </span>
      </button>
      {open && <BestiaryOverlay onClose={() => setOpen(false)} />}
    </>
  )
}
