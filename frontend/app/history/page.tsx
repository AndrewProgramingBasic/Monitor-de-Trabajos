'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Archive,
  ArrowUpDown,
  Bell,
  BellRing,
  CalendarDays,
  Check,
  ChevronDown,
  CircleAlert,
  ClipboardList,
  Clock3,
  Download,
  FileSpreadsheet,
  Filter,
  History,
  Layers,
  Loader2,
  LogOut,
  RefreshCw,
  Search,
  Send,
  UserPlus,
  X,
} from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { api, ScheduledTask, CommitteeSheet } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import {
  registerServiceWorker,
  checkPushSubscription,
  subscribeToPush,
  unsubscribeFromPush,
} from '@/lib/push-notifications'
import { LoginView } from '@/components/login-view'
import { EditScheduleDialog } from '@/components/edit-schedule-dialog'
import { RegisterUserDialog } from '@/components/register-user-dialog'
import { TaskDetailDialog } from '@/components/task-detail-dialog'
import { toast } from 'sonner'

export const getStatusBadgeProps = (status: string) => {
  const norm = status?.toUpperCase() || ''
  if (norm.startsWith('PROXIMO')) {
    return {
      label: status, // Renders e.g. "PROXIMO (MENOS DE 20 MINUTOS)"
      className:
        'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/50 dark:text-amber-300 font-semibold',
    }
  }
  if (norm === 'EN EJECUCION') {
    return {
      label: status,
      className:
        'border-red-200 bg-red-50 text-red-700 dark:border-red-800/60 dark:bg-red-950/50 dark:text-red-300 font-semibold',
    }
  }
  if (norm === 'TERMINADO') {
    return {
      label: status,
      className:
        'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/50 dark:text-emerald-300',
    }
  }
  return {
    label: status || 'PROGRAMADO',
    className:
      'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800/60 dark:bg-blue-950/50 dark:text-blue-300',
  }
}

const baseStatusStyles: Record<string, string> = {
  PROGRAMADO:
    'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800/60 dark:bg-blue-950/50 dark:text-blue-300',
  'EN EJECUCION':
    'border-red-200 bg-red-50 text-red-700 dark:border-red-800/60 dark:bg-red-950/50 dark:text-red-300 font-semibold',
  TERMINADO:
    'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/50 dark:text-emerald-300',
}

const statusStyles: Record<string, string> = new Proxy(baseStatusStyles, {
  get(target: Record<string, string>, prop: string) {
    if (typeof prop === 'string') {
      const norm = prop.toUpperCase()
      if (norm.startsWith('PROXIMO')) {
        return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/50 dark:text-amber-300 font-semibold'
      }
      if (target[prop]) return target[prop]
    }
    return 'border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-slate-700 dark:text-slate-300'
  },
})

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '-'
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return iso
    const pad = (n: number) => String(n).padStart(2, '0')
    const day = pad(d.getDate())
    const month = pad(d.getMonth() + 1)
    const year = d.getFullYear()
    const hours = pad(d.getHours())
    const mins = pad(d.getMinutes())
    return `${day}/${month}/${year} · ${hours}:${mins}`
  } catch {
    return iso
  }
}

function formatDateOnly(iso: string | null | undefined): string {
  if (!iso) return '-'
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return iso
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
  } catch {
    return iso
  }
}

