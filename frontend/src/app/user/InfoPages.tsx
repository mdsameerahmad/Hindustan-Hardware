import { useEffect, useState } from "react"
import { Link, useLocation } from "react-router"
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock3,
  Eye,
  EyeOff,
  FileText,
  Heart,
  HelpCircle,
  History,
  Mail,
  MapPin,
  Package,
  Phone,
  Send,
  ShieldCheck,
  ShoppingCart,
  Store,
  UserRound,
  Wrench,
} from "lucide-react"
import { catalogueApi, type BackendCategory } from "../api/catalogueApi"
import { Badge, Button, PageHeader } from "../components"
import { useStore } from "../store"
import { useAuth } from "../authContext"
import { authApi } from "../api/authApi"
import { useNavigate } from "react-router"
import { AddressManager } from "../features/components/AddressManager"
import { useAddresses } from "../features/hooks/useAddresses"
import { useOrders } from "../features/hooks/useOrders"

export function AuthPage() {
  const { pathname, state } = useLocation()
  const navigate = useNavigate()
  const { login, register, isAuthenticated, user } = useAuth()
  const signup = pathname === "/signup"

  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successInfo, setSuccessInfo] = useState<{ title: string; text: string } | null>(null)

  // Redirect destination if specified (defaults to home "/" or "/admin" or "/partner/dashboard")
  const getDefaultRedirect = (role?: string) => {
    if (role === "admin" || role === "staff") return "/admin"
    if (role === "delivery_partner") return "/partner/dashboard"
    return "/"
  }

  const from = (state as any)?.from?.pathname || getDefaultRedirect(user?.role)

  // If already authenticated and not showing success screen, redirect
  useEffect(() => {
    if (isAuthenticated && !successInfo) {
      navigate(getDefaultRedirect(user?.role), { replace: true })
    }
  }, [isAuthenticated, successInfo, navigate, user?.role])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setErrorMessage(null)
    setLoading(true)

    try {
      if (signup) {
        if (!email.trim() || !password || !fullName.trim()) {
          setErrorMessage("Please fill in all required fields.")
          setLoading(false)
          return
        }
        if (password.length < 8) {
          setErrorMessage("Password must be at least 8 characters long.")
          setLoading(false)
          return
        }

        const res = await register({
          email: email.trim().toLowerCase(),
          password,
          fullName: fullName.trim(),
          phone: phone.trim() || undefined,
        })

        if (res.requiresVerification) {
          setSuccessInfo({
            title: "Registration successful!",
            text: "Please check your email to verify your account before logging in.",
          })
        } else {
          setSuccessInfo({
            title: "Account created successfully!",
            text: "Welcome to Hindustan Hardware & Sanitary.",
          })
          window.setTimeout(() => {
            navigate(from, { replace: true })
          }, 1500)
        }
      } else {
        if (!email.trim() || !password) {
          setErrorMessage("Please enter both email and password.")
          setLoading(false)
          return
        }

        await login({
          email: email.trim().toLowerCase(),
          password,
        })

        navigate(from, { replace: true })
      }
    } catch (err: any) {
      setErrorMessage(err?.message || "Authentication failed. Please verify your details.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[75vh] bg-slate-100 py-10">
      <div className="container-narrow grid overflow-hidden rounded-2xl border border-border bg-white shadow-xl md:grid-cols-2">
        <div className="relative hidden min-h-[580px] overflow-hidden bg-brand p-10 text-white md:block">
          <img
            src="https://images.unsplash.com/photo-1454988501794-2992f706932e?auto=format&fit=crop&w=1000&q=80"
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-25"
          />
          <div className="relative">
            <Link to="/" className="inline-block group">
              <img
                src="/logo.webp"
                alt="Hindustan Hardware"
                className="h-16 w-16 rounded-full object-cover border-2 border-[#D4AF37] shadow-xl shadow-black/40 group-hover:scale-105 transition-transform"
              />
            </Link>
            <h1 className="mt-8 text-4xl font-black">
              {signup
                ? "Create your customer account"
                : "Welcome back to your local hardware store"}
            </h1>
            <p className="mt-4 leading-7 text-blue-100">
              Manage orders, save project lists, track local delivery and
              reorder essentials faster.
            </p>
            <div className="mt-10 space-y-4 text-sm">
              {[
                "Instant, secure Supabase authentication",
                "Persistent cart and real-time order history",
                "Exclusive contractor & homeowner benefits",
              ].map((item) => (
                <p className="flex items-center gap-3" key={item}>
                  <CheckCircle2 className="text-accent" size={18} />
                  {item}
                </p>
              ))}
            </div>
          </div>
        </div>
        <div className="p-7 sm:p-10">
          {successInfo ? (
            <div className="flex min-h-[480px] flex-col items-center justify-center text-center">
              <span className="grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-emerald-700">
                <CheckCircle2 size={32} />
              </span>
              <h2 className="mt-5 text-2xl font-black">
                {successInfo.title}
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                {successInfo.text}
              </p>
              <Link className="mt-6" to="/account">
                <Button>Go to Account Dashboard</Button>
              </Link>
            </div>
          ) : (
            <>
              {/* Mobile / Form Top Logo */}
              <div className="flex items-center gap-3 mb-5">
                <Link to="/" className="flex items-center gap-3">
                  <img
                    src="/logo.webp"
                    alt="Hindustan Hardware"
                    className="h-12 w-12 rounded-full object-cover border-2 border-[#D4AF37] shadow-md shadow-[#D4AF37]/20 shrink-0"
                  />
                  <div>
                    <span className="block font-serif text-base font-black tracking-wider text-[#0B0B0B] leading-tight">
                      HINDUSTAN HARDWARE
                    </span>
                    <span className="block text-[9px] font-bold tracking-[0.2em] text-[#D4AF37] uppercase">
                      EST. 1993 · TRUSTED QUALITY
                    </span>
                  </div>
                </Link>
              </div>

              <Badge tone="blue">Secure Account Access</Badge>
              <h2 className="mt-4 text-3xl font-black">
                {signup ? "Create an account" : "Login to your account"}
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                {signup
                  ? "Register to save addresses and manage orders."
                  : "Enter your registered credentials to access your account."}
              </p>

              {errorMessage && (
                <div className="mt-4 rounded-lg bg-red-50 p-3.5 text-sm font-semibold text-red-700 border border-red-200">
                  {errorMessage}
                </div>
              )}

              <form
                onSubmit={handleSubmit}
                className="mt-7 space-y-4"
              >
                {signup && (
                  <Label text="Full name">
                    <input
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Ramesh Kumar"
                      className="field mt-2"
                      disabled={loading}
                    />
                  </Label>
                )}
                <Label text="Email address">
                  <input
                    required
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="field mt-2"
                    disabled={loading}
                  />
                </Label>
                {signup && (
                  <Label text="Phone number (optional)">
                    <input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="field mt-2"
                      placeholder="e.g. +91 98765 43210"
                      disabled={loading}
                    />
                  </Label>
                )}
                <Label text="Password">
                  <div className="relative mt-2">
                    <input
                      required
                      minLength={signup ? 8 : 1}
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={signup ? "Minimum 8 characters" : "Enter your password"}
                      className="field w-full pr-10"
                      disabled={loading}
                    />
                    <button
                      type="button"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition p-1"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </Label>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      if (!email.trim()) {
                        setErrorMessage("Please enter your email above first to receive reset instructions.")
                      } else {
                        authApi
                          .forgotPassword(email.trim().toLowerCase())
                          .then(() => alert("If registered, a reset link has been sent to your email."))
                          .catch((err) => setErrorMessage(err.message))
                      }
                    }}
                    className="text-sm font-bold text-brand hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>

                <Button className="w-full" type="submit" disabled={loading}>
                  {loading
                    ? "Authenticating..."
                    : signup
                      ? "Create Account"
                      : "Login"}
                </Button>
              </form>

              <div className="my-6 flex items-center gap-3 text-xs text-slate-400">
                <span className="h-px flex-1 bg-border" />
                OR
                <span className="h-px flex-1 bg-border" />
              </div>
              <Link to="/cart">
                <Button variant="outline" className="w-full">
                  Continue as Guest
                </Button>
              </Link>
              <p className="mt-6 text-center text-sm text-slate-500">
                {signup
                  ? "Already have an account?"
                  : "New to Hindustan Hardware?"}{" "}
                <Link
                  className="font-bold text-brand"
                  to={signup ? "/login" : "/signup"}
                  onClick={() => setErrorMessage(null)}
                >
                  {signup ? "Login" : "Sign up"}
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export function AccountPage() {
  const { wishlist, cartCount } = useStore()
  const { user, logout, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const { totalCount: ordersCount } = useOrders(isAuthenticated)

  const {
    addresses,
    loading: loadingAddresses,
    createAddress,
    setDefaultAddress,
    deleteAddress,
  } = useAddresses(isAuthenticated)

  const displayName = user?.profile?.full_name || user?.email?.split("@")[0] || "Valued Customer"
  const phone = user?.profile?.phone || "Not specified"
  const email = user?.email || "Not specified"
  const role = user?.role || "customer"

  const handleLogout = async () => {
    await logout()
    navigate("/", { replace: true })
  }

  return (
    <div className="container-wide py-6 sm:py-8">
      {/* Premium Account Header Banner with Black & Gold Theme */}
      <div className="mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-[#0B0B0B] via-[#14120B] to-[#1F190B] p-6 sm:p-7 border border-[#D4AF37]/35 shadow-lg relative overflow-hidden">
        <div className="flex items-center gap-4 z-10">
          <div className="relative">
            <span className="grid h-14 w-14 sm:h-16 sm:w-16 place-items-center rounded-2xl bg-gradient-to-br from-[#1C1C1C] to-[#0A0A0A] border-2 border-[#D4AF37] text-[#D4AF37] shadow-md">
              <UserRound size={28} />
            </span>
            <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-black text-[9px] font-black text-white">
              ✓
            </span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-white">{displayName}</h1>
              <span className="rounded-md bg-[#D4AF37]/20 border border-[#D4AF37]/40 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-[#D4AF37]">
                {role}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-300 font-medium flex flex-wrap items-center gap-3">
              <span>{email}</span>
              {phone !== "Not specified" && (
                <>
                  <span className="text-[#D4AF37]/60">·</span>
                  <span>{phone}</span>
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 z-10 self-end md:self-auto">
          {role === "admin" && (
            <Link to="/admin">
              <Button className="btn-gold-gradient py-2 px-4 text-xs font-bold text-[#0B0B0B]">
                Admin Console
              </Button>
            </Link>
          )}
          <Button
            variant="outline"
            onClick={handleLogout}
            className="border-slate-700 bg-black/40 text-slate-300 hover:border-[#D4AF37] hover:text-[#D4AF37] text-xs py-2 px-4"
          >
            Sign Out
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[260px_1fr] items-start">
        {/* Left Sidebar Navigation */}
        <aside className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs sticky top-20">
          <p className="px-3 pb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
            Account Menu
          </p>
          <nav className="space-y-1">
            {[
              ["Personal Details", UserRound, "/account", true],
              ["My Orders", Package, "/my-orders", false],
              ["Wishlist", Heart, "/wishlist", false],
              ["Shopping Cart", ShoppingCart, "/cart", false],
              ["Customer Support", HelpCircle, "/contact", false],
            ].map(([label, Icon, path, isActive]) => {
              const IconComponent = Icon as typeof UserRound
              return (
                <Link
                  key={String(label)}
                  to={String(path)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-xs font-bold transition ${
                    isActive
                      ? "bg-[#0B0B0B] text-[#D4AF37] shadow-xs"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <IconComponent size={16} className={isActive ? "text-[#D4AF37]" : "text-slate-400"} />
                  {String(label)}
                </Link>
              )
            })}
          </nav>
        </aside>

        {/* Right Content Area */}
        <div className="space-y-6">
          {/* Quick Metrics Cards */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Link to="/my-orders" className="block group">
              <div className="rounded-2xl border border-slate-200/90 bg-gradient-to-br from-white to-[#FCFAF5] p-5 shadow-xs transition group-hover:border-[#D4AF37]/50 group-hover:shadow-md">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Orders</span>
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-50 text-[#B89124] border border-amber-200/40">
                    <Package size={18} />
                  </span>
                </div>
                <b className="mt-3 block text-2xl sm:text-3xl font-black text-slate-900">{ordersCount}</b>
                <span className="mt-1 block text-[11px] font-semibold text-[#B89124] group-hover:underline">
                  View order history &rarr;
                </span>
              </div>
            </Link>

            <Link to="/wishlist" className="block group">
              <div className="rounded-2xl border border-slate-200/90 bg-gradient-to-br from-white to-[#FCFAF5] p-5 shadow-xs transition group-hover:border-[#D4AF37]/50 group-hover:shadow-md">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Wishlist</span>
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-red-50 text-red-500 border border-red-200/40">
                    <Heart size={18} />
                  </span>
                </div>
                <b className="mt-3 block text-2xl sm:text-3xl font-black text-slate-900">{wishlist.length}</b>
                <span className="mt-1 block text-[11px] font-semibold text-slate-500 group-hover:text-slate-900">
                  Saved hardware items &rarr;
                </span>
              </div>
            </Link>

            <Link to="/cart" className="block group">
              <div className="rounded-2xl border border-slate-200/90 bg-gradient-to-br from-white to-[#FCFAF5] p-5 shadow-xs transition group-hover:border-[#D4AF37]/50 group-hover:shadow-md">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Cart Items</span>
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200/40">
                    <ShoppingCart size={18} />
                  </span>
                </div>
                <b className="mt-3 block text-2xl sm:text-3xl font-black text-slate-900">{cartCount}</b>
                <span className="mt-1 block text-[11px] font-semibold text-slate-500 group-hover:text-slate-900">
                  Proceed to checkout &rarr;
                </span>
              </div>
            </Link>
          </div>

          {/* Personal Profile Details Card */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-base sm:text-lg font-black text-slate-900">Profile Information</h2>
                <p className="text-xs text-slate-500">Your personal details registered with Hindustan Hardware</p>
              </div>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-extrabold text-emerald-700 border border-emerald-200/60">
                Verified Account
              </span>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
                <small className="block text-[10px] font-black uppercase tracking-wider text-slate-400">Full Name</small>
                <p className="mt-1 text-sm font-bold text-slate-800">{displayName}</p>
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
                <small className="block text-[10px] font-black uppercase tracking-wider text-slate-400">Phone Number</small>
                <p className="mt-1 text-sm font-bold text-slate-800">{phone}</p>
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
                <small className="block text-[10px] font-black uppercase tracking-wider text-slate-400">Email Address</small>
                <p className="mt-1 text-sm font-bold text-slate-800 break-all">{email}</p>
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
                <small className="block text-[10px] font-black uppercase tracking-wider text-slate-400">Account Type</small>
                <p className="mt-1 text-sm font-bold text-[#B89124] uppercase">{role} Customer</p>
              </div>
            </div>
          </div>

          {/* Saved Addresses Section */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs">
            <AddressManager
              addresses={addresses}
              loading={loadingAddresses}
              onCreateAddress={createAddress}
              onSetDefaultAddress={setDefaultAddress}
              onDeleteAddress={deleteAddress}
            />
          </div>

          {/* Account Security & Session Card */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs">
            <h2 className="text-base sm:text-lg font-black text-slate-900">Account Security & Session</h2>
            <p className="text-xs text-slate-500">Manage your active authentication session and security settings</p>
            <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
              <div>
                <p className="text-xs font-bold text-slate-900">Active Secure Session</p>
                <p className="text-[11px] text-slate-500">Authenticated via Hindustan Hardware database</p>
              </div>
              <Button
                variant="outline"
                onClick={handleLogout}
                className="border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 text-xs py-2 px-4 font-bold"
              >
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string
  value: string
  icon: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-border bg-white p-5">
      <span className="text-brand">{icon}</span>
      <b className="mt-4 block text-3xl">{value}</b>
      <span className="text-sm text-slate-500">{label}</span>
    </div>
  )
}
type DisplayFieldProps = {
  label: string
  value: string
}

function DisplayField({ label, value }: DisplayFieldProps) {
  return (
    <div>
      <small className="font-bold uppercase tracking-wide text-slate-400">
        {label}
      </small>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  )
}
type LabelProps = {
  text: string
  children: React.ReactNode
}

function Label({ text, children }: LabelProps) {
  return (
    <label className="field-label">
      {text}
      {children}
    </label>
  )
}

export function AboutPage() {
  const [categoriesList, setCategoriesList] = useState<BackendCategory[]>([])
  const [loadingCats, setLoadingCats] = useState(true)

  useEffect(() => {
    let isMounted = true
    catalogueApi
      .getCategories()
      .then((cats) => {
        if (isMounted && cats) setCategoriesList(cats)
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setLoadingCats(false)
      })
    return () => {
      isMounted = false
    }
  }, [])

  return (
    <>
      <section className="bg-brand py-16 text-white">
        <div className="container-wide">
          <Badge tone="warning">About Hindustan Hardware</Badge>
          <h1 className="mt-5 max-w-3xl text-4xl font-black tracking-tight sm:text-5xl">
            Practical hardware supply with a strong local connection.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-blue-100">
            Serving Jehanabad and surrounding areas with plumbing, water
            connection, electrical and construction essentials.
          </p>
        </div>
      </section>
      <div className="container-wide py-14">
        <section className="grid gap-10 md:grid-cols-2 md:items-center">
          <div>
            <p className="eyebrow">Our story</p>
            <h2 className="mt-2 text-3xl font-black">
              Built around the needs of local homes and projects
            </h2>
            <p className="mt-4 leading-7 text-slate-600">
              Hindustan Hardware is a local hardware and plumbing supply
              business in Jehanabad. This website prototype is designed to make
              product discovery, quantity planning and local ordering more
              convenient. Business history and establishment details remain
              editable until supplied by the owner.
            </p>
          </div>
          <img
            src="https://images.unsplash.com/photo-1789992085565-c9eaf815767b?auto=format&fit=crop&w=1100&q=80"
            alt="Illustrative hardware store, not the actual shop"
            className="h-80 w-full rounded-2xl object-cover"
          />
        </section>
        <section className="section-space">
          <p className="eyebrow">Our product range</p>
          <h2 className="mt-2 text-3xl font-black">
            Hardware for water, electrical and construction work
          </h2>
          {loadingCats ? (
            <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-32 animate-pulse rounded-xl bg-slate-100" />
              ))}
            </div>
          ) : categoriesList.length > 0 ? (
            <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {categoriesList.map((category) => (
                <Link
                  key={category.slug}
                  to={`/category/${category.slug}`}
                  className="rounded-xl border border-border bg-white p-4 text-center transition hover:-translate-y-1 hover:border-brand/40 hover:shadow-md"
                >
                  <img
                    src={
                      category.image_url ||
                      "https://images.unsplash.com/photo-1642797735471-3e90055c5ff9?auto=format&fit=crop&w=700&q=80"
                    }
                    alt={category.name}
                    className="mx-auto h-20 w-20 rounded-full object-cover"
                  />
                  <b className="mt-3 block text-sm">{category.name}</b>
                </Link>
              ))}
            </div>
          ) : (
            <p className="mt-6 text-sm text-slate-500">Categories are currently being updated.</p>
          )}
        </section>
        <section className="section-space">
          <div className="rounded-2xl bg-slate-100 p-7 sm:p-10">
            <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
              <div>
                <p className="eyebrow">Our work & experience</p>
                <h2 className="mt-2 text-3xl font-black">
                  Project gallery placeholders
                </h2>
                <p className="mt-4 leading-7 text-slate-600">
                  These are illustrative stock images only. They do not
                  represent completed Hindustan Hardware customer projects.
                  Actual project photos can be added later.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  [
                    "https://images.unsplash.com/photo-1642797735471-3e90055c5ff9?auto=format&fit=crop&w=800&q=80",
                    "Plumbing installation",
                  ],
                  [
                    "https://images.unsplash.com/photo-1603093433330-e0e5c30df0fe?auto=format&fit=crop&w=800&q=80",
                    "Water tank installation",
                  ],
                  [
                    "https://images.unsplash.com/photo-1673870861507-d72aa6855d89?auto=format&fit=crop&w=800&q=80",
                    "Pipe supply work",
                  ],
                  [
                    "https://images.unsplash.com/photo-1751486289943-0428133c367c?auto=format&fit=crop&w=800&q=80",
                    "Construction supply",
                  ],
                ].map(([image, title]) => (
                  <figure
                    key={title}
                    className="relative overflow-hidden rounded-xl"
                  >
                    <img
                      src={image}
                      alt=""
                      className="aspect-square h-full w-full object-cover"
                    />
                    <figcaption className="absolute inset-x-2 bottom-2 rounded bg-black/70 px-2 py-1 text-xs font-bold text-white">
                      Illustrative: {title}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          </div>
        </section>
        <section className="section-space grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-white p-7">
            <p className="eyebrow">Established business & trust</p>
            <h2 className="mt-2 text-2xl font-black">
              Credentials shown only when verified
            </h2>
            <p className="mt-4 leading-7 text-slate-600">
              Year established, registrations, certifications, authorized
              dealerships, service coverage and testimonials are intentionally
              hidden until supplied and verified by the business.
            </p>
            <div className="mt-5 flex items-center gap-3 rounded-lg bg-amber-50 p-4 text-sm font-semibold text-amber-800">
              <ShieldCheck />
              No invented credentials or customer metrics.
            </div>
          </div>
          <div className="rounded-2xl bg-ink p-7 text-white">
            <MapPin className="text-accent" />
            <h2 className="mt-4 text-2xl font-black">Visit our store</h2>
            <p className="mt-3 leading-7 text-slate-300">
              Hindustan Hardware
              <br />
              P.G. Road, Opposite Eidgah,
              <br />
              Jehanabad, Bihar 804408.
            </p>
            <a
              href="https://www.google.com/maps/search/?api=1&query=P.G.+Road+Opposite+Eidgah+Jehanabad+Bihar+804408"
              target="_blank"
              rel="noreferrer"
            >
              <Button variant="secondary" className="mt-6">
                Open in Maps
              </Button>
            </a>
          </div>
        </section>
        <section className="mt-12 rounded-2xl bg-brand p-8 text-center text-white sm:p-12">
          <h2 className="text-3xl font-black">
            Looking for the Right Hardware for Your Project?
          </h2>
          <p className="mt-3 text-blue-100">
            Explore the catalog or tell us what you need.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link to="/products">
              <Button variant="secondary">Explore Products</Button>
            </Link>
            <Link to="/contact">
              <Button
                variant="outline"
                className="border-white/30 bg-transparent text-white"
              >
                Contact Us
              </Button>
            </Link>
          </div>
        </section>
      </div>
    </>
  )
}

export function ContactPage({ bulk = false }: { bulk?: boolean }) {
  const { notify } = useStore()
  const [submitted, setSubmitted] = useState(false)
  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitted(true)
    notify(bulk ? "Bulk inquiry submitted" : "Message submitted")
  }
  return (
    <div className="container-wide py-10">
      <PageHeader
        title={
          bulk ? "Request a project quotation" : "Contact Hindustan Hardware"
        }
        description={
          bulk
            ? "Share the products, sizes, quantities and delivery location for a demo bulk inquiry."
            : "Ask about a product, an order or store services. Contact details remain configurable placeholders."
        }
      />
      <div className="grid gap-7 lg:grid-cols-[0.75fr_1.25fr]">
        <aside className="rounded-2xl bg-brand p-7 text-white">
          <h2 className="text-2xl font-black">Store information</h2>
          <div className="mt-7 space-y-6">
            {[
              [
                MapPin,
                "Address",
                "P.G. Road, Opposite Eidgah, Jehanabad, Bihar 804408",
              ],
              [Phone, "Phone", "+91 XXXXX XXXXX"],
              [Mail, "Email", "contact@example.com"],
              [Clock3, "Business hours", "Configurable by store"],
            ].map(([Icon, title, value]) => {
              const C = Icon as typeof MapPin
              return (
                <div className="flex gap-3" key={String(title)}>
                  <C className="shrink-0 text-accent" size={21} />
                  <div>
                    <b className="block">{String(title)}</b>
                    <span className="mt-1 block text-sm leading-6 text-blue-100">
                      {String(value)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </aside>
        <section className="rounded-2xl border border-border bg-white p-7">
          {submitted ? (
            <div className="flex min-h-96 flex-col items-center justify-center text-center">
              <CheckCircle2 className="text-emerald-700" size={48} />
              <h2 className="mt-4 text-2xl font-black">
                {bulk ? "Inquiry received" : "Message received"}
              </h2>
              <p className="mt-2 max-w-md text-sm text-slate-500">
                This demo submission is stored only in the current prototype
                experience. A backend is required for real notifications.
              </p>
              <Button className="mt-6" onClick={() => setSubmitted(false)}>
                Send another
              </Button>
            </div>
          ) : (
            <form onSubmit={submit}>
              <h2 className="text-2xl font-black">
                {bulk ? "Project requirements" : "Send us a message"}
              </h2>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <Label text="Full name">
                  <input required className="field mt-2" />
                </Label>
                <Label text="Phone">
                  <input required pattern="[0-9]{10}" className="field mt-2" />
                </Label>
                {bulk && (
                  <>
                    <Label text="Product / pipe size">
                      <input
                        required
                        className="field mt-2"
                        placeholder="e.g. 2 inch UPVC"
                      />
                    </Label>
                    <Label text="Required quantity">
                      <input
                        required
                        className="field mt-2"
                        placeholder="e.g. 30 lengths"
                      />
                    </Label>
                    <Label text="Delivery location">
                      <input required className="field mt-2" />
                    </Label>
                  </>
                )}
                <div className="sm:col-span-2">
                  <Label text={bulk ? "Full requirements" : "How can we help?"}>
                    <textarea
                      required
                      rows={5}
                      className="field mt-2 resize-none"
                    />
                  </Label>
                </div>
              </div>
              <Button type="submit" className="mt-6">
                {bulk ? "Submit Bulk Inquiry" : "Send Message"}
                <Send size={16} />
              </Button>
            </form>
          )}
        </section>
      </div>
    </div>
  )
}
