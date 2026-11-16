import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import { authApi, type AuthUser, type LoginPayload, type RegisterPayload } from "./api/authApi"
import { tokenStorage } from "./api/client"

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  isAuthenticated: boolean
  isAdmin: boolean
  isStaffOrAdmin: boolean
  isDeliveryPartner: boolean
  login: (payload: LoginPayload) => Promise<void>
  register: (payload: RegisterPayload) => Promise<{ requiresVerification: boolean }>
  resetPassword: (password: string, tokenOverride?: string) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const USER_STORAGE_KEY = "hh_auth_user"

export function AuthProvider({ children }: { children: ReactNode }) {
  // Read cached user synchronously on startup to prevent login state flashing/loss on reload
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      if (!tokenStorage.get()) return null
      const stored = localStorage.getItem(USER_STORAGE_KEY)
      return stored ? (JSON.parse(stored) as AuthUser) : null
    } catch {
      return null
    }
  })
  const [loading, setLoading] = useState<boolean>(!user && Boolean(tokenStorage.get()))

  const saveUser = (newUser: AuthUser | null) => {
    setUser(newUser)
    try {
      if (newUser) {
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(newUser))
      } else {
        localStorage.removeItem(USER_STORAGE_KEY)
      }
    } catch {}
  }

  const refreshUser = useCallback(async () => {
    const token = tokenStorage.get()
    if (!token) {
      saveUser(null)
      setLoading(false)
      return
    }

    try {
      const res = await authApi.getMe()
      if (res?.user) {
        saveUser({
          id: res.user.id,
          email: res.user.email,
          role: res.user.role,
          profile: res.user.profile,
        })
      }
    } catch {
      // The API client clears the session only after a definitive refresh rejection.
      // Preserve cached identity when a temporary network/server error prevents refresh.
      if (!tokenStorage.get()) {
        saveUser(null)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshUser()
  }, [refreshUser])

  const login = async (payload: LoginPayload) => {
    const res = await authApi.login(payload)
    if (res?.user) {
      saveUser({
        id: res.user.id,
        email: res.user.email,
        role: res.user.role,
        profile: res.user.profile,
      })
    }
  }

  const register = async (payload: RegisterPayload) => {
    const res = await authApi.register(payload)
    if (res?.session?.accessToken && res.user) {
      await refreshUser()
      return { requiresVerification: false }
    }
    return { requiresVerification: res?.requiresEmailVerification ?? false }
  }

  const resetPassword = async (password: string, tokenOverride?: string) => {
    const res = await authApi.resetPassword(password, tokenOverride)
    if (res?.user) {
      saveUser({
        id: res.user.id,
        email: res.user.email,
        role: res.user.role,
        profile: res.user.profile,
      })
    } else {
      await refreshUser()
    }
  }

  const logout = async () => {
    try {
      await authApi.logout()
    } finally {
      tokenStorage.clear()
      saveUser(null)
    }
  }

  const isAuthenticated = Boolean(user && tokenStorage.get())
  const isAdmin = Boolean(user && user.role === "admin")
  const isStaffOrAdmin = Boolean(user && (user.role === "admin" || user.role === "staff"))
  const isDeliveryPartner = Boolean(
    user && (user.role === "delivery_partner" || user.role === "admin" || user.role === "staff")
  )

  const value: AuthContextValue = {
    user,
    loading,
    isAuthenticated,
    isAdmin,
    isStaffOrAdmin,
    isDeliveryPartner,
    login,
    register,
    resetPassword,
    logout,
    refreshUser,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
