'use client'

import React, { useState, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { CloudUpload, FileSpreadsheet, Loader2, CheckCircle2, AlertCircle, X } from 'lucide-react'
import { api, SheetUploadResponse } from '@/lib/api'
import { toast } from 'sonner'

interface UploadSheetDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function UploadSheetDialog({
  open,
  onOpenChange,
  onSuccess,
}: UploadSheetDialogProps) {
  const [file, setFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
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
      setErrorMsg('Formato de archivo no válido. Se admiten archivos Excel (.xlsx, .xls, .xlsm).')
      return
    }

    setFile(selectedFile)
  }

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

  async function handleUpload() {
    if (!file) {
      setErrorMsg('Por favor seleccione un archivo Excel para continuar.')
      return
    }

    setUploading(true)
    setErrorMsg(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await api.upload<SheetUploadResponse>('/tasks/upload', formData)

      toast.success(
        `Sheet ingested: ${res.tasks_imported} tasks imported, ${res.rescheduled_count} rescheduled`,
        {
          description: `Comité: ${res.committee_name}`,
        }
      )

      setFile(null)
      onSuccess()
      onOpenChange(false)
    } catch (err: any) {
      if (err?.status === 409) {
        const conflictMsg = 'El archivo ya fue importado previamente'
        const detailMsg =
          err?.data?.detail ||
          err?.data?.error ||
          err?.message ||
          'La matriz de comité coincide con una hoja registrada previamente en el sistema.'
        setErrorMsg(`${conflictMsg}. ${detailMsg}`)
        toast.warning(conflictMsg, {
          description: detailMsg,
        })
      } else {
        const msg = err?.data?.error || err?.message || 'Error al procesar el archivo Excel.'
        setErrorMsg(msg)
        toast.error('Error al importar hoja semanal', {
          description: msg,
        })
      }
    } finally {
      setUploading(false)
    }
  }

  function handleClose() {
    if (uploading) return
    setFile(null)
    setErrorMsg(null)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-xl p-6 text-slate-900 dark:text-slate-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg text-slate-900 dark:text-white font-bold">
            <FileSpreadsheet className="size-5 text-blue-600 dark:text-blue-400" />
            Cargar hoja semanal del comité
          </DialogTitle>
          <DialogDescription className="text-slate-500 dark:text-slate-400">
            Importa la matriz Excel del comité VPTI. El sistema normaliza fechas, analiza enlaces CDC y detecta reprogramaciones automáticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          {errorMsg && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 p-3 text-xs text-red-700 dark:text-red-300">
              <AlertCircle className="size-4 shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFileSelect(e.target.files[0])
              }
            }}
          />

          {!file ? (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
                isDragging
                  ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30'
                  : 'border-slate-300 dark:border-zinc-700 hover:border-blue-500 hover:bg-slate-50 dark:hover:bg-zinc-800/60'
              }`}
            >
              <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                <CloudUpload className="size-6" />
              </div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                Haga clic para seleccionar o arrastre el archivo aquí
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Formatos permitidos: .xlsx, .xls, .xlsm (Hasta 32 MB)
              </p>
              <div className="mt-4">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="bg-white hover:bg-blue-50 text-blue-700 border border-blue-300 hover:border-blue-400 shadow-sm font-semibold px-4 py-2 rounded-xl transition-all"
                  onClick={(e) => {
                    e.stopPropagation()
                    fileInputRef.current?.click()
                  }}
                >
                  Explorar archivos
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800/80 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                    <FileSpreadsheet className="size-5" />
                  </div>
                  <div>
                    <p className="max-w-[280px] truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {file.name}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {(file.size / 1024).toFixed(1)} KB · Listo para procesar
                    </p>
                  </div>
                </div>
                {!uploading && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 text-slate-400 hover:text-slate-600 dark:text-slate-400 dark:hover:text-slate-200"
                    onClick={() => setFile(null)}
                  >
                    <X className="size-4" />
                  </Button>
                )}
              </div>

              {uploading && (
                <div className="mt-4 flex items-center gap-3 rounded-lg border border-blue-200 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-950/50 p-3 text-xs text-blue-700 dark:text-blue-300">
                  <Loader2 className="size-4 animate-spin shrink-0" />
                  <span>
                    El backend está procesando fechas en español y analizando vínculos CDC reprogramados...
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-zinc-800 bg-transparent">
          <Button
            type="button"
            className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-medium text-sm px-4 py-2 rounded-xl transition-colors shadow-sm"
            onClick={handleClose}
            disabled={uploading}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm px-4 py-2 rounded-xl shadow-sm transition-all"
            disabled={!file || uploading}
            onClick={handleUpload}
          >
            {uploading ? (
              <>
                <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
                Ingiriendo hoja...
              </>
            ) : (
              <>
                <CloudUpload className="size-4" data-icon="inline-start" />
                Procesar e Importar
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
