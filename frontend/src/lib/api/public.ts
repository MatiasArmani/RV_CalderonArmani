/**
 * Public API client
 * Handles public endpoints (no authentication required)
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

export interface PublicExperience {
  product: {
    name: string
    versionLabel: string
  }
  assets: {
    glbUrl: string
    thumbUrl: string | null
    usdzUrl: string | null
  }
  share: {
    expiresAt: string
    remainingVisits: number | null
  }
}

export class PublicApiError extends Error {
  public readonly code: string
  public readonly statusCode: number

  constructor(code: string, message: string, statusCode: number) {
    super(message)
    this.code = code
    this.statusCode = statusCode
  }
}

/**
 * Get public experience data by share token
 */
export async function getExperience(token: string): Promise<PublicExperience> {
  const response = await fetch(`${API_URL}/api/public/experience/${token}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    const error = data?.error || {
      code: 'UNKNOWN_ERROR',
      message: 'An unexpected error occurred',
    }
    throw new PublicApiError(error.code, error.message, response.status)
  }

  return data as PublicExperience
}

export const publicApi = {
  getExperience,
}
