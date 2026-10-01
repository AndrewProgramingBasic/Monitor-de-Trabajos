// API Client Utility for VPTI Task Monitor

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5000/api'
).replace(/\/$/, '')

const TOKEN_KEY = 'vpti_access_token'
const USER_KEY = 'vpti_user'

export interface User {
  id: number
  username: string
  email: string
  full_name: string
  created_at?: string
  created_by_user_id?: number | null
}

export interface LoginResponse {
  access_token: string
  user: User
}

export interface ScheduledTask {
  id: number
  sheet_id: number | null
  committee_name: string | null
  sheet_filename?: string | null
  sheet_uploaded_at?: string | null
  sheet_item_order: number | null
  title: string
  cdc_number: string | null
  justification: string | null
  start_datetime: string
  end_datetime: string
  has_affectation: string
  affectation_start: string | null
  affectation_end: string | null
  affectation_details: string | null
  vpti_committee_approval: string | null
  managers_approval: string | null
  is_rescheduled: boolean
  parent_task_id: number | null
  alert_1h_sent: boolean
  alert_sent_at: string | null
  created_at: string
  created_by: number | null
  created_by_name?: string | null
  updated_at: string | null
  updated_by: number | null
  updated_by_name?: string | null
  execution_status: 'PROGRAMADO' | 'PROXIMO (MENOS DE 1 HORA)' | 'EN EJECUCION' | 'TERMINADO' | string
}

export interface CommitteeSheet {
  id: number
  filename: string
  uploaded_at: string
  total_tasks?: number
  file_hash?: string
  committee_name?: string | null
  uploaded_by?: number | null
  uploaded_by_name?: string | null
  is_latest?: boolean
}

export interface SheetUploadResponse {
  sheet_id: number
  committee_name: string
  tasks_imported: number
  rescheduled_count: number
}

export class ApiError extends Error {
  status: number
  data: any

  constructor(message: string, status: number, data?: any) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY)
}

export function getStoredUser(): User | null {
  if (typeof window === 'undefined') return null
  const userStr = localStorage.getItem(USER_KEY)
  if (!userStr) return null
  try {
    return JSON.parse(userStr) as User
  } catch {
    return null
  }
}

export function setStoredSession(token: string, user: User) {
  if (typeof window === 'undefined') return
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
  // Also store in cookie for SSR / middleware compatibility
  document.cookie = `${TOKEN_KEY}=${encodeURIComponent(token)}; path=/; max-age=28800; SameSite=Lax`
}

export function clearStoredSession() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
  sessionStorage.removeItem('vpti-authenticated')
  document.cookie = `${TOKEN_KEY}=; path=/; max-age=0; SameSite=Lax`
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = path.startsWith('http://') || path.startsWith('https://')
    ? path
    : `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  }

  const token = getStoredToken()
  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const config: RequestInit = {
    ...options,
    headers,
  }

  let response: Response
  try {
    response = await fetch(url, config)
  } catch (networkError: any) {
    throw new ApiError(
      networkError?.message || 'Error de conexión con el servidor API.',
      0
    )
  }

  // Intercept 401 Unauthorized responses
  if (response.status === 401) {
    clearStoredSession()
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.location.href = '/login'
    }
  }

  let data: any = null
  const contentType = response.headers.get('content-type')
  if (contentType && contentType.includes('application/json')) {
    try {
      data = await response.json()
    } catch {
      data = null
    }
  } else {
    data = await response.text()
  }

  if (!response.ok) {
    const errorMessage =
      (data && typeof data === 'object' && (data.error || data.message)) ||
      `Error HTTP ${response.status}: ${response.statusText}`
    throw new ApiError(errorMessage, response.status, data)
  }

  return data as T
}

export const api = {
  get<T>(path: string, options: RequestInit = {}): Promise<T> {
    return request<T>(path, { ...options, method: 'GET' })
  },

  post<T>(path: string, body?: any, options: RequestInit = {}): Promise<T> {
    const isFormData = typeof FormData !== 'undefined' && body instanceof FormData
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    }

    if (!isFormData && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json'
    }

    return request<T>(path, {
      ...options,
      method: 'POST',
      headers,
      body: isFormData ? body : JSON.stringify(body),
    })
  },

  patch<T>(path: string, body?: any, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    }

    return request<T>(path, {
      ...options,
      method: 'PATCH',
      headers,
      body: JSON.stringify(body),
    })
  },

  upload<T>(path: string, formData: FormData, options: RequestInit = {}): Promise<T> {
    return request<T>(path, {
      ...options,
      method: 'POST',
      body: formData,
    })
  },
}

