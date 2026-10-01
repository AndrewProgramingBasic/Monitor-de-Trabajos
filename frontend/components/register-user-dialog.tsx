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
import { UserPlus, Loader2, AlertCircle } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { toast } from 'sonner'

interface RegisterUserDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RegisterUserDialog({
  open,
  onOpenChange,
}: RegisterUserDialogProps) {
  const { registerUser } = useAuth()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  function resetForm() {
    setFullName('')
    setEmail('')
    setUsername('')
    setPassword('')
    setErrorMsg(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!fullName.trim() || !email.trim() || !username.trim() || !password) {
      setErrorMsg('Todos los campos son obligatorios.')
      return
    }

    setLoading(true)
    setErrorMsg(null)

    try {
      const newUser = await registerUser({
        full_name: fullName.trim(),
        email: email.trim(),
        username: username.trim(),
        password,
      })

      toast.success('Usuario registrado exitosamente', {
        description: `Se creó la cuenta para ${newUser.full_name} (${newUser.username})`,
      })

      resetForm()
      onOpenChange(false)
    } catch (err: any) {
      const msg = err?.message || 'Error al registrar el usuario en el sistema.'
      setErrorMsg(msg)
      toast.error('Error al registrar usuario', {
        description: msg,
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(val) => { if (!loading) { onOpenChange(val); if (!val) resetForm(); } }}>
      <DialogContent className="max-w-md bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-xl p-6 text-slate-900 dark:text-slate-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
            <UserPlus className="size-5 text-blue-600 dark:text-blue-400" />
            Registrar nuevo usuario
          </DialogTitle>
          <DialogDescription className="text-slate-500 dark:text-slate-400">
            Crea un acceso autorizado para un nuevo miembro del comité técnico VPTI.
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
            <Label htmlFor="reg-fullname" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Nombre completo
            </Label>
            <Input
              id="reg-fullname"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="ej: María Castillo"
              required
              disabled={loading}
              className="mt-1.5 h-10 border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
            />
          </div>

          <div>
            <Label htmlFor="reg-email" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Correo electrónico institucional
            </Label>
            <Input
              id="reg-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="mcastillo@empresa.com"
              required
              disabled={loading}
              className="mt-1.5 h-10 border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
            />
          </div>

          <div>
            <Label htmlFor="reg-username" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Nombre de usuario
            </Label>
            <Input
              id="reg-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="mcastillo"
              required
              disabled={loading}
              className="mt-1.5 h-10 border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
            />
          </div>

          <div>
            <Label htmlFor="reg-password" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Contraseña inicial
            </Label>
            <Input
              id="reg-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              disabled={loading}
              className="mt-1.5 h-10 border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
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
                  Registrando...
                </>
              ) : (
                'Registrar Usuario'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
