export interface ActivityTemplate {
  id: number
  name: string
  color: string
  icon: string
  default_duration: number
  description?: string
  is_background: boolean
  user_id: number
  created_at: string
}

export interface Event {
  id: number
  title: string
  start_datetime: string
  end_datetime: string
  description?: string
  location?: string
  recurrence_rule?: string
  activity_template_id?: number
  activity_template?: ActivityTemplate
  is_background: boolean
  color?: string
  icon?: string
  eisenhower_quadrant?: string | null
  user_id: number
  created_at: string
}

export type TaskStatus = 'todo' | 'in_progress' | 'done'

export interface EisenhowerTask {
  id: number
  title: string
  description?: string | null
  urgent: boolean
  important: boolean
  status: TaskStatus
  linked_event_id?: number
  due_date?: string | null        // ISO datetime — kiedy task pojawia się w target_quadrant
  target_quadrant?: string | null // docelowy kwadrant po upływie due_date
  recurrence_days?: number | null // co ile dni cykl się powtarza
  user_id: number
  created_at: string
}

export interface Contact {
  id: number
  name: string
  phone?: string
  notes?: string
  interests?: string
  birthday?: string   // ISO date "YYYY-MM-DD"
  photo_url?: string
  user_id: number
  created_at: string
}

export interface Token {
  access_token: string
  token_type: string
}

export type Quadrant = 'do_first' | 'schedule' | 'delegate' | 'eliminate'

export function getQuadrant(task: EisenhowerTask): Quadrant {
  if (task.urgent && task.important) return 'do_first'
  if (!task.urgent && task.important) return 'schedule'
  if (task.urgent && !task.important) return 'delegate'
  return 'eliminate'
}

export function quadrantToFlags(q: Quadrant): { urgent: boolean; important: boolean } {
  switch (q) {
    case 'do_first': return { urgent: true, important: true }
    case 'schedule': return { urgent: false, important: true }
    case 'delegate': return { urgent: true, important: false }
    case 'eliminate': return { urgent: false, important: false }
  }
}
