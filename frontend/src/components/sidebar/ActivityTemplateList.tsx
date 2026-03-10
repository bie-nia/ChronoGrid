import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { templatesApi } from '../../api/templates'
import { useCalendarStore } from '../../store/calendarStore'
import { ActivityTemplate } from '../../types'
import { ActivityTemplateOverlay } from './ActivityTemplateOverlay'
import { IconRenderer } from '../ui/IconRenderer'

// ── Pojedynczy kafelek aktywności ────────────────────────────────────────────
function TemplatePill({
  template,
  onEdit,
  onDelete,
}: {
  template: ActivityTemplate
  onEdit: (t: ActivityTemplate) => void
  onDelete: (id: number) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: template.id,
    data: { type: 'template', template },
  })

  const selectedId = useCalendarStore((s) => s.selectedTemplateId)
  const setTemplate = useCalendarStore((s) => s.setTemplate)
  const iconSet = useCalendarStore((s) => s.iconSet)
  const isSelected = selectedId === template.id

  // Rozróżnienie klik vs drag
  const pointerMovedRef = useRef(false)
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null)

  const openEdit = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onEdit(template)
  }

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    backgroundColor: template.color + '44',
    color: template.color,
    borderLeft: `3px solid ${template.color}`,
  }

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      style={style}
      onContextMenu={openEdit}
      onPointerDown={(e) => {
        // Przekaż do dnd-kit (listeners.onPointerDown startuje drag)
        listeners?.onPointerDown?.(e)
        // Śledź start do rozróżnienia klik vs drag
        pointerStartRef.current = { x: e.clientX, y: e.clientY }
        pointerMovedRef.current = false
      }}
      onKeyDown={listeners?.onKeyDown as React.KeyboardEventHandler<HTMLDivElement> | undefined}
      onPointerMove={(e) => {
        if (pointerStartRef.current) {
          const dx = e.clientX - pointerStartRef.current.x
          const dy = e.clientY - pointerStartRef.current.y
          if (Math.sqrt(dx * dx + dy * dy) > 4) pointerMovedRef.current = true
        }
      }}
      onClick={() => {
        if (!pointerMovedRef.current) setTemplate(isSelected ? null : template.id)
      }}
      className="group flex items-center gap-2 px-3 py-2 rounded-lg cursor-grab active:cursor-grabbing text-sm font-medium transition-all select-none hover:brightness-95"
    >
      {/* Wizualny hint — 6 kropek (tylko wizualny, drag działa na całości) */}
      <span className="shrink-0 opacity-0 group-hover:opacity-40 transition-opacity -ml-1 px-0.5 pointer-events-none">
        <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
          <circle cx="3" cy="2.5" r="1.2"/><circle cx="7" cy="2.5" r="1.2"/>
          <circle cx="3" cy="7" r="1.2"/><circle cx="7" cy="7" r="1.2"/>
          <circle cx="3" cy="11.5" r="1.2"/><circle cx="7" cy="11.5" r="1.2"/>
        </svg>
      </span>

      <span className="text-base shrink-0" style={{ color: template.color }}>
        <IconRenderer icon={template.icon} size={18} iconSet={iconSet} />
      </span>
      <span className="flex-1 truncate">{template.name}</span>
      <span className="text-xs opacity-50 tabular-nums shrink-0">
        {template.default_duration >= 60
          ? template.default_duration % 60 === 0
            ? `${template.default_duration / 60}h`
            : `${Math.floor(template.default_duration / 60)}h${template.default_duration % 60}m`
          : `${template.default_duration}m`}
      </span>
    </div>
  )
}

// ── Główny komponent ─────────────────────────────────────────────────────────
export function ActivityTemplateList() {
  const qc = useQueryClient()
  const [showCreateOverlay, setShowCreateOverlay] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<ActivityTemplate | null>(null)
  const templateOrder = useCalendarStore((s) => s.templateOrder)

  const { data: templates = [] } = useQuery({
    queryKey: ['activity-templates'],
    queryFn: templatesApi.list,
  })

  // Sortuj szablony wg zapisanej kolejności
  const sortedTemplates = [...templates].sort((a, b) => {
    const ai = templateOrder.indexOf(a.id)
    const bi = templateOrder.indexOf(b.id)
    if (ai === -1 && bi === -1) return 0
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })

  const createMut = useMutation({
    mutationFn: templatesApi.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['activity-templates'] }),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<ActivityTemplate> }) =>
      templatesApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['activity-templates'] })
      qc.invalidateQueries({ queryKey: ['events'] })
    },
  })

  const deleteMut = useMutation({
    mutationFn: templatesApi.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['activity-templates'] }),
  })

  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Aktywności</h2>
          <button
            onClick={() => setShowCreateOverlay(true)}
            className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-medium"
          >
            + Dodaj
          </button>
        </div>

        <SortableContext items={sortedTemplates.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-1.5">
            {sortedTemplates.map((t) => (
              <TemplatePill
                key={t.id}
                template={t}
                onEdit={setEditingTemplate}
                onDelete={(id) => deleteMut.mutate(id)}
              />
            ))}
          </div>
        </SortableContext>
      </div>

      {showCreateOverlay && (
        <ActivityTemplateOverlay
          onSave={(data) => createMut.mutate(data)}
          onClose={() => setShowCreateOverlay(false)}
        />
      )}

      {editingTemplate && (
        <ActivityTemplateOverlay
          template={editingTemplate}
          onSave={(data) => updateMut.mutate({ id: editingTemplate.id, data })}
          onDelete={() => { deleteMut.mutate(editingTemplate.id); setEditingTemplate(null) }}
          onClose={() => setEditingTemplate(null)}
        />
      )}
    </>
  )
}

export { }
