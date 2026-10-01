'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ClipboardList, Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/lib/auth-context'
import { toast } from 'sonner'

interface LoginViewProps {
  onSignIn?: () => void
}

export function LoginView({ onSignIn }: LoginViewProps) {
  const router = useRouter()
  const { login } = useAuth()
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMsg(null)
    setLoading(true)

    try {
      const user = await login(username, password)
      toast.success('Sesión iniciada correctamente', {
        description: `Bienvenido, ${user.full_name}`,
      })

      if (onSignIn) {
        onSignIn()
      } else {
        router.push('/')
      }
    } catch (err: any) {
      const message =
        err?.message || 'Error al iniciar sesión. Verifique sus credenciales.'
      setErrorMsg(message)
      toast.error('Error de autenticación', {
        description: message,
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-100 dark:bg-zinc-950 px-4 py-10 text-zinc-900 dark:text-zinc-100">
      <Card className="w-full max-w-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xl overflow-hidden rounded-2xl">
        <CardHeader className="items-center pb-3 text-center">
          <div className="mb-3 flex size-14 items-center justify-center rounded-xl bg-[#0d6efd] text-white shadow-md">
            <ClipboardList className="size-7" />
          </div>
          <CardTitle className="text-xl font-bold text-zinc-900 dark:text-white">
            VPTI Task Monitor
          </CardTitle>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Inicie sesión para acceder a la programación y alertas operativas
          </p>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            {errorMsg && (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 p-3 text-xs text-red-700 dark:text-red-300">
                <AlertCircle className="size-4 shrink-0 text-red-600 dark:text-red-400" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div>
              <Label
                htmlFor="login-username"
                className="text-zinc-900 dark:text-white font-semibold text-sm"
              >
                Usuario o Correo Corporativo
              </Label>
              <Input
                id="login-username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="ej: aandra05 o nombre@empresa.com"
                className="mt-1.5 h-11 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-300 dark:border-zinc-700 placeholder:text-zinc-400 focus:bg-white dark:focus:bg-zinc-900"
                required
                autoComplete="username"
                disabled={loading}
              />
            </div>

            <div>
              <Label
                htmlFor="login-password"
                className="text-zinc-900 dark:text-white font-semibold text-sm"
              >
                Contraseña
              </Label>
              <div className="relative mt-1.5">
                <Input
                  id="login-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Ingrese su contraseña"
                  className="h-11 pr-11 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-300 dark:border-zinc-700 placeholder:text-zinc-400 focus:bg-white dark:focus:bg-zinc-900"
                  required
                  autoComplete="current-password"
                  disabled={loading}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-transparent"
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                  onClick={() => setShowPassword((value) => !value)}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
              <span className="inline-flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300">
                <span className="size-2 rounded-full bg-emerald-500" />
                API Conectada (127.0.0.1:5000)
              </span>
              <span>Acceso seguro JWT</span>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="mt-2 h-11 w-full bg-[#0d6efd] font-semibold text-white hover:bg-[#0b5ed7] shadow-sm transition-colors"
            >
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
                  Verificando credenciales...
                </>
              ) : (
                'Iniciar Sesión'
              )}
            </Button>
          </form>

          <div className="mt-6 border-t border-zinc-200 dark:border-zinc-800 pt-4 text-center">
            <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">
              Acceso restringido al personal del comité técnico de infraestructura VPTI. Para solicitar un nuevo acceso, contacte al administrador.
            </p>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
