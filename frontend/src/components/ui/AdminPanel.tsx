import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../../api/client'
import { useCalendarStore } from '../../store/calendarStore'
import { IconRenderer } from './IconRenderer'
import {
  AdminUser,
  InviteToken,
  adminListUsers,
  adminUpdateUser,
  adminDeleteUser,
  adminListInviteTokens,
  adminCreateInviteTokens,
  adminDeleteInviteToken,
} from '../../api/auth'

interface AuditEntry {
  id: number
  user_id: number | null
  user_email: string | null
  action: string
  detail: string | null
  ip_address: string | null
  created_at: string
}

type Tab = 'users' | 'tokens' | 'audit'

export function AdminPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('users')
  const iconSet = useCalendarStore((s) => s.iconSet)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <span className="text-indigo-500 dark:text-indigo-400"><IconRenderer icon="🛡️" iconSet={iconSet} size={20} /></span>
            <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100">Panel administratora</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-300 text-xl leading-none transition-colors">✕</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 dark:border-slate-700 px-6">
          {([['users', 'Użytkownicy'], ['tokens', 'Tokeny zaproszeń'], ['audit', 'Audit Log']] as [Tab, string][]).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`py-3 px-1 mr-6 text-sm font-semibold border-b-2 transition-colors ${
                tab === id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto flex-1">
          {tab === 'users' && <UsersTab />}
          {tab === 'tokens' && <TokensTab />}
          {tab === 'audit' && <AuditTab />}
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ── Users Tab ──────────────────────────────────────────────────────────────────

function UsersTab() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editEmail, setEditEmail] = useState('')
  const [editIsAdmin, setEditIsAdmin] = useState(false)
  const [editPassword, setEditPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try { setUsers(await adminListUsers()) } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  function startEdit(u: AdminUser) {
    setEditingId(u.id)
    setEditEmail(u.email)
    setEditIsAdmin(u.is_admin)
    setEditPassword('')
    setError(null)
  }

  async function saveEdit() {
    if (!editingId) return
    setSaving(true)
    setError(null)
    try {
      await adminUpdateUser(editingId, {
        email: editEmail,
        is_admin: editIsAdmin,
        ...(editPassword ? { new_password: editPassword } : {}),
      })
      setEditingId(null)
      await load()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg ?? 'Błąd zapisu')
    } finally {
      setSaving(false)
    }
  }

  async function deleteUser(u: AdminUser) {
    if (!confirm(`Usunąć użytkownika ${u.email} i wszystkie jego dane?`)) return
    try {
      await adminDeleteUser(u.id)
      await load()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      alert(msg ?? 'Błąd usuwania')
    }
  }

  if (loading) return <div className="p-6 text-sm text-gray-400 dark:text-slate-500">Ładowanie…</div>

  return (
    <div className="p-6 space-y-3">
      {users.map(u => (
        <div key={u.id} className="border border-gray-100 dark:border-slate-700 rounded-xl p-4">
          {editingId === u.id ? (
            <div className="space-y-2">
              <input
                className="w-full border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                value={editEmail}
                onChange={e => setEditEmail(e.target.value)}
                placeholder="Email"
              />
              <input
                type="password"
                className="w-full border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                value={editPassword}
                onChange={e => setEditPassword(e.target.value)}
                placeholder="Nowe hasło (zostaw puste aby nie zmieniać)"
              />
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editIsAdmin}
                  onChange={e => setEditIsAdmin(e.target.checked)}
                  className="rounded"
                />
                Administrator
              </label>
              {error && <p className="text-xs text-red-500">{error}</p>}
              <div className="flex gap-2">
                <button
                  onClick={saveEdit}
                  disabled={saving}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold disabled:opacity-40"
                >
                  {saving ? 'Zapisywanie…' : 'Zapisz'}
                </button>
                <button
                  onClick={() => setEditingId(null)}
                  className="px-4 py-1.5 border border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-lg text-xs font-semibold"
                >
                  Anuluj
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900 dark:text-slate-100 truncate">{u.email}</span>
                  {u.is_admin && (
                    <span className="text-xs px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 rounded-full font-medium">admin</span>
                  )}
                </div>
                <div className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
                  Dołączył: {new Date(u.created_at).toLocaleDateString('pl-PL')}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => startEdit(u)}
                  className="text-xs px-3 py-1.5 border border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-lg font-medium transition-colors"
                >
                  Edytuj
                </button>
                <button
                  onClick={() => deleteUser(u)}
                  className="text-xs px-3 py-1.5 border border-red-200 dark:border-red-900/50 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg font-medium transition-colors"
                >
                  Usuń
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Tokens Tab ─────────────────────────────────────────────────────────────────

function TokensTab() {
  const [tokens, setTokens] = useState<InviteToken[]>([])
  const [loading, setLoading] = useState(true)
  const [count, setCount] = useState(1)
  const [generating, setGenerating] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try { setTokens(await adminListInviteTokens()) } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function generate() {
    setGenerating(true)
    try {
      const newTokens = await adminCreateInviteTokens(count)
      setTokens(prev => [...newTokens, ...prev])
    } finally {
      setGenerating(false)
    }
  }

  async function deleteToken(token: string) {
    try {
      await adminDeleteInviteToken(token)
      setTokens(prev => prev.filter(t => t.token !== token))
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      alert(msg ?? 'Błąd usuwania tokenu')
    }
  }

  function copy(token: string) {
    navigator.clipboard.writeText(token)
    setCopied(token)
    setTimeout(() => setCopied(null), 2000)
  }

  const unused = tokens.filter(t => !t.used)
  const used = tokens.filter(t => t.used)

  return (
    <div className="p-6 space-y-5">
      {/* Generator */}
      <div className="flex items-center gap-3">
        <label className="text-sm text-gray-600 dark:text-slate-300 font-medium">Wygeneruj</label>
        <input
          type="number"
          min={1}
          max={100}
          value={count}
          onChange={e => setCount(Math.max(1, Math.min(100, Number(e.target.value))))}
          className="w-20 border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 rounded-lg px-3 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        <label className="text-sm text-gray-600 dark:text-slate-300">tokenów</label>
        <button
          onClick={generate}
          disabled={generating}
          className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold disabled:opacity-40 transition-colors"
        >
          {generating ? 'Generowanie…' : 'Generuj'}
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-gray-400 dark:text-slate-500">Ładowanie…</div>
      ) : (
        <>
          {/* Nieużyte */}
          {unused.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-2">
                Nieużyte ({unused.length})
              </h4>
              <div className="space-y-2">
                {unused.map(t => (
                  <div key={t.token} className="flex items-center gap-3 border border-gray-100 dark:border-slate-700 rounded-xl px-4 py-2.5">
                    <code className="text-xs text-gray-700 dark:text-slate-300 flex-1 truncate font-mono">{t.token}</code>
                    <button
                      onClick={() => copy(t.token)}
                      className="text-xs px-2.5 py-1 border border-gray-200 dark:border-slate-600 text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-lg font-medium transition-colors shrink-0"
                    >
                      {copied === t.token ? '✓ Skopiowano' : 'Kopiuj'}
                    </button>
                    <button
                      onClick={() => deleteToken(t.token)}
                      className="text-xs px-2.5 py-1 border border-red-200 dark:border-red-900/50 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg font-medium transition-colors shrink-0"
                    >
                      Usuń
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Użyte */}
          {used.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-2">
                Użyte ({used.length})
              </h4>
              <div className="space-y-2">
                {used.map(t => (
                  <div key={t.token} className="flex items-center gap-3 border border-gray-100 dark:border-slate-700 rounded-xl px-4 py-2.5 opacity-50">
                    <code className="text-xs text-gray-500 dark:text-slate-400 flex-1 truncate font-mono">{t.token}</code>
                    <span className="text-xs text-gray-400 dark:text-slate-500 shrink-0">
                      {t.used_at ? new Date(t.used_at).toLocaleDateString('pl-PL') : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tokens.length === 0 && (
            <p className="text-sm text-gray-400 dark:text-slate-500">Brak tokenów. Wygeneruj pierwszy.</p>
          )}
        </>
      )}
    </div>
  )
}

// ── Audit Log Tab ──────────────────────────────────────────────────────────────

const ACTION_COLOR: Record<string, string> = {
  LOGIN_SUCCESS: 'text-green-600 bg-green-50',
  LOGIN_FAILURE: 'text-red-600 bg-red-50',
  LOGOUT: 'text-gray-500 bg-gray-50',
  TOKEN_REFRESH: 'text-blue-600 bg-blue-50',
  TOKEN_REVOKE_ALL: 'text-orange-600 bg-orange-50',
  REGISTER: 'text-indigo-600 bg-indigo-50',
  PASSWORD_CHANGE: 'text-yellow-700 bg-yellow-50',
  INVITE_CREATE: 'text-purple-600 bg-purple-50',
  INVITE_DELETE: 'text-purple-400 bg-purple-50',
  USER_UPDATE: 'text-blue-700 bg-blue-50',
  USER_DELETE: 'text-red-700 bg-red-50',
}

function AuditTab() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [offset, setOffset] = useState(0)
  const PAGE = 50

  async function load(off = 0) {
    setLoading(true)
    try {
      const res = await api.get(`/admin/audit-log?limit=${PAGE}&offset=${off}`)
      setEntries(res.data)
      setOffset(off)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(0) }, [])

  return (
    <div className="p-6 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400 dark:text-slate-500">Zdarzenia bezpieczeństwa — najnowsze pierwsze</p>
        <button onClick={() => load(0)} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">Odśwież</button>
      </div>

      {loading ? (
        <div className="text-sm text-gray-400 dark:text-slate-500">Ładowanie…</div>
      ) : (
        <>
          <div className="space-y-1.5">
            {entries.map(e => (
              <div key={e.id} className="flex items-start gap-3 border border-gray-100 dark:border-slate-700 rounded-xl px-4 py-2.5 text-xs">
                <span className={`shrink-0 px-2 py-0.5 rounded-full font-mono font-semibold text-[10px] ${ACTION_COLOR[e.action] ?? 'text-gray-600 bg-gray-100 dark:text-slate-400 dark:bg-slate-700'}`}>
                  {e.action}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-gray-700 dark:text-slate-300">{e.user_email ?? '—'}</span>
                  {e.detail && <span className="text-gray-400 dark:text-slate-500 ml-2">{e.detail}</span>}
                </div>
                <div className="shrink-0 text-right text-gray-400 dark:text-slate-500 space-y-0.5">
                  <div>{e.ip_address ?? '—'}</div>
                  <div>{new Date(e.created_at).toLocaleString('pl-PL')}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-between pt-2">
            <button
              disabled={offset === 0}
              onClick={() => load(Math.max(0, offset - PAGE))}
              className="text-xs px-3 py-1.5 border border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-300 rounded-lg disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-slate-700"
            >
              ← Nowsze
            </button>
            <button
              disabled={entries.length < PAGE}
              onClick={() => load(offset + PAGE)}
              className="text-xs px-3 py-1.5 border border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-300 rounded-lg disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-slate-700"
            >
              Starsze →
            </button>
          </div>
        </>
      )}
    </div>
  )
}
