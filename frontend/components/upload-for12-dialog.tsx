'use client'

import React, { useState, useRef, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { CloudUpload, FileSpreadsheet, Loader2, CheckCircle2, AlertCircle, X, Sparkles } from 'lucide-react'
import { api, ScheduledTask, generateExternalRedaccion, For12UploadResponse } from '@/lib/api'
import { toast } from 'sonner'

interface UploadFor12DialogProps {
  task: ScheduledTask | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: (generatedMessage: string) => void
  initialFile?: File | null
}

export function UploadFor12Dialog({
  task,
  open,
  onOpenChange,
  onSuccess,
  initialFile = null,
}: UploadFor12DialogProps) {
  const [file, setFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [currentStep, setCurrentStep] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFileSelect(selectedFile: File | null) {
    if (!selectedFile) return
    setErrorMsg(null)

    const validExtensions = ['.xlsx', '.xls', '.xlsm']
    const hasValidExt = validExtensions.some((ext) =>
      selectedFile.name.toLowerCase().endsWith(ext)
    )

    if (!hasValidExt) {
      setFile(null)
      setErrorMsg('Formato de archivo no válido. Se admiten archivos Excel (.xlsx, .xls, .xlsm).')
      return
    }

    setFile(selectedFile)
  }

  useEffect(() => {
    if (open) {
      if (initialFile) {
        handleFileSelect(initialFile)
      } else {
        setFile(null)
        setErrorMsg(null)
      }
      setCurrentStep(null)
    } else {
      setFile(null)
      setErrorMsg(null)
      setCurrentStep(null)
    }
  }, [open, initialFile])

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(true)
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0])
    }
  }

  async function handleSubmit() {
    if (!task) return
    if (!file) {
      setErrorMsg('Por favor seleccione el archivo Excel FOR12.')
      return
    }

    const cdc = task.cdc_number || ''
    if (!cdc.trim()) {
      setErrorMsg('El trabajo seleccionado no posee número de CDC asignado.')
      return
    }

    setProcessing(true)
    setErrorMsg(null)

    try {
      // Paso 1: Enviar a la API externa para redactar
      setCurrentStep('1/2 Conectando con API externa (localhost:7000/api/redactar)...')
      const redaccionTexto = await generateExternalRedaccion(file, cdc)

      // Paso 2: Enviar al backend para guardar en for12_files y for12_messages
      setCurrentStep('2/2 Guardando archivo en servidor y registrando redacción...')
      const backendFormData = new FormData()
      backendFormData.append('file', file)
      backendFormData.append('message', redaccionTexto)
      backendFormData.append('task_id', String(task.id))
      backendFormData.append('cdc_number', cdc)

      await api.upload<For12UploadResponse>('/for12/upload', backendFormData)

      toast.success(
        task.has_for12
          ? 'FOR12 actualizado y redacción regenerada con éxito'
          : 'FOR12 cargado y redacción registrada con éxito',
        {
          description: `CDC ${cdc} - Archivo: ${file.name}`,
        }
      )

      setFile(null)
      setCurrentStep(null)
      onOpenChange(false)
      onSuccess(redaccionTexto)
    } catch (err: any) {
      console.error('Error en proceso FOR12:', err)
      setErrorMsg(err?.message || 'Ocurrió un error inesperado al procesar la FOR12.')
    } finally {
      setProcessing(false)
      setCurrentStep(null)
    }
  }

  function handleClose() {
    if (processing) return
    setFile(null)
    setErrorMsg(null)
    setCurrentStep(null)
    onOpenChange(false)
  }

  const isUpdating = Boolean(task?.has_for12)

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[540px] border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/60 text-[#0d6efd]">
              <FileSpreadsheet className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-slate-900 dark:text-white">
                {isUpdating ? 'Actualizar FOR12' : 'Cargar FOR12'}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
                Se enviará el archivo a la API externa para generar la redacción y se guardará en la base de datos.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {task && (
          <div className="rounded-lg border border-slate-100 dark:border-zinc-800/80 bg-slate-50/80 dark:bg-zinc-800/40 p-3 text-xs">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="font-mono font-bold text-blue-700 dark:text-blue-400 bg-blue-100/70 dark:bg-blue-950/80 px-2 py-0.5 rounded">
                CDC: {task.cdc_number || 'S/N'}
              </span>
              <span className="text-[11px] text-slate-500">
                ID Tarea: #{task.id}
              </span>
            </div>
            <p className="font-medium text-slate-800 dark:text-slate-200 line-clamp-2">
              {task.title}
            </p>
          </div>
        )}

        <div className="space-y-4 py-2">
          {/* Dropzone */}
          <div
            className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-all cursor-pointer ${
              isDragging
                ? 'border-[#0d6efd] bg-blue-50/40 dark:bg-blue-950/20'
                : 'border-slate-300 dark:border-zinc-700 hover:border-slate-400 dark:hover:border-zinc-600 bg-slate-50/30 dark:bg-zinc-900/40'
            } ${file ? 'border-emerald-500 bg-emerald-50/20 dark:bg-emerald-950/10' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.xlsm"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleFileSelect(e.target.files[0])
                }
              }}
              disabled={processing}
            />

            {file ? (
              <div className="flex flex-col items-center gap-2">
                <div className="flex size-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="size-6" />
                </div>
                <div className="text-center">
                  <p className="font-semibold text-slate-900 dark:text-white text-sm max-w-xs truncate">
                    {file.name}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {(file.size / 1024).toFixed(1)} KB · Archivo Excel listo
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-1 h-7 text-xs bg-white hover:bg-slate-100 text-slate-700 hover:text-red-600 border border-slate-300 px-2.5 rounded-lg transition-colors"
                  onClick={(e) => {
                    e.stopPropagation()
                    setFile(null)
                  }}
                  disabled={processing}
                >
                  <X className="size-3.5 mr-1" />
                  Cambiar archivo
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div className="flex size-12 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-950/50 text-[#0d6efd]">
                  <CloudUpload className="size-6" />
                </div>
                <div>
                  <p className="font-semibold text-slate-800 dark:text-slate-200 text-sm">
                    Haz clic para seleccionar o arrastra el archivo aquí
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                    Formatos soportados: .xlsx, .xls, .xlsm
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Estado de procesamiento por pasos */}
          {processing && (
            <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50/70 dark:border-blue-900/60 dark:bg-blue-950/40 p-3">
              <Loader2 className="size-5 shrink-0 animate-spin text-[#0d6efd]" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-blue-900 dark:text-blue-300">
                  Procesando FOR12...
                </p>
                <p className="text-[11px] text-blue-700 dark:text-blue-400 truncate">
                  {currentStep}
                </p>
              </div>
            </div>
          )}

          {/* Mensaje de error */}
          {errorMsg && (
            <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50/80 p-3 text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400 text-xs">
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">{errorMsg}</div>
            </div>
          )}
        </div>

        <DialogFooter className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-zinc-800 bg-transparent">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={processing}
            className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-medium text-xs px-4 py-2 rounded-xl transition-colors shadow-sm"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!file || processing}
            className="bg-[#0d6efd] hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-sm transition-all"
          >
            {processing ? (
              <>
                <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                Procesando...
              </>
            ) : (
              <>
                <Sparkles className="size-3.5 mr-1.5" />
                {isUpdating ? 'Actualizar FOR12' : 'Cargar FOR12'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
