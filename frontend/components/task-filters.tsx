'use client'

import React from 'react'
import { Search, X, RotateCcw } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CommitteeSheet } from '@/lib/api'

export interface TaskFiltersProps {
  search: string
  onSearchChange: (value: string) => void
  statusFilter: string
  onStatusFilterChange: (value: string) => void
  affectationFilter: string
  onAffectationFilterChange: (value: string) => void
  rescheduledFilter: boolean
  onRescheduledFilterChange: (value: boolean) => void
  onResetFilters: () => void
  // Optional sheet selector for history view
  sheets?: CommitteeSheet[]
  selectedSheetId?: string
  onSheetIdChange?: (sheetId: string) => void
  loadingSheets?: boolean
  formatDateOnly?: (iso: string | null | undefined) => string
}

export function TaskFilters({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  affectationFilter,
  onAffectationFilterChange,
  rescheduledFilter,
  onRescheduledFilterChange,
  onResetFilters,
  sheets,
  selectedSheetId,
  onSheetIdChange,
  loadingSheets = false,
  formatDateOnly,
}: TaskFiltersProps) {
  const isFiltered =
    Boolean(search) ||
    (statusFilter && statusFilter !== 'all') ||
    (affectationFilter && affectationFilter !== 'all') ||
    rescheduledFilter ||
    (selectedSheetId && selectedSheetId !== 'all')

  return (
    <div className="space-y-3.5">
      {/* Filters grid / flex container */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-12 items-end">
        {/* 1. Search by title or CDC */}
        <div className={sheets ? 'lg:col-span-3' : 'lg:col-span-4'}>
          <Label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
            Buscar por título o CDC...
          </Label>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 size-4 text-slate-400 pointer-events-none" />
            <Input
              type="text"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Ej. Switch, 39000925..."
              className="w-full pl-9 pr-8 h-10 text-xs bg-white text-slate-800 border border-slate-200 rounded-lg shadow-sm placeholder:text-slate-400 hover:border-slate-300 focus:ring-2 focus:ring-blue-500"
            />
            {search && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 transition-colors"
                title="Limpiar búsqueda"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        </div>

        {/* Optional Committee Sheet filter (if provided) */}
        {sheets && onSheetIdChange && (
          <div className="lg:col-span-3">
            <Label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Matriz / Hoja de Comité
            </Label>
            <Select
              value={selectedSheetId || 'all'}
              onValueChange={(val) => onSheetIdChange(val || 'all')}
              disabled={loadingSheets}
            >
              <SelectTrigger className="h-10 bg-white border border-slate-200 text-slate-800 rounded-lg px-3 py-2 text-sm shadow-sm hover:border-slate-300 focus:ring-2 focus:ring-blue-500">
                <SelectValue placeholder="Todas las matrices">
                  {(val) => {
                    if (!val || val === 'all') return 'Todas las matrices'
                    const s = sheets.find((item) => String(item.id) === String(val))
                    return s ? (s.committee_name || s.filename) : 'Todas las matrices'
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="bg-white text-slate-800 border border-slate-200 shadow-xl rounded-xl p-1 z-50 min-w-[240px] max-h-72 w-auto">
                <SelectItem value="all">Todas las matrices ({sheets.length})</SelectItem>
                {sheets.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    <div className="flex items-center gap-2">
                      <span className="truncate max-w-[200px]">{s.committee_name || s.filename}</span>
                      {formatDateOnly && (
                        <span className="text-[11px] text-slate-400">
                          ({formatDateOnly(s.uploaded_at)})
                        </span>
                      )}
                      {s.is_latest && (
                        <span className="rounded bg-blue-100 text-blue-700 px-1.5 py-0.2 text-[10px] font-bold">
                          Activa
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* 2. Execution Status filter */}
        <div className={sheets ? 'lg:col-span-2' : 'lg:col-span-3'}>
          <Label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
            Estado
          </Label>
          <Select
            value={statusFilter || 'all'}
            onValueChange={(val) => onStatusFilterChange(val || 'all')}
          >
            <SelectTrigger className="h-10 bg-white border border-slate-200 text-slate-800 rounded-lg px-3 py-2 text-sm shadow-sm hover:border-slate-300 focus:ring-2 focus:ring-blue-500">
              <SelectValue placeholder="Todos los estados">
                {(val) => {
                  if (!val || val === 'all') return 'Todos los estados'
                  if (val === 'PROXIMO') return 'PROXIMO (ALERTAS / PREAVISO)'
                  return val
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="bg-white text-slate-800 border border-slate-200 shadow-xl rounded-xl p-1 z-50 min-w-[220px] w-auto">
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="PROGRAMADO">PROGRAMADO</SelectItem>
              <SelectItem value="PROXIMO">PROXIMO (ALERTAS / PREAVISO)</SelectItem>
              <SelectItem value="EN EJECUCION">EN EJECUCION</SelectItem>
              <SelectItem value="TERMINADO">TERMINADO</SelectItem>
              <SelectItem value="SUSPENDIDO">SUSPENDIDO</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* 3. Affectation filter */}
        <div className={sheets ? 'lg:col-span-2' : 'lg:col-span-2'}>
          <Label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
            Afectación
          </Label>
          <Select
            value={affectationFilter || 'all'}
            onValueChange={(val) => onAffectationFilterChange(val || 'all')}
          >
            <SelectTrigger className="h-10 bg-white border border-slate-200 text-slate-800 rounded-lg px-3 py-2 text-sm shadow-sm hover:border-slate-300 focus:ring-2 focus:ring-blue-500">
              <SelectValue placeholder="Todas las afectaciones">
                {(val) => {
                  if (!val || val === 'all') return 'Todas las afectaciones'
                  if (val === 'SI') return 'SI - Con afectación'
                  if (val === 'NO') return 'NO - Sin afectación'
                  return val
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="bg-white text-slate-800 border border-slate-200 shadow-xl rounded-xl p-1 z-50 min-w-[220px] w-auto">
              <SelectItem value="all">Todas las afectaciones</SelectItem>
              <SelectItem value="SI">SI - Con afectación</SelectItem>
              <SelectItem value="NO">NO - Sin afectación</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* 4. Rescheduled Switch (aligned vertically with label) */}
        <div className={sheets ? 'lg:col-span-2' : 'lg:col-span-3'}>
          <div className="flex h-10 w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 shadow-sm hover:border-slate-300 transition-colors">
            <Label
              htmlFor="rescheduled-toggle"
              className="text-xs font-semibold text-slate-800 cursor-pointer select-none"
            >
              Solo reprogramaciones
            </Label>
            <Switch
              id="rescheduled-toggle"
              checked={rescheduledFilter}
              onCheckedChange={onRescheduledFilterChange}
            />
          </div>
        </div>
      </div>

      {/* 5. Reset filters bar (if any filter is active) */}
      {isFiltered && (
        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-slate-500 font-medium">
            Filtros activos aplicados a la lista de tareas.
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onResetFilters}
            className="h-8 text-xs font-semibold text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-2.5 rounded-lg inline-flex items-center gap-1.5 transition-colors"
          >
            <RotateCcw className="size-3.5" />
            Restablecer filtros
          </Button>
        </div>
      )}
    </div>
  )
}

