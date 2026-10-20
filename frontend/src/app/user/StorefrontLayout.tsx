import {
  AtSign,
  BadgeIndianRupee,
  Boxes,
  Camera,
  Check,
  ChevronDown,
  Clock3,
  Heart,
  Home,
  Menu,
  Package,
  Phone,
  Search,
  ShoppingCart,
  Truck,
  UserRound,
  Wrench,
  X
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router"
import { catalogueApi } from "../api/catalogueApi"
import { useAuth } from "../authContext"
import { type Product } from "../data"
import { ProductImage } from "../features/components/ProductImage"
import { useStore } from "../store"
import { formatPrice } from "../utils/formatters"
import { transformBackendProduct } from "../utils/productTransform"

export function UserNavAction() {
  const { isAuthenticated, user } = useAuth()
  if (isAuthenticated && user) {
    const label = user.profile?.full_name ? user.profile.full_name.split(" ")[0] : "Account"
    return (
      <Link to="/account" className="header-action">
        <UserRound size={20} className="text-[#D4AF37]" />
        <span className="text-[11px] font-bold text-white max-w-[80px] truncate">{label}</span>
      </Link>
    )
  }
  return (
    <Link to="/login" className="header-action">
      <UserRound size={20} className="text-white" />
      <span className="text-[11px] font-medium text-[#CCCCCC]">Login / Register</span>
    </Link>
  )
}

export function SearchBox() {
  const navigate = useNavigate()
  const { products, brands, categories } = useStore()
  const [value, setValue] = useState("")
  const [open, setOpen] = useState(false)
  const [remoteResults, setRemoteResults] = useState<Product[]>([])
  const searchBoxRef = useRef<HTMLDivElement>(null)

  // Close search suggestions on clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchBoxRef.current && !searchBoxRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // Fast Amazon/Flipkart style scoring & prefix matching on memory dataset
  const localSuggestions = useMemo(() => {
    const raw = value.trim().toLowerCase()
    if (!raw) {
      return products.filter((p) => p.featured).slice(0, 6)
    }

    const cleanInput = raw.replace(/[₹,]/g, "")
    const priceMatch = cleanInput.match(/under\s+(\d+)/)
    const priceLimit = priceMatch ? Number(priceMatch[1]) : 0
    const queryTerms = cleanInput
      .replace(/under\s+\d+/g, "")
      .split(/\s+/)
      .filter(Boolean)

    if (!queryTerms.length) return []

    const scored: { product: Product; score: number }[] = []

    for (const p of products) {
      if (priceLimit && p.price > priceLimit) continue

      const name = (p.name || "").toLowerCase()
      const brand = (p.brandName || "").toLowerCase()
      const category = (p.category || "").toLowerCase()
      const type = (p.productType || "").toLowerCase()
      const haystack = `${name} ${brand} ${category} ${type} ${p.material || ""} ${p.diameter || ""}`.toLowerCase()

      const matchesAll = queryTerms.every((term) => haystack.includes(term))
      if (!matchesAll) continue

      let score = 0
      const queryStr = queryTerms.join(" ")

      if (name === queryStr) score += 100
      if (name.startsWith(queryStr)) score += 60

      for (const term of queryTerms) {
        const words = name.split(/\s+/)
        for (const w of words) {
          if (w.startsWith(term)) score += 30
          else if (w.includes(term)) score += 10
        }
        if (brand.startsWith(term)) score += 25
        if (category.startsWith(term)) score += 20
      }

      scored.push({ product: p, score })
    }

    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, 6).map((item) => item.product)
  }, [value, products])

  const brandSuggestions = useMemo(() => {
    const raw = value.trim().toLowerCase()
    if (!raw) return []
    return brands
      .filter((b) => b.active && b.name.toLowerCase().includes(raw))
      .sort((a, b) => {
        const aStarts = a.name.toLowerCase().startsWith(raw) ? 1 : 0
        const bStarts = b.name.toLowerCase().startsWith(raw) ? 1 : 0
        return bStarts - aStarts
      })
      .slice(0, 2)
  }, [value, brands])

  const categorySuggestions = useMemo(() => {
    const raw = value.trim().toLowerCase()
    if (!raw || raw.length < 2) return []
    return (categories || [])
      .filter((c) => c.name.toLowerCase().includes(raw))
      .slice(0, 2)
  }, [value, categories])

  useEffect(() => {
    const trimmed = value.trim()
    if (!trimmed || trimmed.length < 2) {
      setRemoteResults([])
      return
    }

    const timer = setTimeout(() => {
      catalogueApi
        .listProducts({ search: trimmed, limit: 6 })
        .then((res) => {
          if (res && res.items) {
            setRemoteResults(res.items.map(transformBackendProduct))
          }
        })
        .catch(() => {})
    }, 120)

    return () => clearTimeout(timer)
  }, [value])

  const displayedProducts = useMemo(() => {
    const combined = [...localSuggestions]
    const seen = new Set(combined.map((p) => p.id))
    for (const rp of remoteResults) {
      if (!seen.has(rp.id)) {
        combined.push(rp)
        seen.add(rp.id)
      }
    }
    return combined.slice(0, 6)
  }, [localSuggestions, remoteResults])

  const submit = () => {
    navigate(`/products${value ? `?q=${encodeURIComponent(value.trim())}` : ""}`)
    setOpen(false)
  }

  return (
    <div ref={searchBoxRef} className="relative flex-1">
      <form
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
        className="flex h-11 items-center overflow-hidden rounded-full bg-white pl-4 pr-1 shadow-sm border border-slate-200 focus-within:border-[#D4AF37] focus-within:ring-2 focus-within:ring-[#D4AF37]/30"
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
          className="min-w-0 flex-1 bg-transparent px-2 text-sm !text-slate-900 font-medium placeholder:!text-slate-400 outline-none"
          style={{ color: "#0f172a" }}
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
        <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-border bg-white text-slate-900 shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5 bg-slate-50">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-600">
              {value.trim() ? `Search results for "${value.trim()}"` : "Trending & Popular Searches"}
            </span>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close suggestions"
              className="text-slate-400 hover:text-slate-700"
            >
              <X size={16} />
            </button>
          </div>

          {/* Instant Category Matches */}
          {categorySuggestions.map((cat) => (
            <button
              key={cat.id}
              onClick={() => {
                navigate(`/category/${cat.slug}`)
                setOpen(false)
              }}
              className="flex w-full items-center gap-3 border-b border-slate-100 bg-emerald-50/40 px-4 py-2.5 text-left hover:bg-emerald-50 transition"
            >
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-700 text-xs font-bold text-white">
                <Boxes size={15} />
              </span>
              <span className="flex-1 text-sm font-semibold text-slate-900">
                In category: <span className="font-bold text-emerald-800">{cat.name}</span>
              </span>
              <span className="text-xs font-medium text-emerald-700">View Category</span>
            </button>
          ))}

          {/* Instant Brand Matches */}
          {brandSuggestions.map((brand) => (
            <button
              key={brand.id}
              onClick={() => {
                navigate(`/brands/${brand.slug}`)
                setOpen(false)
              }}
              className="flex w-full items-center gap-3 border-b border-slate-100 bg-amber-50/40 px-4 py-2.5 text-left hover:bg-amber-100/60 transition"
            >
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#0B0B0B] text-xs font-black text-[#D4AF37] border border-[#D4AF37]/30">
                {brand.name
                  .split(" ")
                  .map((word) => word[0])
                  .slice(0, 2)
                  .join("")}
              </span>
              <span className="flex-1 text-sm font-semibold text-slate-900">
                Brand: <span className="font-bold text-slate-900">{brand.name}</span>
              </span>
              <span className="text-xs font-semibold text-[#B89124]">
                Browse brand
              </span>
            </button>
          ))}

          {/* Instant Product Suggestions */}
          {displayedProducts.length > 0 ? (
            displayedProducts.map((product) => (
              <button
                key={product.id}
                onClick={() => {
                  navigate(`/product/${product.id}`)
                  setOpen(false)
                }}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 border-b border-slate-100 last:border-b-0 transition"
              >
                <ProductImage
                  src={product.image}
                  alt={product.name}
                  className="h-10 w-10 rounded-lg object-cover bg-slate-100 shrink-0 border border-slate-200"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    {product.name}
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    {product.brandName ? `${product.brandName} • ` : ""}{product.category || product.productType}
                  </p>
                </div>
                <span className="text-sm font-bold text-slate-900 shrink-0">
                  {formatPrice(product.price)}
                </span>
              </button>
            ))
          ) : (
            <div className="px-4 py-6 text-center text-sm text-slate-500">
              No products found matching &ldquo;{value}&rdquo;
            </div>
          )}

          {value.trim() && (
            <button
              onClick={submit}
              className="flex w-full items-center justify-center gap-2 bg-slate-50 px-4 py-2.5 text-xs font-bold text-[#B89124] hover:bg-amber-50 hover:underline border-t border-slate-100"
            >
              See all results for &ldquo;{value.trim()}&rdquo; &rarr;
            </button>
          )}
        </div>
      )}
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
          </div>
        </div>
      </div>
    </footer>
  )
}

