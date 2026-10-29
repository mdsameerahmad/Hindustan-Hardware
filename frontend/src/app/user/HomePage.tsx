import {
  ArrowRight,
  Building2,
  ChevronLeft,
  ChevronRight,
  Droplets,
  Hammer,
  PackageCheck,
  Phone,
  ShieldCheck,
  ShoppingCart,
  Star,
  Store,
  Truck,
  Users,
  Wrench,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router"
import { catalogueApi, type BackendCategory } from "../api/catalogueApi"
import { Button, ProductCard, SectionHeading } from "../components"
import { type Product } from "../data"
import { transformBackendProduct } from "../utils/productTransform"
import { BrandStrip } from "./BrandPages"

// Realistic fallback photography for hardware categories matching the reference image
const categoryImages: Record<string, { image: string; subtitle: string }> = {
  "pipes": {
    image: "https://images.unsplash.com/photo-1542013936693-884638332954?auto=format&fit=crop&w=800&q=80",
    subtitle: "uPVC, CPVC, PVC, HDPE",
  },
  "bathroom": {
    image: "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=800&q=80",
    subtitle: "Wash Basins, CP Fittings, Accessories",
  },
  "tanks": {
    image: "https://images.unsplash.com/photo-1590496793929-36417d3117de?auto=format&fit=crop&w=800&q=80",
    subtitle: "Sintex, Supreme, 3 Layer & More",
  },
  "pumps": {
    image: "https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=800&q=80",
    subtitle: "Water Pumps, Pressure Pumps",
  },
  "hardware": {
    image: "https://images.unsplash.com/photo-1581244277943-fe4a9c777189?auto=format&fit=crop&w=800&q=80",
    subtitle: "Tools, Locks, Hinges, Fasteners",
  },
  "electrical": {
    image: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=800&q=80",
    subtitle: "Wires, Switches, MCB, Lights",
  },
}

// Default visual themes for storefront hero presentations matching reference
const heroImagePresets = [
  "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=1600&q=85",
  "https://images.unsplash.com/photo-1620626011761-996317b8d101?auto=format&fit=crop&w=1600&q=85",
  "https://images.unsplash.com/photo-1507652313519-d4e9174996dd?auto=format&fit=crop&w=1600&q=85",
]

export function HomePage() {
  const [slide, setSlide] = useState(0)
  const [featuredProducts, setFeaturedProducts] = useState<Product[]>([])
  const [backendCategories, setBackendCategories] = useState<BackendCategory[]>([])
  const [loadingFeatured, setLoadingFeatured] = useState(true)

  // Dynamically derive hero slides matching reference design layout
  const heroSlides = useMemo(() => {
    return [
      {
        label: "PREMIUM SANITARY & HARDWARE SOLUTIONS",
        titlePrefix: "Built for ",
        titleHighlight: "every project.",
        text: "Trusted plumbing, sanitaryware and hardware from brands you know.",
        image: "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=1600&q=85",
      },
      {
        label: "DURABLE PIPES & INDUSTRIAL FITTINGS",
        titlePrefix: "Strength for ",
        titleHighlight: "every pipeline.",
        text: "Authorized CPVC, UPVC, PVC and SWR systems direct from top manufacturers.",
        image: "https://images.unsplash.com/photo-1620626011761-996317b8d101?auto=format&fit=crop&w=1600&q=85",
      },
    ]
  }, [])

  const [loadingCategories, setLoadingCategories] = useState(true)

  useEffect(() => {
    let isMounted = true

    catalogueApi
      .getCategories()
      .then((cats) => {
        if (isMounted && cats && cats.length) {
          setBackendCategories(cats)
        }
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setLoadingCategories(false)
      })

    catalogueApi
      .getFeaturedProducts(8)
      .then((prods) => {
        if (isMounted) {
          if (prods && prods.length) {
            setFeaturedProducts(prods.map(transformBackendProduct))
          } else {
            catalogueApi.listProducts({ page: 1, limit: 8 }).then((res) => {
              if (isMounted && res.items.length) {
                setFeaturedProducts(res.items.map(transformBackendProduct))
              }
            })
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setLoadingFeatured(false)
      })

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (heroSlides.length <= 1) return
    const timer = window.setInterval(
      () => setSlide((value) => (value + 1) % heroSlides.length),
      7000,
    )
    return () => window.clearInterval(timer)
  }, [heroSlides.length])

  // Resolve display categories strictly from backend database categories
  const displayCategories = useMemo(() => {
    return backendCategories.map((c, idx) => {
      const lower = c.name.toLowerCase()
      let presetMatch = Object.entries(categoryImages).find(([key]) => lower.includes(key))

      return {
        id: c.id,
        name: c.name,
        slug: c.slug,
        subtitle:
          presetMatch?.[1]?.subtitle ||
          c.description ||
          "Genuine plumbing & hardware solutions",
        image:
          c.image_url ||
          presetMatch?.[1]?.image ||
          heroImagePresets[idx % heroImagePresets.length],
      }
    })
  }, [backendCategories])

  return (
    <>
      {/* Clean, Bright Hero Banner exactly matching Reference Screenshot */}
      <section className="container-wide pt-4 sm:pt-6">
        <div className="relative min-h-[420px] sm:min-h-[460px] md:min-h-[480px] overflow-hidden rounded-3xl border border-[#D4AF37]/30 bg-gradient-to-r from-[#0B0B0B] via-[#14120B] to-[#1F190B] shadow-xl">
          {heroSlides.map((item, index) => (
            <div
              key={index}
              className={`absolute inset-0 transition-opacity duration-700 ${
                index === slide ? "opacity-100" : "pointer-events-none opacity-0"
              }`}
            >
              {/* Right Hero Image with dark gold fade blend */}
              <div className="absolute right-0 top-0 bottom-0 w-full md:w-3/5 lg:w-7/12">
                <img
                  src={item.image}
                  alt="Modern bathroom and hardware fixture"
                  className="h-full w-full object-cover object-center brightness-90 contrast-105"
                />
                {/* Left gradient overlay to seamlessly integrate dark gold/black text background */}
                <div
                  className="absolute inset-0 bg-gradient-to-r from-[#0B0B0B] via-[#0B0B0B]/85 to-transparent"
                  style={{
                    maskImage: "linear-gradient(to right, black 20%, transparent 100%)",
                    WebkitMaskImage: "linear-gradient(to right, black 20%, transparent 100%)",
                  }}
                />
                {/* Subtle gold ambient tint */}
                <div className="absolute inset-0 bg-[#D4AF37]/10 mix-blend-color" />
              </div>

              {/* Full background base gradient for dark theme text legibility */}
              <div className="absolute inset-0 bg-gradient-to-r from-[#0B0B0B] via-[#0B0B0B]/95 via-50% to-transparent w-full md:w-3/5" />

              {/* Hero Content Left */}
              <div className="relative z-10 flex min-h-[420px] sm:min-h-[460px] md:min-h-[480px] max-w-xl flex-col justify-center px-6 sm:px-12 md:px-16 py-10">
                <span className="inline-block text-[11px] sm:text-xs font-black uppercase tracking-[0.25em] text-[#D4AF37]">
                  {item.label}
                </span>

                <h1 className="mt-3.5 text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white leading-[1.08]">
                  {item.titlePrefix}
                  <span className="text-[#D4AF37]">{item.titleHighlight}</span>
                </h1>

                <p className="mt-4 max-w-md text-sm sm:text-base text-slate-300 font-normal leading-relaxed">
                  {item.text}
                </p>

                {/* Primary & Secondary Action Buttons */}
                <div className="mt-7 flex flex-wrap items-center gap-3.5">
                  <Link
                    to="/products"
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#D4AF37] hover:bg-[#B89124] px-6 py-3.5 text-xs sm:text-sm font-black text-[#0B0B0B] shadow-md transition hover:shadow-lg"
                  >
                    Shop Products <ArrowRight size={16} />
                  </Link>
                  <Link
                    to="/brands"
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#D4AF37]/50 bg-black/60 hover:bg-black/90 px-6 py-3.5 text-xs sm:text-sm font-bold text-white shadow-sm transition hover:border-[#D4AF37]"
                  >
                    Browse Brands
                  </Link>
                </div>
              </div>
            </div>
          ))}

          {/* Slider Prev / Next Navigation Controls */}
          <button
            onClick={() => setSlide((slide + heroSlides.length - 1) % heroSlides.length)}
            aria-label="Previous slide"
            className="absolute left-3.5 top-1/2 -translate-y-1/2 z-20 hidden sm:flex h-10 w-10 items-center justify-center rounded-full bg-black/60 hover:bg-black/85 text-[#D4AF37] border border-[#D4AF37]/40 shadow-md backdrop-blur transition"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={() => setSlide((slide + 1) % heroSlides.length)}
            aria-label="Next slide"
            className="absolute right-3.5 top-1/2 -translate-y-1/2 z-20 hidden sm:flex h-10 w-10 items-center justify-center rounded-full bg-black/60 hover:bg-black/85 text-[#D4AF37] border border-[#D4AF37]/40 shadow-md backdrop-blur transition"
          >
            <ChevronRight size={20} />
          </button>

          {/* Slide Indicator Dots */}
          <div className="absolute bottom-4 left-6 sm:left-16 z-20 flex gap-2">
            {heroSlides.map((_, index) => (
              <button
                key={index}
                onClick={() => setSlide(index)}
                aria-label={`Go to slide ${index + 1}`}
                className={`h-2 rounded-full transition-all ${
                  slide === index ? "w-6 bg-[#D4AF37]" : "w-2 bg-white/40"
                }`}
              />
            ))}
          </div>
        </div>

        {/* 4 Feature Badges exactly like Reference Image: White Card with Clean Gold Icons */}
        <div className="relative z-20 mt-4 rounded-2xl border border-slate-200/90 bg-white p-3 sm:p-4 shadow-xs grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
          <div className="flex items-center gap-3 p-2">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-[#D4AF37] border border-amber-200/60">
              <ShieldCheck size={20} />
            </span>
            <span className="text-xs">
              <strong className="block font-bold text-slate-900">Genuine Products</strong>
              <small className="text-slate-500 font-medium">100% brand certified</small>
            </span>
          </div>

          <div className="flex items-center gap-3 p-2 pt-3 sm:pt-2">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-[#D4AF37] border border-amber-200/60">
              <Star size={20} />
            </span>
            <span className="text-xs">
              <strong className="block font-bold text-slate-900">Best Price Promise</strong>
              <small className="text-slate-500 font-medium">Wholesale & retail</small>
            </span>
          </div>

          <div className="flex items-center gap-3 p-2 pt-3 sm:pt-2">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-[#D4AF37] border border-amber-200/60">
              <Users size={20} />
            </span>
            <span className="text-xs">
              <strong className="block font-bold text-slate-900">Expert Support</strong>
              <small className="text-slate-500 font-medium">Product guidance</small>
            </span>
          </div>

          <div className="flex items-center gap-3 p-2 pt-3 sm:pt-2">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-[#D4AF37] border border-amber-200/60">
              <Truck size={20} />
            </span>
            <span className="text-xs">
              <strong className="block font-bold text-slate-900">Pan-India Delivery</strong>
              <small className="text-slate-500 font-medium">Safe & fast logistics</small>
            </span>
          </div>
        </div>
      </section>

      {/* Shop by Brand Section */}
      <BrandStrip className="mt-12 sm:mt-16" />

      {/* Shop by Category Section matching Reference Image (Card with image, title, subtitle & chevron) */}
      <section id="categories" className="container-wide mt-12 sm:mt-16">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-6">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-[#0B0B0B]">
                Shop by Category
              </h2>
              <span className="hidden sm:inline-block text-xs text-slate-500 font-normal">
                Find everything for your home, commercial or industrial project.
              </span>
            </div>
            <p className="sm:hidden text-xs text-slate-500 mt-1">
              Find everything for your home, commercial or industrial project.
            </p>
          </div>
          <Link
            to="/products"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#D4AF37] hover:text-[#B89124] transition-colors shrink-0"
          >
            View All Categories <ArrowRight size={14} />
          </Link>
        </div>

        {loadingCategories ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-48 rounded-2xl bg-slate-100 animate-pulse border border-slate-200" />
            ))}
          </div>
        ) : displayCategories.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {displayCategories.map((category) => (
              <Link
                to={`/category/${category.slug}`}
                key={category.slug}
                className="group flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-2.5 transition-all duration-200 hover:-translate-y-1 hover:border-[#D4AF37]/60 hover:shadow-lg"
              >
                {/* Category Thumbnail Image */}
                <div className="aspect-[4/3] w-full overflow-hidden rounded-xl bg-slate-100">
                  <img
                    src={category.image}
                    alt={category.name}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                </div>

                {/* Category Title, Subtitle and Chevron Arrow */}
                <div className="flex items-start justify-between gap-1.5 pt-3 pb-1 px-1">
                  <div className="min-w-0">
                    <h3 className="text-xs sm:text-sm font-black text-slate-900 group-hover:text-[#0B0B0B] truncate">
                      {category.name}
                    </h3>
                    <p className="mt-0.5 text-[10px] sm:text-[11px] text-slate-500 line-clamp-1">
                      {category.subtitle}
                    </p>
                  </div>
                  <ChevronRight
                    size={14}
                    className="text-amber-500 group-hover:translate-x-0.5 transition-transform shrink-0 mt-0.5"
                  />
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-center text-sm text-slate-500 py-6">
            Store categories are currently being updated.
          </p>
        )}
      </section>

      {/* Customer Favourites / Best-Selling Hardware Section */}
      <section className="container-wide mt-16 sm:mt-20">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-6">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-[#0B0B0B]">
                Best-Selling Hardware
              </h2>
              <span className="hidden sm:inline-block text-xs text-slate-500 font-normal">
                Customer favourites & top industrial hardware essentials.
              </span>
            </div>
            <p className="sm:hidden text-xs text-slate-500 mt-1">
              Customer favourites & top industrial hardware essentials.
            </p>
          </div>
          <Link
            to="/products"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#D4AF37] hover:text-[#B89124] transition-colors shrink-0"
          >
            Browse Full Catalogue <ArrowRight size={14} />
          </Link>
        </div>

        {loadingFeatured ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-80 animate-pulse rounded-2xl bg-white border border-slate-200 p-4" />
            ))}
          </div>
        ) : featuredProducts.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
            {featuredProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
            <p className="text-sm font-medium text-slate-500">
              Catalogue products are currently being updated.
            </p>
          </div>
        )}
      </section>

      {/* Why Choose Hindustan Hardware - Sleek Dark & Gold Banner */}
      <section className="mt-16 sm:mt-20 border-y border-[#222222] bg-gradient-to-r from-[#070707] via-[#0E0E0E] to-[#14120B] py-12 text-white">
        <div className="container-wide">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 items-center">
            <div className="text-center md:text-left pr-0 md:pr-4">
              <span className="inline-block text-[11px] font-black uppercase tracking-[0.25em] text-[#D4AF37]">
                Trusted Quality
              </span>
              <h2 className="mt-2 text-2xl sm:text-3xl font-black text-white leading-tight">
                Why Choose Hindustan Hardware?
              </h2>
              <p className="mt-2 text-xs text-slate-400">
                Direct authorized sourcing, fair wholesale pricing, and community trust.
              </p>
            </div>

            <div className="flex items-center gap-4 rounded-2xl border border-white/5 bg-white/[0.03] p-4 transition hover:bg-white/[0.06] hover:border-[#D4AF37]/30">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-[#D4AF37]/40 bg-[#161616] text-[#D4AF37] shadow-sm">
                <ShieldCheck size={24} />
              </span>
              <div>
                <strong className="block text-sm font-bold text-white">100% Genuine</strong>
                <span className="text-xs text-slate-400">Brand Authorized OEM Parts</span>
              </div>
            </div>

            <div className="flex items-center gap-4 rounded-2xl border border-white/5 bg-white/[0.03] p-4 transition hover:bg-white/[0.06] hover:border-[#D4AF37]/30">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-[#D4AF37]/40 bg-[#161616] text-[#D4AF37] shadow-sm">
                <PackageCheck size={24} />
              </span>
              <div>
                <strong className="block text-sm font-bold text-white">Wide Range</strong>
                <span className="text-xs text-slate-400">Sanitary, Pipes & Hardware</span>
              </div>
            </div>

            <div className="flex items-center gap-4 rounded-2xl border border-white/5 bg-white/[0.03] p-4 transition hover:bg-white/[0.06] hover:border-[#D4AF37]/30">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-[#D4AF37]/40 bg-[#161616] text-[#D4AF37] shadow-sm">
                <Phone size={24} />
              </span>
              <div>
                <strong className="block text-sm font-bold text-white">Expert Support</strong>
                <span className="text-xs text-[#D4AF37] font-semibold">+91 98765 43210</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Local Expertise, Online Convenience - Clean Modern 6-Card Grid */}
      <section className="container-wide mt-16 sm:mt-20">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-[#B89124]">
            Local expertise, online convenience
          </span>
          <h2 className="mt-2 text-2xl sm:text-3xl lg:text-4xl font-black text-[#0B0B0B] tracking-tight">
            Why shop with Hindustan Hardware?
          </h2>
          <p className="mt-3 text-xs sm:text-sm text-slate-600">
            Engineered to provide homeowners, contractors, and builders with a reliable, straightforward hardware shopping experience.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[
            [
              PackageCheck,
              "Wide Product Selection",
              "Core plumbing, pipes, tanks, pumps, electrical, and construction essentials in stock.",
            ],
            [
              Store,
              "Trusted Local Store",
              "A practical local shopping experience in Jehanabad with verified factory direct items.",
            ],
            [
              Wrench,
              "Product Guidance",
              "Expert help selecting compatible pipe diameters, fittings, valves, and water systems.",
            ],
            [
              ShoppingCart,
              "Convenient Ordering",
              "Effortlessly build your cart, get transparent tax invoices, and track orders online.",
            ],
            [
              Truck,
              "Local Delivery Support",
              "Fast, doorstep dispatch verified by PIN code directly to your project location.",
            ],
            [
              Users,
              "For Every Project",
              "Tailored support for plumbers, contractors, homeowners, and commercial facilities.",
            ],
          ].map(([Icon, title, text]) => {
            const IconComponent = Icon as typeof Wrench
            return (
              <div
                key={String(title)}
                className="group flex gap-4 rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xs transition-all duration-200 hover:-translate-y-1 hover:border-[#D4AF37]/50 hover:shadow-md"
              >
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-amber-50/80 text-[#B89124] border border-amber-200/60 transition-colors group-hover:bg-[#0B0B0B] group-hover:text-[#D4AF37] group-hover:border-[#0B0B0B]">
                  <IconComponent size={22} />
                </span>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 group-hover:text-[#0B0B0B]">
                    {String(title)}
                  </h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                    {String(text)}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Our Story Spotlight Banner */}
      <section className="container-wide mt-16 sm:mt-20 mb-16">
        <div className="grid overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-sm md:grid-cols-2">
          <div className="relative min-h-72 sm:min-h-80 w-full overflow-hidden bg-slate-100">
            <img
              src="https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=1200&q=80"
              alt="Hindustan Hardware Showroom"
              className="h-full w-full object-cover transition-transform duration-700 hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent md:hidden" />
          </div>

          <div className="flex flex-col justify-center p-8 sm:p-12 lg:p-14">
            <div className="inline-flex items-center gap-2 self-start rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-[#B89124] border border-amber-200/80 mb-3">
              Serving Jehanabad & Bihar
            </div>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-[#0B0B0B] tracking-tight leading-tight">
              Hardware knowledge rooted in the local community
            </h2>
            <p className="mt-4 text-xs sm:text-sm leading-relaxed text-slate-600">
              Hindustan Hardware brings practical product discovery and seamless ordering to customers across Jehanabad and surrounding districts. Visit our authorized showroom on P.G. Road, opposite Eidgah for expert consultations and complete project supplies.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                to="/about"
                className="inline-flex items-center gap-2 rounded-xl bg-[#0B0B0B] hover:bg-[#D4AF37] hover:text-[#0B0B0B] px-6 py-3 text-xs sm:text-sm font-bold text-white transition-all shadow-xs"
              >
                Our Story <ArrowRight size={15} />
              </Link>
              <Link
                to="/contact"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-5 py-3 text-xs sm:text-sm font-bold text-slate-800 transition shadow-2xs"
              >
                Contact Store
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
