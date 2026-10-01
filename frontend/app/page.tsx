'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Bell,
  BellRing,
  CalendarDays,
  Check,
  ChevronDown,
  CircleAlert,
  ClipboardList,
  Clock3,
  CloudUpload,
  Filter,
  LayoutDashboard,
  Loader2,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  Upload,
  UserPlus,
  Send,
} from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { UploadSheetDialog } from '@/components/upload-sheet-dialog'
import { EditScheduleDialog } from '@/components/edit-schedule-dialog'
import { RegisterUserDialog } from '@/components/register-user-dialog'
import { NewTaskDialog } from '@/components/new-task-dialog'
import { TaskDetailDialog } from '@/components/task-detail-dialog'
import { toast } from 'sonner'

export { LoginView }

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

export default function DashboardPage() {
  const router = useRouter()
  const { user, isAuthenticated, isLoading: authLoading, logout } = useAuth()

  // Active committee sheet & tasks state
  const [activeSheet, setActiveSheet] = useState<CommitteeSheet | null>(null)
  const [tasks, setTasks] = useState<ScheduledTask[]>([])
  const [loadingTasks, setLoadingTasks] = useState(false)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [rescheduledFilter, setRescheduledFilter] = useState(false)
  const [affectationFilter, setAffectationFilter] = useState('all')

  // Modals state
  const [selectedTask, setSelectedTask] = useState<ScheduledTask | null>(null)
  const [taskDetailOpen, setTaskDetailOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<ScheduledTask | null>(null)
  const [editScheduleOpen, setEditScheduleOpen] = useState(false)
  const [uploadSheetOpen, setUploadSheetOpen] = useState(false)
  const [registerUserOpen, setRegisterUserOpen] = useState(false)
  const [manualTaskOpen, setManualTaskOpen] = useState(false)
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

  // Fetch tasks from Flask API (scope=latest for active sheet)
  const fetchTasks = useCallback(async () => {
    if (!isAuthenticated) return

    setLoadingTasks(true)
    try {
      const params = new URLSearchParams()
      params.append('scope', 'latest')
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
      const [tasksRes, sheetRes] = await Promise.allSettled([
        api.get<ScheduledTask[]>(endpoint),
        api.get<CommitteeSheet | null>('/committee-sheets/latest'),
      ])

      if (tasksRes.status === 'fulfilled') {
        setTasks(tasksRes.value || [])
      } else {
        throw tasksRes.reason
      }

      if (sheetRes.status === 'fulfilled') {
        setActiveSheet(sheetRes.value)
      }
    } catch (err: any) {
      toast.error('Error al cargar tareas', {
        description: err?.message || 'No se pudo conectar con el servidor API.',
      })
    } finally {
      setLoadingTasks(false)
    }
  }, [isAuthenticated, statusFilter, rescheduledFilter, affectationFilter, debouncedSearch])

  // Initial tasks fetch and PWA SW registration
  useEffect(() => {
    if (isAuthenticated) {
      fetchTasks()
    }
  }, [isAuthenticated, fetchTasks])

  // Initialize Service Worker and check push subscription
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

  // Toggle Push Notifications
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
          toast.success('Notificaciones push activadas exitosamente', {
            description: 'Recibirás avisos 1 hora antes de cada ventana de trabajo programada.',
          })
        } else {
          setPushEnabled(false)
          toast.error('No se pudieron activar las notificaciones', {
            description: 'El servidor no pudo registrar la suscripción push.',
          })
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

  // Send a test notification
  async function handleSendTestPush() {
    try {
      await api.post('/push/test', {
        title: 'ALERTA DE TRABAJO VPTI',
        body: 'Prueba de notificación push operacional: el servicio está listo.',
      })
      toast.success('Notificación de prueba enviada al dispositivo.')
    } catch (err: any) {
      toast.error('Error al enviar notificación de prueba', {
        description: err?.message || 'Verifique que la suscripción esté activa.',
      })
    }
  }

  // Open detail modal
  function handleSelectTask(task: ScheduledTask) {
    setSelectedTask(task)
    setTaskDetailOpen(true)
  }

  // Open edit schedule modal
  function handleOpenEditSchedule(task: ScheduledTask) {
    setEditingTask(task)
    setEditScheduleOpen(true)
  }

  // Stats computed from current task list
  const stats = useMemo(() => {
    const total = tasks.length
    const alerts = tasks.filter(
      (t) => t.execution_status && t.execution_status.toUpperCase().startsWith('PROXIMO')
    ).length
    const running = tasks.filter(
      (t) => t.execution_status && t.execution_status.toUpperCase() === 'EN EJECUCION'
    ).length
    const completed = tasks.filter(
      (t) => t.execution_status && t.execution_status.toUpperCase() === 'TERMINADO'
    ).length

    return { total, alerts, running, completed }
  }, [tasks])

  // Dynamic Card Header Label:
  // If a dynamic task exists with t.execution_status.includes('MINUTOS'), extract the label or title it dynamically
  const upcomingAlertLabel = useMemo(() => {
    const minTask = tasks.find(
      (t) => t.execution_status && t.execution_status.toUpperCase().includes('MINUTOS')
    )
    if (minTask?.execution_status) {
      const match = minTask.execution_status.match(/\((.*?)\)/)
      if (match && match[1]) {
        return `Próximas alertas (${match[1].toLowerCase()})`
      }
    }
    const anyUpcoming = tasks.find(
      (t) => t.execution_status && t.execution_status.toUpperCase().startsWith('PROXIMO')
    )
    if (anyUpcoming?.execution_status) {
      const match = anyUpcoming.execution_status.match(/\((.*?)\)/)
      if (match && match[1]) {
        return `Próximas alertas (${match[1].toLowerCase()})`
      }
    }
    return 'Próximas alertas'
  }, [tasks])

  // Get user initials
  const initials = useMemo(() => {
    if (!user?.full_name) return 'VT'
    return user.full_name
      .split(' ')
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase()
  }, [user])

  // Loading auth state
  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8f9fa]">
        <Loader2 className="size-8 animate-spin text-[#0d6efd]" />
      </div>
    )
  }

  // Protect route
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
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 shadow-xs"
              >
                Semana activa
              </Link>
              <Link
                href="/history"
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-zinc-800 transition-colors"
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

            <Button
              variant="outline"
              size="icon"
              disabled={pushProcessing}
              className={`sm:hidden rounded-lg ${
                pushEnabled
                  ? 'border border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 dark:bg-zinc-800 dark:text-slate-200 dark:border-zinc-700'
              }`}
              aria-label="Activar notificaciones"
              onClick={handleTogglePush}
            >
              {pushEnabled ? (
                <BellRing className="size-4 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <Bell className="size-4 text-slate-600 dark:text-slate-400" />
              )}
            </Button>

            {/* Test Push button (visible if push is enabled) */}
            {pushEnabled && (
              <Button
                variant="ghost"
                size="sm"
                className="hidden text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-800 md:flex"
                onClick={handleSendTestPush}
                title="Enviar notificación de prueba"
              >
                <Send className="size-3.5 mr-1" />
                Probar push
              </Button>
            )}

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
              <LayoutDashboard className="size-4" />
              Panel operativo en tiempo real
            </div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl text-slate-900 dark:text-white">
              Programación semanal de trabajos
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Supervisa ventanas de mantenimiento VPTI, analiza afectaciones y sincroniza alertas de preaviso de 1 hora.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
            {/* Header badge indicating active week */}
            <div className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-1.5 text-xs font-semibold text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/50 dark:text-blue-300 shadow-xs">
              <CalendarDays className="size-4 text-blue-600 dark:text-blue-400" />
              <span>
                Semana activa:{' '}
                <span className="font-bold underline decoration-blue-300">
                  {activeSheet?.filename
                    ? activeSheet.filename
                    : activeSheet?.committee_name
                      ? activeSheet.committee_name
                      : 'Sin matriz cargada'}
                </span>
              </span>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 shadow-sm transition-colors text-xs font-medium px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5"
              onClick={() => fetchTasks()}
              disabled={loadingTasks}
            >
              <RefreshCw
                className={`size-3.5 mr-1.5 ${loadingTasks ? 'animate-spin' : ''}`}
              />
              Actualizar
            </Button>
          </div>
        </div>

        {/* Statistics Cards */}
        <section className="mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={<ClipboardList className="size-5" />}
            label="Total tareas activas"
            value={String(stats.total).padStart(2, '0')}
            detail="Matriz de la semana activa"
            tone="blue"
          />
          <StatCard
            icon={<CircleAlert className="size-5" />}
            label={upcomingAlertLabel}
            value={String(stats.alerts).padStart(2, '0')}
            detail="Preaviso Web Push programado"
            tone="amber"
          />
          <StatCard
            icon={<Clock3 className="size-5" />}
            label="En ejecución ahora"
            value={String(stats.running).padStart(2, '0')}
            detail="Ventana técnica activa"
            tone="red"
          />
          <StatCard
            icon={<Check className="size-5" />}
            label="Completadas / Terminadas"
            value={String(stats.completed).padStart(2, '0')}
            detail="Ventana de tiempo finalizada"
            tone="green"
          />
        </section>

        {/* Action Banner for Excel Ingestion & Manual Task */}
        <Card className="mb-6 border-[#dee2e6] dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs overflow-hidden">
          <CardContent className="p-4 sm:p-5">
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
              <div className="flex items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                  <CloudUpload className="size-5" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">Carga de matriz semanal del comité</p>
                  <p className="text-xs text-slate-500 dark:text-slate-300">
                    Importa hojas Excel (.xlsx, .xls) con detección automática de reprogramaciones por CDC.
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  variant="outline"
                  className="bg-white hover:bg-blue-50 text-blue-700 hover:text-blue-700 border border-blue-300 hover:border-blue-400 shadow-sm font-semibold px-4 py-2 rounded-xl transition-all inline-flex items-center gap-2"
                  onClick={() => setUploadSheetOpen(true)}
                >
                  <Upload className="size-4" data-icon="inline-start" />
                  Subir hoja semanal
                </Button>
                <Button
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-xl shadow-sm transition-all inline-flex items-center gap-2"
                  onClick={() => setManualOpenSafe()}
                >
                  <Plus className="size-4" data-icon="inline-start" />
                  Nueva tarea manual
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tasks Table Card */}
        <Card className="border-[#dee2e6] dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs overflow-hidden">
          <CardHeader className="border-b border-[#dee2e6] dark:border-zinc-800 pb-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <CardTitle className="text-base font-bold text-slate-900 dark:text-white">Tareas programadas</CardTitle>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">
                  {tasks.length} registros encontrados
                  {loadingTasks && ' (actualizando...)'}
                </p>
              </div>

              {/* Search Bar */}
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 size-4 text-slate-400" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar por título o CDC..."
                    className="w-full pl-9 sm:w-72 h-9 text-xs border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
                  />
                </div>
              </div>
            </div>

            {/* Filter Controls */}
            <div className="grid gap-3 pt-4 sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <Label className="mb-1.5 block text-xs text-slate-500 dark:text-slate-300">Filtrar por Estado</Label>
                <Select value={statusFilter} onValueChange={(val) => setStatusFilter(val || 'all')}>
                  <SelectTrigger className="h-9 text-xs border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100">
                    <SelectValue />
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

              <div>
                <Label className="mb-1.5 block text-xs text-slate-500 dark:text-slate-300">Filtrar por Afectación</Label>
                <Select value={affectationFilter} onValueChange={(val) => setAffectationFilter(val || 'all')}>
                  <SelectTrigger className="h-9 text-xs border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las afectaciones</SelectItem>
                    <SelectItem value="SI">SI - Con afectación</SelectItem>
                    <SelectItem value="NO">NO - Sin afectación</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-end">
                <div className="flex h-9 w-full items-center justify-between rounded-md border border-[#dee2e6] dark:border-zinc-700 px-3 bg-white dark:bg-zinc-800 text-slate-700 dark:text-slate-200">
                  <Label htmlFor="rescheduled-toggle" className="text-xs font-medium cursor-pointer">
                    Solo reprogramaciones
                  </Label>
                  <Switch
                    id="rescheduled-toggle"
                    checked={rescheduledFilter}
                    onCheckedChange={setRescheduledFilter}
                  />
                </div>
              </div>

              <div className="flex items-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9 w-full text-xs text-slate-600 dark:text-slate-300 border border-dashed border-slate-300 dark:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-800"
                  onClick={() => {
                    setStatusFilter('all')
                    setAffectationFilter('all')
                    setRescheduledFilter(false)
                    setSearch('')
                  }}
                >
                  Restablecer filtros
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {loadingTasks ? (
              <div className="flex flex-col items-center justify-center p-12 text-slate-400 dark:text-slate-500">
                <Loader2 className="size-8 animate-spin text-[#0d6efd] dark:text-blue-400 mb-2" />
                <p className="text-xs">Cargando tareas del servidor...</p>
              </div>
            ) : tasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-center text-slate-400 dark:text-slate-500">
                <ClipboardList className="size-10 mb-2 stroke-1 text-slate-300 dark:text-slate-600" />
                <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">No se encontraron tareas</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-sm">
                  No hay trabajos que coincidan con los filtros aplicados o aún no se ha subido una matriz semanal.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-white hover:bg-blue-50 text-blue-700 border border-blue-300 hover:border-blue-400 shadow-sm font-semibold px-4 py-2 rounded-xl transition-all inline-flex items-center gap-2 mt-4"
                  onClick={() => setUploadSheetOpen(true)}
                >
                  <Upload className="size-3.5 mr-1" />
                  Subir hoja semanal Excel
                </Button>
              </div>
            ) : (
              <>
                {/* Desktop Table View */}
                <div className="hidden overflow-x-auto custom-scrollbar md:block">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-slate-50 dark:bg-zinc-800/80">
                      <TableRow className="border-slate-200 dark:border-zinc-800">
                        <TableHead className="w-12 pl-6 text-slate-700 dark:text-slate-300 font-semibold">N°</TableHead>
                        <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Tarea / CDC</TableHead>
                        <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Inicio</TableHead>
                        <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Fin</TableHead>
                        <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Afectación</TableHead>
                        <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Aprobaciones</TableHead>
                        <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Estado</TableHead>
                        <TableHead className="pr-6 text-right text-slate-700 dark:text-slate-300 font-semibold">Acción</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tasks.map((task) => (
                        <TableRow
                          key={task.id}
                          className="cursor-pointer border-slate-200 dark:border-zinc-800 hover:bg-blue-50/40 dark:hover:bg-zinc-800/60 transition-colors"
                          onClick={() => handleSelectTask(task)}
                        >
                          <TableCell className="pl-6 font-mono text-xs text-slate-500 dark:text-slate-400">
                            {task.sheet_item_order || task.id}
                          </TableCell>
                          <TableCell className="min-w-[260px]">
                            <div className="flex items-start gap-2">
                              <div>
                                <p className="font-medium text-slate-900 dark:text-slate-100 leading-snug">
                                  {task.title}
                                </p>
                                <p className="mt-1 font-mono text-xs text-slate-500 dark:text-slate-400">
                                  CDC {task.cdc_number || 'S/N'}
                                </p>
                              </div>
                              {task.is_rescheduled && (
                                <Badge className="shrink-0 border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/50 text-[10px] text-amber-700 dark:text-amber-300">
                                  REPROGRAMACIÓN
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs">
                            <span
                              className={
                                task.execution_status && task.execution_status.toUpperCase().startsWith('PROXIMO')
                                  ? 'inline-flex items-center gap-1.5 rounded-full bg-amber-100 dark:bg-amber-950/60 px-2 py-0.5 font-semibold text-amber-800 dark:text-amber-300'
                                  : 'text-slate-700 dark:text-slate-200'
                              }
                            >
                              {task.execution_status && task.execution_status.toUpperCase().startsWith('PROXIMO') && (
                                <span className="size-1.5 animate-pulse rounded-full bg-amber-600 dark:bg-amber-400" />
                              )}
                              {formatDateTime(task.start_datetime)}
                            </span>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs text-slate-600 dark:text-slate-300">
                            {formatDateTime(task.end_datetime)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={
                                task.has_affectation === 'SI'
                                  ? 'border-red-200 dark:border-red-800/60 bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300'
                                  : 'border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                              }
                            >
                              {task.has_affectation === 'SI' ? 'SI' : 'NO'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col items-start gap-0.5 text-[10px]">
                              <span className="text-slate-600 dark:text-slate-400">
                                Comité: <strong className="text-slate-800 dark:text-slate-200">{task.vpti_committee_approval || 'S/D'}</strong>
                              </span>
                              <span className="text-slate-600 dark:text-slate-400">
                                Gerencia: <strong className="text-slate-800 dark:text-slate-200">{task.managers_approval || 'S/D'}</strong>
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={getStatusBadgeProps(task.execution_status).className}
                            >
                              {getStatusBadgeProps(task.execution_status).label}
                            </Badge>
                          </TableCell>
                          <TableCell className="pr-6 text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              className="bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 hover:border-blue-300 text-xs font-medium px-2.5 py-1 rounded-md transition-all shadow-none"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleSelectTask(task)
                              }}
                            >
                              Ver detalle
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile Cards View */}
                <div className="grid gap-3 p-4 md:hidden">
                  {tasks.map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      className="rounded-lg border border-[#dee2e6] dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 text-left shadow-xs hover:border-[#0d6efd] dark:hover:border-blue-500 transition-colors"
                      onClick={() => handleSelectTask(task)}
                    >
                      <div className="mb-2.5 flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-slate-100 text-sm leading-tight">
                            {task.title}
                          </p>
                          <div className="mt-1 flex items-center gap-2">
                            <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                              CDC {task.cdc_number || 'S/N'}
                            </span>
                            {task.is_rescheduled && (
                              <Badge className="border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/50 text-[9px] text-amber-700 dark:text-amber-300 px-1 py-0">
                                REPROGRAMADA
                              </Badge>
                            )}
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className={`shrink-0 text-[10px] ${
                            getStatusBadgeProps(task.execution_status).className
                          }`}
                        >
                          {getStatusBadgeProps(task.execution_status).label}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-100 dark:border-zinc-800">
                        <div>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400">Inicio programado</p>
                          <p className="font-medium text-slate-800 dark:text-slate-200">
                            {formatDateTime(task.start_datetime)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400">Afectación de servicio</p>
                          <p
                            className={
                              task.has_affectation === 'SI'
                                ? 'font-semibold text-red-700 dark:text-red-400'
                                : 'font-medium text-emerald-700 dark:text-emerald-400'
                            }
                          >
                            {task.has_affectation === 'SI' ? 'SI · Con afectación' : 'NO · Sin afectación'}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Floating Push Notifications Widget (Bottom Right) */}
      <div className="fixed bottom-4 right-4 hidden max-w-sm items-center gap-3 rounded-xl border border-[#dee2e6] dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3.5 shadow-lg sm:flex z-20">
        <div
          className={`flex size-9 items-center justify-center rounded-full ${
            pushEnabled
              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
              : 'bg-blue-50 dark:bg-blue-950/60 text-[#0d6efd] dark:text-blue-400'
          }`}
        >
          {pushEnabled ? <BellRing className="size-4" /> : <Bell className="size-4" />}
        </div>
        <div className="flex-1 pr-2">
          <p className="text-xs font-semibold text-slate-900 dark:text-white">
            {pushEnabled ? 'Alertas push activadas' : 'Alertas operativas VPTI'}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-300 leading-tight">
            {pushEnabled
              ? 'Te avisaremos 1 hora antes de cada inicio de trabajo.'
              : 'Activa Web Push para recibir alertas en este equipo.'}
          </p>
        </div>
        <Switch
          checked={pushEnabled}
          disabled={pushProcessing}
          onCheckedChange={handleTogglePush}
        />
      </div>

      {/* Modals */}
      <TaskDetailDialog
        task={selectedTask}
        open={taskDetailOpen}
        onOpenChange={setTaskDetailOpen}
        onOpenEditSchedule={handleOpenEditSchedule}
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

      <UploadSheetDialog
        open={uploadSheetOpen}
        onOpenChange={setUploadSheetOpen}
        onSuccess={() => {
          fetchTasks()
        }}
      />

      <RegisterUserDialog
        open={registerUserOpen}
        onOpenChange={setRegisterUserOpen}
      />

      <NewTaskDialog
        open={manualTaskOpen}
        onOpenChange={setManualTaskOpen}
        onSuccess={() => {
          fetchTasks()
        }}
        activeSheetId={activeSheet?.id}
      />
    </main>
  )

  function setManualOpenSafe() {
    setManualTaskOpen(true)
  }
}

function StatCard({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: string
  detail: string
  tone: 'blue' | 'amber' | 'red' | 'green'
}) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 dark:bg-blue-950/60 text-[#0d6efd] dark:text-blue-400',
    amber: 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400',
    red: 'bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-400',
    green: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400',
  }

  return (
    <Card className="overflow-hidden border-[#dee2e6] dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs">
      <CardContent className="flex items-start justify-between gap-3 p-4 sm:p-5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-slate-500 dark:text-slate-300">{label}</p>
          <p className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">{value}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-300 break-words leading-relaxed">{detail}</p>
        </div>
        <div className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${colors[tone]}`}>
          {icon}
        </div>
      </CardContent>
    </Card>
  )
}
