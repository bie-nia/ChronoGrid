import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { RichTextEditor } from './RichTextEditor'
import { isEmptyHtml } from '../../lib/htmlUtils'

const DESC_PANEL_WIDTH = 380
const DESC_PANEL_GAP = 12

interface DescriptionFieldProps {
  value: string
  onChange: (v: string) => void
  accentColor: string
  /** Ref do kontenera modalu — do obliczania pozycji panelu */
  modalRef: React.RefObject<HTMLDivElement>
}

export function DescriptionField({
  value,
  onChange,
  accentColor,
  modalRef,
}: DescriptionFieldProps) {
  const [open, setOpen] = useState(false)
  // draft + ref — setState jest async, confirm() czyta z ref żeby zawsze mieć świeże dane
  const [draft, setDraft] = useState(value)
  const draftRef = useRef(value)
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({})

  const computePosition = useCallback(() => {
    const modal = modalRef.current
    if (!modal) return
    const rect = modal.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const panelH = Math.min(520, vh - 32)
    const top = Math.max(16, Math.min(rect.top, vh - panelH - 16))
    const spaceRight = vw - rect.right - DESC_PANEL_GAP
    const spaceLeft = rect.left - DESC_PANEL_GAP
    let left: number
    if (spaceRight >= DESC_PANEL_WIDTH) {
      left = rect.right + DESC_PANEL_GAP
    } else if (spaceLeft >= DESC_PANEL_WIDTH) {
      left = rect.left - DESC_PANEL_GAP - DESC_PANEL_WIDTH
    } else {
      left = Math.max(16, (vw - DESC_PANEL_WIDTH) / 2)
    }
    setPanelStyle({ position: 'fixed', top, left, width: DESC_PANEL_WIDTH, height: panelH, zIndex: 200 })
  }, [modalRef])

  function openEditor() {
    draftRef.current = value
    setDraft(value)
    setOpen(true)
  }

  function confirm() {
    onChange(draftRef.current)
    setOpen(false)
  }

  function cancel() {
    setOpen(false)
  }

  useEffect(() => {
    if (open) computePosition()
  }, [open, computePosition])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') cancel() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const hasContent = !isEmptyHtml(value)

  // Policz checkboxy
  const totalTasks = (value.match(/data-type="taskItem"/g) ?? []).length
  const doneTasks = (value.match(/data-checked="true"/g) ?? []).length

  return (
    <>
      {/* Przycisk otwierający edytor */}
        <button
        type="button"
        onClick={openEditor}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 dark:border-slate-600 hover:border-gray-300 dark:hover:border-slate-500 transition-colors text-left"
        style={{ borderColor: open ? accentColor : '' }}
      >
        <svg width="14" height="14" viewBox="0 0 15 15" fill="none" className="shrink-0 text-gray-400 dark:text-slate-500">
          <path d="M11.8536 1.14645C11.6583 0.951184 11.3417 0.951184 11.1465 1.14645L3.71455 8.57836C3.62459 8.66832 3.56263 8.78255 3.53552 8.90704L3.02943 11.2524C2.98802 11.4412 3.04719 11.6387 3.18536 11.7769C3.32352 11.915 3.52105 11.9742 3.70978 11.9328L6.05524 11.4267C6.17972 11.3996 6.29396 11.3376 6.38392 11.2477L13.8158 3.81573C14.0111 3.62047 14.0111 3.30389 13.8158 3.10863L11.8536 1.14645ZM4.66541 9.37884L11.5 2.54424L12.4558 3.50003L5.62118 10.3346L4.23667 10.6457L4.66541 9.37884Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"/>
        </svg>
        <span className="text-xs font-medium text-gray-500 dark:text-slate-400">Opis</span>
        {hasContent ? (
          <span className="text-xs text-gray-400 dark:text-slate-500 ml-auto">
            {totalTasks > 0 ? `☑ ${doneTasks}/${totalTasks} zadań` : 'wypełniony'}
          </span>
        ) : (
          <span className="text-xs text-gray-300 dark:text-slate-600 ml-auto">puste</span>
        )}
      </button>

      {/* Popup WYSIWYG — pozycjonowany dynamicznie obok modalu */}
      {open && createPortal(
        <>
          <div className="fixed inset-0 z-[199]" onClick={cancel} />
          <div
            className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden z-[200]"
            style={panelStyle}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 dark:border-slate-700 shrink-0">
              <span className="text-sm font-semibold text-gray-700 dark:text-slate-200">Opis</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-300 dark:text-slate-600">Ctrl+Enter · Esc</span>
                <button onClick={cancel} className="text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 text-lg leading-none">✕</button>
              </div>
            </div>

            {/* Edytor WYSIWYG */}
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
              <RichTextEditor
                value={draft}
                onChange={(html) => { draftRef.current = html; setDraft(html) }}
                accentColor={accentColor}
                onCtrlEnter={confirm}
              />
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-100 dark:border-slate-700 shrink-0">
              <button
                onClick={cancel}
                className="px-3 py-1.5 text-sm text-gray-600 dark:text-slate-300 border border-gray-200 dark:border-slate-600 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
              >
                Anuluj
              </button>
              <button
                onClick={confirm}
                className="px-3 py-1.5 text-sm text-white rounded-xl font-semibold transition-colors"
                style={{ backgroundColor: accentColor }}
              >
                Zapisz
              </button>
            </div>
          </div>
        </>,
        document.body,
      )}
    </>
  )
}