export default function HistoryPage() {
  const router = useRouter()
  const { user, isAuthenticated, isLoading: authLoading, logout } = useAuth()

  // State: sheets list and task list
  const [sheets, setSheets] = useState<CommitteeSheet[]>([])
  const [loadingSheets, setLoadingSheets] = useState(false)
  const [tasks, setTasks] = useState<ScheduledTask[]>([])
  const [loadingTasks, setLoadingTasks] = useState(false)

  // Filters state
  const [selectedSheetId, setSelectedSheetId] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [affectationFilter, setAffectationFilter] = useState('all')
  const [rescheduledFilter, setRescheduledFilter] = useState(false)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Modals state
  const [selectedTask, setSelectedTask] = useState<ScheduledTask | null>(null)
  const [taskDetailOpen, setTaskDetailOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<ScheduledTask | null>(null)
  const [editScheduleOpen, setEditScheduleOpen] = useState(false)
  const [registerUserOpen, setRegisterUserOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)

  // Push notifications state
  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushProcessing, setPushProcessing] = useState(false)

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  // Load committee sheets dropdown
  const fetchSheets = useCallback(async () => {
    if (!isAuthenticated) return
    setLoadingSheets(true)
    try {
      const data = await api.get<CommitteeSheet[]>('/committee-sheets')
      setSheets(data || [])
    } catch (err: any) {
      console.warn('Error al cargar matrices de comité:', err)
    } finally {
      setLoadingSheets(false)
    }
  }, [isAuthenticated])

  // Load all tasks (scope=all) with multi-criteria filters
  const fetchTasks = useCallback(async () => {
    if (!isAuthenticated) return

    setLoadingTasks(true)
    try {
      const params = new URLSearchParams()
      params.append('scope', 'all')

      if (selectedSheetId && selectedSheetId !== 'all') {
        params.append('sheet_id', selectedSheetId)
      }
      if (statusFilter && statusFilter !== 'all') {
        params.append('status', statusFilter)
      }
      if (rescheduledFilter) {
        params.append('is_rescheduled', 'true')
      }
      if (affectationFilter && affectationFilter !== 'all') {
        params.append('has_affectation', affectationFilter)
      }
      if (debouncedSearch.trim()) {
        params.append('search', debouncedSearch.trim())
      }

      const queryString = params.toString()
      const endpoint = `/tasks${queryString ? `?${queryString}` : ''}`
      const data = await api.get<ScheduledTask[]>(endpoint)
      setTasks(data || [])
    } catch (err: any) {
      toast.error('Error al cargar historial de tareas', {
        description: err?.message || 'No se pudo conectar con el servidor API.',
      })
    } finally {
      setLoadingTasks(false)
    }
  }, [isAuthenticated, selectedSheetId, statusFilter, rescheduledFilter, affectationFilter, debouncedSearch])

  // Initial data loading
  useEffect(() => {
    if (isAuthenticated) {
      fetchSheets()
      fetchTasks()
    }
  }, [isAuthenticated, fetchSheets, fetchTasks])

  // Initialize Service Worker and push status
  useEffect(() => {
    let isMounted = true
    if (typeof window !== 'undefined') {
      setPushProcessing(true)
      registerServiceWorker()
        .then(() => checkPushSubscription())
        .then((active: boolean) => {
          if (isMounted) setPushEnabled(active)
        })
        .catch((err) => {
          console.warn('Push init error:', err)
          if (isMounted) setPushEnabled(false)
        })
        .finally(() => {
          if (isMounted) setPushProcessing(false)
        })
    }
    return () => {
      isMounted = false
    }
  }, [])

  // Toggle push
  async function handleTogglePush() {
    if (pushProcessing) return
    setPushProcessing(true)

    try {
      if (pushEnabled) {
        const unsubscribed = await unsubscribeFromPush()
        if (unsubscribed) {
          setPushEnabled(false)
          toast.info('Notificaciones push desactivadas.')
        } else {
          toast.error('No se pudo desactivar la suscripción push.')
        }
      } else {
        const ok = await subscribeToPush()
        if (ok) {
          setPushEnabled(true)
          toast.success('Notificaciones push activadas exitosamente')
        } else {
          setPushEnabled(false)
          toast.error('No se pudieron activar las notificaciones')
        }
      }
    } catch (err: any) {
      setPushEnabled(false)
      toast.error('No se pudieron activar las notificaciones', {
        description: err?.message || 'Error al suscribirse.',
      })
    } finally {
      setPushProcessing(false)
    }
  }

  // Clear all filters
  function handleClearFilters() {
    setSelectedSheetId('all')
    setStatusFilter('all')
    setAffectationFilter('all')
    setRescheduledFilter(false)
    setSearch('')
  }

  // Export filtered tasks as CSV
  function handleExportCsv() {
    if (!tasks || tasks.length === 0) {
      toast.error('No hay tareas para exportar con los filtros actuales.')
      return
    }

    const headers = [
      'N°',
      'Matriz / Comité',
      'Título del Trabajo',
      'Código CDC',
      'Fecha Inicio',
      'Fecha Fin',
      'Estado',
      'Afectación',
      'Detalle Afectación',
      'Justificación',
      'Aprobación VPTI',
      'Aprobación Gerentes',
      'Reprogramado',
    ]

    const escapeCsv = (str: string | null | undefined) => {
      if (str === null || str === undefined) return '""'
      const val = String(str).replace(/"/g, '""')
      return `"${val}"`
    }

    const rows = tasks.map((t, idx) => [
      idx + 1,
      escapeCsv(t.committee_name || t.sheet_filename || 'Manual'),
      escapeCsv(t.title),
      escapeCsv(t.cdc_number || 'N/A'),
      escapeCsv(formatDateTime(t.start_datetime)),
      escapeCsv(formatDateTime(t.end_datetime)),
      escapeCsv(t.execution_status),
      escapeCsv(t.has_affectation),
      escapeCsv(t.affectation_details || ''),
      escapeCsv(t.justification || ''),
      escapeCsv(t.vpti_committee_approval || ''),
      escapeCsv(t.managers_approval || ''),
      escapeCsv(t.is_rescheduled ? 'SI' : 'NO'),
    ])

    const csvContent =
      '\uFEFF' +
      [headers.join(','), ...rows.map((row) => row.join(','))].join('\r\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const ts = new Date().toISOString().slice(0, 10)
    link.href = url
    link.setAttribute('download', `Historico_Trabajos_VPTI_${ts}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    toast.success('Archivo CSV exportado exitosamente', {
      description: `${tasks.length} registros exportados para auditoría.`,
    })
  }

  // Summary statistics for auditing
  const stats = useMemo(() => {
    const total = tasks.length
    const withAffectation = tasks.filter((t) => t.has_affectation === 'SI').length
    const rescheduled = tasks.filter((t) => t.is_rescheduled).length
    const totalSheets = sheets.length

    return { total, withAffectation, rescheduled, totalSheets }
  }, [tasks, sheets])

  const initials = useMemo(() => {
    if (!user?.full_name) return 'VT'
    return user.full_name
      .split(' ')
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase()
  }, [user])

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8f9fa]">
        <Loader2 className="size-8 animate-spin text-[#0d6efd]" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <LoginView />
  }

  return (
    <main className="min-h-screen bg-[#f8f9fa] dark:bg-zinc-950 text-[#212529] dark:text-zinc-100">
      {/* Top Navigation Bar */}
      <header className="border-b border-[#dee2e6] dark:border-zinc-800 bg-white dark:bg-zinc-900 sticky top-0 z-30 shadow-xs">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-4 py-3.5 lg:px-8">
          <div className="flex min-w-0 items-center gap-3 sm:gap-6">
            <Link href="/" className="flex min-w-0 items-center gap-3 hover:opacity-95 transition-opacity">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#0d6efd] text-white shadow-xs">
                <ClipboardList className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-base font-bold tracking-tight text-slate-900 dark:text-white">VPTI Task Monitor</p>
                <p className="hidden text-xs text-slate-500 dark:text-slate-400 sm:block">
                  Comité técnico de infraestructura y telecomunicaciones
                </p>
              </div>
            </Link>

            {/* View Navigation Links */}
            <nav className="flex items-center gap-1.5 border-l border-slate-200 dark:border-zinc-800 pl-3 sm:pl-5">
              <Link
                href="/"
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-zinc-800 transition-colors"
              >
                Semana activa
              </Link>
              <Link
                href="/history"
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 shadow-xs"
              >
                Histórico general
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-2">
            {/* Push Notifications Toggle */}
            <Button
              variant="outline"
              disabled={pushProcessing}
              className={`hidden sm:flex ${
                pushEnabled
                  ? 'border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-700 border border-slate-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-slate-200 dark:border-zinc-700'
              } font-medium text-xs px-3 py-2 rounded-lg inline-flex items-center gap-2 transition-colors shadow-none`}
              onClick={handleTogglePush}
            >
              {pushProcessing ? (
                <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
              ) : pushEnabled ? (
                <BellRing className="size-4 text-emerald-600 dark:text-emerald-400" data-icon="inline-start" />
              ) : (
                <Bell className="size-4" data-icon="inline-start" />
              )}
              {pushEnabled ? 'Notificaciones activas' : 'Activar notificaciones'}
            </Button>

            {/* Register User Button */}
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs px-3.5 py-2 rounded-lg shadow-sm transition-all inline-flex items-center gap-2"
              onClick={() => setRegisterUserOpen(true)}
            >
              <UserPlus className="size-4" data-icon="inline-start" />
              <span className="hidden sm:inline">Registrar usuario</span>
            </Button>

            {/* User Profile Dropdown */}
            <div className="relative">
              <Button
                variant="ghost"
                className="flex h-auto items-center gap-2 rounded-full px-1.5 py-1 hover:bg-slate-100 dark:hover:bg-zinc-800"
                aria-expanded={profileOpen}
                onClick={() => setProfileOpen((prev) => !prev)}
              >
                <Avatar className="size-9 border border-[#dee2e6] dark:border-zinc-700">
                  <AvatarFallback className="bg-blue-50 dark:bg-blue-950/60 text-xs font-bold text-[#0d6efd] dark:text-blue-400">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden text-left lg:block">
                  <span className="block text-xs font-semibold text-slate-900 dark:text-white">{user?.full_name}</span>
                  <span className="block text-[10px] text-slate-500 dark:text-slate-400">@{user?.username}</span>
                </span>
                <ChevronDown className="hidden size-4 text-slate-400 sm:block" />
              </Button>

              {profileOpen && (
                <div className="absolute right-0 top-12 z-40 w-60 rounded-xl border border-[#dee2e6] dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 shadow-xl">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{user?.full_name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{user?.email}</p>
                  <p className="mt-1 text-[11px] font-mono text-slate-400 dark:text-slate-500">Usuario: {user?.username}</p>
                  <Separator className="my-2.5 dark:border-zinc-800" />
                  <Button
                    variant="ghost"
                    className="w-full justify-start text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-700 dark:hover:text-red-300"
                    onClick={() => {
                      setProfileOpen(false)
                      logout()
                    }}
                  >
                    <LogOut className="size-3.5 mr-2" />
                    Cerrar sesión
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="mx-auto max-w-[1600px] px-4 py-6 lg:px-8">
        {/* Page Header */}
        <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#0d6efd] dark:text-blue-400">
              <History className="size-4" />
              Auditoría y Archivo General
            </div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl text-slate-900 dark:text-white">
              Histórico general de tareas y matrices
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Consulta el registro acumulado de todas las matrices de comité procesadas, analiza trazabilidad de CDC y exporta datos.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 shadow-sm transition-colors text-xs font-medium px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5"
              onClick={() => {
                fetchSheets()
                fetchTasks()
              }}
              disabled={loadingTasks || loadingSheets}
            >
              <RefreshCw
                className={`size-3.5 mr-1.5 ${loadingTasks || loadingSheets ? 'animate-spin' : ''}`}
              />
              Actualizar
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="bg-white hover:bg-emerald-50 text-emerald-700 hover:text-emerald-800 border border-emerald-300 hover:border-emerald-400 shadow-sm transition-colors text-xs font-medium px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5"
              onClick={handleExportCsv}
              disabled={tasks.length === 0}
            >
              <Download className="size-3.5 mr-1 text-emerald-600" />
              Exportar CSV ({tasks.length})
            </Button>
          </div>
        </div>

        {/* Audit Statistics Cards */}
        <section className="mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="overflow-hidden border-[#dee2e6] dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs">
            <CardContent className="flex items-start justify-between gap-3 p-4 sm:p-5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-slate-500 dark:text-slate-300">Total tareas filtradas</p>
                <p className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                  {String(stats.total).padStart(2, '0')}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-300 break-words leading-relaxed">
                  Registros en la vista actual
                </p>
              </div>
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/60 text-[#0d6efd] dark:text-blue-400">
                <Layers className="size-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-[#dee2e6] dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs">
            <CardContent className="flex items-start justify-between gap-3 p-4 sm:p-5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-slate-500 dark:text-slate-300">Matrices procesadas</p>
                <p className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                  {String(stats.totalSheets).padStart(2, '0')}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-300 break-words leading-relaxed">
                  Hojas semanales en histórico
                </p>
              </div>
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-400">
                <FileSpreadsheet className="size-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-[#dee2e6] dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs">
            <CardContent className="flex items-start justify-between gap-3 p-4 sm:p-5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-slate-500 dark:text-slate-300">Con afectación de servicio</p>
                <p className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                  {String(stats.withAffectation).padStart(2, '0')}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-300 break-words leading-relaxed">
                  Impacto operativo confirmado
                </p>
              </div>
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400">
                <CircleAlert className="size-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-[#dee2e6] dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs">
            <CardContent className="flex items-start justify-between gap-3 p-4 sm:p-5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-slate-500 dark:text-slate-300">Tareas reprogramadas</p>
                <p className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                  {String(stats.rescheduled).padStart(2, '0')}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-300 break-words leading-relaxed">
                  CDC recurrentes / postergadas
                </p>
              </div>
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-400">
                <Clock3 className="size-5" />
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Enhanced Filter Panel */}
        <Card className="mb-6 border-[#dee2e6] dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs">
          <CardContent className="p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-zinc-800 pb-3">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                <Filter className="size-4 text-[#0d6efd]" />
                Filtros avanzados de auditoría
              </div>
              {(selectedSheetId !== 'all' ||
                statusFilter !== 'all' ||
                affectationFilter !== 'all' ||
                rescheduledFilter ||
                search) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearFilters}
                  className="h-7 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white px-2 rounded-lg"
                >
                  <X className="size-3.5 mr-1" />
                  Limpiar filtros
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {/* Filter 1: Committee Sheet Selector */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Matriz / Hoja de Comité
                </Label>
                <Select
                  value={selectedSheetId}
                  onValueChange={(val) => setSelectedSheetId(val || 'all')}
                  disabled={loadingSheets}
                >
                  <SelectTrigger className="w-full bg-white dark:bg-zinc-800 border-slate-300 dark:border-zinc-700 text-xs rounded-xl shadow-xs">
                    <SelectValue placeholder="Todas las matrices" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="all">Todas las matrices ({sheets.length})</SelectItem>
                    {sheets.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        <div className="flex items-center gap-2">
                          <span>{s.committee_name || s.filename}</span>
                          <span className="text-[11px] text-slate-400">
                            ({formatDateOnly(s.uploaded_at)})
                          </span>
                          {s.is_latest && (
                            <span className="rounded bg-blue-100 dark:bg-blue-950 px-1.5 py-0.2 text-[10px] font-bold text-blue-700 dark:text-blue-300">
                              Activa
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Filter 2: Execution Status */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Estado de Ejecución
                </Label>
                <Select
                  value={statusFilter}
                  onValueChange={(val) => setStatusFilter(val || 'all')}
                >
                  <SelectTrigger className="w-full bg-white dark:bg-zinc-800 border-slate-300 dark:border-zinc-700 text-xs rounded-xl shadow-xs">
                    <SelectValue placeholder="Todos los estados" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los estados</SelectItem>
                    <SelectItem value="PROGRAMADO">PROGRAMADO</SelectItem>
                    <SelectItem value="PROXIMO">PROXIMO (ALERTAS / PREAVISO)</SelectItem>
                    <SelectItem value="EN EJECUCION">EN EJECUCION</SelectItem>
                    <SelectItem value="TERMINADO">TERMINADO</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Filter 3: Affectation */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Afectación de Servicio
                </Label>
                <Select
                  value={affectationFilter}
                  onValueChange={(val) => setAffectationFilter(val || 'all')}
                >
                  <SelectTrigger className="w-full bg-white dark:bg-zinc-800 border-slate-300 dark:border-zinc-700 text-xs rounded-xl shadow-xs">
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="SI">Con afectación (SI)</SelectItem>
                    <SelectItem value="NO">Sin afectación (NO)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Filter 4: Text Search */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Buscar por Título o CDC
                </Label>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 size-4 text-slate-400" />
                  <Input
                    placeholder="Ej. Switch, 39000925..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 bg-white dark:bg-zinc-800 border-slate-300 dark:border-zinc-700 text-xs rounded-xl shadow-xs"
                  />
                  {search && (
                    <button
                      onClick={() => setSearch('')}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      <X className="size-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Filter 5: Rescheduled Switch Toggle */}
            <div className="mt-4 flex items-center justify-between pt-3 border-t border-slate-100 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <Switch
                  id="rescheduled-toggle"
                  checked={rescheduledFilter}
                  onCheckedChange={setRescheduledFilter}
                />
                <Label
                  htmlFor="rescheduled-toggle"
                  className="cursor-pointer text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Filtrar únicamente tareas reprogramadas (CDC con duplicidad histórica)
                </Label>
              </div>

              <div className="text-xs text-slate-500 dark:text-slate-400">
                Mostrando <span className="font-bold text-slate-800 dark:text-white">{tasks.length}</span> tareas encontradas
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tasks Table */}
        <Card className="border-[#dee2e6] dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs overflow-hidden">
          <div className="hidden overflow-x-auto custom-scrollbar md:block">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-[#dee2e6] dark:border-zinc-800 bg-slate-50/75 dark:bg-zinc-800/40">
                  <TableHead className="w-14 text-center font-bold text-slate-700 dark:text-slate-300">N°</TableHead>
                  <TableHead className="w-44 font-bold text-slate-700 dark:text-slate-300">Matriz de Comité</TableHead>
                  <TableHead className="min-w-[280px] font-bold text-slate-700 dark:text-slate-300">Título del Trabajo</TableHead>
                  <TableHead className="w-32 font-bold text-slate-700 dark:text-slate-300">Código CDC</TableHead>
                  <TableHead className="min-w-[190px] font-bold text-slate-700 dark:text-slate-300">Ventana Operativa</TableHead>
                  <TableHead className="w-48 text-center font-bold text-slate-700 dark:text-slate-300">Estado</TableHead>
                  <TableHead className="w-24 text-center font-bold text-slate-700 dark:text-slate-300">Afectación</TableHead>
                  <TableHead className="w-24 text-right font-bold text-slate-700 dark:text-slate-300">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingTasks ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-40 text-center">
                      <div className="flex flex-col items-center justify-center gap-2 text-slate-500">
                        <Loader2 className="size-6 animate-spin text-[#0d6efd]" />
                        <span className="text-xs">Cargando tareas históricas...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : tasks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-40 text-center">
                      <div className="flex flex-col items-center justify-center gap-2 text-slate-500 dark:text-slate-400">
                        <Archive className="size-8 text-slate-300 dark:text-slate-600" />
                        <p className="text-sm font-semibold">No se encontraron tareas en el histórico</p>
                        <p className="text-xs">
                          {selectedSheetId !== 'all' || statusFilter !== 'all' || affectationFilter !== 'all' || search
                            ? 'Intenta relajar los filtros aplicados arriba.'
                            : 'Aún no se han importado hojas de comité o tareas en el sistema.'}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  tasks.map((task, idx) => (
                    <TableRow
                      key={task.id}
                      className="border-b border-[#f1f3f5] dark:border-zinc-800/60 hover:bg-slate-50/60 dark:hover:bg-zinc-800/30 transition-colors"
                    >
                      <TableCell className="text-center text-xs font-mono font-medium text-slate-500 dark:text-slate-400">
                        {idx + 1}
                      </TableCell>
                      <TableCell className="text-xs">
                        <span className="block truncate font-medium text-slate-800 dark:text-slate-200" title={task.committee_name || task.sheet_filename || 'Manual'}>
                          {task.committee_name || task.sheet_filename || 'Manual'}
                        </span>
                        {task.sheet_uploaded_at && (
                          <span className="block text-[11px] text-slate-400 dark:text-slate-500">
                            {formatDateOnly(task.sheet_uploaded_at)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 line-clamp-2">
                            {task.title}
                          </span>
                          {task.is_rescheduled && (
                            <span className="inline-flex w-fit items-center rounded-sm bg-purple-100 dark:bg-purple-950/60 px-1.5 py-0.5 text-[10px] font-bold text-purple-700 dark:text-purple-300">
                              REPROGRAMADA
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs font-mono text-slate-700 dark:text-slate-300">
                        {task.cdc_number || <span className="text-slate-400">S/C</span>}
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="flex flex-col gap-0.5 text-slate-700 dark:text-slate-300 font-mono text-[11px]">
                          <div><span className="font-semibold text-slate-500">I:</span> {formatDateTime(task.start_datetime)}</div>
                          <div><span className="font-semibold text-slate-500">F:</span> {formatDateTime(task.end_datetime)}</div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant="outline"
                          className={`text-[11px] px-2 py-0.5 rounded-md font-semibold justify-center ${
                            getStatusBadgeProps(task.execution_status).className
                          }`}
                        >
                          {getStatusBadgeProps(task.execution_status).label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {task.has_affectation === 'SI' ? (
                          <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-300 text-[10px] font-bold">
                            SI
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-slate-400 text-[10px]">
                            NO
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 hover:border-blue-300 text-xs font-medium px-2.5 py-1 rounded-md transition-all shadow-none"
                          onClick={() => {
                            setSelectedTask(task)
                            setTaskDetailOpen(true)
                          }}
                        >
                          Ver detalle
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Mobile view card list */}
          <div className="divide-y divide-slate-100 dark:divide-zinc-800 md:hidden">
            {loadingTasks ? (
              <div className="flex h-36 items-center justify-center">
                <Loader2 className="size-6 animate-spin text-[#0d6efd]" />
              </div>
            ) : tasks.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                No se encontraron tareas históricas.
              </div>
            ) : (
              tasks.map((task) => (
                <div key={task.id} className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-bold text-slate-900 dark:text-white line-clamp-2">
                      {task.title}
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] shrink-0 ${statusStyles[task.execution_status] || ''}`}
                    >
                      {task.execution_status}
                    </Badge>
                  </div>
                  <div className="text-[11px] text-slate-500 flex flex-wrap gap-x-3 gap-y-1">
                    <span>CDC: <span className="font-mono text-slate-700 dark:text-slate-300">{task.cdc_number || 'N/A'}</span></span>
                    <span>Afectación: <strong className={task.has_affectation === 'SI' ? 'text-red-600' : 'text-slate-700'}>{task.has_affectation}</strong></span>
                    <span>Matriz: <strong className="text-slate-700 dark:text-slate-300">{task.committee_name || 'Manual'}</strong></span>
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <div className="text-[10px] text-slate-400">
                      Inicio: {formatDateTime(task.start_datetime)}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-slate-100 text-slate-700 border-slate-200 text-xs px-2 py-0.5 rounded-md"
                      onClick={() => {
                        setSelectedTask(task)
                        setTaskDetailOpen(true)
                      }}
                    >
                      Ver detalle
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* Task Detail and Schedule Edit Modals */}
      <TaskDetailDialog
        task={selectedTask}
        open={taskDetailOpen}
        onOpenChange={setTaskDetailOpen}
        onOpenEditSchedule={(t) => {
          setEditingTask(t)
          setEditScheduleOpen(true)
        }}
        formatDateTime={formatDateTime}
        statusStyles={statusStyles}
      />

      <EditScheduleDialog
        task={editingTask}
        open={editScheduleOpen}
        onOpenChange={setEditScheduleOpen}
        onSuccess={(updatedTask) => {
          setSelectedTask(updatedTask)
          fetchTasks()
        }}
      />

      <RegisterUserDialog
        open={registerUserOpen}
        onOpenChange={setRegisterUserOpen}
      />
    </main>
  )
}

