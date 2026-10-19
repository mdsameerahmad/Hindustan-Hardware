import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useParams, useSearchParams } from "react-router"
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Droplets,
  Hammer,
  Heart,
  GitCompareArrows,
  PackageCheck,
  Phone,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  Star,
  Store,
  Truck,
  Users,
  Wrench,
  X,
} from "lucide-react"
import { categories, type Product } from "../data"
import {
  Badge,
  Button,
  EmptyState,
  PageHeader,
  ProductCard,
  Quantity,
  SectionHeading,
  formatPrice,
} from "../components"
import { useStore } from "../store"
import { BrandMark, BrandStrip } from "./BrandPages"

const heroSlides = [
  {
    label: "PLUMBING ESSENTIALS",
    title: "Everything for Your Water & Hardware Needs",
    text: "Quality pipes, fittings, water tanks and essential hardware — all in one place.",
    image:
      "https://images.unsplash.com/photo-1642797735471-3e90055c5ff9?auto=format&fit=crop&w=1600&q=85",
  },
  {
    label: "WATER STORAGE",
    title: "Durable Tanks for Everyday Water Storage",
    text: "Compare capacities and choose the right tank for your home or project.",
    image:
      "https://images.unsplash.com/photo-1603093433330-e0e5c30df0fe?auto=format&fit=crop&w=1600&q=85",
  },
  {
    label: "CONNECTION READY",
    title: "Fittings, Valves & Water Connections",
    text: "Build a complete connection with dependable parts and local product guidance.",
    image:
      "https://images.unsplash.com/photo-1707409464203-df2f21c32b9c?auto=format&fit=crop&w=1600&q=85",
  },
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
  const { products } = useStore()
  const [slide, setSlide] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(
      () => setSlide((value) => (value + 1) % heroSlides.length),
      7000,
    )
    return () => window.clearInterval(timer)
  }, [])

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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {categories.map((category) => (
            <Link
              to={`/category/${category.slug}`}
              key={category.slug}
              className="group overflow-hidden rounded-xl border border-border bg-white p-3 text-center transition hover:-translate-y-1 hover:border-brand/40 hover:shadow-lg"
            >
              <div className="aspect-square overflow-hidden rounded-lg bg-slate-100">
                <img
                  src={category.image}
                  alt=""
                  className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                />
              </div>
              <h3 className="mt-3 text-sm font-extrabold leading-tight text-ink">
                {category.name}
              </h3>
            </Link>
          ))}
        </div>
      </section>

      <section className="section-space bg-white py-14">
        <div className="container-wide">
          <SectionHeading
            eyebrow="Customer favourites"
            title="Best-selling hardware"
            action={
              <span className="hidden text-xs text-slate-500 sm:block">
                Demo pricing · verify before purchase
              </span>
            }
          />
          <div className="product-grid">
            {products
              .filter((p) => p.featured)
              .map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
          </div>
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

export function ProductsPage() {
  const { products, brands } = useStore()
  const [params, setParams] = useSearchParams()
  const route = useParams()
  const matchedCategory = categories.find(
    (category) => category.slug === route.slug,
  )
  const query = params.get("q") ?? ""
  const [material, setMaterial] = useState(params.get("material") ?? "")
  const [selectedBrand, setSelectedBrand] = useState(params.get("brand") ?? "")
  const [productType, setProductType] = useState(params.get("type") ?? "")
  const [diameter, setDiameter] = useState("")
  const [length, setLength] = useState("")
  const [category, setCategory] = useState(matchedCategory?.name ?? "")
  const [sort, setSort] = useState("relevance")
  const [maxPrice, setMaxPrice] = useState(7000)
  const [mobileFilters, setMobileFilters] = useState(false)
  const waterPipeView =
    query === "Water Pipes" ||
    ["PVC Pipes", "UPVC & CPVC Pipes", "HDPE Pipes"].includes(
      matchedCategory?.name ?? "",
    )

  useEffect(() => {
    if (matchedCategory) setCategory(matchedCategory.name)
  }, [matchedCategory])

  const filtered = useMemo(() => {
    const normalized = query.toLowerCase().replace(/[₹,]/g, "")
    const priceFromQuery = Number(normalized.match(/under\s+(\d+)/)?.[1] ?? 0)
    const words = normalized
      .replace(/under\s+\d+/g, "")
      .split(/\s+/)
      .filter(
        (word) =>
          word && !(waterPipeView && ["water", "pipes", "pipe"].includes(word)),
      )
    const matches = products.filter(
      (product) =>
        product.active !== false &&
        (!waterPipeView || product.productType.includes("Pipe")) &&
        (!words.length ||
          words.every((word) =>
            `${product.name} ${product.category} ${product.material} ${product.brandName} ${product.productType} ${product.diameter}`
              .toLowerCase()
              .includes(word),
          )) &&
        (!category || product.category === category) &&
        (!selectedBrand || product.brandId === selectedBrand) &&
        (!productType || product.productType === productType) &&
        (!material || product.material === material) &&
        (!diameter || product.diameter === diameter) &&
        (!length || product.length === length) &&
        product.price <= Math.min(maxPrice, priceFromQuery || maxPrice),
    )
    return [...matches].sort((a, b) =>
      sort === "low"
        ? a.price - b.price
        : sort === "high"
          ? b.price - a.price
          : a.name.localeCompare(b.name),
    )
  }, [
    products,
    query,
    category,
    selectedBrand,
    productType,
    material,
    diameter,
    length,
    maxPrice,
    sort,
    waterPipeView,
  ])

  const clear = () => {
    setCategory("")
    setMaterial("")
    setSelectedBrand("")
    setProductType("")
    setDiameter("")
    setLength("")
    setMaxPrice(7000)
    setParams({})
  }
  const filters = (
    <div className="space-y-7">
      <div className="flex items-center justify-between">
        <h3 className="font-extrabold">Filters</h3>
        <button onClick={clear} className="text-sm font-bold text-brand">
          Clear all
        </button>
      </div>
      <FilterGroup label="Category">
        {categories.map((item) => (
          <label key={item.slug} className="filter-option">
            <input
              type="radio"
              name="category"
              checked={category === item.name}
              onChange={() => setCategory(item.name)}
            />
            {item.name}
          </label>
        ))}
      </FilterGroup>
      <FilterGroup label="Brand">
        {brands.map((brand) => (
          <label key={brand.id} className="filter-option">
            <input
              type="radio"
              name="brand"
              checked={selectedBrand === brand.id}
              onChange={() => setSelectedBrand(brand.id)}
            />
            {brand.name}
          </label>
        ))}
      </FilterGroup>
      <FilterGroup label={`Price up to ${formatPrice(maxPrice)}`}>
        <input
          aria-label="Maximum price"
          type="range"
          min="200"
          max="7000"
          step="100"
          value={maxPrice}
          onChange={(event) => setMaxPrice(Number(event.target.value))}
          className="w-full accent-[#1769AA]"
        />
        <div className="mt-2 flex justify-between text-xs text-slate-500">
          <span>₹200</span>
          <span>₹7,000</span>
        </div>
      </FilterGroup>
      <FilterGroup label="Material">
        {["PVC", "UPVC", "CPVC", "HDPE", "Brass", "Polycarbonate"].map(
          (item) => (
            <label key={item} className="filter-option">
              <input
                type="radio"
                name="material"
                checked={material === item}
                onChange={() => setMaterial(item)}
              />
              {item}
            </label>
          ),
        )}
      </FilterGroup>
      <FilterGroup label="Diameter / size">
        {[...new Set(products.map((product) => product.diameter))]
          .filter((item) => item !== "Not applicable")
          .slice(0, 8)
          .map((item) => (
            <label key={item} className="filter-option">
              <input
                type="radio"
                name="diameter"
                checked={diameter === item}
                onChange={() => setDiameter(item)}
              />
              {item}
            </label>
          ))}
      </FilterGroup>
      <FilterGroup label="Length">
        {[...new Set(products.map((product) => product.length))]
          .filter((item) => item !== "Not applicable")
          .map((item) => (
            <label key={item} className="filter-option">
              <input
                type="radio"
                name="length"
                checked={length === item}
                onChange={() => setLength(item)}
              />
              {item}
            </label>
          ))}
      </FilterGroup>
      <FilterGroup label="Availability">
        <label className="filter-option">
          <input type="checkbox" defaultChecked />
          In stock
        </label>
      </FilterGroup>
    </div>
  )

  return (
    <div className="container-wide py-8">
      <PageHeader
        breadcrumbs={waterPipeView ? "Home / Water Pipes" : "Home / Products"}
        title={
          waterPipeView
            ? "Shop Water Pipes by Type and Brand"
            : (matchedCategory?.name ??
              (query
                ? `Search results for “${query}”`
                : "All hardware products"))
        }
        description={
          waterPipeView
            ? "Compare plumbing pipes from multiple manufacturers by size, material, specifications, and price."
            : "Compare demo prices, sizes, materials and availability across our configurable product catalog."
        }
      />
      {waterPipeView && (
        <div className="mb-6 space-y-5 rounded-xl border border-border bg-white p-5">
          <div className="flex gap-3 overflow-x-auto pb-1">
            {brands.map((brand) => (
              <button
                key={brand.id}
                onClick={() =>
                  setSelectedBrand(selectedBrand === brand.id ? "" : brand.id)
                }
                className={`min-w-44 rounded-lg border p-3 text-left ${
                  selectedBrand === brand.id
                    ? "border-brand bg-blue-50"
                    : "border-border"
                }`}
              >
                <BrandMark brand={brand} compact />
              </button>
            ))}
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {[
              "CPVC Pipes",
              "PVC Pipes",
              "UPVC Pipes",
              "HDPE Pipes",
              "Agricultural Pipes",
              "SWR and Drainage",
              "Borewell and Water Supply Pipes",
            ].map((type) => (
              <button
                key={type}
                onClick={() => setProductType(productType === type ? "" : type)}
                className={`tab-pill ${productType === type ? "active" : ""}`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-white p-4">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            className="lg:hidden"
            onClick={() => setMobileFilters(true)}
          >
            <SlidersHorizontal size={17} />
            Filters
          </Button>
          <span className="text-sm text-slate-500">
            <b className="text-ink">{filtered.length}</b> products found
          </span>
        </div>
        <select
          value={sort}
          onChange={(event) => setSort(event.target.value)}
          className="field max-w-56"
          aria-label="Sort products"
        >
          <option value="relevance">Sort: Relevance</option>
          <option value="low">Price: Low to high</option>
          <option value="high">Price: High to low</option>
        </select>
      </div>
      {(category || material || selectedBrand || productType || query) && (
        <div className="mb-5 flex flex-wrap gap-2">
          {query && <Badge tone="blue">Search: {query}</Badge>}
          {category && <Badge tone="blue">{category}</Badge>}
          {material && <Badge tone="blue">{material}</Badge>}
          {selectedBrand && (
            <Badge tone="blue">
              {brands.find((brand) => brand.id === selectedBrand)?.name}
            </Badge>
          )}
          {productType && <Badge tone="blue">{productType}</Badge>}
        </div>
      )}
      <div className="grid gap-7 lg:grid-cols-[260px_1fr]">
        <aside className="hidden rounded-xl border border-border bg-white p-5 lg:block">
          {filters}
        </aside>
        <div>
          {filtered.length ? (
            <div className="product-grid">
              {filtered.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<X />}
              title="No matching products"
              text="Try removing a filter or search for PVC pipe, water tank, socket, elbow, boring pipe or valve."
              action={<Button onClick={clear}>Clear filters</Button>}
            />
          )}
        </div>
      </div>
      {mobileFilters && (
        <div className="fixed inset-0 z-[80] bg-black/40 lg:hidden">
          <div className="absolute bottom-0 left-0 right-0 max-h-[88vh] overflow-y-auto rounded-t-2xl bg-white p-6">
            <div className="mb-4 flex justify-end">
              <button onClick={() => setMobileFilters(false)}>
                <X />
              </button>
            </div>
            {filters}
            <Button
              onClick={() => setMobileFilters(false)}
              className="mt-6 w-full"
            >
              Show {filtered.length} products
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function FilterGroup({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="border-t border-border pt-5">
      <h4 className="mb-3 text-sm font-extrabold">{label}</h4>
      <div className="space-y-2.5">{children}</div>
    </div>
  )
}

export function ProductDetailPage() {
  const { id } = useParams()
  const {
    products,
    addToCart,
    toggleWishlist,
    wishlist,
    compareIds,
    toggleCompare,
  } = useStore()
  const navigate = useNavigate()
  const product = products.find((item) => item.id === id)
  const [quantity, setQuantity] = useState(1)
  const [tab, setTab] = useState("Description")
  const [pin, setPin] = useState("")
  const [checked, setChecked] = useState(false)
  const [image, setImage] = useState(0)
  const [comparisonSort, setComparisonSort] = useState("low")
  if (!product)
    return (
      <div className="container-wide py-16">
        <EmptyState
          title="Product not found"
          text="This product may have been removed from the demo catalog."
          action={
            <Link to="/products">
              <Button>Browse products</Button>
            </Link>
          }
        />
      </div>
    )

  const related = products
    .filter(
      (item) => item.category === product.category && item.id !== product.id,
    )
    .slice(0, 4)
  const alternatives = products
    .filter(
      (item) =>
        item.id !== product.id &&
        product.comparisonGroupId &&
        item.comparisonGroupId === product.comparisonGroupId,
    )
    .sort((a, b) =>
      comparisonSort === "high"
        ? b.price - a.price
        : comparisonSort === "brand"
          ? a.brandName.localeCompare(b.brandName)
          : a.price - b.price,
    )
  const moreFromBrand = products
    .filter(
      (item) =>
        item.id !== product.id &&
        item.brandId === product.brandId &&
        item.active !== false,
    )
    .slice(0, 5)
  const buyNow = () => {
    addToCart(product.id, quantity)
    navigate("/cart")
  }
  return (
    <div className="container-wide py-7">
      <p className="mb-5 text-xs font-bold text-slate-500">
        Home / {product.category} / {product.name}
      </p>
      <div className="grid gap-8 rounded-2xl border border-border bg-white p-5 md:p-8 lg:grid-cols-[1fr_1fr]">
        <div>
          <div className="aspect-square overflow-hidden rounded-xl bg-slate-100">
            <img
              src={
                image === 0
                  ? product.image
                  : (related[image - 1]?.image ?? product.image)
              }
              alt={product.name}
              className="h-full w-full object-cover"
            />
          </div>
          <div className="mt-3 flex gap-3">
            {[product, ...related.slice(0, 3)].map((item, index) => (
              <button
                key={`${item.id}-${index}`}
                onClick={() => setImage(index)}
                className={`h-16 w-16 overflow-hidden rounded-lg border-2 ${
                  image === index ? "border-brand" : "border-border"
                }`}
              >
                <img
                  src={item.image}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold uppercase tracking-wide text-brand">
                {product.brandName}
              </p>
              <h1 className="mt-2 text-3xl font-black leading-tight text-ink">
                {product.name}
              </h1>
            </div>
            <button
              onClick={() => toggleWishlist(product.id)}
              className="rounded-full border border-border p-3"
            >
              <Heart
                className={
                  wishlist.includes(product.id)
                    ? "fill-red-500 text-red-500"
                    : ""
                }
              />
            </button>
          </div>
          <p className="mt-3 text-sm text-slate-500">
            SKU: HH-{product.id.toUpperCase()} · Demo catalog item
          </p>
          <div className="mt-6 flex items-baseline gap-3">
            <span className="text-4xl font-black text-ink">
              {formatPrice(product.price)}
            </span>
            {product.mrp && (
              <span className="text-lg text-slate-400 line-through">
                {formatPrice(product.mrp)}
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Sample pricing only. Final store pricing may vary.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="spec-pill">
              <small>Material</small>
              <b>{product.material}</b>
            </div>
            <div className="spec-pill">
              <small>Size / capacity</small>
              <b>{product.size}</b>
            </div>
            <div className="spec-pill">
              <small>Unit of sale</small>
              <b>{product.unitOfSale}</b>
            </div>
            <div className="spec-pill">
              <small>Availability</small>
              <b className="text-emerald-700">{product.stock} in demo stock</b>
            </div>
          </div>
          <div className="mt-6">
            <p className="mb-2 text-sm font-bold">Select variant</p>
            <div className="flex gap-2">
              <button className="variant active">{product.size}</button>
              <button className="variant">Standard</button>
            </div>
          </div>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Quantity value={quantity} onChange={setQuantity} />
            <Button
              onClick={() => addToCart(product.id, quantity)}
              className="flex-1"
            >
              <ShoppingCart size={18} />
              Add to Cart
            </Button>
            <Button onClick={buyNow} variant="secondary" className="flex-1">
              Buy Now
            </Button>
          </div>
          {product.comparisonGroupId && (
            <Button
              variant="outline"
              className="mt-3"
              onClick={() => toggleCompare(product.id)}
            >
              <GitCompareArrows size={17} />
              {compareIds.includes(product.id)
                ? "Remove from Comparison"
                : "Add to Comparison"}
            </Button>
          )}
          <div className="mt-7 rounded-xl border border-border p-4">
            <p className="font-bold">Check local delivery availability</p>
            <div className="mt-3 flex gap-2">
              <input
                maxLength={6}
                value={pin}
                onChange={(event) => {
                  setPin(event.target.value.replace(/\D/g, ""))
                  setChecked(false)
                }}
                className="field"
                placeholder="Enter 6-digit PIN code"
              />
              <Button
                variant="outline"
                disabled={pin.length !== 6}
                onClick={() => setChecked(true)}
              >
                Check
              </Button>
            </div>
            {checked && (
              <p className="mt-3 text-sm font-semibold text-emerald-700">
                Demo check complete. Delivery scheduling will be confirmed by
                the store.
              </p>
            )}
          </div>
        </div>
      </div>
      <section className="mt-8 rounded-2xl border border-border bg-white">
        <div className="flex overflow-x-auto border-b border-border px-4">
          {[
            "Description",
            "Specifications",
            "Applications",
            "Delivery & Returns",
            "Reviews",
          ].map((item) => (
            <button
              onClick={() => setTab(item)}
              key={item}
              className={`whitespace-nowrap border-b-2 px-4 py-4 text-sm font-bold ${
                tab === item
                  ? "border-brand text-brand"
                  : "border-transparent text-slate-500"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="p-6 sm:p-8">
          {tab === "Description" && (
            <p className="max-w-3xl leading-7 text-slate-600">
              {product.description}
            </p>
          )}
          {tab === "Specifications" && (
            <div className="max-w-3xl divide-y divide-border rounded-lg border border-border">
              {Object.entries(product.specs).map(([key, value]) => (
                <div key={key} className="grid grid-cols-2 px-4 py-3 text-sm">
                  <b className="text-slate-500">{key}</b>
                  <span>{value}</span>
                </div>
              ))}
            </div>
          )}
          {tab === "Applications" && (
            <p className="leading-7 text-slate-600">
              Suitable for use across {product.category.toLowerCase()} projects.
              Confirm compatibility, pressure rating and installation
              requirements before purchase.
            </p>
          )}
          {tab === "Delivery & Returns" && (
            <p className="leading-7 text-slate-600">
              Delivery timing, fees and returns are configurable store policies.
              This prototype does not provide a real delivery guarantee.
            </p>
          )}
          {tab === "Reviews" && (
            <EmptyState
              icon={<Star />}
              title="No verified reviews yet"
              text="Reviews will appear here only after verified review data is connected."
            />
          )}
        </div>
      </section>
      {product.comparisonGroupId && (
        <section className="section-space rounded-2xl border border-border bg-white p-5 sm:p-7">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="eyebrow">Compare Other Brands</p>
              <h2 className="mt-2 text-2xl font-black">
                Compare Similar Products from Other Brands
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                Compare compatible products by brand, specifications and price.
                All prices are illustrative prototype prices.
              </p>
            </div>
            <select
              value={comparisonSort}
              onChange={(event) => setComparisonSort(event.target.value)}
              className="field max-w-56"
            >
              <option value="low">Lowest price</option>
              <option value="high">Highest price</option>
              <option value="brand">Brand name</option>
            </select>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <ComparisonCard product={product} current />
            {alternatives.map((item) => (
              <ComparisonCard key={item.id} product={item} />
            ))}
          </div>
          <Link to="/compare">
            <Button variant="outline" className="mt-6">
              <GitCompareArrows size={17} /> Open side-by-side comparison
            </Button>
          </Link>
        </section>
      )}
      {!product.comparisonGroupId && (
        <section className="section-space rounded-xl border border-border bg-white p-7">
          <h2 className="text-2xl font-black">Compare Other Brands</h2>
          <p className="mt-2 text-sm text-slate-500">
            More compatible products from other brands will appear here as the
            catalog grows.
          </p>
        </section>
      )}
      {moreFromBrand.length > 0 && (
        <section className="section-space">
          <SectionHeading
            eyebrow={product.brandName}
            title="More from this Brand"
          />
          <div className="product-grid">
            {moreFromBrand.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </section>
      )}
      <div className="fixed bottom-16 left-0 right-0 z-30 flex gap-2 border-t border-border bg-white p-3 md:hidden">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => addToCart(product.id, quantity)}
        >
          Add to Cart
        </Button>
        <Button className="flex-1" onClick={buyNow}>
          Buy Now
        </Button>
      </div>
    </div>
  )
}

function ComparisonCard({
  product,
  current = false,
}: {
  product: Product
  current?: boolean
}) {
  const { brands, addToCart, compareIds, toggleCompare } = useStore()
  const brand = brands.find((item) => item.id === product.brandId)
  return (
    <article
      className={`rounded-xl border p-4 ${
        current ? "border-brand bg-blue-50/50" : "border-border"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        {brand ? (
          <BrandMark brand={brand} compact />
        ) : (
          <b>{product.brandName}</b>
        )}
        {current && <Badge tone="blue">Currently Viewing</Badge>}
      </div>
      <div className="mt-4 flex gap-3">
        <img
          src={product.image}
          alt=""
          className="h-20 w-20 rounded-lg object-cover"
        />
        <div>
          <Link
            className="text-sm font-extrabold hover:text-brand"
            to={`/product/${product.id}`}
          >
            {product.name}
          </Link>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {product.material} · {product.diameter} · {product.length}
            <br />
            {product.pressureRating || "Not specified"} · {product.unitOfSale}
          </p>
        </div>
      </div>
      <div className="mt-4 flex items-end justify-between">
        <div>
          <b className="text-xl">{formatPrice(product.price)}</b>
          <small className="block text-slate-500">Demo price</small>
        </div>
        <Badge tone={product.stock > 0 ? "success" : "danger"}>
          {product.stock > 0 ? "In stock" : "Out of stock"}
        </Badge>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          onClick={() => toggleCompare(product.id)}
          disabled={current && compareIds.includes(product.id)}
        >
          {compareIds.includes(product.id) ? "Selected" : "Compare"}
        </Button>
        <Button onClick={() => addToCart(product.id)}>Add to Cart</Button>
      </div>
    </article>
  )
}
