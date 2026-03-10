import { api } from './client'
import { Contact } from '../types'

export const _contactsImpl = {
  list: async (): Promise<Contact[]> => {
    const res = await api.get<Contact[]>('/contacts')
    return res.data
  },
  create: async (data: Omit<Contact, 'id' | 'user_id' | 'created_at'>): Promise<Contact> => {
    const res = await api.post<Contact>('/contacts', data)
    return res.data
  },
  update: async (id: number, data: Partial<Contact>): Promise<Contact> => {
    const res = await api.put<Contact>(`/contacts/${id}`, data)
    return res.data
  },
  delete: async (id: number): Promise<void> => {
    await api.delete(`/contacts/${id}`)
  },
  uploadPhoto: async (id: number, file: File): Promise<Contact> => {
    const form = new FormData()
    form.append('file', file)
    const res = await api.post<Contact>(`/contacts/${id}/photo`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return res.data
  },
  deletePhoto: async (id: number): Promise<Contact> => {
    const res = await api.delete<Contact>(`/contacts/${id}/photo`)
    return res.data
  },
}

export const contactsApi = new Proxy(_contactsImpl, {
  get(target, prop) {
    return (...args: unknown[]) => (target[prop as keyof typeof target] as (...a: unknown[]) => unknown)(...args)
  },
}) as typeof _contactsImpl
