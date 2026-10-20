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

// Default visual themes for storefront hero presentations
const heroImagePresets = [
  "https://images.unsplash.com/photo-1642797735471-3e90055c5ff9?auto=format&fit=crop&w=1600&q=85",
  "https://images.unsplash.com/photo-1603093433330-e0e5c30df0fe?auto=format&fit=crop&w=1600&q=85",
  "https://images.unsplash.com/photo-1707409464203-df2f21c32b9c?auto=format&fit=crop&w=1600&q=85",
]

const applications = [
  [
    "Home Water Connection",
    "Pipes, valves and fittings for dependable household supply",
    Droplets,
    "Water Connection Supplies",
  ],
  [
    "Borewell & Boring",
    "Casing pipes, cables and connection equipment",
    Hammer,
    "Boring Materials",
  ],
  [
    "Overhead Tank Installation",
    "Tanks, valves and connection accessories",
    PackageCheck,
    "Water Storage Tanks",
  ],
  [
    "Bathroom Plumbing",
    "Taps, faucets, waste pipes and fittings",
    Wrench,
    "Bathroom Fittings",
  ],
  [
    "Agricultural Water Supply",
    "HDPE pipes and robust flow control products",
    Droplets,
    "HDPE Pipes",
  ],
  [
    "Electrical Installation",
    "Modular sockets, switches and safe accessories",
    ShieldCheck,
    "Electrical",
  ],
  [
    "Construction Projects",
    "Project-ready quantities across core categories",
    Building2,
    "Tools & Accessories",
  ],
] as const

