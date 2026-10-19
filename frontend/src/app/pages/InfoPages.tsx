import { useState } from "react"
import { Link, useLocation } from "react-router"
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock3,
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
import { categories } from "../data"
import { Badge, Button, PageHeader } from "../components"
import { useStore } from "../store"

export function AuthPage() {
  const { pathname } = useLocation()
  const signup = pathname === "/signup"
  const [submitted, setSubmitted] = useState(false)
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
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-accent text-ink">
              <Wrench />
            </span>
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
                "Demo authentication only",
                "Shared cart and order history",
                "No real credentials are transmitted",
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
          {submitted ? (
            <div className="flex min-h-[480px] flex-col items-center justify-center text-center">
              <span className="grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-emerald-700">
                <CheckCircle2 />
              </span>
              <h2 className="mt-5 text-2xl font-black">
                Demo {signup ? "account created" : "login complete"}
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                Secure authentication requires a connected backend.
              </p>
              <Link className="mt-6" to="/account">
                <Button>Open account dashboard</Button>
              </Link>
            </div>
          ) : (
            <>
              <Badge tone="blue">Prototype flow</Badge>
              <h2 className="mt-4 text-3xl font-black">
                {signup ? "Create an account" : "Login to your account"}
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                {signup
                  ? "Register to save addresses and manage orders."
                  : "Use any valid-looking details for this demo."}
              </p>
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  setSubmitted(true)
                }}
                className="mt-7 space-y-4"
              >
                {signup && (
                  <Label text="Full name">
                    <input required className="field mt-2" />
                  </Label>
                )}
                <Label text="Phone number">
                  <input
                    required
                    pattern="[0-9]{10}"
                    className="field mt-2"
                    placeholder="10-digit mobile number"
                  />
                </Label>
                {signup && (
                  <Label text="Email">
                    <input required type="email" className="field mt-2" />
                  </Label>
                )}
                <Label text="Password">
                  <input
                    required
                    minLength={6}
                    type="password"
                    className="field mt-2"
                  />
                </Label>
                <div className="flex justify-end">
                  <button
                    type="button"
                    className="text-sm font-bold text-brand"
                  >
                    Forgot password?
                  </button>
                </div>
                <Button className="w-full" type="submit">
                  {signup ? "Create Demo Account" : "Login (Demo)"}
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
  const { orders, wishlist, cartCount } = useStore()
  return (
    <div className="container-wide py-8">
      <PageHeader
        title="My Account"
        description="Demo customer profile and shopping activity."
        action={<Badge tone="warning">Demo login state</Badge>}
      />
      <div className="grid gap-6 lg:grid-cols-[270px_1fr]">
        <aside className="rounded-xl border border-border bg-white p-5">
          <div className="flex items-center gap-3 border-b border-border pb-5">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-brand text-white">
              <UserRound />
            </span>
            <div>
              <b>Demo Customer</b>
              <small className="block text-slate-500">+91 XXXXX XXXXX</small>
            </div>
          </div>
          <nav className="mt-4 space-y-1">
            {[
              ["Personal details", UserRound],
              ["Saved addresses", MapPin],
              ["My Orders", Package],
              ["Wishlist", Heart],
              ["Cart", ShoppingCart],
              ["Support requests", HelpCircle],
            ].map(([label, Icon]) => {
              const IconComponent = Icon as typeof UserRound
              return (
                <button
                  key={String(label)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-bold text-slate-600 hover:bg-slate-50 hover:text-brand"
                >
                  <IconComponent size={18} />
                  {String(label)}
                </button>
              )
            })}
          </nav>
        </aside>
        <section>
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat
              label="Total orders"
              value={String(orders.length)}
              icon={<History />}
            />
            <Stat
              label="Wishlist items"
              value={String(wishlist.length)}
              icon={<Heart />}
            />
            <Stat
              label="Items in cart"
              value={String(cartCount)}
              icon={<ShoppingCart />}
            />
          </div>
          <div className="mt-6 rounded-xl border border-border bg-white p-6">
            <h2 className="text-xl font-black">Personal details</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <DisplayField label="Full name" value="Demo Customer" />
              <DisplayField label="Phone" value="+91 XXXXX XXXXX" />
              <DisplayField label="Email" value="customer@example.com" />
              <DisplayField label="Default location" value="Jehanabad, Bihar" />
            </div>
            <Button variant="outline" className="mt-6">
              Edit details
            </Button>
          </div>
          <div className="mt-6 rounded-xl border border-border bg-white p-6">
            <h2 className="text-xl font-black">Saved delivery address</h2>
            <div className="mt-4 flex gap-3 rounded-lg bg-slate-50 p-4">
              <MapPin className="text-brand" />
              <p className="text-sm leading-6">
                P.G. Road area, Jehanabad, Bihar 804408
                <br />
                <span className="text-slate-500">Demo address · editable</span>
              </p>
            </div>
          </div>
        </section>
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
          <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {categories.map((category) => (
              <Link
                key={category.slug}
                to={`/category/${category.slug}`}
                className="rounded-xl border border-border bg-white p-4 text-center"
              >
                <img
                  src={category.image}
                  alt=""
                  className="mx-auto h-20 w-20 rounded-full object-cover"
                />
                <b className="mt-3 block text-sm">{category.name}</b>
              </Link>
            ))}
          </div>
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
