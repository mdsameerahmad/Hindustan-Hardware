import { Navigate, Outlet, useLocation } from "react-router"
import { useAuth } from "./authContext"

export function CustomerRoute() {
  const { isAuthenticated, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#D4AF37] border-t-transparent" />
          <p className="text-sm font-medium text-slate-500">Checking session...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <Outlet />
}

export function AdminRoute() {
  const { isAuthenticated, isStaffOrAdmin, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0B0B0B] flex items-center justify-center text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#D4AF37] border-t-transparent" />
          <p className="text-sm font-medium text-[#AAAAAA]">Verifying administrator credentials...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (!isStaffOrAdmin) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl border border-red-200 bg-white p-8 text-center shadow-lg">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-red-100 text-red-600">
            <svg
              className="h-8 w-8"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h2 className="mt-4 text-2xl font-black text-ink">Access Restricted</h2>
          <p className="mt-2 text-sm text-slate-600">
            Your account does not possess administrative or staff clearance.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <a
              href="/"
              className="inline-flex justify-center rounded-lg bg-[#D4AF37] px-4 py-2.5 text-sm font-bold text-[#0B0B0B] hover:bg-[#B89124] transition"
            >
              Return to Storefront
            </a>
          </div>
        </div>
      </div>
    )
  }

  return <Outlet />
}
