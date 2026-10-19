import {
  ArrowRight,
  AtSign,
  BadgeIndianRupee,
  Boxes,
  Building2,
  Camera,
  Check,
  ChevronDown,
  CircleHelp,
  ClipboardList,
  Clock3,
  Gauge,
  GitCompareArrows,
  Heart,
  Home,
  LayoutDashboard,
  MapPin,
  Menu,
  Minus,
  Package,
  Phone,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  Store,
  Tags,
  Trash2,
  Truck,
  UserRound,
  Users,
  Wrench,
  X,
  Zap,
} from "lucide-react"
import { useState, type ReactNode } from "react"
import { Link, NavLink, Outlet, useNavigate } from "react-router"
import { type OrderStatus, type Product } from "./data"
import { useStore } from "./store"

export const formatPrice = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value)

export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger"
}) {
  const styles = {
    primary:
      "btn-gold-gradient font-bold",
    secondary:
      "btn-cart-gradient font-bold",
    outline:
      "border border-[#D4AF37] bg-transparent text-[#D4AF37] hover:bg-[#D4AF37] hover:text-[#0B0B0B]",
    ghost: "text-[#555555] hover:bg-[#EEEEEE]",
    danger: "bg-red-50 text-red-700 hover:bg-red-100",
  }
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode
  tone?: "neutral" | "success" | "warning" | "blue" | "danger"
}) {
  const tones = {
    neutral: "bg-[#EFEFEF] text-[#555555]",
    success: "bg-emerald-50 text-emerald-800",
    warning: "bg-[#FFF9E6] text-[#B89124] border border-[#F3E5AB]",
    blue: "bg-[#1C1C1C] text-[#D4AF37]",
    danger: "bg-red-50 text-red-700",
  }
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${tones[tone]}`}
    >
      {children}
    </span>
  )
}

export function SectionHeading({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string
  title: string
  action?: ReactNode
}) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        {eyebrow && (
          <p className="mb-1 text-xs font-extrabold uppercase tracking-[0.16em] text-accent-dark">
            {eyebrow}
          </p>
        )}
        <h2 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
          {title}
        </h2>
      </div>
      {action}
    </div>
  )
}

export function Quantity({
  value,
  onChange,
}: {
  value: number
  onChange: (value: number) => void
}) {
  return (
    <div className="inline-flex items-center rounded-lg border border-border bg-white">
      <button
        aria-label="Decrease quantity"
        onClick={() => onChange(Math.max(1, value - 1))}
        className="p-2 text-slate-500 hover:text-brand"
      >
        <Minus size={15} />
      </button>
      <span className="min-w-8 text-center text-sm font-bold">{value}</span>
      <button
        aria-label="Increase quantity"
        onClick={() => onChange(value + 1)}
        className="p-2 text-slate-500 hover:text-brand"
      >
        <Plus size={15} />
      </button>
    </div>
  )
}

export function ProductCard({ product }: { product: Product }) {
  const { addToCart, wishlist, toggleWishlist, compareIds, toggleCompare } =
    useStore()
  const discount = product.mrp
    ? Math.round(((product.mrp - product.price) / product.mrp) * 100)
    : 0
  return (
    <article className="group flex min-w-0 flex-col overflow-hidden rounded-xl border border-[#E8E8E8] bg-white transition hover:-translate-y-1 hover:shadow-xl">
      <div className="relative aspect-[4/3] overflow-hidden bg-[#F5F5F5]">
        <Link to={`/product/${product.id}`}>
          <img
            src={product.image}
            alt={product.name}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        </Link>
        <button
          aria-label="Toggle wishlist"
          onClick={() => toggleWishlist(product.id)}
          className="absolute right-3 top-3 rounded-full bg-white/90 p-2 shadow-sm transition hover:scale-110"
        >
          <Heart
            size={16}
            className={
              wishlist.includes(product.id)
                ? "fill-red-500 text-red-500"
                : "text-[#888888]"
            }
          />
        </button>
        {discount > 0 && (
          <span className="absolute left-3 top-3 rounded bg-[#0B0B0B] px-2 py-0.5 text-[11px] font-bold text-[#D4AF37] border border-[#D4AF37]/30">
            {discount}% OFF
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-[#888888]">
          {product.brandName}
        </p>
        <Link
          to={`/product/${product.id}`}
          className="mt-1 line-clamp-2 min-h-10 text-sm font-bold leading-snug text-[#0B0B0B] hover:text-[#B89124] transition"
        >
          {product.name}
        </Link>
        <p className="mt-1 text-xs text-[#777777]">
          {product.material} · {product.diameter}
        </p>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-lg font-black text-[#0B0B0B]">
            {formatPrice(product.price)}
          </span>
          {product.mrp && (
            <span className="text-xs text-[#999999] line-through">
              {formatPrice(product.mrp)}
            </span>
          )}
        </div>
        <p
          className={`mt-1 text-[11px] font-bold ${
            product.stock > 10 ? "text-emerald-700" : "text-amber-700"
          }`}
        >
          {product.stock > 10 ? "In stock" : `Only ${product.stock} left`}
        </p>
        {product.comparisonGroupId && (
          <label className="mt-2.5 flex cursor-pointer items-center gap-2 text-xs font-semibold text-[#555555]">
            <input
              type="checkbox"
              checked={compareIds.includes(product.id)}
              onChange={() => toggleCompare(product.id)}
              className="accent-[#D4AF37]"
            />
            Compare equivalent
          </label>
        )}
        <button
          onClick={() => addToCart(product.id)}
          className="btn-cart-gradient mt-4 flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-bold transition"
        >
          <ShoppingCart size={15} className="text-[#D4AF37]" />
          <span className="text-[#F3E5AB]">Add to Cart</span>
        </button>
      </div>
    </article>
  )
}

function SearchBox() {
  const navigate = useNavigate()
  const { products, brands } = useStore()
  const [value, setValue] = useState("")
  const [open, setOpen] = useState(false)
  const normalized = value.toLowerCase().replace(/[₹,]/g, "")
  const words = normalized
    .replace(/under\s+\d+/g, "")
    .split(/\s+/)
    .filter(Boolean)
  const priceLimit = Number(normalized.match(/under\s+(\d+)/)?.[1] ?? 0)
  const suggestions = value.trim()
    ? products
        .filter((p) => {
          const haystack =
            `${p.name} ${p.brandName} ${p.category} ${p.productType} ${p.material} ${p.diameter}`.toLowerCase()
          return (
            words.every((word) => haystack.includes(word)) &&
            (!priceLimit || p.price <= priceLimit)
          )
        })
        .slice(0, 5)
    : products.filter((p) => p.featured).slice(0, 5)
  const brandSuggestions = value.trim()
    ? brands
        .filter((brand) =>
          brand.name.toLowerCase().includes(value.toLowerCase()),
        )
        .slice(0, 2)
    : []

  const submit = () => {
    navigate(`/products${value ? `?q=${encodeURIComponent(value)}` : ""}`)
    setOpen(false)
  }

  return (
    <div className="relative flex-1">
      <form
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
        className="flex h-11 items-center overflow-hidden rounded-full bg-white pl-4 pr-1 shadow-sm"
      >
        <input
          value={value}
          onChange={(event) => {
            setValue(event.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          aria-label="Search products"
          placeholder="Search for products, brands, categories..."
          className="min-w-0 flex-1 bg-transparent px-2 text-sm text-[#0B0B0B] placeholder:text-[#777777] outline-none"
        />
        <button
          aria-label="Search"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#D4AF37] text-[#0B0B0B] transition hover:bg-[#B89124]"
          type="submit"
        >
          <Search size={18} />
        </button>
      </form>
      {open && (
        <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-border bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
              {value ? "Matching products" : "Popular searches"}
            </span>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close suggestions"
            >
              <X size={16} />
            </button>
          </div>
          {brandSuggestions.map((brand) => (
            <button
              key={brand.id}
              onClick={() => {
                navigate(`/brands/${brand.slug}`)
                setOpen(false)
              }}
              className="flex w-full items-center gap-3 border-b border-border bg-blue-50/60 px-4 py-3 text-left hover:bg-blue-50"
            >
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand text-xs font-black text-white">
                {brand.name
                  .split(" ")
                  .map((word) => word[0])
                  .slice(0, 2)
                  .join("")}
              </span>
              <span className="flex-1 text-sm font-bold">{brand.name}</span>
              <span className="text-xs font-semibold text-brand">
                Browse brand
              </span>
            </button>
          ))}
          {suggestions.map((product) => (
            <button
              key={product.id}
              onClick={() => {
                navigate(`/product/${product.id}`)
                setOpen(false)
              }}
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
            >
              <img
                src={product.image}
                alt=""
                className="h-10 w-10 rounded-lg object-cover"
              />
              <span className="flex-1 text-sm font-semibold">
                {product.name}
              </span>
              <span className="text-sm font-bold">
                {formatPrice(product.price)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const mainCategories = [
  "All Categories",
  "Brands",
  "Water Pipes",
  "Water Tanks",
  "Pipe Fittings",
  "Boring & Water Connection",
  "Valves & Taps",
  "Electrical",
  "Bathroom Fittings",
  "Tools & Accessories",
  "Offers",
]

export function StorefrontLayout() {
  const { cartCount, compareIds, toasts } = useStore()
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <div className="min-h-screen bg-canvas pb-16 md:pb-0 font-sans">
      <header className="sticky top-0 z-40 bg-[#0B0B0B] text-white shadow-md">
        {/* Top utility bar */}
        <div className="hidden border-b border-[#222222] bg-[#000000] px-4 py-2 text-xs text-[#AAAAAA] md:block">
          <div className="container-wide flex items-center justify-between">
            <div className="flex items-center gap-6">
              <span className="flex items-center gap-1.5 font-medium">
                <Truck size={14} className="text-[#D4AF37]" /> Free Delivery*
              </span>
              <span className="flex items-center gap-1.5 font-medium">
                <BadgeIndianRupee size={14} className="text-[#D4AF37]" /> GST Invoice
              </span>
              <span className="flex items-center gap-1.5 font-medium">
                <Clock3 size={14} className="text-[#D4AF37]" /> Easy Returns
              </span>
            </div>
            <div className="flex items-center gap-6">
              <span className="flex items-center gap-1.5 text-white">
                <Phone size={13} className="text-[#D4AF37]" /> +91 98765 43210
              </span>
              <Link to="/contact" className="hover:text-[#D4AF37]">
                Customer Support
              </Link>
            </div>
          </div>
        </div>

        {/* Main Navbar */}
        <div className="container-wide flex items-center gap-5 py-3">
          <button
            aria-label="Open menu"
            className="text-white hover:text-[#D4AF37] md:hidden"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <Menu size={24} />
          </button>

          {/* Logo with gold seal mark from reference */}
          <Link to="/" className="flex shrink-0 items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-full border-2 border-[#D4AF37] bg-transparent text-[#D4AF37] shadow-sm">
              <Wrench size={20} />
            </span>
            <span className="leading-tight">
              <strong className="block font-serif text-lg font-black tracking-wider text-white">
                HINDUSTAN
              </strong>
              <span className="block text-[10px] font-bold tracking-[0.25em] text-[#D4AF37] uppercase">
                HARDWARE & SANITARY
              </span>
            </span>
          </Link>

          {/* Search bar */}
          <div className="hidden flex-1 md:block max-w-xl mx-auto">
            <SearchBox />
          </div>

          {/* Nav actions with icons & gold badges */}
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <Link to="/login" className="header-action">
              <UserRound size={20} className="text-white" />
              <span className="text-[11px] font-medium text-[#CCCCCC]">Login / Register</span>
            </Link>
            <Link to="/wishlist" className="header-action hidden lg:flex">
              <Heart size={20} className="text-white" />
              <span className="text-[11px] font-medium text-[#CCCCCC]">Wishlist</span>
            </Link>
            <Link
              to="/compare"
              className="header-action relative hidden lg:flex"
            >
              <GitCompareArrows size={20} className="text-white" />
              <span className="text-[11px] font-medium text-[#CCCCCC]">Compare</span>
              {compareIds.length > 0 && (
                <b className="absolute -right-0.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-[#D4AF37] px-1 text-[9px] font-extrabold text-[#0B0B0B]">
                  {compareIds.length}
                </b>
              )}
            </Link>
            <Link to="/cart" className="header-action relative">
              <ShoppingCart size={20} className="text-white" />
              <span className="text-[11px] font-medium text-[#CCCCCC]">Cart</span>
              {cartCount > 0 && (
                <b className="absolute -right-0.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-[#D4AF37] px-1 text-[9px] font-extrabold text-[#0B0B0B]">
                  {cartCount}
                </b>
              )}
            </Link>
          </div>
        </div>

        {/* Mobile Search Input */}
        <div className="container-wide pb-3 md:hidden">
          <SearchBox />
        </div>

        {/* Sub-navbar with categories */}
        <nav className="border-t border-[#1C1C1C] bg-[#0B0B0B] text-xs">
          <div className="container-wide flex items-center gap-1 overflow-x-auto py-1.5 scrollbar-none">
            <Link
              to="/products"
              className="inline-flex items-center gap-2 rounded bg-[#D4AF37] px-4 py-2 font-bold text-[#0B0B0B] transition hover:bg-[#B89124] shrink-0 mr-3"
            >
              <Menu size={16} /> All Categories
            </Link>
            {mainCategories.slice(1).map((category) => (
              <Link
                key={category}
                to={
                  category === "Brands"
                    ? "/brands"
                    : `/products?q=${encodeURIComponent(category)}`
                }
                className={
                  category === "Offers"
                    ? "rounded px-3 py-1.5 whitespace-nowrap font-bold text-[#D4AF37] hover:bg-white/5"
                    : "rounded px-3 py-1.5 whitespace-nowrap font-medium text-[#CCCCCC] hover:text-[#D4AF37] hover:bg-white/5 transition"
                }
              >
                {category}
              </Link>
            ))}
          </div>
        </nav>

        {menuOpen && (
          <div className="absolute left-0 right-0 border-t border-[#222222] bg-[#0B0B0B] p-4 shadow-2xl md:hidden z-50">
            {mainCategories.map((item) => (
              <Link
                onClick={() => setMenuOpen(false)}
                key={item}
                className="block border-b border-[#1C1C1C] py-3 text-sm font-semibold text-[#CCCCCC] hover:text-[#D4AF37]"
                to="/products"
              >
                {item}
              </Link>
            ))}
          </div>
        )}
      </header>
      <main>
        <Outlet />
      </main>
      <Footer />
      <nav className="fixed bottom-0 left-0 right-0 z-50 grid grid-cols-4 border-t border-border bg-white px-2 py-2 md:hidden">
        <NavLink to="/" className="mobile-nav">
          <Home size={20} />
          Home
        </NavLink>
        <NavLink to="/products" className="mobile-nav">
          <Boxes size={20} />
          Categories
        </NavLink>
        <NavLink to="/my-orders" className="mobile-nav">
          <Package size={20} />
          Orders
        </NavLink>
        <NavLink to="/account" className="mobile-nav">
          <UserRound size={20} />
          Account
        </NavLink>
      </nav>
      <div className="fixed right-4 top-24 z-[70] space-y-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="flex items-center gap-2 rounded-lg bg-ink px-4 py-3 text-sm font-semibold text-white shadow-xl"
          >
            <Check size={16} className="text-emerald-400" />
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  )
}

export function Footer() {
  return (
    <footer className="mt-16 bg-[#000000] text-[#CCCCCC] border-t border-[#1C1C1C]">
      <div className="container-wide grid gap-10 py-14 md:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <div className="mb-4 flex items-center gap-3 text-white">
            <span className="grid h-11 w-11 place-items-center rounded-full border-2 border-[#D4AF37] text-[#D4AF37]">
              <Wrench size={22} />
            </span>
            <div>
              <strong className="block font-serif text-lg font-black tracking-wider text-white">
                HINDUSTAN HARDWARE
              </strong>
              <span className="block text-[10px] font-bold tracking-[0.2em] text-[#D4AF37] uppercase">
                SANITARY & HARDWARE · EST. 1993
              </span>
            </div>
          </div>
          <p className="max-w-sm text-xs leading-6 text-[#888888]">
            Premium sanitaryware, bath fittings, pipes, hardware and architectural solutions. Trusted quality since 1993.
          </p>
          <div className="mt-5 flex gap-3 text-[#D4AF37]">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-[#1C1C1C] text-[#D4AF37] hover:bg-[#D4AF37] hover:text-[#0B0B0B] transition cursor-pointer">
              <Camera size={16} />
            </span>
            <span className="grid h-9 w-9 place-items-center rounded-full bg-[#1C1C1C] text-[#D4AF37] hover:bg-[#D4AF37] hover:text-[#0B0B0B] transition cursor-pointer">
              <AtSign size={16} />
            </span>
            <span className="grid h-9 w-9 place-items-center rounded-full bg-[#1C1C1C] text-[#D4AF37] hover:bg-[#D4AF37] hover:text-[#0B0B0B] transition cursor-pointer">
              <Phone size={16} />
            </span>
          </div>
        </div>
        <FooterColumn
          title="Quick Links"
          links={[
            "Home",
            "About Us",
            "Contact Us",
            "Admin Login",
            "FAQs",
            "Terms & Conditions",
            "Privacy Policy",
          ]}
        />
        <FooterColumn
          title="Customer Service"
          links={[
            "Track Order",
            "Shipping Policy",
            "Return & Refund",
            "Warranty",
            "Bulk Orders",
          ]}
        />
        <div>
          <h4 className="mb-4 text-xs font-bold uppercase tracking-[0.16em] text-white">
            Subscribe for Updates
          </h4>
          <p className="text-xs text-[#888888] mb-3">
            Get exclusive trade offers, contractor rates, and new arrivals.
          </p>
          <div className="flex overflow-hidden rounded-lg border border-[#333333] bg-[#111111]">
            <input
              placeholder="Enter your email address"
              className="min-w-0 flex-1 bg-transparent px-3 py-2 text-xs text-white placeholder:text-[#666666] outline-none"
            />
            <button className="bg-[#D4AF37] px-4 py-2 text-xs font-bold text-[#0B0B0B] hover:bg-[#B89124] transition">
              Subscribe
            </button>
          </div>
          <div className="mt-4 text-xs text-[#888888]">
            <p className="flex items-center gap-2">
              <Phone size={12} className="text-[#D4AF37]" /> +91 98765 43210
            </p>
            <p className="flex items-center gap-2 mt-1">
              <AtSign size={12} className="text-[#D4AF37]" /> info@hindustanhardware.in
            </p>
          </div>
        </div>
      </div>
      <div className="border-t border-[#1C1C1C] bg-[#000000] py-4 text-xs text-[#666666]">
        <div className="container-wide flex flex-col sm:flex-row items-center justify-between gap-3">
          <span>© 2026 Hindustan Hardware. All Rights Reserved.</span>
          <div className="flex items-center gap-4">
            <span>Made for Professionals. Loved by Homeowners.</span>
            <Link
              to="/admin"
              className="inline-flex items-center gap-1.5 rounded bg-[#1C1C1C] px-3 py-1 font-bold text-[#D4AF37] hover:bg-[#D4AF37] hover:text-[#0B0B0B] transition border border-[#333333]"
            >
              <ShieldCheck size={14} /> Admin Portal
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}

type FooterColumnProps = {
  title: string
  links: string[]
}

function FooterColumn({ title, links }: FooterColumnProps) {
  const map: Record<string, string> = {
    "Home": "/",
    "My Orders": "/my-orders",
    "Contact Us": "/contact",
    "Bulk Orders": "/bulk-order",
    "About Us": "/about",
    "Admin Login": "/admin",
    "Admin Demo": "/admin",
  }
  return (
    <div>
      <h3 className="mb-4 font-bold text-white">{title}</h3>
      <div className="space-y-3 text-sm">
        {links.map((link) => (
          <Link
            className="block hover:text-white"
            key={link}
            to={map[link] ?? "/products"}
          >
            {link}
          </Link>
        ))}
      </div>
    </div>
  )
}

export const statusTone = (status: OrderStatus) =>
  status === "Delivered"
    ? "success"
    : status === "Cancelled"
      ? "danger"
      : status === "Out for Delivery"
        ? "warning"
        : "blue"

const adminNav = [
  ["Overview", "/admin", LayoutDashboard],
  ["Products", "/admin/products", Package],
  ["Categories", "/admin/categories", Boxes],
  ["Brands", "/admin/brands", Tags],
  ["Inventory", "/admin/inventory", Gauge],
  ["Orders", "/admin/orders", ClipboardList],
  ["Customers", "/admin/customers", Users],
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
            <span className="grid h-10 w-10 place-items-center rounded-full border-2 border-[#D4AF37] text-[#D4AF37]">
              <Wrench size={19} />
            </span>
            <div>
              <b className="block font-serif text-sm tracking-wider text-white">HINDUSTAN</b>
              <small className="text-[#D4AF37] font-semibold text-[10px] tracking-widest uppercase">Admin Panel</small>
            </div>
          </Link>
          <button onClick={() => setOpen(false)} className="lg:hidden text-white">
            <X />
          </button>
        </div>
        <nav className="space-y-1 p-4">
          {adminNav.map(([label, path, Icon]) => (
            <NavLink
              end={path === "/admin"}
              key={label}
              to={path}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-semibold transition ${
                  isActive
                    ? "bg-[#D4AF37] text-[#0B0B0B] font-bold"
                    : "text-[#CCCCCC] hover:bg-white/5 hover:text-[#D4AF37]"
                }`
              }
            >
              <Icon size={19} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="absolute bottom-5 left-4 right-4">
          <Link
            to="/"
            className="flex items-center gap-2 rounded-lg border border-[#333333] bg-[#111111] px-4 py-3 text-sm font-bold text-[#D4AF37] hover:bg-[#D4AF37] hover:text-[#0B0B0B] transition"
          >
            <Store size={17} />
            View storefront
          </Link>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="flex h-20 items-center justify-between border-b border-border bg-white px-5 lg:px-8">
          <button onClick={() => setOpen(true)} className="lg:hidden">
            <Menu />
          </button>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
              Demo operations workspace
            </p>
            <h1 className="text-xl font-extrabold text-ink">
              Store administration
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Badge tone="warning">Demo data</Badge>
            <span className="grid h-10 w-10 place-items-center rounded-full bg-brand font-bold text-white">
              HH
            </span>
          </div>
        </header>
        <main className="p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export function PageHeader({
  title,
  description,
  action,
  breadcrumbs,
}: {
  title: string
  description?: string
  action?: ReactNode
  breadcrumbs?: string
}) {
  return (
    <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        {breadcrumbs && (
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
            {breadcrumbs}
          </p>
        )}
        <h1 className="text-3xl font-black tracking-tight text-ink">{title}</h1>
        {description && (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  )
}

export function EmptyState({
  icon = <Package />,
  title,
  text,
  action,
}: {
  icon?: ReactNode
  title: string
  text: string
  action?: ReactNode
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
      <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-slate-100 text-slate-500">
        {icon}
      </span>
      <h3 className="text-lg font-bold">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{text}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export const iconMap = {
  Clock3,
  Truck,
  CircleHelp,
  Zap,
  BadgeIndianRupee,
  SlidersHorizontal,
  ArrowRight,
  ChevronDown,
  Phone,
  MapPin,
  Search,
  Trash2,
}
