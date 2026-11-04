import { apiRequest } from './client'

export interface BulkInquiryPayload {
  fullName: string
  phone: string
  email?: string
  productDetails: string
  quantity: string
  deliveryLocation: string
  requirements?: string
}

export interface BulkInquiry {
  id: string
  full_name: string
  phone: string
  email: string | null
  product_details: string
  quantity: string
  delivery_location: string
  requirements: string | null
  status: 'new' | 'read' | 'contacted' | 'quoted' | 'closed'
  created_at: string
}

export const bulkInquiryApi = {
  submit: (payload: BulkInquiryPayload) =>
    apiRequest<{ id: string; createdAt: string }>('/bulk-inquiries', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  list: () =>
    apiRequest<BulkInquiry[]>('/admin/bulk-inquiries', {
      method: 'GET',
      requiresAuth: true,
    }),
  markRead: (id: string) =>
    apiRequest<BulkInquiry>(`/admin/bulk-inquiries/${id}/read`, {
      method: 'PATCH',
      requiresAuth: true,
    }),
  delete: (id: string) =>
    apiRequest<void>(`/admin/bulk-inquiries/${id}`, {
      method: 'DELETE',
      requiresAuth: true,
    }),
}
