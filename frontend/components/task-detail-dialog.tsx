'use client'

import React from 'react'
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
import { ScheduledTask } from '@/lib/api'
import { CalendarClock, ShieldAlert, History } from 'lucide-react'

interface TaskDetailDialogProps {
  task: ScheduledTask | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpenEditSchedule: (task: ScheduledTask) => void
  formatDateTime: (iso: string | null | undefined) => string
  statusStyles: Record<string, string>
}

export function TaskDetailDialog({
  task,
  open,
  onOpenChange,
  onOpenEditSchedule,
  formatDateTime,
  statusStyles,
}: TaskDetailDialogProps) {
  if (!task) return null

  const normStatus = task.execution_status?.toUpperCase() || ''
  const statusClass = normStatus.startsWith('PROXIMO')
    ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/50 dark:text-amber-300 font-semibold'
    : statusStyles[task.execution_status] ||
      'border-slate-200 bg-slate-50 text-slate-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-slate-300'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-xl p-6 text-slate-900 dark:text-slate-100">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-slate-900 dark:text-white">Detalle técnico de la tarea</DialogTitle>
          <DialogDescription className="text-slate-500 dark:text-slate-400">
            Información operativa, aprobaciones y trazabilidad de modificaciones.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={statusClass}>
                {task.execution_status}
              </Badge>
              {task.is_rescheduled && (
                <Badge className="border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300">
                  REPROGRAMACIÓN
                </Badge>
              )}
              {task.has_affectation === 'SI' ? (
                <Badge variant="outline" className="border-red-200 dark:border-red-800/60 bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300">
                  CON AFECTACIÓN
                </Badge>
              ) : (
                <Badge variant="outline" className="border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300">
                  SIN AFECTACIÓN
                </Badge>
              )}
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 leading-snug">{task.title}</h3>
            <p className="mt-1 font-mono text-xs text-slate-500 dark:text-slate-400">
              CDC {task.cdc_number || 'Sin número CDC'} · ID #{task.id}
            </p>
          </div>

          <Separator className="dark:border-zinc-800" />

          <div className="grid grid-cols-2 gap-4 text-xs">
            <div className="rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800/80 p-2.5">
              <p className="font-semibold text-slate-500 dark:text-slate-400">Inicio programado</p>
              <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
                {formatDateTime(task.start_datetime)}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800/80 p-2.5">
              <p className="font-semibold text-slate-500 dark:text-slate-400">Fin programado</p>
              <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
                {formatDateTime(task.end_datetime)}
              </p>
            </div>
          </div>

          {task.has_affectation === 'SI' && (
            <div className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50/50 dark:bg-red-950/40 p-3 text-xs">
              <p className="font-semibold text-red-800 dark:text-red-300">Ventana de afectación:</p>
              <p className="mt-1 text-red-700 dark:text-red-400">
                {formatDateTime(task.affectation_start)} — {formatDateTime(task.affectation_end)}
              </p>
              {task.affectation_details && (
                <p className="mt-1.5 text-slate-600 dark:text-slate-300">{task.affectation_details}</p>
              )}
            </div>
          )}

          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Justificación técnica
            </p>
            <p className="rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50/80 dark:bg-zinc-800/80 p-3 text-xs leading-relaxed text-slate-700 dark:text-slate-200">
              {task.justification || 'Sin justificación técnica registrada.'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50/50 dark:bg-zinc-800/50 p-2.5">
              <p className="text-slate-500 dark:text-slate-400">Aprobación Comité VPTI</p>
              <p className="mt-1 font-medium text-slate-800 dark:text-slate-200">
                {task.vpti_committee_approval || 'No registrado'}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50/50 dark:bg-zinc-800/50 p-2.5">
              <p className="text-slate-500 dark:text-slate-400">Aprobación Gerencia</p>
              <p className="mt-1 font-medium text-slate-800 dark:text-slate-200">
                {task.managers_approval || 'No registrado'}
              </p>
            </div>
          </div>

          <div className="rounded-lg bg-slate-50 dark:bg-zinc-800/80 p-3 text-xs text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-zinc-700">
            <div className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
              <History className="size-3.5 text-slate-500 dark:text-slate-400" />
              <span>Trazabilidad y auditoría</span>
            </div>
            <p className="mt-1">
              • Registrado: {formatDateTime(task.created_at)}
              {task.created_by_name ? ` por ${task.created_by_name}` : ''}
            </p>
            {task.updated_at && (
              <p className="mt-1 text-[#0d6efd] dark:text-blue-400">
                • Última modificación: {formatDateTime(task.updated_at)}
                {task.updated_by_name ? ` por ${task.updated_by_name}` : ''}
              </p>
            )}
            {task.committee_name && (
              <p className="mt-1 text-slate-500 dark:text-slate-400">
                • Origen: {task.committee_name}
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
              onOpenEditSchedule(task)
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
