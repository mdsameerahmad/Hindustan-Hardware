/**
 * Authentication API Service.
 * Implements endpoints corresponding to backend/src/routes/auth.ts
 */

import { apiRequest, tokenStorage } from './client'

export type UserRole = 'customer' | 'admin' | 'staff' | 'delivery_partner'

export interface UserProfile {
  id: string
  role: UserRole
  full_name: string
  phone: string | null
  avatar_url: string | null
  created_at?: string
  updated_at?: string
}

export interface AuthUser {
  id: string
  email: string
  role: UserRole
  emailConfirmed?: boolean
  profile?: UserProfile | null
}

export interface AuthSession {
  accessToken: string
  refreshToken?: string
  expiresIn?: number
  expiresAt?: number
}

export interface RegisterPayload {
  email: string
  password: string
  fullName: string
  phone?: string
}

export interface RegisterResponse {
  user: {
    id: string
    email: string
    emailConfirmed: boolean
  }
  session: AuthSession | null
  requiresEmailVerification: boolean
}

export interface LoginPayload {
  email: string
  password: string
}

export interface LoginResponse {
  user: {
    id: string
    email: string
    role: UserRole
    profile: UserProfile | null
  }
  session: AuthSession
}

export interface MeResponse {
  user: {
    id: string
    email: string
    role: UserRole
    profile: UserProfile
  }
}

export const authApi = {
  /**
   * Register customer account.
   */
  register: async (payload: RegisterPayload): Promise<RegisterResponse> => {
    const res = await apiRequest<RegisterResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    })

    if (res.session?.accessToken) {
      tokenStorage.set(res.session.accessToken, res.session.refreshToken)
    }

    return res
  },

  /**
   * Login customer or administrator.
   */
  login: async (payload: LoginPayload): Promise<LoginResponse> => {
    const res = await apiRequest<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    })

    if (res.session?.accessToken) {
      tokenStorage.set(res.session.accessToken, res.session.refreshToken)
    }

    return res
  },

  /**
   * Retrieve authoritative user profile from backend.
   */
  getMe: async (): Promise<MeResponse> => {
    return apiRequest<MeResponse>('/auth/me', {
      method: 'GET',
      requiresAuth: true,
    })
  },

  /**
   * Validate active session.
   */
  validateSession: async (): Promise<{ valid: boolean; user: AuthUser }> => {
    return apiRequest<{ valid: boolean; user: AuthUser }>('/auth/session', {
      method: 'GET',
      requiresAuth: true,
    })
  },

  /**
   * Sign out from active session.
   */
  logout: async (): Promise<void> => {
    try {
      await apiRequest('/auth/logout', {
        method: 'POST',
        requiresAuth: true,
      })
    } catch {
      // Proceed with clearing local token regardless
    } finally {
      tokenStorage.clear()
    }
  },

  /**
   * Request password recovery email.
   */
  forgotPassword: async (email: string, redirectTo?: string): Promise<{ recoveryUrl?: string } | null> => {
    const res = await apiRequest<{ recoveryUrl?: string } | null>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email, redirectTo }),
    })
    return res
  },

  /**
   * Reset password with recovery/bearer token or tokenHash.
   */
  resetPassword: async (password: string, tokenOverride?: string, tokenHash?: string): Promise<LoginResponse> => {
    const res = await apiRequest<LoginResponse>('/auth/reset-password', {
      method: 'POST',
      requiresAuth: !tokenHash,
      tokenOverride,
      body: JSON.stringify({ password, tokenHash }),
    })

    if (res?.session?.accessToken) {
      tokenStorage.set(res.session.accessToken, res.session.refreshToken)
    }

    return res
  },

  /**
   * Update profile fields (customer).
   */
  updateProfile: async (payload: { fullName?: string; phone?: string | null }): Promise<UserProfile> => {
    return apiRequest<UserProfile>('/customers/me', {
      method: 'PATCH',
      requiresAuth: true,
      body: JSON.stringify(payload),
    })
  },
}
