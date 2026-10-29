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

const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000

interface StoredAuthSession {
  accessToken: string
  refreshToken?: string | null
  expiresAt: number // Timestamp when the 10-day session window expires
}

let cachedSession: StoredAuthSession | null = null

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
      const raw = localStorage.getItem("hh_auth_session")
      if (!raw) return null
      const parsed: StoredAuthSession = JSON.parse(raw)
      if (!parsed.accessToken || Date.now() > parsed.expiresAt) {
        tokenStorage.clear()
        return null
      }
      cachedSession = parsed
      return parsed.accessToken
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
      const raw = localStorage.getItem("hh_auth_session")
      if (!raw) return null
      const parsed: StoredAuthSession = JSON.parse(raw)
      if (!parsed.refreshToken || Date.now() > parsed.expiresAt) {
        tokenStorage.clear()
        return null
      }
      cachedSession = parsed
      return parsed.refreshToken
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
      expiresAt: Date.now() + TEN_DAYS_MS, // Token automatically deleted after 10 days
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
  _isRetry?: boolean
}

/**
 * Standard fetch wrapper handling headers, bearer token injection, JSON parsing,
 * transparent token refresh (1 month lifespan), and standardized error envelopes.
 */
export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestOptions = {},
): Promise<T> {
  const { requiresAuth = false, headers: customHeaders, _isRetry = false, ...restOptions } = options
  const isFormData = typeof FormData !== "undefined" && restOptions.body instanceof FormData

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(customHeaders as Record<string, string>),
  }

  if (!isFormData && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json"
  }

  const token = tokenStorage.get()
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

  // Handle 401: Attempt silent token refresh via refreshToken if within 10-day window
  if (response.status === 401 && !_isRetry && !cleanEndpoint.includes("/auth/")) {
    const refreshToken = tokenStorage.getRefreshToken()
    if (refreshToken) {
      try {
        const refreshRes = await fetch(`${API_BASE_URL}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        })
        if (refreshRes.ok) {
          const refreshJson = await refreshRes.json()
          const newSession = refreshJson?.data?.session
          if (newSession?.accessToken) {
            tokenStorage.set(newSession.accessToken, newSession.refreshToken || refreshToken)
            // Retry original request with new token
            return apiRequest<T>(endpoint, { ...options, _isRetry: true })
          }
        }
      } catch {
        // Refresh failed, proceed to error handling
      }
    }
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

    if (response.status === 401) {
      tokenStorage.clear()
    }

    throw new ApiError(message, response.status, code, details)
  }

  // Handle standard backend sendSuccess envelope: { success: true, data: ..., message: ... }
  if (body && typeof body === "object" && "data" in body) {
    return body.data as T
  }

  return body as T
}
