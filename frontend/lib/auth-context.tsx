'use client'

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  api,
  getStoredToken,
  getStoredUser,
  setStoredSession,
  clearStoredSession,
  User,
  LoginResponse,
} from '@/lib/api'

interface AuthContextType {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (usernameOrEmail: string, password: string) => Promise<User>
  logout: () => void
  registerUser: (userData: {
    username: string
    email: string
    password: string
    full_name: string
  }) => Promise<User>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Initialize session from storage
  useEffect(() => {
    const existingToken = getStoredToken()
    const existingUser = getStoredUser()

    if (existingToken && existingUser) {
      setToken(existingToken)
      setUser(existingUser)

      // Optionally refresh user profile in background
      api
        .get<User>('/auth/me')
        .then((freshUser) => {
          if (freshUser && freshUser.id) {
            setUser(freshUser)
            setStoredSession(existingToken, freshUser)
          }
        })
        .catch(() => {
          // If token expired, clearStoredSession has already run via 401 interceptor
        })
        .finally(() => {
          setIsLoading(false)
        })
    } else {
      setIsLoading(false)
    }
  }, [])

  const login = useCallback(
    async (usernameOrEmail: string, password: string): Promise<User> => {
      const res = await api.post<LoginResponse>('/auth/login', {
        username_or_email: usernameOrEmail,
        password: password,
      })

      if (!res.access_token || !res.user) {
        throw new Error('Respuesta inválida del servidor al iniciar sesión.')
      }

      setStoredSession(res.access_token, res.user)
      sessionStorage.setItem('vpti-authenticated', 'true')
      setToken(res.access_token)
      setUser(res.user)
      return res.user
    },
    []
  )

  const logout = useCallback(() => {
    clearStoredSession()
    setToken(null)
    setUser(null)
    router.push('/login')
  }, [router])

  const registerUser = useCallback(
    async (userData: {
      username: string
      email: string
      password: string
      full_name: string
    }): Promise<User> => {
      const res = await api.post<User>('/users', userData)
      return res
    },
    []
  )

  const refreshUser = useCallback(async () => {
    if (!token) return
    try {
      const freshUser = await api.get<User>('/auth/me')
      if (freshUser) {
        setUser(freshUser)
        setStoredSession(token, freshUser)
      }
    } catch {
      // Ignored
    }
  }, [token])

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token && !!user,
        isLoading,
        login,
        logout,
        registerUser,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
