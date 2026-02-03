/**
 * API client for backend communication
 * Handles auth tokens, refresh, and error responses
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

export interface ApiError {
  code: string
  message: string
  details?: Array<{ field?: string; message?: string }>
}

export class ApiClientError extends Error {
  public readonly code: string
  public readonly statusCode: number
  public readonly details?: ApiError['details']

  constructor(error: ApiError, statusCode: number) {
    super(error.message)
    this.code = error.code
    this.statusCode = statusCode
    this.details = error.details
  }
}

// Store access token in memory (not localStorage for security)
let accessToken: string | null = null

export function setAccessToken(token: string | null) {
  accessToken = token
}

export function getAccessToken(): string | null {
  return accessToken
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
}

async function request<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { body, headers: customHeaders, ...rest } = options

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...customHeaders,
  }

  if (accessToken) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${accessToken}`
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...rest,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include', // Include cookies (for refresh token)
  })

  // Handle 401 - attempt refresh
  if (response.status === 401 && accessToken) {
    // TODO: Implement token refresh logic
    // For now, just clear the token
    setAccessToken(null)
  }

  // Parse response
  const data = await response.json().catch(() => null)

  if (!response.ok) {
    const error = data?.error || {
      code: 'UNKNOWN_ERROR',
      message: 'An unexpected error occurred',
    }
    throw new ApiClientError(error, response.status)
  }

  return data as T
}

// Convenience methods
export const api = {
  get: <T>(endpoint: string, options?: RequestOptions) =>
    request<T>(endpoint, { ...options, method: 'GET' }),

  post: <T>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    request<T>(endpoint, { ...options, method: 'POST', body }),

  patch: <T>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    request<T>(endpoint, { ...options, method: 'PATCH', body }),

  delete: <T>(endpoint: string, options?: RequestOptions) =>
    request<T>(endpoint, { ...options, method: 'DELETE' }),
}