function FooterColumn({ title, links }: { title: string; links: string[] }) {
  const map: Record<string, string> = {
    "Home": "/",
    "My Orders": "/my-orders",
    "Contact Us": "/contact",
    "Bulk Orders": "/bulk-order",
    "About Us": "/about",
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

export function StorefrontLayout() {
  const { pathname } = useLocation()
  const { cartCount, orders, toasts, categories } = useStore()
  const [menuOpen, setMenuOpen] = useState(false)
  const [categoriesDropdownOpen, setCategoriesDropdownOpen] = useState(false)

  // Always reset page scroll position to top whenever route changes
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" })
  }, [pathname])

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
            <UserNavAction />
            <Link to="/wishlist" className="header-action hidden lg:flex">
              <Heart size={20} className="text-white" />
              <span className="text-[11px] font-medium text-[#CCCCCC]">Wishlist</span>
            </Link>
            <Link
              to="/my-orders"
              className="header-action relative hidden lg:flex"
            >
              <div className="relative">
                <Package size={20} className="text-white" />
                {orders.length > 0 && (
                  <span className="absolute -top-1.5 -right-2 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#D4AF37] px-1 text-[10px] font-bold text-black shadow-sm">
                    {orders.length}
                  </span>
                )}
              </div>
              <span className="text-[11px] font-medium text-[#CCCCCC]">Orders</span>
            </Link>
            <Link to="/cart" className="header-action relative">
              <div className="relative">
                <ShoppingCart size={20} className="text-white" />
                {cartCount > 0 && (
                  <span className="absolute -top-1.5 -right-2 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#D4AF37] px-1 text-[10px] font-bold text-black shadow-sm">
                    {cartCount}
                  </span>
                )}
              </div>
              <span className="text-[11px] font-medium text-[#CCCCCC]">Cart</span>
            </Link>
          </div>
        </div>

        {/* Mobile search bar */}
        <div className="border-t border-[#222222] px-4 py-2 md:hidden">
          <SearchBox />
        </div>

        {/* Secondary Navigation Ribbon */}
        <nav className="border-t border-[#1C1C1C] bg-[#000000] text-xs font-semibold overflow-x-auto scrollbar-none">
          <div className="container-wide flex items-center gap-2 py-2">
            {/* All Categories Dropdown Button */}
            <div className="relative shrink-0">
              <button
                onClick={() => setCategoriesDropdownOpen(!categoriesDropdownOpen)}
                className="flex items-center gap-2 rounded bg-[#D4AF37] px-3.5 py-1.5 font-bold text-[#0B0B0B] hover:bg-[#B89124] transition shadow-sm"
              >
                <Menu size={14} />
                <span>All Categories</span>
                <ChevronDown size={14} className={`transition-transform ${categoriesDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown Menu */}
              {categoriesDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setCategoriesDropdownOpen(false)}
                  />
                  <div className="absolute left-0 top-full mt-1.5 w-64 rounded-xl border border-[#222222] bg-[#0B0B0B] py-2 shadow-2xl z-50">
                    <div className="px-4 py-2 border-b border-[#1C1C1C] text-[10px] font-bold uppercase tracking-wider text-[#888888]">
                      Product Categories
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {categories.map((category) => (
                        <Link
                          key={category.id || category.slug}
                          to={`/category/${category.slug}`}
                          onClick={() => setCategoriesDropdownOpen(false)}
                          className="flex items-center justify-between px-4 py-2.5 text-xs text-[#CCCCCC] hover:bg-[#1C1C1C] hover:text-[#D4AF37] transition"
                        >
                          <span>{category.name}</span>
                          <span className="text-[10px] text-[#666666]">→</span>
                        </Link>
                      ))}
                      {categories.length === 0 && (
                        <div className="px-4 py-3 text-xs text-[#888888]">Loading categories...</div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Brands Link */}
            <Link
              to="/brands"
              className="rounded px-3 py-1.5 whitespace-nowrap font-bold text-[#D4AF37] bg-white/5 hover:bg-white/10 transition shrink-0"
            >
              Brands
            </Link>

            {/* All Categories Pills directly in navbar */}
            {categories.map((category) => (
              <Link
                key={category.id || category.slug}
                to={`/category/${category.slug}`}
                className="rounded px-3 py-1.5 whitespace-nowrap font-medium text-[#CCCCCC] hover:text-[#D4AF37] hover:bg-white/5 transition shrink-0"
              >
                {category.name}
              </Link>
            ))}
          </div>
        </nav>

        {menuOpen && (
          <div className="absolute left-0 right-0 border-t border-[#222222] bg-[#0B0B0B] p-4 shadow-2xl md:hidden z-50 max-h-[80vh] overflow-y-auto">
            <Link
              onClick={() => setMenuOpen(false)}
              className="block border-b border-[#1C1C1C] py-3 text-sm font-bold text-[#D4AF37]"
              to="/products"
            >
              All Products
            </Link>
            <Link
              onClick={() => setMenuOpen(false)}
              className="block border-b border-[#1C1C1C] py-3 text-sm font-bold text-[#D4AF37]"
              to="/brands"
            >
              All Brands
            </Link>
            <div className="pt-2 text-[11px] font-bold uppercase tracking-wider text-[#777777]">
              Categories
            </div>
            {categories.map((cat) => (
              <Link
                onClick={() => setMenuOpen(false)}
                key={cat.id || cat.slug}
                className="block border-b border-[#1C1C1C] py-2.5 text-sm font-medium text-[#CCCCCC] hover:text-[#D4AF37]"
                to={`/category/${cat.slug}`}
              >
                {cat.name}
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
