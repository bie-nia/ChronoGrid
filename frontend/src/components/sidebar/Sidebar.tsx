import { ActivityTemplateList } from './ActivityTemplateList'
import { EisenhowerMatrix } from '../eisenhower/EisenhowerMatrix'
import { Bestiary } from '../bestiary/Bestiary'
import { useAuthStore } from '../../store/authStore'

export function Sidebar() {
  const logout = useAuthStore((s) => s.logout)

  return (
    <aside className="w-[320px] min-w-[300px] h-full bg-white border-r border-gray-100 flex flex-col overflow-hidden">
      {/* Top brand */}
      <div className="px-4 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h1 className="font-bold text-gray-900 text-base">ADHD Calendar</h1>
          <p className="text-xs text-gray-400">Zarządzaj swoim czasem</p>
        </div>
        <button
          onClick={logout}
          className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
          title="Wyloguj"
        >
          ⎋
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-5">
        <ActivityTemplateList />
        <div className="border-t border-gray-100 pt-4">
          <EisenhowerMatrix />
        </div>
        <div className="border-t border-gray-100 pt-4">
          <Bestiary />
        </div>
      </div>

      {/* Help hint */}
      <div className="px-4 py-2 border-t border-gray-100 bg-gray-50">
        <p className="text-xs text-gray-400">
          Przeciągnij aktywność lub zadanie na kalendarz
        </p>
      </div>
    </aside>
  )
}
