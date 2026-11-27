/**
 * Centralized API Client for Hindustan Hardware & Sanitary Frontend.
 * Communicates with the Express + TypeScript backend.
 */

export const getApiBaseUrl = (): string => {
  const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined
  if (configuredBaseUrl?.trim()) {
    const trimmed = configuredBaseUrl.trim().replace(/\/$/, "")
    // If running in browser and configured URL points to localhost/127.0.0.1 while accessing from a LAN IP (e.g. mobile)
    if (typeof window !== "undefined" && window.location?.hostname) {
      const hostname = window.location.hostname
      if (hostname !== "localhost" && hostname !== "127.0.0.1") {
        return trimmed.replace(/\/\/(localhost|127\.0\.0\.1)(:\d+)?/, `//${hostname}:5000`)
      }
    }
    return trimmed
  }

  if (typeof window !== "undefined" && window.location?.hostname) {
    return `http://${window.location.hostname}:5000/api/v1`
  }

  return "http://localhost:5000/api/v1"
}

const API_BASE_URL: string = getApiBaseUrl()

export interface ApiResponse<T = any> {
  success: boolean
  message?: string
  data?: T
  error?: {
    code?: string
    message: string
    details?: any
  }
}

export class ApiError extends Error {
  statusCode: number
  code?: string
  details?: any

  constructor(message: string, statusCode: number, code?: string, details?: any) {
    super(message)
    this.name = "ApiError"
    this.statusCode = statusCode
    this.code = code
    this.details = details
  }
}

const SESSION_RETENTION_MS = 30 * 24 * 60 * 60 * 1000
const LEGACY_SESSION_RETENTION_MS = 10 * 24 * 60 * 60 * 1000

interface StoredAuthSession {
  accessToken: string
  refreshToken?: string | null
  expiresAt: number
  version?: 2
}

let cachedSession: StoredAuthSession | null = null

function readStoredSession(): StoredAuthSession | null {
  const raw = localStorage.getItem("hh_auth_session")
  if (!raw) return null

  const session = JSON.parse(raw) as StoredAuthSession
  if (!session.accessToken) return null

  if (session.version !== 2) {
    const previousExpiry = Number(session.expiresAt)
    session.expiresAt =
      session.refreshToken && Number.isFinite(previousExpiry)
        ? previousExpiry + SESSION_RETENTION_MS - LEGACY_SESSION_RETENTION_MS
        : Date.now() + SESSION_RETENTION_MS
    session.version = 2
    localStorage.setItem("hh_auth_session", JSON.stringify(session))
  }

  if (!Number.isFinite(session.expiresAt)) return null
  return session
}

export const tokenStorage = {
  get: (): string | null => {
    if (cachedSession) {
      if (Date.now() > cachedSession.expiresAt) {
        tokenStorage.clear()
        return null
      }
      return cachedSession.accessToken
    }

    try {
      const session = readStoredSession()
      if (!session || Date.now() > session.expiresAt) {
        tokenStorage.clear()
        return null
      }
      cachedSession = session
      return session.accessToken
    } catch {
      tokenStorage.clear()
      return null
    }
  },

  getRefreshToken: (): string | null => {
    if (cachedSession) {
      if (Date.now() > cachedSession.expiresAt) {
        tokenStorage.clear()
        return null
      }
      return cachedSession.refreshToken || null
    }

    try {
      const session = readStoredSession()
      if (!session || !session.refreshToken || Date.now() > session.expiresAt) {
        tokenStorage.clear()
        return null
      }
      cachedSession = session
      return session.refreshToken
    } catch {
      return null
    }
  },

  set: (accessToken: string | null, refreshToken?: string | null): void => {
    if (!accessToken) {
      tokenStorage.clear()
      return
    }

    const session: StoredAuthSession = {
      accessToken,
      refreshToken: refreshToken || tokenStorage.getRefreshToken(),
      expiresAt: Date.now() + SESSION_RETENTION_MS,
      version: 2,
    }
    cachedSession = session

    try {
      localStorage.setItem("hh_auth_session", JSON.stringify(session))
      // Backwards-compat legacy key removal
      localStorage.removeItem("hh_access_token")
    } catch {
      // Ignore localStorage failure in restricted contexts
    }
  },

  clear: (): void => {
    cachedSession = null
    try {
      localStorage.removeItem("hh_auth_session")
      localStorage.removeItem("hh_access_token")
      localStorage.removeItem("hh_auth_user")
    } catch {
      // Ignore
    }
  },
}

