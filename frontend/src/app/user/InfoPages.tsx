import {
  ArrowRight,
  BadgeCheck,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  EyeOff,
  Headset,
  Heart,
  HelpCircle,
  Mail,
  MapPin,
  Package,
  Phone,
  ReceiptText,
  Send,
  ShieldCheck,
  ShoppingCart,
  Tag,
  Target,
  Truck,
  UserRound,
  Users
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Link, useLocation, useNavigate } from "react-router"
import { authApi } from "../api/authApi"
import { bulkInquiryApi } from "../api/bulkInquiryApi"
import { useAuth } from "../authContext"
import { Badge, Button, PageHeader } from "../components"
import { AddressManager } from "../features/components/AddressManager"
import { useAddresses } from "../features/hooks/useAddresses"
import { useOrders } from "../features/hooks/useOrders"
import { useStore } from "../store"

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
            src="/placeholder.webp"
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
              {[].map((item) => (
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
                      placeholder="e.g. +91 8935926021"
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

const shopCertificates = [
  { src: "/certificate1.webp", alt: "Watertec authorized channel partner dealer certificate" },
  { src: "/certificate2.webp", alt: "Tata Pipes authorized dealer certificate" },
  { src: "/certificate3.webp", alt: "Ashirvad recognition certificate" },
  { src: "/certificate4.webp", alt: "CAVA Bathware authorized dealership certificate" },
]

export function AboutPage() {
  const [activeCertificate, setActiveCertificate] = useState(0)
  const certificateTrack = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveCertificate((current) => (current + 1) % shopCertificates.length)
    }, 5000)
    return () => window.clearInterval(timer)
  }, [])

  const showCertificate = (direction: -1 | 1) => {
    setActiveCertificate((current) => (current + direction + shopCertificates.length) % shopCertificates.length)
  }

  useEffect(() => {
    const track = certificateTrack.current
    const card = track?.children[activeCertificate] as HTMLElement | undefined
    if (track && card) {
      track.scrollTo({ left: card.offsetLeft - track.offsetLeft, behavior: "smooth" })
    }
  }, [activeCertificate])

  return (
    <div className="overflow-hidden bg-[#fbf8f1] text-[#111111]">
      <section className="relative isolate min-h-[530px] overflow-hidden bg-[#090909] text-white sm:min-h-[590px] lg:min-h-[610px]">
        <img src="/ShopImage.webp" alt="Hindustan Hardware storefront" className="absolute inset-0 -z-20 h-full w-full object-cover object-center lg:object-[center_45%]" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-black via-black/90 to-black/20 lg:via-black/80" />
        <div className="container-wide flex min-h-[530px] items-center py-14 sm:min-h-[590px] sm:py-16 lg:min-h-[610px]">
          <div className="max-w-2xl">
            <div className="mb-6 flex items-center gap-2 text-xs font-medium text-white/70">
              <Link to="/" aria-label="Home" className="transition hover:text-[#D4AF37]">⌂</Link>
              <span>/</span><span>About Us</span>
            </div>
            <Badge tone="warning">About Hindustan Hardware</Badge>
            <h1 className="mt-6 text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl lg:text-7xl">
              Building Trust,<br /><span className="text-[#F3C742]">Delivering Quality</span><br />Since 1993
            </h1>
            <div className="mt-5 h-1 w-16 rounded-full bg-[#F3C742]" />
            <p className="mt-5 max-w-xl text-sm leading-6 text-white/85 sm:text-base sm:leading-7">
              For over 33 years, Hindustan Hardware has been a trusted partner for builders, homeowners and contractors, offering genuine products, leading brands and expert guidance under one roof.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a href="#our-story" className="inline-flex min-h-11 items-center gap-3 rounded-lg bg-[#F3C742] px-5 py-3 text-sm font-extrabold text-black transition hover:bg-white">
                Our Story <ArrowRight size={17} />
              </a>
              <Link to="/contact" className="inline-flex min-h-11 items-center gap-3 rounded-lg border border-[#D4AF37] px-5 py-3 text-sm font-extrabold text-white transition hover:bg-[#D4AF37] hover:text-black">
                Contact Us <ArrowRight size={17} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <main className="container-wide pb-14 sm:pb-20">
        <section className="relative z-10 -mt-1 grid grid-cols-2 overflow-hidden rounded-2xl border border-[#eadcb8] bg-[#fffaf0] shadow-sm sm:grid-cols-4" aria-label="Hindustan Hardware highlights">
          {[
            [CalendarDays, "33+", "Years of Experience"],
            [Users, "10,000+", "Happy Customers"],
            [Package, "100%", "Original Products"],
            [BadgeCheck, "Top Brands", "Under One Roof"],
          ].map(([Icon, value, label], index) => {
            const HighlightIcon = Icon as typeof CalendarDays
            return (
              <div key={String(label)} className={`flex items-center gap-3 px-4 py-5 sm:justify-center sm:px-5 sm:py-6 ${index > 1 ? "border-t border-[#eadcb8] sm:border-t-0" : ""} ${index % 2 === 1 ? "border-l border-[#eadcb8] sm:border-l-0" : ""} ${index > 0 ? "sm:border-l sm:border-[#eadcb8]" : ""}`}>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#fff0c7] text-[#bd7b00] sm:h-12 sm:w-12"><HighlightIcon size={22} /></span>
                <div className="min-w-0"><b className="block text-base font-black leading-tight sm:text-xl">{String(value)}</b><span className="mt-1 block text-[10px] leading-tight text-slate-600 sm:text-xs">{String(label)}</span></div>
              </div>
            )
          })}
        </section>

        <section id="our-story" className="grid scroll-mt-24 items-center gap-8 py-14 sm:gap-12 sm:py-20 lg:grid-cols-2 lg:gap-16">
          <div className="relative mx-auto w-full max-w-[560px]">
            <div className="absolute -left-2 top-5 h-24 w-24 rounded-3xl border-[10px] border-[#edbd32]/80 sm:-left-4 sm:top-8 sm:h-32 sm:w-32" />
            <div className="relative grid grid-cols-2 gap-2.5 p-3 sm:gap-3 sm:p-5">
              {[
                ["/inside1.webp", "Plumbing supplies and pipes"],
                ["/inside2.webp", "Showroom taps and fittings"],
                ["/inside3.webp", "Sanitaryware display"],
                ["/inside4.webp", "Hardware and building materials"],
              ].map(([src, alt], index) => (
                <img key={src} src={src} alt={alt} className={`aspect-[1.18] w-full rounded-2xl object-cover shadow-md transition duration-500 hover:z-10 hover:scale-[1.03] sm:rounded-3xl ${index === 0 || index === 3 ? "translate-y-2" : "-translate-y-2"}`} />
              ))}
              <div className="absolute left-1/2 top-1/2 z-10 grid h-20 w-20 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-4 border-[#f7d66e] bg-[#111111] text-center text-[#f7d66e] shadow-xl sm:h-24 sm:w-24">
                <span className="text-[9px] font-black uppercase leading-tight tracking-wider sm:text-[10px]">Hindustan<br /><b className="text-lg sm:text-xl">Since</b><br />1993</span>
              </div>
            </div>
            <div className="absolute -bottom-1 right-0 h-16 w-16 rounded-2xl border-[8px] border-[#edbd32]/80 sm:-right-2 sm:h-24 sm:w-24" />
          </div>
          <div className="py-2">
            <p className="text-[11px] font-black uppercase tracking-[0.35em] text-[#bd7b00]">Our Story</p>
            <h2 className="mt-3 border-l-2 border-[#d49a0b] pl-4 text-2xl font-black leading-tight sm:text-3xl lg:text-4xl">
              More than products — quality, reliability and lasting relationships.
            </h2>
            <p className="mt-5 text-sm leading-7 text-slate-600 sm:text-base">
              With over 33 years of experience, we believe in delivering more than just products — we deliver quality, reliability and long-lasting relationships.
            </p>
            <p className="mt-4 text-sm leading-7 text-slate-600 sm:text-base">
              Our commitment to excellence brings together top brands, 100% original products and expert customer support under one roof. Whether you are building a new home, renovating your space or working on a large construction project, we are here to help you find the right solutions.
            </p>
          </div>
        </section>

        <section className="grid gap-4 sm:gap-5 md:grid-cols-2" aria-label="Our mission and vision">
          <article className="relative flex min-h-44 items-start gap-4 overflow-hidden rounded-2xl bg-[#101010] p-6 text-white sm:min-h-48 sm:p-8">
            <Target className="shrink-0 text-[#efbd2f]" size={28} />
            <div className="relative z-10"><h2 className="text-xl font-black">Our <span className="text-[#efbd2f]">Mission</span></h2><p className="mt-3 max-w-md text-sm leading-6 text-white/85">Making every home-building journey easier and better with quality products, trusted brands and reliable service.</p></div>
            <Target className="absolute -bottom-5 -right-3 text-[#d3a817]/20" size={112} />
          </article>
          <article className="relative flex min-h-44 items-start gap-4 overflow-hidden rounded-2xl border border-[#e8c05c] bg-gradient-to-br from-[#fffdf7] to-[#fff3ce] p-6 sm:min-h-48 sm:p-8">
            <Eye className="shrink-0 text-[#c48a00]" size={28} />
            <div className="relative z-10"><h2 className="text-xl font-black">Our <span className="text-[#b77d00]">Vision</span></h2><p className="mt-3 max-w-md text-sm leading-6 text-slate-700">To be a one-stop and most trusted destination for hardware, plumbing, sanitaryware and building materials in the region.</p></div>
            <Building2 className="absolute -bottom-5 -right-3 text-[#d3a817]/15" size={112} />
          </article>
        </section>

        <section className="py-14 sm:py-20" aria-label="Why choose us">
          <div className="mx-auto max-w-2xl text-center"><p className="text-[10px] font-black uppercase tracking-[0.4em] text-[#bd7b00]">Why choose us</p><h2 className="mt-2 text-2xl font-black sm:text-3xl">Trusted for every project</h2></div>
          <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6">
            {[
              [ShieldCheck, "33+ Years", "of Trust"],
              [Tag, "Top 5", "Brands"],
              [Package, "100% Original", "Products"],
              [Headset, "Expert", "Guidance"],
              [Truck, "Reliable", "Service"],
              [ReceiptText, "Computerized", "Billing"],
            ].map(([Icon, title, subtitle]) => {
              const BenefitIcon = Icon as typeof ShieldCheck
              return <article key={String(title)} className="group flex min-h-28 flex-col items-center justify-center rounded-xl border border-[#efe5d0] bg-white px-3 py-4 text-center shadow-[0_3px_15px_rgba(80,60,10,0.04)] transition duration-300 hover:-translate-y-1 hover:border-[#e6bd52] hover:shadow-md sm:min-h-32"><BenefitIcon size={27} className="text-[#bd7b00] transition group-hover:scale-110" /><h3 className="mt-3 text-xs font-black sm:text-sm">{String(title)}</h3><p className="text-[11px] text-slate-600 sm:text-xs">{String(subtitle)}</p></article>
            })}
          </div>
        </section>

        <section aria-label="Certificates and authorizations" className="overflow-hidden rounded-2xl bg-[#101010] p-5 text-white shadow-xl sm:p-7 lg:flex lg:items-center lg:gap-8 lg:p-8">
          <div className="mb-5 flex items-center gap-4 lg:mb-0 lg:w-[36%] lg:shrink-0">
            <BadgeCheck className="h-10 w-10 shrink-0 text-[#efbd2f] sm:h-12 sm:w-12" />
            <div><h2 className="text-xl font-black sm:text-2xl">Certificates &amp; <span className="text-[#efbd2f]">Authorizations</span></h2><p className="mt-1 text-xs leading-5 text-white/70 sm:text-sm">Recognitions and dealership certificates from our brand partners.</p></div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="relative">
              <div ref={certificateTrack} className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-4">
                {shopCertificates.map((certificate, index) => (
                  <div key={certificate.src} className={`w-[82%] shrink-0 snap-center overflow-hidden rounded-xl border-2 bg-white p-2 transition duration-500 sm:w-[46%] lg:w-[31%] ${activeCertificate === index ? "border-[#efbd2f] shadow-[0_0_20px_rgba(239,189,47,0.2)]" : "border-white/10 opacity-75"}`}>
                    <img src={certificate.src} alt={certificate.alt} className="h-28 w-full object-contain sm:h-32" />
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => showCertificate(-1)} aria-label="Previous certificate" className="absolute left-0 top-1/2 grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-slate-200 bg-white text-slate-900 shadow-md transition hover:bg-[#efbd2f]"><ChevronLeft size={19} /></button>
              <button type="button" onClick={() => showCertificate(1)} aria-label="Next certificate" className="absolute right-0 top-1/2 grid h-9 w-9 translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-slate-200 bg-white text-slate-900 shadow-md transition hover:bg-[#efbd2f]"><ChevronRight size={19} /></button>
            </div>
            <div className="mt-3 flex justify-center gap-1.5" role="group" aria-label="Choose a certificate">
              {shopCertificates.map((certificate, index) => <button key={certificate.src} type="button" onClick={() => setActiveCertificate(index)} aria-label={`Show certificate ${index + 1}`} aria-current={activeCertificate === index ? "true" : undefined} className={`h-1.5 rounded-full transition-all ${activeCertificate === index ? "w-6 bg-[#efbd2f]" : "w-1.5 bg-white/40 hover:bg-white"}`} />)}
            </div>
          </div>
        </section>

        <section className="mt-10 flex flex-col items-center justify-between gap-4 rounded-2xl border border-[#ecdba8] bg-[#fff9e9] p-6 text-center sm:flex-row sm:text-left sm:p-8">
          <div><h2 className="text-xl font-black sm:text-2xl">Hindustan Hardware – Your Home, Our Priority.</h2><p className="mt-2 text-sm text-slate-600">We’re here to help you find the right products for your next project.</p></div>
          <Link to="/products" className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-[#111111] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#d3a817] hover:text-black">Explore Products <ArrowRight size={17} /></Link>
        </section>
      </main>
    </div>
  )
}

export function ContactPage({ bulk = false }: { bulk?: boolean }) {
  const { notify } = useStore()
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitError(null)
    if (!bulk) {
      setSubmitted(true)
      notify("Message submitted")
      return
    }

    const form = event.currentTarget
    const values = new FormData(form)
    const payload = {
      fullName: String(values.get("fullName") || "").trim(),
      phone: String(values.get("phone") || "").trim(),
      email: String(values.get("email") || "").trim(),
      productDetails: String(values.get("productDetails") || "").trim(),
      quantity: String(values.get("quantity") || "").trim(),
      deliveryLocation: String(values.get("deliveryLocation") || "").trim(),
      requirements: String(values.get("requirements") || "").trim(),
    }
    const whatsappText = [
      "New Bulk Order Inquiry - Hindustan Hardware",
      `Name: ${payload.fullName}`,
      `Phone: ${payload.phone}`,
      payload.email ? `Email: ${payload.email}` : "",
      `Products / sizes: ${payload.productDetails}`,
      `Quantity: ${payload.quantity}`,
      `Delivery location: ${payload.deliveryLocation}`,
      payload.requirements ? `Additional requirements: ${payload.requirements}` : "",
    ].filter(Boolean).join("\n")
    const whatsappUrl = `https://wa.me/918935926021?text=${encodeURIComponent(whatsappText)}`
    const whatsappWindow = window.open("about:blank", "_blank")
    if (whatsappWindow) whatsappWindow.opener = null

    setSubmitting(true)
    try {
      await bulkInquiryApi.submit(payload)
      setSubmitted(true)
      notify("Bulk inquiry saved. Continue in WhatsApp to send it to the store.")
      if (whatsappWindow) {
        whatsappWindow.location.replace(whatsappUrl)
      } else {
        window.location.assign(whatsappUrl)
      }
    } catch (err: any) {
      whatsappWindow?.close()
      setSubmitError(err?.message || "We could not save your inquiry. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }
  return (
    <div className={`container-wide py-8 sm:py-12 ${bulk ? "max-w-6xl" : ""}`}>
      <PageHeader
        title={
          bulk ? "Bulk Orders & Project Quotes" : "Contact Hindustan Hardware"
        }
        description={
          bulk
            ? "Tell us what your project needs. We’ll save your request and open WhatsApp so you can send it directly to our team."
            : "Ask about a product, an order or store services. Contact details remain configurable placeholders."
        }
      />
      <div className={`grid gap-6 lg:gap-8 ${bulk ? "lg:grid-cols-[0.72fr_1.28fr]" : "lg:grid-cols-[0.75fr_1.25fr]"}`}>
        <aside className={`rounded-2xl p-6 text-white sm:p-8 ${bulk ? "bg-gradient-to-br from-[#101010] via-[#18150d] to-[#30230a]" : "bg-brand"}`}>
          <h2 className="text-2xl font-black">{bulk ? "Let’s plan your project." : "Store information"}</h2>
          {bulk && <p className="mt-3 text-sm leading-6 text-white/75">Share your material list and delivery details. Our team will help with product availability and a suitable quotation.</p>}
          <div className="mt-7 space-y-6">
            {[
              [
                MapPin,
                "Address",
                "P.G. Road, Opposite Eidgah, Jehanabad, Bihar 804408",
              ],
              [Phone, "Phone", "+91 8935926021"],
              [Mail, "Email", "info@hindustanhardware.in"],
              [Clock3, "Business hours", "Contact us for assistance"],
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
          {bulk && <div className="mt-8 rounded-xl border border-[#D4AF37]/30 bg-white/5 p-4"><p className="text-xs font-bold uppercase tracking-wider text-[#F3C742]">What happens next?</p><ol className="mt-3 space-y-2 text-xs leading-5 text-white/80"><li>1. Your inquiry is saved securely for our team.</li><li>2. WhatsApp opens with your request ready to send.</li><li>3. We’ll follow up about availability and pricing.</li></ol></div>}
        </aside>
        <section className="rounded-2xl border border-border bg-white p-5 shadow-sm sm:p-8">
          {submitted ? (
            <div className="flex min-h-96 flex-col items-center justify-center text-center">
              <CheckCircle2 className="text-emerald-700" size={48} />
              <h2 className="mt-4 text-2xl font-black">
                {bulk ? "Inquiry received" : "Message received"}
              </h2>
              <p className="mt-2 max-w-md text-sm text-slate-500">
                {bulk ? "Your request is saved for our team. WhatsApp has opened with your inquiry details—send the message there to contact the store." : "Thanks for contacting Hindustan Hardware. We’ll be happy to help."}
              </p>
              <Button className="mt-6" onClick={() => setSubmitted(false)}>{bulk ? "Send another inquiry" : "Send another message"}</Button>
            </div>
          ) : (
            <form onSubmit={submit}>
              <h2 className="text-2xl font-black">
                {bulk ? "Tell us what you need" : "Send us a message"}
              </h2>
              {bulk && <p className="mt-2 text-sm leading-6 text-slate-500">Fields marked required help us prepare an accurate bulk quotation.</p>}
              {submitError && <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{submitError}</div>}
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <Label text="Full name">
                  <input name="fullName" required className="field mt-2" autoComplete="name" placeholder="Your name" />
                </Label>
                <Label text="Phone">
                  <input name="phone" required pattern="[0-9]{10}" inputMode="numeric" className="field mt-2" autoComplete="tel" placeholder="10-digit mobile number" />
                </Label>
                {bulk && (
                  <>
                    <Label text="Products / sizes required">
                      <input
                        name="productDetails"
                        required
                        className="field mt-2"
                        placeholder="e.g. 2-inch UPVC pipes, elbows, valves"
                      />
                    </Label>
                    <Label text="Required quantity">
                      <input
                        name="quantity"
                        required
                        className="field mt-2"
                        placeholder="e.g. 30 lengths, 20 pieces"
                      />
                    </Label>
                    <Label text="Delivery location">
                      <input name="deliveryLocation" required className="field mt-2" autoComplete="street-address" placeholder="City, area or full address" />
                    </Label>
                    <Label text="Email (optional)">
                      <input name="email" type="email" className="field mt-2" autoComplete="email" placeholder="you@example.com" />
                    </Label>
                  </>
                )}
                <div className="sm:col-span-2">
                  <Label text={bulk ? "Project notes / additional requirements (optional)" : "How can we help?"}>
                    <textarea
                      name={bulk ? "requirements" : "message"}
                      required={!bulk}
                      rows={5}
                      className="field mt-2 resize-none"
                      placeholder={bulk ? "Project type, preferred brands, delivery timing, or anything else we should know" : "Write your message here"}
                    />
                  </Label>
                </div>
              </div>
              <Button type="submit" disabled={submitting} className="mt-6 w-full justify-center sm:w-auto">
                {submitting ? "Saving inquiry..." : bulk ? "Submit & Continue to WhatsApp" : "Send Message"}
                <Send size={16} />
              </Button>
            </form>
          )}
        </section>
      </div>
    </div>
  )
}
