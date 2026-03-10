import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Placeholder from '@tiptap/extension-placeholder'
import { useEffect, useRef } from 'react'

// ── Toolbar button helper ─────────────────────────────────────────────────────
function ToolBtn({
  onClick,
  active,
  title,
  children,
  accentColor,
}: {
  onClick: () => void
  active?: boolean
  title: string
  children: React.ReactNode
  accentColor: string
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => { e.preventDefault(); onClick() }}
      className="w-8 h-7 flex items-center justify-center rounded text-sm transition-colors"
      style={{
        backgroundColor: active ? accentColor + '22' : 'transparent',
        color: active ? accentColor : 'var(--text-muted)',
        fontWeight: active ? 700 : 400,
      }}
    >
      {children}
    </button>
  )
}

// ── Główny komponent ──────────────────────────────────────────────────────────
interface RichTextEditorProps {
  /** Wartość jako HTML — przechowywana w bazie */
  value: string
  onChange: (html: string) => void
  accentColor: string
  onCtrlEnter?: () => void
}

export function RichTextEditor({ value, onChange, accentColor, onCtrlEnter }: RichTextEditorProps) {
  // initialValue — ustawiamy tylko raz przy montowaniu, edytor jest uncontrolled
  const initialValue = useRef(value)
  // Refy na callbacki — żeby useEditor nie miał stale closure
  const onChangeRef = useRef(onChange)
  const onCtrlEnterRef = useRef(onCtrlEnter)
  useEffect(() => { onChangeRef.current = onChange }, [onChange])
  useEffect(() => { onCtrlEnterRef.current = onCtrlEnter }, [onCtrlEnter])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Wyłącz heading/codeBlock — niepotrzebne w notatkach
        heading: false,
        codeBlock: false,
        code: false,
        horizontalRule: {},
      }),
      Underline,
      TaskList,
      TaskItem.configure({ nested: false }),
      Placeholder.configure({ placeholder: 'Notatki, zadania, linki…' }),
    ],
    content: initialValue.current || '',
    onUpdate({ editor }) {
      onChangeRef.current(editor.getHTML())
    },
    editorProps: {
      handleKeyDown(_view, event) {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          onCtrlEnterRef.current?.()
          return true
        }
        return false
      },
    },
  })

  // Synchronizuj tylko gdy panel jest remountowany z nową wartością zewnętrzną
  // (np. otwarcie drugiego eventu bez odmontowania komponentu — w praktyce rzadkie,
  // ale zabezpieczamy: compare ref z aktualnym value)
  useEffect(() => {
    if (!editor) return
    if (value !== initialValue.current) {
      initialValue.current = value
      // Ustaw nową treść tylko jeśli edytor ma inną (nie nadpisuj tego co użytkownik pisze)
      if (editor.getHTML() !== value) {
        editor.commands.setContent(value || '')
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  if (!editor) return null

  return (
    <div className="flex flex-col flex-1 min-h-0" style={{ '--accent': accentColor } as React.CSSProperties}>
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b shrink-0"
        style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-surface-2)' }}
      >
        {/* Checkbox / lista zadań */}
        <ToolBtn
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          active={editor.isActive('taskList')}
          title="Lista zadań (checkbox)"
          accentColor={accentColor}
        >
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <rect x="1.5" y="1.5" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M4 7.5l2.5 2.5 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </ToolBtn>

        <div className="w-px h-4 bg-gray-200 dark:bg-slate-600 mx-1" />

        {/* Bold */}
        <ToolBtn
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive('bold')}
          title="Pogrubienie (Ctrl+B)"
          accentColor={accentColor}
        >
          <span style={{ fontWeight: 800 }}>B</span>
        </ToolBtn>

        {/* Italic */}
        <ToolBtn
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive('italic')}
          title="Kursywa (Ctrl+I)"
          accentColor={accentColor}
        >
          <span style={{ fontStyle: 'italic', fontWeight: 600 }}>I</span>
        </ToolBtn>

        {/* Underline */}
        <ToolBtn
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={editor.isActive('underline')}
          title="Podkreślenie (Ctrl+U)"
          accentColor={accentColor}
        >
          <span style={{ textDecoration: 'underline', fontWeight: 600 }}>U</span>
        </ToolBtn>

        {/* Strike */}
        <ToolBtn
          onClick={() => editor.chain().focus().toggleStrike().run()}
          active={editor.isActive('strike')}
          title="Przekreślenie"
          accentColor={accentColor}
        >
          <span style={{ textDecoration: 'line-through', fontWeight: 600 }}>S</span>
        </ToolBtn>

        <div className="w-px h-4 bg-gray-200 dark:bg-slate-600 mx-1" />

        {/* Lista punktowana */}
        <ToolBtn
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive('bulletList')}
          title="Lista punktowana"
          accentColor={accentColor}
        >
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <circle cx="3" cy="4.5" r="1.2" fill="currentColor"/>
            <circle cx="3" cy="7.5" r="1.2" fill="currentColor"/>
            <circle cx="3" cy="10.5" r="1.2" fill="currentColor"/>
            <line x1="6" y1="4.5" x2="13" y2="4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <line x1="6" y1="7.5" x2="13" y2="7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <line x1="6" y1="10.5" x2="13" y2="10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </ToolBtn>

        {/* Separator */}
        <ToolBtn
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          active={false}
          title="Linia pozioma"
          accentColor={accentColor}
        >
          <span style={{ fontSize: '16px', lineHeight: 1 }}>—</span>
        </ToolBtn>
      </div>

      {/* Edytor */}
      <EditorContent
        editor={editor}
        className="flex-1 overflow-y-auto tiptap-editor"
      />
    </div>
  )
}


