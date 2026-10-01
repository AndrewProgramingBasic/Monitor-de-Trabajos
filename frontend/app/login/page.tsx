'use client'

import React, { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { LoginView } from '@/components/login-view'
import { useAuth } from '@/lib/auth-context'
import { Loader2 } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const { isAuthenticated, isLoading } = useAuth()

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace('/')
    }
  }, [isAuthenticated, isLoading, router])

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8f9fa]">
        <Loader2 className="size-8 animate-spin text-[#0d6efd]" />
      </div>
    )
  }

  return <LoginView />
}
