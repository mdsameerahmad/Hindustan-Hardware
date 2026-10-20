import {
  Boxes,
  Building2,
  ClipboardList,
  FileText,
  Gauge,
  LayoutDashboard,
  Menu,
  Package,
  Settings,
  Tags,
  Truck,
  Users,
  Wrench,
  X,
} from "lucide-react"
import { useState } from "react"
import { Link, NavLink, Outlet, useNavigate } from "react-router"
import { useAuth } from "../authContext"
import { Badge, Button } from "../components"

export function AdminHeaderUser() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const role = user?.role || "admin"
  const email = user?.email || "Admin User"

  const handleLogout = async () => {
    await logout()
    navigate("/", { replace: true })
  }

  return (
    <div className="flex items-center gap-3">
      <Badge tone="blue">{role.toUpperCase()}</Badge>
      <span className="text-xs font-semibold text-slate-700 hidden sm:inline max-w-[150px] truncate">
        {email}
      </span>
      <Button variant="ghost" onClick={handleLogout} className="text-xs py-1.5 px-3">
        Sign Out
      </Button>
    </div>
  )
}

const adminNav = [
  ["Overview", "/admin", LayoutDashboard],
  ["Products", "/admin/products", Package],
  ["Categories", "/admin/categories", Boxes],
  ["Brands", "/admin/brands", Tags],
  ["Inventory", "/admin/inventory", Gauge],
  ["Orders", "/admin/orders", ClipboardList],
  ["Customers", "/admin/customers", Users],
  ["Audit Logs", "/admin/audit", FileText],
  ["Delivery Management", "/admin/deliveries", Truck],
  ["Bulk Inquiries", "/admin/inquiries", Building2],
  ["Store Settings", "/admin/settings", Settings],
] as const

export function AdminLayout() {
  const [open, setOpen] = useState(false)
  return (
    <div className="min-h-screen bg-[#F5F5F5] lg:flex font-sans">
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-[#0B0B0B] text-white border-r border-[#1C1C1C] transition-transform lg:static lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-20 items-center justify-between border-b border-[#1C1C1C] px-6">
          <Link to="/admin" className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full border border-[#D4AF37] text-[#D4AF37]">
              <Wrench size={18} />
            </span>
            <div>
              <p className="font-serif text-sm font-bold tracking-wider text-white">
                HINDUSTAN
              </p>
              <p className="text-[10px] tracking-widest text-[#D4AF37] uppercase">
                ADMIN PORTAL
              </p>
            </div>
          </Link>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close sidebar"
            className="lg:hidden text-[#888888] hover:text-white"
          >
            <X size={20} />
          </button>
        </div>
        <div className="p-4">
          <p className="px-3 py-2 text-[10px] font-bold tracking-wider text-[#666666] uppercase">
            Management & Operations
          </p>
          <nav className="space-y-1">
            {adminNav.map(([label, path, Icon]) => (
              <NavLink
                key={path}
                to={path}
                end={path === "/admin"}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-semibold transition ${
                    isActive
                      ? "bg-[#D4AF37] text-[#0B0B0B] font-bold"
                      : "text-[#AAAAAA] hover:bg-[#1C1C1C] hover:text-white"
                  }`
                }
              >
                <Icon size={16} />
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="border-t border-[#1C1C1C] p-4">
          <Link
            to="/"
            className="flex items-center justify-center gap-2 rounded-lg bg-[#1C1C1C] py-2 text-xs font-bold text-[#D4AF37] hover:bg-[#D4AF37] hover:text-[#0B0B0B] transition"
          >
            ← View Live Storefront
          </Link>
        </div>
      </aside>
      <div className="flex-1">
        <header className="flex h-20 items-center justify-between border-b border-[#E8E8E8] bg-white px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setOpen(true)}
              aria-label="Open sidebar"
              className="lg:hidden text-[#0B0B0B]"
            >
              <Menu size={22} />
            </button>
            <h2 className="text-lg font-bold text-[#0B0B0B]">
              Operations Control
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <AdminHeaderUser />
          </div>
        </header>
        <main className="p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
