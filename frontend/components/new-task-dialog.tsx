'use client'

import React, { useState } from 'react'
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
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { PlusCircle, Loader2, AlertCircle } from 'lucide-react'
import { api, ScheduledTask } from '@/lib/api'
import { toast } from 'sonner'

interface NewTaskDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  activeSheetId?: number | null
}

export function NewTaskDialog({
  open,
  onOpenChange,
  onSuccess,
  activeSheetId,
}: NewTaskDialogProps) {
  const [title, setTitle] = useState('')
  const [cdcNumber, setCdcNumber] = useState('')
  const [startDatetime, setStartDatetime] = useState('')
  const [endDatetime, setEndDatetime] = useState('')
  const [hasAffectation, setHasAffectation] = useState('NO')
  const [justification, setJustification] = useState('')
  const [isRescheduled, setIsRescheduled] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  function resetForm() {
    setTitle('')
    setCdcNumber('')
    setStartDatetime('')
    setEndDatetime('')
    setHasAffectation('NO')
    setJustification('')
    setIsRescheduled(false)
    setErrorMsg(null)
  }

async function handleSubmit(e: React.FormEvent) {
  e.preventDefault()

  if (!title.trim() || !startDatetime || !endDatetime) {
    setErrorMsg('El título y las fechas de inicio y fin son obligatorios.')
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
    const FOUR_HOURS_MS = 14_400_000

    const payload = {
      title: title.trim(),
      cdc_number: cdcNumber.trim() || null,
      start_datetime: new Date(startDate.getTime() - FOUR_HOURS_MS).toISOString(),
      end_datetime: new Date(endDate.getTime() - FOUR_HOURS_MS).toISOString(),
      has_affectation: hasAffectation,
      justification: justification.trim() || null,
      is_rescheduled: isRescheduled,
      sheet_id: activeSheetId || undefined,
    }

    await api.post<ScheduledTask>('/tasks', payload)

    toast.success('Tarea creada exitosamente', {
      description: `Se programó la tarea "${title.trim()}"`,
    })

    resetForm()
    onSuccess()
    onOpenChange(false)
  } catch (err: any) {
    const msg = err?.message || 'Error al crear la tarea.'
    setErrorMsg(msg)
    toast.error('Error al registrar tarea manual', {
      description: msg,
    })
  } finally {
    setLoading(false)
  }
}

  return (
    <Dialog open={open} onOpenChange={(val) => { if (!loading) { onOpenChange(val); if (!val) resetForm(); } }}>
      <DialogContent className="max-w-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-xl p-6 text-slate-900 dark:text-slate-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
            <PlusCircle className="size-5 text-blue-600 dark:text-blue-400" />
            Nueva tarea manual
          </DialogTitle>
          <DialogDescription className="text-slate-500 dark:text-slate-400">
            Ingresa una tarea operativa al calendario. Nota: por política de auditoría y seguridad, las tareas no pueden ser eliminadas una vez creadas.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 py-2">
          {errorMsg && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 p-3 text-xs text-red-700 dark:text-red-300">
              <AlertCircle className="size-4 shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div>
            <Label htmlFor="task-title" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Título de la tarea / trabajo
            </Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="ej: Actualización de firmware en switches de distribución"
              required
              disabled={loading}
              className="mt-1.5 h-10 text-xs border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="task-cdc" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Número CDC (Opcional)
              </Label>
              <Input
                id="task-cdc"
                value={cdcNumber}
                onChange={(e) => setCdcNumber(e.target.value)}
                placeholder="ej: 3900092507 o R/P ..."
                disabled={loading}
                className="mt-1.5 h-10 font-mono text-xs border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
              />
            </div>
            <div>
              <Label htmlFor="task-aff" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Afectación de servicio
              </Label>
              <Select value={hasAffectation} onValueChange={(val) => setHasAffectation(val || 'NO')} disabled={loading}>
                <SelectTrigger id="task-aff" className="mt-1.5 h-10 text-xs border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NO">NO - Sin afectación</SelectItem>
                  <SelectItem value="SI">SI - Con afectación</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="task-start" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Fecha y hora de inicio
              </Label>
              <Input
                id="task-start"
                type="datetime-local"
                value={startDatetime}
                onChange={(e) => setStartDatetime(e.target.value)}
                required
                disabled={loading}
                className="mt-1.5 h-10 text-xs border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
              />
            </div>
            <div>
              <Label htmlFor="task-end" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Fecha y hora de fin
              </Label>
              <Input
                id="task-end"
                type="datetime-local"
                value={endDatetime}
                onChange={(e) => setEndDatetime(e.target.value)}
                required
                disabled={loading}
                className="mt-1.5 h-10 text-xs border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="task-just" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Justificación técnica
            </Label>
            <Textarea
              id="task-just"
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder="Explica el motivo y alcance de la actividad técnica..."
              disabled={loading}
              className="mt-1.5 text-xs min-h-[70px] border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-3 shadow-xs">
            <div className="space-y-0.5">
              <Label htmlFor="new-reschedule-toggle" className="text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
                Marcar como Reprogramación
              </Label>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Identificar explícitamente esta tarea como reprogramación de una ventana técnica anterior
              </p>
            </div>
            <Switch
              id="new-reschedule-toggle"
              checked={isRescheduled}
              onCheckedChange={setIsRescheduled}
              disabled={loading}
            />
          </div>

          <DialogFooter className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-zinc-800 bg-transparent">
            <Button
              type="button"
              className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-medium text-sm px-4 py-2 rounded-xl transition-colors shadow-sm"
              onClick={() => {
                resetForm()
                onOpenChange(false)
              }}
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
                  Guardando...
                </>
              ) : (
                'Guardar Tarea'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
