/**
 * Public API client
 * Handles public endpoints (no authentication required)
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? ''

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

export interface StartVisitResponse {
  visitId: string
}

export interface DeviceInfo {
  ua: string
  os: string
  isMobile: boolean
}

/**
 * Start tracking a visit
 * Call this when the experience page loads
 */
export async function startVisit(
  shareToken: string,
  device?: DeviceInfo
): Promise<StartVisitResponse> {
  const response = await fetch(`${API_URL}/api/public/visits/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      shareToken,
      device,
    }),
  })

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    const error = data?.error || {
      code: 'UNKNOWN_ERROR',
      message: 'An unexpected error occurred',
    }
    throw new PublicApiError(error.code, error.message, response.status)
  }

  return data as StartVisitResponse
}

/**
 * End tracking a visit
 * Call this when the user leaves the experience page
 */
export async function endVisit(
  visitId: string,
  durationMs: number,
  usedAR: boolean
): Promise<{ ok: boolean }> {
  const response = await fetch(`${API_URL}/api/public/visits/end`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      visitId,
      durationMs,
      usedAR,
    }),
  })

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    const error = data?.error || {
      code: 'UNKNOWN_ERROR',
      message: 'An unexpected error occurred',
    }
    throw new PublicApiError(error.code, error.message, response.status)
  }

  return data as { ok: boolean }
}

export const publicApi = {
  getExperience,
  startVisit,
  endVisit,
}
