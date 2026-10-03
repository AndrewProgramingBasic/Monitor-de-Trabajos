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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { CalendarClock, Loader2, AlertCircle, Clock } from 'lucide-react'
import { api, ScheduledTask } from '@/lib/api'
import { toast } from 'sonner'

interface EditScheduleDialogProps {
  task: ScheduledTask | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: (updatedTask: ScheduledTask) => void
}

function toLocalDatetimeString(isoStr: string | null | undefined): string {
  if (!isoStr) return ''
  try {
    const d = new Date(isoStr)
    if (isNaN(d.getTime())) return ''
    const pad = (n: number) => String(n).padStart(2, '0')
    const year = d.getFullYear()
    const month = pad(d.getMonth() + 1)
    const day = pad(d.getDate())
    const hours = pad(d.getHours())
    const minutes = pad(d.getMinutes())
    return `${year}-${month}-${day}T${hours}:${minutes}`
  } catch {
    return ''
  }
}

export function EditScheduleDialog({
  task,
  open,
  onOpenChange,
  onSuccess,
}: EditScheduleDialogProps) {
  const [startDatetime, setStartDatetime] = useState('')
  const [endDatetime, setEndDatetime] = useState('')
  const [isRescheduled, setIsRescheduled] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    if (task && open) {
      setStartDatetime(toLocalDatetimeString(task.start_datetime))
      setEndDatetime(toLocalDatetimeString(task.end_datetime))
      setIsRescheduled(Boolean(task.is_rescheduled))
      setErrorMsg(null)
    }
  }, [task, open])

async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!task) return

    if (!startDatetime || !endDatetime) {
      setErrorMsg('Ambas fechas y horas (inicio y fin) son requeridas.')
      return
    }

    const startDate = new Date(startDatetime)
    const endDate = new Date(endDatetime)

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      setErrorMsg('Las fechas ingresadas no tienen un formato válido.')
      return
    }

    if (endDate <= startDate) {
      setErrorMsg('La fecha de fin debe ser posterior a la fecha de inicio.')
      return
    }

    setLoading(true)
    setErrorMsg(null)

    try {
      // 4 horas en milisegundos (4 * 60 * 60 * 1000)
      const FOUR_HOURS_MS = 14_400_000

      const payload = {
        start_datetime: new Date(startDate.getTime() - FOUR_HOURS_MS).toISOString(),
        end_datetime: new Date(endDate.getTime() - FOUR_HOURS_MS).toISOString(),
        is_rescheduled: isRescheduled,
      }

      const updated = await api.put<ScheduledTask>(`/tasks/${task.id}`, payload)

      toast.success('Horario de tarea actualizado', {
        description: `Se reprogramó la ventana para la tarea CDC ${task.cdc_number || task.id}`,
      })

      onSuccess(updated)
      onOpenChange(false)
    } catch (err: any) {
      const msg = err?.message || 'Error al actualizar el horario de la tarea.'
      setErrorMsg(msg)
      toast.error('Error al editar horario', {
        description: msg,
      })
    } finally {
      setLoading(false)
    }
  }
  if (!task) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-xl p-6 text-slate-900 dark:text-slate-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
            <CalendarClock className="size-5 text-blue-600 dark:text-blue-400" />
            Editar horario de ventana
          </DialogTitle>
          <DialogDescription className="text-slate-500 dark:text-slate-400">
            Modificación restringida de horario técnico para{' '}
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              {task.cdc_number ? `CDC ${task.cdc_number}` : `Tarea #${task.id}`}
            </span>
            .
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 py-2">
          {errorMsg && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 p-3 text-xs text-red-700 dark:text-red-300">
              <AlertCircle className="size-4 shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800/80 p-3 text-xs">
            <p className="font-semibold text-slate-700 dark:text-slate-200">{task.title}</p>
            <p className="mt-1 font-mono text-slate-500 dark:text-slate-400">CDC {task.cdc_number || 'S/N'}</p>
          </div>

          <div>
            <Label htmlFor="start-datetime" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Nueva Fecha y Hora de Inicio
            </Label>
            <div className="relative mt-1.5">
              <Input
                id="start-datetime"
                type="datetime-local"
                value={startDatetime}
                onChange={(e) => setStartDatetime(e.target.value)}
                required
                disabled={loading}
                className="h-10 text-xs border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="end-datetime" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Nueva Fecha y Hora de Fin
            </Label>
            <div className="relative mt-1.5">
              <Input
                id="end-datetime"
                type="datetime-local"
                value={endDatetime}
                onChange={(e) => setEndDatetime(e.target.value)}
                required
                disabled={loading}
                className="h-10 text-xs border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-3 shadow-xs">
            <div className="space-y-0.5">
              <Label htmlFor="edit-reschedule-toggle" className="text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
                Marcar como Reprogramación
              </Label>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Identificar explícitamente esta ventana como reprogramada
              </p>
            </div>
            <Switch
              id="edit-reschedule-toggle"
              checked={isRescheduled}
              onCheckedChange={setIsRescheduled}
              disabled={loading}
            />
          </div>

          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/50 p-2.5 text-[11px] leading-relaxed text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60">
            <p className="font-semibold">Aviso de reprogramación:</p>
            <p className="mt-0.5">
              Al modificar la fecha de inicio, el sistema recalculará los cronómetros de alerta y reiniciará el indicador de preaviso de 1 hora.
            </p>
          </div>

          <DialogFooter className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-zinc-800 bg-transparent">
            <Button
              type="button"
              className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-medium text-sm px-4 py-2 rounded-xl transition-colors shadow-sm"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm px-4 py-2 rounded-xl shadow-sm transition-all"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
                  Guardando cambios...
                </>
              ) : (
                'Guardar Horario'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
