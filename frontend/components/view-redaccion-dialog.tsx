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
import {
  FileText,
  Copy,
  Check,
  Download,
  RefreshCw,
  Loader2,
  Calendar,
  FileSpreadsheet,
  AlertCircle,
} from 'lucide-react'
import { api, ScheduledTask, TaskMessageResponse, normalizeMessageText } from '@/lib/api'
import { toast } from 'sonner'

interface ViewRedaccionDialogProps {
  task: ScheduledTask | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpenUpdateFor12?: (task: ScheduledTask) => void
  initialMessage?: string | null
}

export function ViewRedaccionDialog({
  task,
  open,
  onOpenChange,
  onOpenUpdateFor12,
  initialMessage,
}: ViewRedaccionDialogProps) {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<TaskMessageResponse | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open || !task) {
      setData(null)
      setErrorMsg(null)
      setCopied(false)
      return
    }

    if (initialMessage) {
      setData({
        task_id: task.id,
        cdc_number: task.cdc_number,
        title: task.title,
        message_text: initialMessage,
        original_filename: 'FOR12.xlsx',
        storage_path: '',
        uploaded_at: new Date().toISOString(),
        has_message: true,
      })
      return
    }

    // Fetch from backend
    async function fetchMessage() {
      if (!task) return
      setLoading(true)
      setErrorMsg(null)
      try {
        const res = await api.get<TaskMessageResponse>(`/tasks/${task.id}/message`)
        setData(res)
      } catch (err: any) {
        console.error('Error fetching redaccion:', err)
        setErrorMsg(
          err?.data?.error ||
          err?.message ||
          'No se pudo recuperar la redacción para este trabajo.'
        )
      } finally {
        setLoading(false)
      }
    }

    fetchMessage()
  }, [open, task, initialMessage])

  async function handleCopy() {
    const textToCopy = normalizeMessageText(data?.message_text || '')
    if (!textToCopy) return

    try {
      await navigator.clipboard.writeText(textToCopy)
      setCopied(true)
      toast.success('Redacción copiada al portapapeles')
      setTimeout(() => setCopied(false), 2500)
    } catch {
      toast.error('No se pudo copiar automáticamente. Por favor seleccione y copie el texto manualmente.')
    }
  }

  function handleDownload() {
    if (!task) return
    const downloadUrl = `/api/tasks/${task.id}/for12/download`
    const token = typeof window !== 'undefined' ? localStorage.getItem('vpti_access_token') : null

    // Trigger download with auth header via fetch blob
    fetch(downloadUrl, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => {
        if (!res.ok) throw new Error('Error al descargar el archivo')
        const filename = data?.original_filename || `FOR12_CDC_${task.cdc_number || task.id}.xlsx`
        return res.blob().then((blob) => ({ blob, filename }))
      })
      .then(({ blob, filename }) => {
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
        toast.success(`Archivo ${filename} descargado`)
      })
      .catch((err) => {
        toast.error(`Error al descargar archivo: ${err.message}`)
      })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[680px] max-h-[90vh] flex flex-col border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl p-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="p-5 pb-3 border-b border-slate-100 dark:border-zinc-800">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
                <FileText className="size-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  Redacción del Trabajo
                  {task?.cdc_number && (
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-semibold">
                      CDC {task.cdc_number}
                    </span>
                  )}
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">
                  {task?.title}
                </DialogDescription>
              </div>
            </div>
          </div>

          {data && (
            <div className="flex flex-wrap items-center gap-3 mt-3 pt-2 text-[11px] text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-zinc-800/80">
              {data.original_filename && (
                <span className="inline-flex items-center gap-1">
                  <FileSpreadsheet className="size-3.5 text-emerald-600" />
                  Archivo: <strong className="text-slate-700 dark:text-slate-300">{data.original_filename}</strong>
                </span>
              )}
              {data.uploaded_at && (
                <span className="inline-flex items-center gap-1">
                  <Calendar className="size-3.5 text-blue-600" />
                  Fecha: {new Date(data.uploaded_at).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })}
                </span>
              )}
            </div>
          )}
        </DialogHeader>

        {/* Body / Message Content */}
        <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
              <Loader2 className="size-8 animate-spin text-[#0d6efd]" />
              <p className="text-xs font-medium">Cargando redacción del trabajo...</p>
            </div>
          ) : errorMsg ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-amber-50 text-amber-600 mb-3">
                <AlertCircle className="size-6" />
              </div>
              <p className="font-semibold text-slate-800 dark:text-slate-200 text-sm">
                No hay redacción disponible
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mt-1 mb-4">
                {errorMsg}
              </p>
              {onOpenUpdateFor12 && task && (
                <Button
                  size="sm"
                  className="bg-[#0d6efd] hover:bg-blue-700 text-white text-xs font-semibold"
                  onClick={() => {
                    onOpenChange(false)
                    onOpenUpdateFor12(task)
                  }}
                >
                  <RefreshCw className="size-3.5 mr-1.5" />
                  Cargar FOR12 ahora
                </Button>
              )}
            </div>
          ) : data?.message_text ? (
            <div className="relative rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-950/60 p-4 font-mono text-xs leading-relaxed text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-words select-text selection:bg-blue-200 selection:text-blue-900 shadow-inner">
              {normalizeMessageText(data.message_text)}
            </div>
          ) : (
            <div className="text-center py-12 text-xs text-slate-400">
              No se encontró contenido en la redacción.
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="p-3.5 px-5 bg-slate-50/60 dark:bg-zinc-800/40 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between sm:justify-between w-full">
          <div className="flex items-center gap-2">
            {data?.message_text && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCopy}
                className="text-xs h-8 font-medium gap-1.5 bg-white dark:bg-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-700"
              >
                {copied ? (
                  <>
                    <Check className="size-3.5 text-emerald-600" />
                    Copiado
                  </>
                ) : (
                  <>
                    <Copy className="size-3.5" />
                    Copiar texto
                  </>
                )}
              </Button>
            )}

            {data?.storage_path && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDownload}
                className="text-xs h-8 font-medium gap-1.5 bg-white dark:bg-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-700 text-slate-700 dark:text-slate-200"
              >
                <Download className="size-3.5" />
                Descargar Excel
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {onOpenUpdateFor12 && task && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  onOpenChange(false)
                  onOpenUpdateFor12(task)
                }}
                className="text-xs h-8 font-medium gap-1.5 border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-900 dark:text-blue-400"
              >
                <RefreshCw className="size-3.5" />
                Actualizar FOR12
              </Button>
            )}

            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs h-8 bg-slate-800 hover:bg-slate-900 text-white dark:bg-zinc-700 dark:hover:bg-zinc-600 font-medium"
            >
              Cerrar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
