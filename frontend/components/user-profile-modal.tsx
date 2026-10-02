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
import { Separator } from '@/components/ui/separator'
import { useAuth } from '@/lib/auth-context'
import { api, User as UserType } from '@/lib/api'
import { toast } from 'sonner'
import { User, Mail, KeyRound, Loader2, CheckCircle2, ShieldCheck, AlertCircle } from 'lucide-react'

interface UserProfileModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function UserProfileModal({ open, onOpenChange }: UserProfileModalProps) {
  const { user, updateUser } = useAuth()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    if (user && open) {
      setFullName(user.full_name || '')
      setEmail(user.email || '')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setErrorMsg(null)
    }
  }, [user, open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg(null)

    if (!fullName.trim()) {
      setErrorMsg('El nombre completo es requerido.')
      return
    }

    if (!email.trim()) {
      setErrorMsg('El correo electrónico es requerido.')
      return
    }

    if (newPassword || confirmPassword) {
      if (newPassword !== confirmPassword) {
        setErrorMsg('La confirmación de la contraseña no coincide.')
        return
      }
      if (newPassword.length < 6) {
        setErrorMsg('La nueva contraseña debe tener al menos 6 caracteres.')
        return
      }
      if (!currentPassword) {
        setErrorMsg('Debe ingresar su contraseña actual para establecer una nueva.')
        return
      }
    }

    setLoading(true)

    try {
      const payload: {
        full_name: string
        email: string
        current_password?: string
        new_password?: string
      } = {
        full_name: fullName.trim(),
        email: email.trim().toLowerCase(),
      }

      if (newPassword) {
        payload.current_password = currentPassword
        payload.new_password = newPassword
      }

      const updatedUser = await api.put<UserType>('/auth/me', payload)

      updateUser(updatedUser)
      toast.success('Perfil actualizado correctamente', {
        description: 'Tus datos de usuario han sido guardados.',
      })

      onOpenChange(false)
    } catch (err: any) {
      const msg = err?.message || 'Error al actualizar el perfil.'
      setErrorMsg(msg)
      toast.error('Error al actualizar perfil', {
        description: msg,
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-xl p-6 text-slate-900 dark:text-slate-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
            <User className="size-5 text-blue-600 dark:text-blue-400" />
            Mi Perfil de Usuario
          </DialogTitle>
          <DialogDescription className="text-slate-500 dark:text-slate-400">
            Administra tus datos personales y credenciales de acceso a VPTI Task Monitor.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 py-2">
          {errorMsg && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 p-3 text-xs text-red-700 dark:text-red-300">
              <AlertCircle className="size-4 shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800/80 p-3 text-xs flex items-center justify-between">
            <div>
              <p className="font-semibold text-slate-700 dark:text-slate-200">Nombre de usuario</p>
              <p className="mt-0.5 font-mono text-slate-500 dark:text-slate-400">@{user?.username}</p>
            </div>
            <span className="text-[11px] bg-slate-200/80 dark:bg-zinc-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded font-mono">
              ID #{user?.id}
            </span>
          </div>

          <div>
            <Label htmlFor="profile-fullname" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Nombre completo
            </Label>
            <div className="relative mt-1.5">
              <Input
                id="profile-fullname"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                disabled={loading}
                className="h-10 text-xs border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="profile-email" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Correo electrónico institucional
            </Label>
            <div className="relative mt-1.5">
              <Input
                id="profile-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                className="h-10 text-xs border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <Separator className="my-1 dark:border-zinc-800" />

          <div>
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-1.5">
              <KeyRound className="size-3.5 text-slate-400" />
              Cambio de Contraseña (Opcional)
            </p>

            <div className="space-y-3">
              <div>
                <Label htmlFor="profile-current-pw" className="text-[11px] text-slate-500 dark:text-slate-400">
                  Contraseña actual (solo si vas a cambiarla)
                </Label>
                <Input
                  id="profile-current-pw"
                  type="password"
                  placeholder="••••••••"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  disabled={loading}
                  className="mt-1 h-9 text-xs border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <Label htmlFor="profile-new-pw" className="text-[11px] text-slate-500 dark:text-slate-400">
                  Nueva contraseña
                </Label>
                <Input
                  id="profile-new-pw"
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={loading}
                  className="mt-1 h-9 text-xs border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <Label htmlFor="profile-confirm-pw" className="text-[11px] text-slate-500 dark:text-slate-400">
                  Confirmar nueva contraseña
                </Label>
                <Input
                  id="profile-confirm-pw"
                  type="password"
                  placeholder="Repite la nueva contraseña"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={loading}
                  className="mt-1 h-9 text-xs border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-zinc-800 bg-transparent">
            <Button
              type="button"
              className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-medium text-xs px-4 py-2 rounded-xl transition-colors shadow-sm"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs px-4 py-2 rounded-xl shadow-sm transition-all"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="size-3.5 animate-spin mr-1.5" />
                  Guardando...
                </>
              ) : (
                'Guardar Cambios'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