interface RequestOptions extends RequestInit {
  requiresAuth?: boolean
  tokenOverride?: string
  _isRetry?: boolean
}

type RefreshResult = "refreshed" | "invalid" | "unavailable"
let refreshInFlight: Promise<RefreshResult> | null = null

function refreshSession(): Promise<RefreshResult> {
  if (refreshInFlight) return refreshInFlight

  const refreshToken = tokenStorage.getRefreshToken()
  if (!refreshToken) {
    tokenStorage.clear()
    return Promise.resolve("invalid")
  }

  refreshInFlight = (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      })

      if (response.ok) {
        const body = await response.json()
        const session = body?.data?.session
        if (session?.accessToken && session?.refreshToken) {
          tokenStorage.set(session.accessToken, session.refreshToken)
          return "refreshed"
        }
        return "unavailable"
      }

      if ([400, 401, 403].includes(response.status)) {
        tokenStorage.clear()
        return "invalid"
      }

      return "unavailable"
    } catch {
      return "unavailable"
    } finally {
      refreshInFlight = null
    }
  })()

  return refreshInFlight
}

/**
 * Core fetch helper handling headers, bearer token injection, JSON parsing,
 * transparent token refresh (1 month lifespan), and standardized error envelopes.
 */
async function apiRequestEnvelope<T = any>(
  endpoint: string,
  options: RequestOptions = {},
): Promise<{ data: T; meta?: any }> {
  const { requiresAuth = false, tokenOverride, headers: customHeaders, _isRetry = false, ...restOptions } = options
  const isFormData = typeof FormData !== "undefined" && restOptions.body instanceof FormData

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(customHeaders as Record<string, string>),
  }

  if (!isFormData && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json"
  }

  const token = tokenOverride || tokenStorage.get()
  if (token) {
    headers["Authorization"] = `Bearer ${token}`
  } else if (requiresAuth) {
    throw new ApiError("Authentication required to complete this action.", 401, "UNAUTHORIZED")
  }

  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`
  const baseUrl = getApiBaseUrl()
  const url = `${baseUrl}${cleanEndpoint}`

  let response: Response
  try {
    response = await fetch(url, {
      ...restOptions,
      headers,
    })
  } catch (networkErr: any) {
    throw new ApiError(
      "Unable to connect to the backend server. Please verify your connection or try again later.",
      0,
      "NETWORK_ERROR",
      networkErr,
    )
  }

  const authEndpoint = cleanEndpoint.split("?")[0]
  const skipsRefresh = [
    "/auth/login",
    "/auth/register",
    "/auth/refresh",
    "/auth/logout",
  ].includes(authEndpoint)
  if (response.status === 401 && !_isRetry && !skipsRefresh) {
    const refreshResult = await refreshSession()
    if (refreshResult === "refreshed") {
      return apiRequestEnvelope<T>(endpoint, { ...options, _isRetry: true })
    }
  } else if (response.status === 401 && _isRetry) {
    tokenStorage.clear()
  }

  let body: any
  const contentType = response.headers.get("content-type")
  if (contentType && contentType.includes("application/json")) {
    try {
      body = await response.json()
    } catch {
      body = null
    }
  } else {
    try {
      body = await response.text()
    } catch {
      body = null
    }
  }

  if (!response.ok) {
    const message =
      body?.error?.message ||
      body?.message ||
      (typeof body === "string" && body) ||
      `Request failed with HTTP status ${response.status}`
    const code = body?.error?.code || (response.status === 401 ? "UNAUTHORIZED" : "HTTP_ERROR")
    const details = body?.error?.details || null

    throw new ApiError(message, response.status, code, details)
  }

  if (body && typeof body === "object" && "data" in body) {
    return { data: body.data as T, meta: body.meta }
  }

  return { data: body as T }
}

/**
 * Standard fetch wrapper returning the unwrapped `data` payload.
 */
export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestOptions = {},
): Promise<T> {
  const { data } = await apiRequestEnvelope<T>(endpoint, options)
  return data
}

/**
 * Fetch wrapper returning both `data` and `meta` (e.g., pagination metadata).
 */
export async function apiRequestWithMeta<T = any>(
  endpoint: string,
  options: RequestOptions = {},
): Promise<{ data: T; meta?: any }> {
  return apiRequestEnvelope<T>(endpoint, options)
}
