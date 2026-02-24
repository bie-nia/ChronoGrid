export function isEmptyHtml(html: string): boolean {
  return !html || html === '<p></p>' || html.trim() === ''
}

export interface TodoItem {
  text: string
  checked: boolean
}

/**
 * Wyciąga listę task-list items z HTML generowanego przez Tiptap.
 * Tiptap generuje: <ul data-type="taskList"><li data-checked="true/false">...</li></ul>
 */
export function parseTodoItems(html: string): TodoItem[] {
  if (!html) return []
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const items: TodoItem[] = []
  // Tiptap task list: <li data-type="taskItem" data-checked="true|false">
  const listItems = doc.querySelectorAll('li[data-type="taskItem"]')
  listItems.forEach((li) => {
    const checked = li.getAttribute('data-checked') === 'true'
    // Treść jest w <label> lub bezpośrednio w li — weź textContent po usunięciu checkboxa
    const text = (li.textContent ?? '').trim()
    if (text) items.push({ checked, text })
  })
  return items
}

/**
 * Zwraca liczbę nieodznaczonych (todo) task-list items w HTML.
 */
export function countUncheckedTodos(html: string): number {
  return parseTodoItems(html).filter((t) => !t.checked).length
}

/**
 * Zaznacza lub odznacza checkbox w HTML Tiptap na podstawie tekstu itemu.
 * Zwraca zmodyfikowany HTML lub null jeśli nic nie zmieniono.
 */
export function setTodoChecked(html: string, todoText: string, checked: boolean): string | null {
  if (!html) return null
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  let changed = false
  const listItems = doc.querySelectorAll('li[data-type="taskItem"]')
  listItems.forEach((li) => {
    const text = (li.textContent ?? '').trim()
    if (text === todoText.trim()) {
      const currentChecked = li.getAttribute('data-checked') === 'true'
      if (currentChecked !== checked) {
        li.setAttribute('data-checked', checked ? 'true' : 'false')
        // Tiptap też ustawia atrybut na wewnętrznym <input type="checkbox">
        const input = li.querySelector('input[type="checkbox"]')
        if (input) {
          if (checked) input.setAttribute('checked', 'checked')
          else input.removeAttribute('checked')
        }
        changed = true
      }
    }
  })
  if (!changed) return null
  // Serializuj z powrotem do HTML — body.innerHTML
  return doc.body.innerHTML
}
