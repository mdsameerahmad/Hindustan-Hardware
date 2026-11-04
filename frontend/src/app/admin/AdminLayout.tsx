import {
    Bike,
    Boxes,
    Building2,
    ClipboardList,
    Gauge,
    LayoutDashboard,
    LogOut,
    Menu,
    Package,
    Tags,
    Truck,
    Users,
    X
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
    <div className="flex items-center gap-2 sm:gap-3 shrink-0">
      <Badge tone="blue" className="text-[10px] sm:text-xs px-2 py-0.5 sm:px-2.5 sm:py-1">
        {role.toUpperCase()}
      </Badge>
      <span className="text-xs font-semibold text-slate-700 hidden md:inline max-w-[140px] truncate">
        {email}
      </span>
      <Button
        variant="ghost"
        onClick={handleLogout}
        className="text-xs py-1.5 px-2.5 sm:px-3 flex items-center gap-1.5 text-slate-600 hover:text-rose-600 hover:bg-rose-50"
        title="Sign Out"
      >
        <LogOut size={15} />
        <span className="hidden sm:inline">Sign Out</span>
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
  ["Delivery Orders", "/admin/deliveries", Truck],
  ["Delivery Partner Management", "/admin/delivery-partners", Bike],
  ["Bulk Inquiries", "/admin/inquiries", Building2],
] as const

export function AdminLayout() {
  const [open, setOpen] = useState(false)
  return (
    <div className="min-h-screen bg-[#F5F5F5] lg:flex font-sans">
      {/* Mobile Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-[#0B0B0B] text-white border-r border-[#1C1C1C] transition-transform duration-300 lg:static lg:translate-x-0 ${
          open ? "translate-x-0 shadow-2xl" : "-translate-x-full"
        }`}
      >
        <div className="flex h-20 items-center justify-between border-b border-[#1C1C1C] px-6">
          <Link to="/admin" className="flex items-center gap-3 group">
            <img
              src="/logo.webp"
              alt="Hindustan Hardware Admin"
              className="h-10 w-10 rounded-full object-cover border-2 border-[#D4AF37] shadow-md shadow-[#D4AF37]/20 group-hover:scale-105 transition-transform"
            />
            <div>
              <p className="font-serif text-sm font-bold tracking-wider text-white">
                HINDUSTAN
              </p>
              <p className="text-[10px] tracking-widest text-[#D4AF37] uppercase font-bold">
                ADMIN PORTAL
              </p>
            </div>
          </Link>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close sidebar"
            className="lg:hidden text-[#888888] hover:text-white p-1 rounded-md"
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
      </aside>
      <div className="flex-1 min-w-0">
        <header className="flex h-14 sm:h-16 md:h-20 items-center justify-between border-b border-[#E8E8E8] bg-white px-3 sm:px-6 gap-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <button
              onClick={() => setOpen(true)}
              aria-label="Open sidebar"
              className="lg:hidden text-[#0B0B0B] p-1.5 rounded-lg hover:bg-slate-100 shrink-0"
            >
              <Menu size={20} />
            </button>
            <h2 className="text-sm sm:text-base md:text-lg font-black text-[#0B0B0B] truncate">
              Operations Control
            </h2>
          </div>
          <AdminHeaderUser />
        </header>
        <main className="p-3 sm:p-6 lg:p-8 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
