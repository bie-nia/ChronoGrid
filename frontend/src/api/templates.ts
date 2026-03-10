import { api } from './client'
import { ActivityTemplate } from '../types'

export const _templatesImpl = {
  list: async (): Promise<ActivityTemplate[]> => {
    const res = await api.get<ActivityTemplate[]>('/activity-templates')
    return res.data
  },
  create: async (data: Partial<ActivityTemplate>): Promise<ActivityTemplate> => {
    const res = await api.post<ActivityTemplate>('/activity-templates', data)
    return res.data
  },
  update: async (id: number, data: Partial<ActivityTemplate>): Promise<ActivityTemplate> => {
    const res = await api.put<ActivityTemplate>(`/activity-templates/${id}`, data)
    return res.data
  },
  delete: async (id: number): Promise<void> => {
    await api.delete(`/activity-templates/${id}`)
  },
}

export const templatesApi = new Proxy(_templatesImpl, {
  get(target, prop) {
    return (...args: unknown[]) => (target[prop as keyof typeof target] as (...a: unknown[]) => unknown)(...args)
  },
}) as typeof _templatesImpl
