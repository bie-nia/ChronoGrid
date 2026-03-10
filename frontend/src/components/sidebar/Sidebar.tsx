import { ActivityTemplateList } from './ActivityTemplateList'
import { EisenhowerMatrix } from '../eisenhower/EisenhowerMatrix'
import { Bestiary } from '../bestiary/Bestiary'
import { useAuthStore } from '../../store/authStore'
import { ChronoGridLogo } from '../ui/ChronoGridLogo'

export function Sidebar() {
  const logout = useAuthStore((s) => s.logout)

  return (
    <aside className="w-[320px] min-w-[300px] h-full bg-white dark:bg-slate-800 border-r border-gray-100 dark:border-slate-700 flex flex-col overflow-hidden">
      {/* Top brand */}
      <div className="px-4 py-4 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between">
        <ChronoGridLogo size={30} />
        <button
          onClick={logout}
          className="text-xs text-gray-400 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-200 transition-colors"
          title="Wyloguj"
        >
          ⎋
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-5">
        <ActivityTemplateList />
        <div className="border-t border-gray-100 dark:border-slate-700 pt-4">
          <EisenhowerMatrix />
        </div>
        <div className="border-t border-gray-100 dark:border-slate-700 pt-4">
          <Bestiary />
        </div>
      </div>

      {/* Help hint */}
      <div className="px-4 py-2 border-t border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-900">
        <p className="text-xs text-gray-400 dark:text-slate-500">
          Przeciągnij aktywność lub zadanie na kalendarz
        </p>
      </div>
    </aside>
  )
}
