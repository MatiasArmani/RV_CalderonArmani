'use client'

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { api, setAccessToken, getAccessToken, ApiClientError } from '../api'
import {
  AuthState,
  User,
  Company,
  LoginCredentials,
  RegisterData,
  LoginResponse,
  RegisterResponse,
  MeResponse,
} from './types'

interface AuthContextValue extends AuthState {
  login: (credentials: LoginCredentials) => Promise<void>
  register: (data: RegisterData) => Promise<void>
  logout: () => Promise<void>
  refreshAuth: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const initialState: AuthState = {
  user: null,
  company: null,
  isAuthenticated: false,
  isLoading: true,
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(initialState)

  // Fetch current user info
  const fetchUser = useCallback(async (): Promise<boolean> => {
    try {
      const data = await api.get<MeResponse>('/api/auth/me')
      setState({
        user: data.user,
        company: data.company,
        isAuthenticated: true,
        isLoading: false,
      })
      return true
    } catch (error) {
      setState({
        user: null,
        company: null,
        isAuthenticated: false,
        isLoading: false,
      })
      return false
    }
  }, [])

  // Try to refresh token
  const refreshAuth = useCallback(async () => {
    const currentToken = getAccessToken()
    if (!currentToken) {
      setState(prev => ({ ...prev, isLoading: false }))
      return
    }

    try {
      const data = await api.post<{ accessToken: string }>('/api/auth/refresh')
      setAccessToken(data.accessToken)
      await fetchUser()
    } catch (error) {
      setAccessToken(null)
      setState({
        user: null,
        company: null,
        isAuthenticated: false,
        isLoading: false,
      })
    }
  }, [fetchUser])

  // Initialize auth state on mount
  useEffect(() => {
    const storedToken = typeof window !== 'undefined'
      ? sessionStorage.getItem('accessToken')
      : null

    if (storedToken) {
      setAccessToken(storedToken)
      fetchUser().then(success => {
        if (!success) {
          // Token might be expired, try refresh
          refreshAuth()
        }
      })
    } else {
      setState(prev => ({ ...prev, isLoading: false }))
    }
  }, [fetchUser, refreshAuth])

  // Login
  const login = useCallback(async (credentials: LoginCredentials) => {
    setState(prev => ({ ...prev, isLoading: true }))

    try {
      const data = await api.post<LoginResponse>('/api/auth/login', credentials)

      // Store token
      setAccessToken(data.accessToken)
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('accessToken', data.accessToken)
      }

      // Fetch full user info
      await fetchUser()
    } catch (error) {
      setState(prev => ({ ...prev, isLoading: false }))
      throw error
    }
  }, [fetchUser])

  // Register
  const register = useCallback(async (data: RegisterData) => {
    setState(prev => ({ ...prev, isLoading: true }))

    try {
      await api.post<RegisterResponse>('/api/auth/register', data)

      // Auto-login after registration
      await login({ email: data.email, password: data.password })
    } catch (error) {
      setState(prev => ({ ...prev, isLoading: false }))
      throw error
    }
  }, [login])

  // Logout
  const logout = useCallback(async () => {
    try {
      await api.post('/api/auth/logout')
    } catch {
      // Ignore errors - logout should always succeed locally
    } finally {
      setAccessToken(null)
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('accessToken')
      }
      setState({
        user: null,
        company: null,
        isAuthenticated: false,
        isLoading: false,
      })
    }
  }, [])

  const value: AuthContextValue = {
    ...state,
    login,
    register,
    logout,
    refreshAuth,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
