/**
 * Auth types
 */

export type Role = 'ADMIN' | 'USER'

export interface User {
  id: string
  email: string
  role: Role
  status: string
  createdAt: string
}

export interface Company {
  id: string
  name: string
}

export interface AuthState {
  user: User | null
  company: Company | null
  isAuthenticated: boolean
  isLoading: boolean
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface RegisterData {
  companyName: string
  email: string
  password: string
}

export interface LoginResponse {
  accessToken: string
  user: {
    id: string
    companyId: string
    role: Role
  }
}

export interface RegisterResponse {
  company: Company
  user: {
    id: string
    email: string
    role: Role
  }
}

export interface MeResponse {
  user: User
  company: Company
}
