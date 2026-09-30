'use client'

import { LoginView } from '@/app/page'

export default function LoginPage() {
  return <LoginView onSignIn={() => { sessionStorage.setItem('vpti-authenticated', 'true'); window.location.href = '/' }} />
}
