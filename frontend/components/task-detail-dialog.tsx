'use client'

import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { api, ScheduledTask } from '@/lib/api'
import { toast } from 'sonner'
import {
  CalendarClock,
  ShieldAlert,
  History,
  Pencil,
  Check,
  X,
  Loader2,
  SlidersHorizontal,
  Info,
} from 'lucide-react'

interface TaskDetailDialogProps {
  task: ScheduledTask | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpenEditSchedule: (task: ScheduledTask) => void
  onTaskUpdated?: (updatedTask: ScheduledTask) => void
  formatDateTime: (iso: string | null | undefined) => string
  statusStyles: Record<string, string>
}

export function TaskDetailDialog({
  task,
  open,
  onOpenChange,
  onOpenEditSchedule,
  onTaskUpdated,
  formatDateTime,
  statusStyles,
}: TaskDetailDialogProps) {
  const [currentTask, setCurrentTask] = useState<ScheduledTask | null>(task)

  // CDC Editing state
  const [isEditingCdc, setIsEditingCdc] = useState(false)
  const [cdcInput, setCdcInput] = useState('')
  const [savingCdc, setSavingCdc] = useState(false)

  // Manual Status state
  const [statusSelection, setStatusSelection] = useState<string>('AUTO')
  const [savingStatus, setSavingStatus] = useState(false)

  // Rescheduled flag state
  const [savingRescheduled, setSavingRescheduled] = useState(false)

  useEffect(() => {
    if (task) {
      setCurrentTask(task)
      setCdcInput(task.cdc_number || '')
      setIsEditingCdc(false)
      setStatusSelection(task.manual_status || 'AUTO')
    }
  }, [task, open])

  if (!currentTask) return null

  const normStatus = currentTask.execution_status?.toUpperCase() || ''
  const statusClass = normStatus.startsWith('PROXIMO')
    ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/50 dark:text-amber-300 font-semibold'
    : normStatus === 'SUSPENDIDO'
    ? 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800/60 dark:bg-orange-950/50 dark:text-orange-300 font-semibold'
    : statusStyles[currentTask.execution_status] ||
      'border-slate-200 bg-slate-50 text-slate-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-slate-300'

  // Handler for saving CDC Number
  async function handleSaveCdc() {
    setSavingCdc(true)
    try {
      const updated = await api.put<ScheduledTask>(`/tasks/${currentTask!.id}`, {
        cdc_number: cdcInput.trim() || null,
      })
      setCurrentTask(updated)
      setIsEditingCdc(false)
      toast.success('Número CDC actualizado', {
        description: updated.cdc_number ? `Asignado CDC ${updated.cdc_number}` : 'CDC eliminado/establecido en S/N',
      })
      onTaskUpdated?.(updated)
    } catch (err: any) {
      toast.error('Error al actualizar CDC', {
        description: err?.message || 'No se pudo guardar el número CDC.',
      })
    } finally {
      setSavingCdc(false)
    }
  }

  // Handler for changing Manual Status
  async function handleStatusChange(newStatus: string) {
    setStatusSelection(newStatus)
    setSavingStatus(true)
    try {
      const updated = await api.put<ScheduledTask>(`/tasks/${currentTask!.id}`, {
        manual_status: newStatus === 'AUTO' ? null : newStatus,
      })
      setCurrentTask(updated)
      toast.success('Estado de la tarea modificado', {
        description:
          newStatus === 'AUTO'
            ? 'Estado restablecido al cálculo automático por horario.'
            : `Estado manual forzado a: ${newStatus}`,
      })
      onTaskUpdated?.(updated)
    } catch (err: any) {
      setStatusSelection(currentTask?.manual_status || 'AUTO')
      toast.error('Error al cambiar estado', {
        description: err?.message || 'No se pudo aplicar el nuevo estado.',
      })
    } finally {
      setSavingStatus(false)
    }
  }

  // Handler for toggling Rescheduled flag manually
  async function handleToggleRescheduled(checked: boolean) {
    setSavingRescheduled(true)
    try {
      const updated = await api.put<ScheduledTask>(`/tasks/${currentTask!.id}`, {
        is_rescheduled: checked,
      })
      setCurrentTask(updated)
      toast.success(
        checked
          ? 'Tarea marcada como Reprogramación'
          : 'Marca de reprogramación eliminada',
        {
          description: checked
            ? 'Esta tarea ha sido catalogada como reprogramación de ventana previa.'
            : 'Se retiró la marca de reprogramación.',
        }
      )
      onTaskUpdated?.(updated)
    } catch (err: any) {
      toast.error('Error al actualizar reprogramación', {
        description: err?.message || 'No se pudo cambiar el estado de reprogramación.',
      })
    } finally {
      setSavingRescheduled(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-xl p-6 text-slate-900 dark:text-slate-100 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-slate-900 dark:text-white">
            Detalle técnico de la tarea
          </DialogTitle>
          <DialogDescription className="text-slate-500 dark:text-slate-400">
            Información operativa, aprobaciones, control de estado y trazabilidad.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* Status Badges & Title */}
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={statusClass}>
                {currentTask.execution_status}
              </Badge>
              {currentTask.manual_status && (
                <Badge className="border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950/50 dark:text-purple-300 font-semibold">
                  ESTADO MANUAL ({currentTask.manual_status})
                </Badge>
              )}
              {currentTask.is_rescheduled && (
                <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                  🔄 Reprogramado
                </span>
              )}
              {currentTask.has_affectation === 'SI' ? (
                <Badge
                  variant="outline"
                  className="border-red-200 dark:border-red-800/60 bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300"
                >
                  CON AFECTACIÓN
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300"
                >
                  SIN AFECTACIÓN
                </Badge>
              )}
            </div>

            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 leading-snug">
              {currentTask.title}
            </h3>

            {/* CDC assignment row */}
            <div className="mt-2 flex items-center gap-2">
              {isEditingCdc ? (
                <div className="flex items-center gap-1.5 w-full">
                  <Input
                    type="text"
                    value={cdcInput}
                    placeholder="Número CDC (ej: 3900092507 o S/N)"
                    onChange={(e) => setCdcInput(e.target.value)}
                    disabled={savingCdc}
                    className="h-8 text-xs font-mono border-slate-300 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 w-52"
                    autoFocus
                  />
                  <Button
                    size="sm"
                    className="h-8 px-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs"
                    onClick={handleSaveCdc}
                    disabled={savingCdc}
                  >
                    {savingCdc ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 px-2 text-xs border-slate-300"
                    onClick={() => {
                      setIsEditingCdc(false)
                      setCdcInput(currentTask.cdc_number || '')
                    }}
                    disabled={savingCdc}
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-slate-600 dark:text-slate-400">
                    CDC {currentTask.cdc_number || 'Sin número (S/N)'} · ID #{currentTask.id}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-[11px] font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800"
                    onClick={() => setIsEditingCdc(true)}
                  >
                    <Pencil className="size-3 mr-1" />
                    {currentTask.cdc_number ? 'Editar CDC' : 'Asignar CDC'}
                  </Button>
                </div>
              )}
            </div>
          </div>

          <Separator className="dark:border-zinc-800" />

          {/* Status Manager Control (Feature 2) */}
          <div className="rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800/60 p-3.5">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 font-semibold text-xs text-slate-700 dark:text-slate-200">
                <SlidersHorizontal className="size-3.5 text-blue-600 dark:text-blue-400" />
                <span>Gestor de Estado Operacional</span>
              </div>
              {savingStatus && (
                <span className="flex items-center gap-1 text-[11px] text-blue-600">
                  <Loader2 className="size-3 animate-spin" />
                  Guardando...
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={savingStatus}
                onClick={() => handleStatusChange('AUTO')}
                className={`text-xs h-9 justify-center rounded-lg font-medium transition-all ${
                  statusSelection === 'AUTO'
                    ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700 hover:text-white shadow-xs'
                    : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300 dark:bg-zinc-800 dark:text-slate-200'
                }`}
              >
                Automático
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={savingStatus}
                onClick={() => handleStatusChange('TERMINADO')}
                className={`text-xs h-9 justify-center rounded-lg font-medium transition-all ${
                  statusSelection === 'TERMINADO'
                    ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700 hover:text-white shadow-xs'
                    : 'bg-white hover:bg-emerald-50 text-slate-700 border-slate-300 dark:bg-zinc-800 dark:text-slate-200'
                }`}
              >
                TERMINADO
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={savingStatus}
                onClick={() => handleStatusChange('SUSPENDIDO')}
                className={`text-xs h-9 justify-center rounded-lg font-medium transition-all ${
                  statusSelection === 'SUSPENDIDO'
                    ? 'bg-orange-600 text-white border-orange-600 hover:bg-orange-700 hover:text-white shadow-xs'
                    : 'bg-white hover:bg-orange-50 text-slate-700 border-slate-300 dark:bg-zinc-800 dark:text-slate-200'
                }`}
              >
                SUSPENDIDO
              </Button>
            </div>

            {currentTask.manual_status && (
              <div className="mt-2.5 flex items-start gap-1.5 text-[11px] text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/40 p-2 rounded-lg border border-purple-200 dark:border-purple-800/60">
                <Info className="size-3.5 mt-0.5 shrink-0" />
                <span>
                  Sobrescrito manualmente a <strong>{currentTask.manual_status}</strong>
                  {currentTask.manual_status_updated_at ? ` el ${formatDateTime(currentTask.manual_status_updated_at)}` : ''}
                  {currentTask.manual_status_updated_by_name ? ` por ${currentTask.manual_status_updated_by_name}` : ''}.
                  El cálculo horario automático está en pausa para esta tarea.
                </span>
              </div>
            )}

            {/* Manual Rescheduling Toggle */}
            <div className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-800/50 p-3 mt-3">
              <div className="space-y-0.5">
                <Label
                  htmlFor="manual-reschedule-toggle"
                  className="text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer"
                >
                  Marcar como Reprogramación
                </Label>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Indica si esta tarea reemplaza o reprograma una ventana técnica anterior.
                </p>
              </div>
              <Switch
                id="manual-reschedule-toggle"
                checked={Boolean(currentTask.is_rescheduled)}
                onCheckedChange={handleToggleRescheduled}
                disabled={savingRescheduled}
              />
            </div>
          </div>

          {/* Schedule Window */}
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div className="rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800/80 p-2.5">
              <p className="font-semibold text-slate-500 dark:text-slate-400">Inicio programado</p>
              <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
                {formatDateTime(currentTask.start_datetime)}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800/80 p-2.5">
              <p className="font-semibold text-slate-500 dark:text-slate-400">Fin programado</p>
              <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
                {formatDateTime(currentTask.end_datetime)}
              </p>
            </div>
          </div>

          {currentTask.has_affectation === 'SI' && (
            <div className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50/50 dark:bg-red-950/40 p-3 text-xs">
              <p className="font-semibold text-red-800 dark:text-red-300">Ventana de afectación:</p>
              <p className="mt-1 text-red-700 dark:text-red-400">
                {formatDateTime(currentTask.affectation_start)} — {formatDateTime(currentTask.affectation_end)}
              </p>
              {currentTask.affectation_details && (
                <p className="mt-1.5 text-slate-600 dark:text-slate-300">{currentTask.affectation_details}</p>
              )}
            </div>
          )}

          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Justificación técnica
            </p>
            <p className="rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50/80 dark:bg-zinc-800/80 p-3 text-xs leading-relaxed text-slate-700 dark:text-slate-200">
              {currentTask.justification || 'Sin justificación técnica registrada.'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50/50 dark:bg-zinc-800/50 p-2.5">
              <p className="text-slate-500 dark:text-slate-400">Aprobación Comité VPTI</p>
              <p className="mt-1 font-medium text-slate-800 dark:text-slate-200">
                {currentTask.vpti_committee_approval || 'No registrado'}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50/50 dark:bg-zinc-800/50 p-2.5">
              <p className="text-slate-500 dark:text-slate-400">Aprobación Gerencia</p>
              <p className="mt-1 font-medium text-slate-800 dark:text-slate-200">
                {currentTask.managers_approval || 'No registrado'}
              </p>
            </div>
          </div>

          {/* Traceability */}
          <div className="rounded-lg bg-slate-50 dark:bg-zinc-800/80 p-3 text-xs text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-zinc-700">
            <div className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
              <History className="size-3.5 text-slate-500 dark:text-slate-400" />
              <span>Trazabilidad y auditoría</span>
            </div>
            <p className="mt-1">
              • Registrado: {formatDateTime(currentTask.created_at)}
              {currentTask.created_by_name ? ` por ${currentTask.created_by_name}` : ''}
            </p>
            {currentTask.updated_at && (
              <p className="mt-1 text-[#0d6efd] dark:text-blue-400">
                • Última modificación: {formatDateTime(currentTask.updated_at)}
                {currentTask.updated_by_name ? ` por ${currentTask.updated_by_name}` : ''}
              </p>
            )}
            {currentTask.committee_name && (
              <p className="mt-1 text-slate-500 dark:text-slate-400">
                • Origen: {currentTask.committee_name}
              </p>
            )}
          </div>

          {/* Security policy note regarding deletions */}
          <div className="flex items-center gap-2 rounded-md bg-slate-100 dark:bg-zinc-800/50 border border-slate-200 dark:border-zinc-700 p-2 text-[11px] text-slate-500 dark:text-slate-400">
            <ShieldAlert className="size-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
            <span>Eliminaciones deshabilitadas por política de auditoría inmutable VPTI.</span>
          </div>
        </div>

        <DialogFooter className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-zinc-800 bg-transparent">
          <Button
            type="button"
            className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-medium text-sm px-4 py-2 rounded-xl transition-colors shadow-sm"
            onClick={() => onOpenChange(false)}
          >
            Cerrar
          </Button>
          <Button
            type="button"
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm px-4 py-2 rounded-xl shadow-sm transition-all inline-flex items-center gap-2"
            onClick={() => {
              onOpenChange(false)
              onOpenEditSchedule(currentTask)
            }}
          >
            <CalendarClock className="size-4" data-icon="inline-start" />
            Editar horario
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