export function HomePage() {
  const [slide, setSlide] = useState(0)
  const [featuredProducts, setFeaturedProducts] = useState<Product[]>([])
  const [backendCategories, setBackendCategories] = useState<BackendCategory[]>([])
  const [loadingFeatured, setLoadingFeatured] = useState(true)

  // Dynamically derive hero slides from live backend categories
  const heroSlides = useMemo(() => {
    if (backendCategories.length === 0) {
      return [
        {
          label: "PREMIUM SANITARY & HARDWARE",
          title: "Stylish Spaces. Stronger Foundations.",
          text: "Complete range of sanitaryware, bath fittings, hardware & more for your home and commercial spaces.",
          image: heroImagePresets[0],
        },
      ]
    }
    return backendCategories.slice(0, 3).map((cat, idx) => ({
      label: cat.name.toUpperCase(),
      title: cat.name,
      text: cat.description || `Explore our certified range of ${cat.name.toLowerCase()} products.`,
      image: cat.image_url || heroImagePresets[idx % heroImagePresets.length],
    }))
  }, [backendCategories])

  const [loadingCategories, setLoadingCategories] = useState(true)

  useEffect(() => {
    let isMounted = true

    // Fetch live categories from database API
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

    // Fetch live featured products
    catalogueApi
      .getFeaturedProducts(8)
      .then((prods) => {
        if (isMounted) {
          if (prods && prods.length) {
            setFeaturedProducts(prods.map(transformBackendProduct))
          } else {
            // If no products flagged as featured, fetch first page of products
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
    return backendCategories.map((c, idx) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      image:
        c.image_url ||
        heroImagePresets[idx % heroImagePresets.length],
    }))
  }, [backendCategories])

  return (
    <>
      <section className="container-wide pt-5">
        <div className="relative min-h-[500px] overflow-hidden rounded-2xl bg-[#0B0B0B] text-white shadow-2xl md:min-h-[480px]">
          {heroSlides.map((item, index) => (
            <div
              key={item.title}
              className={`absolute inset-0 transition-opacity duration-700 ${
                index === slide
                  ? "opacity-100"
                  : "pointer-events-none opacity-0"
              }`}
            >
              <img
                src={item.image}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-[#000000]/95 via-[#0B0B0B]/85 to-[#0B0B0B]/30" />
              <div className="relative z-10 flex min-h-[500px] max-w-2xl flex-col justify-center px-7 py-14 sm:px-12 md:min-h-[480px] md:px-16">
                <span className="inline-block text-xs font-bold uppercase tracking-[0.25em] text-[#D4AF37]">
                  PREMIUM SANITARY & HARDWARE SOLUTIONS
                </span>
                <h1 className="mt-4 font-serif text-4xl font-black leading-[1.1] tracking-tight text-white sm:text-5xl lg:text-6xl">
                  Stylish Spaces.<br />
                  <span className="text-[#D4AF37]">Stronger Foundations.</span>
                </h1>
                <p className="mt-4 max-w-xl text-sm leading-6 text-[#CCCCCC] sm:text-base">
                  Complete range of sanitaryware, bath fittings, hardware & more for your home and commercial spaces.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Link to="/products">
                    <Button variant="primary" className="px-6 py-3 text-sm">
                      Shop Now <ArrowRight size={17} />
                    </Button>
                  </Link>
                  <a href="#categories">
                    <Button
                      variant="secondary"
                      className="px-6 py-3 text-sm"
                    >
                      Explore Categories
                    </Button>
                  </a>
                </div>
              </div>
            </div>
          ))}
          <button
            onClick={() =>
              setSlide((slide + heroSlides.length - 1) % heroSlides.length)
            }
            aria-label="Previous slide"
            className="absolute left-4 top-1/2 z-20 hidden rounded-full bg-black/40 p-3 text-white backdrop-blur hover:bg-[#D4AF37] hover:text-[#0B0B0B] sm:block transition"
          >
            <ChevronLeft />
          </button>
          <button
            onClick={() => setSlide((slide + 1) % heroSlides.length)}
            aria-label="Next slide"
            className="absolute right-4 top-1/2 z-20 hidden rounded-full bg-black/40 p-3 text-white backdrop-blur hover:bg-[#D4AF37] hover:text-[#0B0B0B] sm:block transition"
          >
            <ChevronRight />
          </button>
          <div className="absolute bottom-5 left-1/2 z-20 flex -translate-x-1/2 gap-2">
            {heroSlides.map((_, index) => (
              <button
                key={index}
                onClick={() => setSlide(index)}
                aria-label={`Go to slide ${index + 1}`}
                className={`h-2 rounded-full transition-all ${
                  slide === index ? "w-7 bg-[#D4AF37]" : "w-2 bg-white/40"
                }`}
              />
            ))}
          </div>
        </div>

        {/* 4 Feature Badges from Reference image */}
        <div className="relative z-20 mx-4 -mt-6 grid grid-cols-2 overflow-hidden rounded-xl border border-[#222222] bg-[#0B0B0B] p-2 text-white shadow-xl md:grid-cols-4">
          <div className="flex items-center gap-3 p-3.5 border-b border-[#1C1C1C] md:border-b-0 md:border-r border-[#1C1C1C]">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#D4AF37]/40 bg-[#1C1C1C] text-[#D4AF37]">
              <ShieldCheck size={20} />
            </span>
            <span className="text-xs">
              <strong className="block text-white">Genuine Products</strong>
              <small className="text-[#888888]">100% Brand Certified</small>
            </span>
          </div>
          <div className="flex items-center gap-3 p-3.5 border-b border-[#1C1C1C] md:border-b-0 md:border-r border-[#1C1C1C]">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#D4AF37]/40 bg-[#1C1C1C] text-[#D4AF37]">
              <Star size={20} />
            </span>
            <span className="text-xs">
              <strong className="block text-white">Best Price Guarantee</strong>
              <small className="text-[#888888]">Wholesale & Retail</small>
            </span>
          </div>
          <div className="flex items-center gap-3 p-3.5 border-r border-[#1C1C1C]">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#D4AF37]/40 bg-[#1C1C1C] text-[#D4AF37]">
              <Users size={20} />
            </span>
            <span className="text-xs">
              <strong className="block text-white">Expert Support</strong>
              <small className="text-[#888888]">Product Guidance</small>
            </span>
          </div>
          <div className="flex items-center gap-3 p-3.5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#D4AF37]/40 bg-[#1C1C1C] text-[#D4AF37]">
              <Truck size={20} />
            </span>
            <span className="text-xs">
              <strong className="block text-white">Pan India Delivery</strong>
              <small className="text-[#888888]">Safe & Fast Logistics</small>
            </span>
          </div>
        </div>
      </section>

      <BrandStrip className="section-space" />

      <section id="categories" className="section-space container-wide">
        <SectionHeading
          eyebrow="Browse the store"
          title="Shop by category"
          action={
            <Link className="link-arrow" to="/products">
              View all <ArrowRight size={16} />
            </Link>
          }
        />
        {loadingCategories ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-36 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        ) : displayCategories.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {displayCategories.map((category) => (
              <Link
                to={`/category/${category.slug}`}
                key={category.slug}
                className="group overflow-hidden rounded-xl border border-border bg-white p-3 text-center transition hover:-translate-y-1 hover:border-brand/40 hover:shadow-lg"
              >
                <div className="aspect-square overflow-hidden rounded-lg bg-slate-100">
                  <img
                    src={category.image}
                    alt={category.name}
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                  />
                </div>
                <h3 className="mt-3 text-sm font-extrabold leading-tight text-ink">
                  {category.name}
                </h3>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-center text-sm text-slate-500 py-6">
            Store categories are currently being updated.
          </p>
        )}
      </section>

      <section className="section-space bg-white py-14">
        <div className="container-wide">
          <SectionHeading
            eyebrow="Customer favourites"
            title="Best-selling hardware"
            action={
              <Link className="link-arrow text-sm font-bold text-brand" to="/products">
                Browse Full Catalogue <ArrowRight size={16} />
              </Link>
            }
          />
          {loadingFeatured ? (
            <div className="product-grid">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-72 animate-pulse rounded-xl bg-slate-100" />
              ))}
            </div>
          ) : featuredProducts.length > 0 ? (
            <div className="product-grid">
              {featuredProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <p className="text-center text-sm text-slate-500 py-8">
              Catalogue products are currently being updated.
            </p>
          )}
        </div>
      </section>

      <section className="section-space container-wide">
        <SectionHeading
          eyebrow="Find the right setup"
          title="Shop by application"
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {applications.map(([title, text, Icon, query], index) => (
            <Link
              key={title}
              to={`/products?q=${encodeURIComponent(query)}`}
              className={`group rounded-xl p-6 transition hover:-translate-y-1 ${
                index === 0
                  ? "bg-brand text-white sm:col-span-2"
                  : "border border-border bg-white text-ink"
              }`}
            >
              <Icon
                className={index === 0 ? "text-accent" : "text-brand"}
                size={28}
              />
              <h3 className="mt-6 text-lg font-extrabold">{title}</h3>
              <p
                className={`mt-2 text-sm leading-6 ${
                  index === 0 ? "text-blue-100" : "text-slate-500"
                }`}
              >
                {text}
              </p>
              <span
                className={`mt-5 inline-flex items-center gap-1 text-sm font-bold ${
                  index === 0 ? "text-accent" : "text-brand"
                }`}
              >
                Explore products <ArrowRight size={15} />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* 3 Showcase Banners from Reference Image */}
      <section className="section-space container-wide">
        <div className="grid gap-5 md:grid-cols-3">
          <div className="relative overflow-hidden rounded-2xl bg-[#0B0B0B] p-6 text-white shadow-lg border border-[#222222]">
            <img
              src="https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=800&q=80"
              alt="Modern Bathroom Solutions"
              className="absolute inset-0 h-full w-full object-cover opacity-25"
            />
            <div className="relative z-10 flex flex-col justify-end min-h-[220px]">
              <span className="text-xs font-bold text-[#D4AF37] uppercase tracking-wider">Luxury · Comfort · Durability</span>
              <h3 className="mt-1 font-serif text-2xl font-black text-white">Modern Bathroom Solutions</h3>
              <div className="mt-4">
                <Link to="/products?q=Sanitaryware">
                  <button className="rounded-lg bg-[#D4AF37] px-4 py-2 text-xs font-bold text-[#0B0B0B] hover:bg-[#B89124] transition">
                    Shop Now →
                  </button>
                </Link>
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-2xl bg-[#0B0B0B] p-6 text-white shadow-lg border border-[#222222]">
            <img
              src="https://images.unsplash.com/photo-1585771724684-38269d6639fd?auto=format&fit=crop&w=800&q=80"
              alt="Premium Faucets & Fittings"
              className="absolute inset-0 h-full w-full object-cover opacity-25"
            />
            <div className="relative z-10 flex flex-col justify-end min-h-[220px]">
              <span className="text-xs font-bold text-[#D4AF37] uppercase tracking-wider">Elegant Designs · Long Life</span>
              <h3 className="mt-1 font-serif text-2xl font-black text-white">Premium Faucets & Fittings</h3>
              <div className="mt-4">
                <Link to="/products?q=Fittings">
                  <button className="rounded-lg bg-[#D4AF37] px-4 py-2 text-xs font-bold text-[#0B0B0B] hover:bg-[#B89124] transition">
                    Shop Now →
                  </button>
                </Link>
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-2xl bg-[#0B0B0B] p-6 text-white shadow-lg border border-[#222222]">
            <img
              src="https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=800&q=80"
              alt="Hardware Tools for Every Project"
              className="absolute inset-0 h-full w-full object-cover opacity-25"
            />
            <div className="relative z-10 flex flex-col justify-end min-h-[220px]">
              <span className="text-xs font-bold text-[#D4AF37] uppercase tracking-wider">Build · Repair · Create</span>
              <h3 className="mt-1 font-serif text-2xl font-black text-white">Hardware Tools for Every Project</h3>
              <div className="mt-4">
                <Link to="/products?q=Tools">
                  <button className="rounded-lg bg-[#D4AF37] px-4 py-2 text-xs font-bold text-[#0B0B0B] hover:bg-[#B89124] transition">
                    Shop Now →
                  </button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why Choose Hindustan Hardware dark strip from reference */}
      <section className="bg-[#0B0B0B] py-10 text-white border-y border-[#1C1C1C]">
        <div className="container-wide">
          <div className="grid grid-cols-2 gap-6 md:grid-cols-4 items-center">
            <div className="text-center md:text-left">
              <span className="text-xs font-bold uppercase tracking-widest text-[#D4AF37]">
                Trusted Quality
              </span>
              <h2 className="mt-1 font-serif text-2xl font-black text-white">
                Why Choose Hindustan Hardware?
              </h2>
            </div>
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-[#D4AF37]/50 bg-[#1C1C1C] text-[#D4AF37]">
                <ShieldCheck size={22} />
              </span>
              <div>
                <strong className="block text-sm text-white">100% Genuine</strong>
                <small className="text-[#888888]">Brand Authorized</small>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-[#D4AF37]/50 bg-[#1C1C1C] text-[#D4AF37]">
                <PackageCheck size={22} />
              </span>
              <div>
                <strong className="block text-sm text-white">Wide Range</strong>
                <small className="text-[#888888]">Sanitary & Hardware</small>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-[#D4AF37]/50 bg-[#1C1C1C] text-[#D4AF37]">
                <Phone size={22} />
              </span>
              <div>
                <strong className="block text-sm text-white">Expert Support</strong>
                <small className="text-[#888888]">+91 98765 43210</small>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section-space container-wide">
        <SectionHeading
          eyebrow="Local expertise, online convenience"
          title="Why shop with Hindustan Hardware?"
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            [
              PackageCheck,
              "Wide Product Selection",
              "Core plumbing, electrical and construction essentials.",
            ],
            [
              Store,
              "Trusted Local Store",
              "A practical local shopping experience in Jehanabad.",
            ],
            [
              Wrench,
              "Product Guidance",
              "Help selecting compatible sizes, materials and fittings.",
            ],
            [
              ShoppingCart,
              "Convenient Ordering",
              "Build your cart and place a simulated order online.",
            ],
            [
              Truck,
              "Local Delivery Support",
              "Delivery availability is configurable by PIN code.",
            ],
            [
              Users,
              "For Every Project",
              "Support for contractors, homeowners and small businesses.",
            ],
          ].map(([Icon, title, text]) => {
            const IconComponent = Icon as typeof Wrench
            return (
              <div
                key={String(title)}
                className="flex gap-4 rounded-xl border border-border bg-white p-5"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-blue-50 text-brand">
                  <IconComponent size={22} />
                </span>
                <div>
                  <h3 className="font-extrabold text-ink">{String(title)}</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    {String(text)}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <section className="container-wide">
        <div className="grid overflow-hidden rounded-2xl border border-border bg-white md:grid-cols-2">
          <img
            src="https://images.unsplash.com/photo-1789992085565-c9eaf815767b?auto=format&fit=crop&w=1200&q=80"
            alt="Illustrative hardware store"
            className="h-full min-h-72 w-full object-cover"
          />
          <div className="flex flex-col justify-center p-8 sm:p-12">
            <p className="eyebrow">Serving Jehanabad</p>
            <h2 className="mt-2 text-3xl font-black text-ink">
              Hardware knowledge rooted in the local community
            </h2>
            <p className="mt-4 leading-7 text-slate-600">
              Hindustan Hardware brings practical product discovery and ordering
              to customers across Jehanabad and surrounding areas. Visit us on
              P.G. Road, opposite Eidgah.
            </p>
            <Link className="mt-6" to="/about">
              <Button variant="outline">
                Our story <ArrowRight size={16} />
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
