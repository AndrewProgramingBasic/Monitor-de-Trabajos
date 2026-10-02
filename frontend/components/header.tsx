'use client'

import React, { useState, useMemo } from 'react'
import Link from 'next/link'
import {
  Bell,
  BellRing,
  ClipboardList,
  ChevronDown,
  Loader2,
  LogOut,
  Menu,
  Send,
  User,
  UserPlus,
  X,
  History,
  LayoutDashboard,
} from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useAuth } from '@/lib/auth-context'

interface HeaderProps {
  activeTab: 'active' | 'history'
  pushEnabled: boolean
  pushProcessing: boolean
  onTogglePush: () => void
  onSendTestPush?: () => void
  onOpenRegisterUser: () => void
  onOpenProfile: () => void
}

export function Header({
  activeTab,
  pushEnabled,
  pushProcessing,
  onTogglePush,
  onSendTestPush,
  onOpenRegisterUser,
  onOpenProfile,
}: HeaderProps) {
  const { user, logout } = useAuth()
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const initials = useMemo(() => {
    if (!user?.full_name) return 'VT'
    return user.full_name
      .split(' ')
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase()
  }, [user])

  return (
    <>
      <header className="border-b border-[#dee2e6] dark:border-zinc-800 bg-white dark:bg-zinc-900 sticky top-0 z-30 shadow-xs">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-4 py-3.5 lg:px-8">
          {/* Logo & Navigation */}
          <div className="flex min-w-0 items-center gap-3 sm:gap-6">
            <Link href="/" className="flex min-w-0 items-center gap-3 hover:opacity-95 transition-opacity">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#0d6efd] text-white shadow-xs">
                <ClipboardList className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-base font-bold tracking-tight text-slate-900 dark:text-white">
                  VPTI Task Monitor
                </p>
                <p className="hidden text-xs text-slate-500 dark:text-slate-400 sm:block">
                  Comité técnico de infraestructura y telecomunicaciones
                </p>
              </div>
            </Link>

            {/* Desktop Navigation Links */}
            <nav className="hidden md:flex items-center gap-1.5 border-l border-slate-200 dark:border-zinc-800 pl-3 sm:pl-5">
              <Link
                href="/"
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors shadow-xs ${
                  activeTab === 'active'
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-zinc-800'
                }`}
              >
                Semana activa
              </Link>
              <Link
                href="/history"
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  activeTab === 'history'
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 font-semibold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-zinc-800'
                }`}
              >
                Histórico general
              </Link>
            </nav>
          </div>

          {/* Desktop Actions (md and up) */}
          <div className="hidden md:flex items-center gap-2">
            {/* Push Notifications Toggle */}
            <Button
              variant="outline"
              disabled={pushProcessing}
              className={`font-medium text-xs px-3 py-2 rounded-lg inline-flex items-center gap-2 transition-colors shadow-none ${
                pushEnabled
                  ? 'border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-700 border border-slate-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-slate-200 dark:border-zinc-700'
              }`}
              onClick={onTogglePush}
            >
              {pushProcessing ? (
                <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
              ) : pushEnabled ? (
                <BellRing className="size-4 text-emerald-600 dark:text-emerald-400" data-icon="inline-start" />
              ) : (
                <Bell className="size-4" data-icon="inline-start" />
              )}
              {pushEnabled ? 'Notificaciones activas' : 'Activar notificaciones'}
            </Button>

            {/* Test Push button */}
            {pushEnabled && onSendTestPush && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-800 flex"
                onClick={onSendTestPush}
                title="Enviar notificación de prueba"
              >
                <Send className="size-3.5 mr-1" />
                Probar push
              </Button>
            )}

            {/* Register User Button */}
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs px-3.5 py-2 rounded-lg shadow-sm transition-all inline-flex items-center gap-2"
              onClick={onOpenRegisterUser}
            >
              <UserPlus className="size-4" data-icon="inline-start" />
              <span>Registrar usuario</span>
            </Button>

            {/* User Profile Dropdown Button */}
            <div className="relative">
              <Button
                variant="ghost"
                className="flex h-auto items-center gap-2 rounded-full px-1.5 py-1 hover:bg-slate-100 dark:hover:bg-zinc-800"
                aria-expanded={profileDropdownOpen}
                onClick={() => setProfileDropdownOpen((prev) => !prev)}
              >
                <Avatar className="size-9 border border-[#dee2e6] dark:border-zinc-700">
                  <AvatarFallback className="bg-blue-50 dark:bg-blue-950/60 text-xs font-bold text-[#0d6efd] dark:text-blue-400">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden text-left lg:block">
                  <span className="block text-xs font-semibold text-slate-900 dark:text-white truncate max-w-[130px]">
                    {user?.full_name}
                  </span>
                  <span className="block text-[10px] text-slate-500 dark:text-slate-400">
                    @{user?.username}
                  </span>
                </span>
                <ChevronDown className="hidden size-4 text-slate-400 sm:block" />
              </Button>

              {profileDropdownOpen && (
                <div
                  className="absolute right-0 top-12 z-40 w-64 rounded-xl border border-[#dee2e6] dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 shadow-xl"
                  onClick={() => setProfileDropdownOpen(false)}
                >
                  <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                    {user?.full_name}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {user?.email}
                  </p>
                  <p className="mt-1 text-[11px] font-mono text-slate-400 dark:text-slate-500">
                    Usuario: @{user?.username}
                  </p>
                  <Separator className="my-2.5 dark:border-zinc-800" />
                  <Button
                    variant="ghost"
                    className="w-full justify-start text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-zinc-800"
                    onClick={(e) => {
                      e.stopPropagation()
                      setProfileDropdownOpen(false)
                      onOpenProfile()
                    }}
                  >
                    <User className="size-3.5 mr-2 text-blue-600" />
                    Mi Perfil
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full justify-start text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-700 dark:hover:text-red-300 mt-1"
                    onClick={(e) => {
                      e.stopPropagation()
                      setProfileDropdownOpen(false)
                      logout()
                    }}
                  >
                    <LogOut className="size-3.5 mr-2" />
                    Cerrar sesión
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Mobile Right Controls (< md) */}
          <div className="flex md:hidden items-center gap-1.5">
            {/* Quick Push Notification Bell Icon */}
            <Button
              variant="outline"
              size="icon"
              disabled={pushProcessing}
              className={`rounded-lg ${
                pushEnabled
                  ? 'border border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 dark:bg-zinc-800 dark:text-slate-200 dark:border-zinc-700'
              }`}
              aria-label="Notificaciones"
              onClick={onTogglePush}
            >
              {pushProcessing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : pushEnabled ? (
                <BellRing className="size-4 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <Bell className="size-4 text-slate-600 dark:text-slate-400" />
              )}
            </Button>

            {/* Mobile Hamburger Menu Button */}
            <Button
              variant="ghost"
              size="icon"
              className="rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-zinc-800"
              aria-label="Abrir menú de navegación"
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu className="size-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Mobile Drawer / Collapsible Sheet */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex justify-end md:hidden">
          {/* Backdrop overlay */}
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Drawer Content */}
          <div className="relative z-50 flex h-full w-[85%] max-w-sm flex-col bg-white dark:bg-zinc-900 border-l border-slate-200 dark:border-zinc-800 shadow-2xl p-5">
            {/* Drawer Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#0d6efd] text-white">
                  <ClipboardList className="size-4" />
                </div>
                <span className="font-bold text-sm text-slate-900 dark:text-white">Menú Principal</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:hover:bg-zinc-800"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Cerrar menú"
              >
                <X className="size-5" />
              </Button>
            </div>

            {/* User Profile Card */}
            <div className="my-4 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800/80 p-3.5">
              <div className="flex items-center gap-3">
                <Avatar className="size-10 border border-[#dee2e6] dark:border-zinc-600">
                  <AvatarFallback className="bg-blue-100 dark:bg-blue-950 text-sm font-bold text-blue-700 dark:text-blue-300">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-slate-900 dark:text-white">{user?.full_name}</p>
                  <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{user?.email}</p>
                  <p className="font-mono text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">@{user?.username}</p>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-slate-200 dark:border-zinc-700">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs font-semibold bg-white dark:bg-zinc-900 border-slate-300 dark:border-zinc-700 justify-center gap-1.5"
                  onClick={() => {
                    setMobileMenuOpen(false)
                    onOpenProfile()
                  }}
                >
                  <User className="size-3.5 text-blue-600" />
                  Editar mi perfil
                </Button>
              </div>
            </div>

            {/* Mobile Navigation Links */}
            <div className="space-y-1 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2 px-1">
                Navegación
              </p>
              <Link
                href="/"
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                  activeTab === 'active'
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                    : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-zinc-800'
                }`}
              >
                <LayoutDashboard className="size-4" />
                Semana activa (Matriz actual)
              </Link>
              <Link
                href="/history"
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                  activeTab === 'history'
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                    : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-zinc-800'
                }`}
              >
                <History className="size-4" />
                Histórico general
              </Link>
            </div>

            <Separator className="my-3 dark:border-zinc-800" />

            {/* Mobile Operational Actions */}
            <div className="space-y-2 py-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2 px-1">
                Operaciones
              </p>
              {/* Push Toggle in Drawer */}
              <button
                type="button"
                onClick={onTogglePush}
                disabled={pushProcessing}
                className={`w-full flex items-center justify-between p-3 rounded-xl border text-xs font-medium transition-colors ${
                  pushEnabled
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                    : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-slate-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  {pushEnabled ? (
                    <BellRing className="size-4 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <Bell className="size-4 text-slate-500" />
                  )}
                  <span>{pushEnabled ? 'Notificaciones Push (Activas)' : 'Activar Notificaciones Push'}</span>
                </div>
                {pushProcessing && <Loader2 className="size-3.5 animate-spin" />}
              </button>

              {/* Test push in Drawer */}
              {pushEnabled && onSendTestPush && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs justify-center gap-1.5 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-zinc-700"
                  onClick={onSendTestPush}
                >
                  <Send className="size-3.5 text-blue-600" />
                  Enviar prueba push
                </Button>
              )}

              {/* Register User in Drawer */}
              <Button
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs py-2 rounded-xl shadow-sm justify-center gap-2 mt-2"
                onClick={() => {
                  setMobileMenuOpen(false)
                  onOpenRegisterUser()
                }}
              >
                <UserPlus className="size-4" />
                Registrar nuevo usuario
              </Button>
            </div>

            {/* Logout at bottom */}
            <div className="mt-auto pt-4 border-t border-slate-200 dark:border-zinc-800">
              <Button
                variant="ghost"
                className="w-full justify-center text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-700 dark:hover:text-red-300"
                onClick={() => {
                  setMobileMenuOpen(false)
                  logout()
                }}
              >
                <LogOut className="size-4 mr-2" />
                Cerrar sesión
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

