import {
  ArrowRight,
  GitCompareArrows,
  Search,
  Trash2,
  Sparkles,
  ShieldCheck,
  Tag,
  Loader2,
  ExternalLink,
  CheckCircle2,
  Pipette,
  Wrench,
  Zap,
  Bath,
  LayoutGrid,
  ChevronRight,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { Link, useParams } from "react-router"
import { catalogueApi } from "../api/catalogueApi"
import {
  Button,
  EmptyState,
  PageHeader,
  ProductCard,
  SectionHeading
} from "../components"
import type { Brand, Product } from "../data"
import { ComparisonTable } from "../features/components/ComparisonTable"
import { useProductComparison } from "../features/hooks/useProductComparison"
import { useStore } from "../store"
import { transformBackendProduct } from "../utils/productTransform"

export function BrandMark({
  brand,
  compact = false,
}: {
  brand: Brand
  compact?: boolean
}) {
  const [imageError, setImageError] = useState(false)
  const initials = brand.name
    .split(" ")
    .map((word) => word[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()

  const hasLogo = Boolean(brand.logo && !imageError)

  return (
    <div className="flex items-center gap-3.5">
      <div
        className={`relative grid place-items-center rounded-xl bg-white border border-slate-200 shadow-2xs overflow-hidden shrink-0 ${
          compact ? "h-10 w-10 p-1" : "h-14 w-14 p-1.5"
        }`}
      >
        {hasLogo ? (
          <img
            src={brand.logo}
            alt={`${brand.name} logo`}
            onError={() => setImageError(true)}
            className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="grid h-full w-full place-items-center rounded-lg bg-gradient-to-tr from-[#0B0B0B] via-[#1A1A1A] to-[#2B2414] text-[#D4AF37] font-black tracking-wider text-xs border border-[#D4AF37]/30">
            {initials}
          </div>
        )}
      </div>
      <div className="min-w-0">
        <h4 className={`font-black tracking-tight text-slate-900 truncate ${compact ? "text-sm" : "text-base"}`}>
          {brand.name}
        </h4>
        {brand.discountPercentage ? (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
            {brand.discountPercentage}% OFF
          </span>
        ) : null}
      </div>
    </div>
  )
}

export function BrandStrip({ className = "" }: { className?: string }) {
  const { brands } = useStore()
  const scrollRef = useState<HTMLDivElement | null>(null)

  const activeBrands = useMemo(
    () =>
      brands
        .filter((brand) => brand.active)
        .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)),
    [brands]
  )

  const scrollLeft = () => {
    const el = document.getElementById("brand-slider-container")
    if (el) el.scrollBy({ left: -320, behavior: "smooth" })
  }

  const scrollRight = () => {
    const el = document.getElementById("brand-slider-container")
    if (el) el.scrollBy({ left: 320, behavior: "smooth" })
  }

  return (
    <section className={`container-wide ${className}`}>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-5">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-[#0B0B0B]">
              Shop by Brand
            </h2>
            <span className="hidden sm:inline-block text-xs text-slate-500 font-normal">
              Explore trusted plumbing brands and find the right product for your project.
            </span>
          </div>
          <p className="sm:hidden text-xs text-slate-500 mt-1">
            Explore trusted plumbing brands and find the right product for your project.
          </p>
        </div>
        <Link
          to="/brands"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-[#D4AF37] hover:text-[#B89124] transition-colors shrink-0"
        >
          View All Brands <ArrowRight size={14} />
        </Link>
      </div>

      <div className="relative group/strip">
        {/* Scroll Container */}
        <div
          id="brand-slider-container"
          className="flex items-center gap-3.5 overflow-x-auto scrollbar-none py-2 px-1 scroll-smooth"
        >
          {activeBrands.map((brand) => {
            const initials = brand.name
              .split(" ")
              .map((word) => word[0])
              .slice(0, 2)
              .join("")
              .toUpperCase()

            return (
              <Link
                key={brand.id}
                to={`/brands/${brand.slug}`}
                className="group flex flex-col items-center justify-between w-32 sm:w-36 h-28 sm:h-32 shrink-0 rounded-2xl border border-slate-200/90 bg-white p-3 text-center transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-[#D4AF37]/50"
              >
                {/* Brand Logo Container */}
                <div className="h-14 sm:h-16 w-full flex items-center justify-center overflow-hidden">
                  {brand.logo ? (
                    <img
                      src={brand.logo}
                      alt={brand.name}
                      className="max-h-full max-w-full object-contain transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-tr from-[#0B0B0B] via-[#1A1A1A] to-[#2B2414] text-xs font-black tracking-wider text-[#D4AF37] border border-[#D4AF37]/30 shadow-xs">
                      {initials}
                    </div>
                  )}
                </div>

                {/* Brand Label */}
                <span className="text-xs font-bold text-slate-800 group-hover:text-[#0B0B0B] truncate w-full mt-2">
                  {brand.name}
                </span>
              </Link>
            )
          })}
        </div>

        {/* Scroll Arrows */}
        <button
          type="button"
          onClick={scrollLeft}
          aria-label="Previous brands"
          className="absolute -left-3 top-1/2 -translate-y-1/2 z-10 hidden sm:flex h-9 w-9 items-center justify-center rounded-full bg-white border border-slate-200 shadow-md text-slate-700 hover:text-black hover:border-slate-400 transition"
        >
          <ChevronRight size={16} className="rotate-180" />
        </button>
        <button
          type="button"
          onClick={scrollRight}
          aria-label="Next brands"
          className="absolute -right-3 top-1/2 -translate-y-1/2 z-10 hidden sm:flex h-9 w-9 items-center justify-center rounded-full bg-white border border-slate-200 shadow-md text-slate-700 hover:text-black hover:border-slate-400 transition"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </section>
  )
}

const brandFilters: string[] = []

export function BrandsPage() {
  const [brands, setBrands] = useState<Brand[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<string>("all")
  const [sortBy, setSortBy] = useState<"name" | "discount" | "order">("name")
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([])

  // Strictly fetch authoritative brands and categories directly from the database
  useEffect(() => {
    let isMounted = true
    setLoading(true)
    setError(null)

    Promise.all([
      catalogueApi.getBrands(),
      catalogueApi.getCategories().catch(() => []),
    ])
      .then(([backendBrands, backendCats]) => {
        if (!isMounted) return
        const mapped: Brand[] = (backendBrands || []).map((b: any) => ({
          id: b.id,
          name: b.name,
          slug: b.slug,
          logo: b.logo_url || b.logoUrl || undefined,
          description: b.description || `${b.name} genuine plumbing and hardware solutions.`,
          supportedCategories: Array.isArray(b.supported_categories)
            ? b.supported_categories
            : Array.isArray(b.supportedCategories)
            ? b.supportedCategories
            : [],
          active: b.is_active ?? b.isActive ?? true,
          displayOrder: b.display_order ?? b.displayOrder ?? 0,
          discountPercentage: b.discount_percentage ?? b.discountPercentage ?? null,
        }))
        setBrands(mapped)
        setCategories((backendCats || []).map((c: any) => ({ id: c.id, name: c.name })))
      })
      .catch((err: any) => {
        if (!isMounted) return
        setError(err?.message || "Failed to load brands from the catalogue database.")
      })
      .finally(() => {
        if (isMounted) setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [])

  // Category filter tabs matching reference image with dynamic fallback
  const categoryFilters = useMemo(() => {
    const defaultPills: { id: string; label: string; icon: any }[] = [
      { id: "all", label: "All Brands", icon: LayoutGrid },
    ]

    if (categories.length > 0) {
      const dbPills = categories.slice(0, 5).map((cat) => {
        const lower = cat.name.toLowerCase()
        let IconComponent = LayoutGrid
        if (lower.includes("pipe") || lower.includes("fitting")) IconComponent = Pipette
        else if (lower.includes("pump") || lower.includes("tool")) IconComponent = Wrench
        else if (lower.includes("elect")) IconComponent = Zap
        else if (lower.includes("sanitary") || lower.includes("bath")) IconComponent = Bath

        return {
          id: cat.name.toLowerCase(),
          label: cat.name,
          icon: IconComponent,
        }
      })
      return [{ id: "all", label: "All Brands", icon: LayoutGrid }, ...dbPills]
    }

    return defaultPills
  }, [categories])

  const filteredBrands = useMemo(() => {
    let list = brands.filter((brand) => brand.active)

    if (query.trim()) {
      const q = query.toLowerCase().trim()
      list = list.filter(
        (brand) =>
          brand.name.toLowerCase().includes(q) ||
          brand.description.toLowerCase().includes(q) ||
          brand.slug.toLowerCase().includes(q)
      )
    }

    if (selectedCategory !== "all") {
      const catLower = selectedCategory.toLowerCase()
      list = list.filter((brand) => {
        const desc = (brand.description || "").toLowerCase()
        const name = (brand.name || "").toLowerCase()
        const supported = (brand.supportedCategories || []).map((c) => c.toLowerCase())
        return (
          desc.includes(catLower) ||
          name.includes(catLower) ||
          supported.some((sc) => sc.includes(catLower)) ||
          (catLower.includes("pipe") && (desc.includes("pipe") || desc.includes("fitting") || name.includes("pipe"))) ||
          (catLower.includes("pump") && (desc.includes("pump") || name.includes("cri") || name.includes("crompton"))) ||
          (catLower.includes("sanitary") && (desc.includes("sanitary") || desc.includes("bath") || desc.includes("cava") || desc.includes("birla"))) ||
          (catLower.includes("elect") && (desc.includes("electric") || desc.includes("wire") || name.includes("havells") || name.includes("anchor")))
        )
      })
    }

    if (sortBy === "name") {
      list.sort((a, b) => a.name.localeCompare(b.name))
    } else if (sortBy === "discount") {
      list.sort((a, b) => (b.discountPercentage || 0) - (a.discountPercentage || 0))
    } else {
      list.sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
    }

    return list
  }, [brands, query, selectedCategory, sortBy])

  return (
    <div className="bg-[#f8fafc] min-h-screen pb-16">
      {/* Top Hero Banner matching Reference Image layout */}
      <div className="relative border-b border-slate-200/80 bg-gradient-to-r from-[#eef4f9] via-[#f1f6fa] to-[#e4edf5] overflow-hidden">
        {/* Soft gradient wash */}
        <div className="absolute inset-0 bg-gradient-to-r from-white/95 via-white/85 to-transparent z-0" />

        {/* Hardware & Sanitary Showcase Illustration on Right */}
        <div className="absolute right-0 top-0 bottom-0 w-1/2 md:w-5/12 hidden md:block overflow-hidden pointer-events-none z-0">
          <div className="relative w-full h-full flex items-center justify-end pr-8">
            <img
              src="/placeholder.webp"
              alt="Plumbing hardware and sanitary fittings"
              className="object-cover h-full w-full max-w-lg opacity-85 mix-blend-multiply"
              style={{
                maskImage: "linear-gradient(to left, rgba(0,0,0,1) 40%, rgba(0,0,0,0) 100%)",
                WebkitMaskImage: "linear-gradient(to left, rgba(0,0,0,1) 40%, rgba(0,0,0,0) 100%)",
              }}
            />
          </div>
        </div>

        <div className="container-wide relative z-10 py-8 md:py-12">
          {/* Breadcrumb Navigation */}
          <nav className="flex items-center gap-1.5 text-xs text-slate-500 font-medium mb-3">
            <Link to="/" className="hover:text-[#0B0B0B] transition-colors">
              Home
            </Link>
            <ChevronRight size={13} className="text-slate-400" />
            <span className="text-slate-800 font-semibold">Brands</span>
          </nav>

          {/* Title and Tagline */}
          <div className="max-w-2xl">
            <h1 className="text-3xl md:text-5xl font-black tracking-tight text-[#0B0B0B] leading-tight">
              Explore <span className="text-[#0B0B0B] underline decoration-[#D4AF37] decoration-4 underline-offset-4">Brands</span>
            </h1>
            <p className="mt-3 text-sm md:text-base text-slate-600 leading-relaxed font-normal">
              Discover top plumbing, sanitary and hardware brands at Hindustan Hardware & Sanitary. Genuine products. Trusted quality.
            </p>
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="container-wide pt-8">
        {/* Filter, Search & Sort Control Bar */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-3 shadow-2xs mb-8 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3.5">
          {/* Search Input Box */}
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search brands..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200/80 rounded-xl text-xs sm:text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-all"
            />
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 lg:pb-0 scrollbar-none">
            {categoryFilters.map((tab) => {
              const Icon = tab.icon
              const isActive = selectedCategory === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setSelectedCategory(tab.id)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all shrink-0 ${
                    isActive
                      ? "bg-[#0B0B0B] text-white shadow-xs"
                      : "bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200/80 hover:text-slate-900"
                  }`}
                >
                  <Icon size={14} className={isActive ? "text-[#D4AF37]" : "text-slate-500"} />
                  <span>{tab.label}</span>
                </button>
              )
            })}
          </div>

          {/* Right Section: Results Count & Sort Dropdown */}
          <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100">
            <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">
              {filteredBrands.length} {filteredBrands.length === 1 ? "brand" : "brands"} found
            </span>

            <div className="h-4 w-px bg-slate-200 hidden sm:block" />

            <div className="relative flex items-center">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                aria-label="Sort brands"
                className="appearance-none bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-800 text-xs font-bold rounded-xl py-2 pl-3 pr-8 cursor-pointer focus:outline-none focus:border-[#D4AF37]"
              >
                <option value="name">Sort by: A - Z</option>
                <option value="order">Sort by: Featured</option>
                <option value="discount">Sort by: Discount</option>
              </select>
              <ChevronRight
                size={13}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rotate-90 text-slate-500 pointer-events-none"
              />
            </div>
          </div>
        </div>

        {/* Brands Grid matching reference image cards */}
        {loading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="h-48 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs animate-pulse flex flex-col justify-between"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-14 w-14 rounded-xl bg-slate-100" />
                    <div className="h-4 w-24 bg-slate-100 rounded" />
                  </div>
                  <div className="h-6 w-16 bg-slate-100 rounded-full" />
                </div>
                <div className="space-y-2 mt-4">
                  <div className="h-3 w-full bg-slate-100 rounded" />
                  <div className="h-3 w-4/5 bg-slate-100 rounded" />
                </div>
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
                  <div className="h-3 w-16 bg-slate-100 rounded" />
                  <div className="h-8 w-24 bg-slate-100 rounded-xl" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <EmptyState
            title="Could not load brands"
            text={error}
            action={
              <Button onClick={() => window.location.reload()} variant="primary">
                Retry
              </Button>
            }
          />
        ) : filteredBrands.length === 0 ? (
          <EmptyState
            title="No matching manufacturers found"
            text={`No brands match your search for "${query}". Try adjusting your query or filter.`}
            action={
              <Button
                onClick={() => {
                  setQuery("")
                  setSelectedCategory("all")
                }}
                variant="outline"
              >
                Clear Filters
              </Button>
            }
          />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filteredBrands.map((brand) => (
              <article
                key={brand.id}
                className="group flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-5.5 shadow-2xs transition-all duration-200 hover:shadow-md hover:border-[#D4AF37]/50"
              >
                <div>
                  {/* Card Header: Brand Logo + Brand Name on Left, Verified Badge on Right */}
                  <div className="flex items-start justify-between gap-3">
                    <BrandMark brand={brand} />

                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 border border-emerald-200/80 shrink-0">
                      <CheckCircle2 size={13} className="text-emerald-600 fill-emerald-100" />
                      Verified
                    </span>
                  </div>

                  {/* Card Description */}
                  <p className="mt-4 text-xs sm:text-sm text-slate-600 line-clamp-2 leading-relaxed">
                    {brand.description || `${brand.name} genuine plumbing and hardware solutions.`}
                  </p>
                </div>

                {/* Card Footer: Slug on left, 'View Catalog ->' Button on right */}
                <div className="mt-5 pt-3.5 border-t border-slate-100/90 flex items-center justify-between">
                  <span className="font-mono text-xs font-medium text-slate-400">
                    /{brand.slug}
                  </span>

                  <Link
                    to={`/brands/${brand.slug}`}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#0B0B0B] hover:bg-[#D4AF37] hover:text-[#0B0B0B] text-white px-4 py-2 text-xs font-bold transition-all shadow-xs group-hover:shadow"
                  >
                    View Catalog <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function BrandDetailPage() {
  const { slug } = useParams()
  const [brand, setBrand] = useState<Brand | null>(null)
  const [items, setItems] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchFilter, setSearchFilter] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<string>("all")

  useEffect(() => {
    let isMounted = true
    if (!slug) return
    setLoading(true)
    setError(null)
    setSelectedCategory("all")

    // Authoritatively query brand and ALL its products (across all pages) from the database
    catalogueApi
      .getBrandBySlug(slug)
      .then(async (b: any) => {
        if (!isMounted) return null
        const mappedBrand: Brand = {
          id: b.id,
          name: b.name,
          slug: b.slug,
          logo: b.logo_url || b.logoUrl || undefined,
          description: b.description || `${b.name} certified plumbing, fittings, and hardware portfolio.`,
          supportedCategories: [],
          active: b.is_active ?? b.isActive ?? true,
          displayOrder: b.display_order ?? b.displayOrder ?? 0,
          discountPercentage: b.discount_percentage ?? b.discountPercentage ?? null,
        }
        setBrand(mappedBrand)

        // Fetch all pages of products for this brand so all item types and products are loaded
        const allProducts: any[] = []
        let page = 1
        let hasNextPage = true

        while (hasNextPage && isMounted) {
          const res = await catalogueApi.listProducts({ brand: b.id, page, limit: 100 })
          if (res?.items) {
            allProducts.push(...res.items)
          }
          hasNextPage = Boolean(res?.pagination?.hasNextPage)
          page += 1
        }

        return allProducts
      })
      .then((allItems) => {
        if (!isMounted || !allItems) return
        setItems(allItems.map(transformBackendProduct))
      })
      .catch((err: any) => {
        if (!isMounted) return
        setError(err?.message || "Manufacturer details could not be loaded from the database catalogue.")
      })
      .finally(() => {
        if (isMounted) setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [slug])

  // Extract available item types (categories) for this brand from its products
  const availableCategories = useMemo(() => {
    const categoryMap = new Map<string, { id: string; name: string; count: number }>()

    for (const item of items) {
      const catKey = (item.category || item.categoryId || "General").trim()
      const catName = (item.category || "General").trim()
      const existing = categoryMap.get(catKey.toLowerCase())
      if (existing) {
        existing.count += 1
      } else {
        categoryMap.set(catKey.toLowerCase(), {
          id: item.categoryId || catKey,
          name: catName,
          count: 1,
        })
      }
    }

    return Array.from(categoryMap.values()).sort((a, b) => b.count - a.count)
  }, [items])

  const visibleProducts = useMemo(() => {
    let list = items

    // Filter by selected item type / category
    if (selectedCategory !== "all") {
      list = list.filter((p) => {
        const catKey = (p.category || p.categoryId || "").toLowerCase().trim()
        const target = selectedCategory.toLowerCase().trim()
        return catKey === target || (p.categoryId && p.categoryId === selectedCategory)
      })
    }

    // Filter by search query
    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase().trim()
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q) ||
          p.material.toLowerCase().includes(q)
      )
    }
    return list
  }, [items, selectedCategory, searchFilter])

  if (loading) {
    return (
      <div className="container-wide py-12">
        <div className="h-56 rounded-3xl bg-slate-900/10 animate-pulse mb-8" />
        <div className="product-grid">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-72 rounded-2xl bg-slate-100 animate-pulse border border-border" />
          ))}
        </div>
      </div>
    )
  }

  if (error || !brand) {
    return (
      <div className="container-wide py-12">
        <EmptyState
          title="Manufacturer Not Found"
          text={error || "This manufacturer is not active in the catalogue database."}
          action={
            <Link to="/brands">
              <Button>Browse All Brands</Button>
            </Link>
          }
        />
      </div>
    )
  }

  const selectedCategoryObj = availableCategories.find(
    (c) => c.name.toLowerCase() === selectedCategory.toLowerCase() || c.id === selectedCategory
  )

  return (
    <div className="container-wide py-9">
      {/* Brand Hero Banner */}
      <div className="relative mb-8 overflow-hidden rounded-3xl bg-gradient-to-br from-[#0B0B0B] via-[#161616] to-[#241E12] p-8 md:p-10 border border-[#D4AF37]/30 shadow-2xl text-white">
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="relative grid h-20 w-20 place-items-center rounded-2xl bg-white p-2 shadow-xl border border-slate-200 shrink-0">
              {brand.logo ? (
                <img
                  src={brand.logo}
                  alt={`${brand.name} logo`}
                  className="h-full w-full object-contain"
                />
              ) : (
                <div className="grid h-full w-full place-items-center rounded-xl bg-gradient-to-tr from-[#0B0B0B] via-[#1A1A1A] to-[#2B2414] text-[#D4AF37] font-black text-xl border border-[#D4AF37]/30">
                  {brand.name.slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="rounded-full bg-[#D4AF37]/20 border border-[#D4AF37]/40 px-2.5 py-0.5 text-[10px] font-black text-[#D4AF37] uppercase tracking-wider">
                  Verified Partner
                </span>
                {brand.discountPercentage ? (
                  <span className="rounded-full bg-emerald-500/20 border border-emerald-500/40 px-2.5 py-0.5 text-[10px] font-black text-emerald-400">
                    {brand.discountPercentage}% OFF Storewide
                  </span>
                ) : null}
              </div>
              <h1 className="text-2xl md:text-4xl font-black tracking-tight text-white">{brand.name}</h1>
              <p className="mt-1 max-w-xl text-xs md:text-sm text-slate-300 leading-relaxed">
                {brand.description}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <Link to="/brands">
              <Button variant="outline" className="border-white/20 text-white hover:bg-white/10">
                ← All Brands
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Item Types (Categories) Section for this Brand */}
      {availableCategories.length > 0 && (
        <div className="mb-8 bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs">
          <div className="flex items-center justify-between mb-3.5">
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 flex items-center gap-2">
                <LayoutGrid size={16} className="text-[#D4AF37]" />
                Item Types by {brand.name}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Select an item type to view products manufactured by {brand.name} in that category.
              </p>
            </div>
            {selectedCategory !== "all" && (
              <button
                type="button"
                onClick={() => setSelectedCategory("all")}
                className="text-xs font-bold text-[#D4AF37] hover:underline"
              >
                View All Categories ({items.length})
              </button>
            )}
          </div>

          {/* Category Cards / Pills */}
          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => setSelectedCategory("all")}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                selectedCategory === "all"
                  ? "bg-[#0B0B0B] text-white shadow-xs"
                  : "bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200/80"
              }`}
            >
              <span>All Item Types</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                  selectedCategory === "all"
                    ? "bg-[#D4AF37] text-[#0B0B0B]"
                    : "bg-slate-200 text-slate-600"
                }`}
              >
                {items.length}
              </span>
            </button>

            {availableCategories.map((cat) => {
              const isSelected =
                selectedCategory.toLowerCase() === cat.name.toLowerCase() ||
                selectedCategory === cat.id
              return (
                <button
                  key={cat.id || cat.name}
                  type="button"
                  onClick={() => setSelectedCategory(cat.name)}
                  className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                    isSelected
                      ? "bg-[#0B0B0B] text-white shadow-xs ring-2 ring-[#D4AF37]/50"
                      : "bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200/80"
                  }`}
                >
                  <span>{cat.name}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                      isSelected
                        ? "bg-[#D4AF37] text-[#0B0B0B]"
                        : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {cat.count}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Brand Product Listing Header */}
      <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-black text-slate-900 tracking-tight">
              {brand.name}
              {selectedCategory !== "all" && selectedCategoryObj
                ? ` › ${selectedCategoryObj.name}`
                : ""}{" "}
              ({visibleProducts.length})
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {selectedCategory !== "all" && selectedCategoryObj
              ? `Showing ${brand.name} products under ${selectedCategoryObj.name}.`
              : `Authoritative products fetched from database catalog.`}
          </p>
        </div>

        {items.length > 0 && (
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
            <input
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder={`Search ${brand.name} products...`}
              className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50"
            />
          </div>
        )}
      </div>

      {visibleProducts.length ? (
        <div className="product-grid">
          {visibleProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <EmptyState
          title={
            searchFilter
              ? "No matching products found"
              : selectedCategory !== "all"
              ? `No products in ${selectedCategory}`
              : "No products listed"
          }
          text={
            searchFilter
              ? `No products match "${searchFilter}" under ${brand.name}.`
              : selectedCategory !== "all"
              ? `No products available under ${brand.name} for the selected item type.`
              : `There are currently no active products in the database catalogue for ${brand.name}.`
          }
          action={
            searchFilter ? (
              <Button onClick={() => setSearchFilter("")} variant="outline">
                Clear Product Filter
              </Button>
            ) : selectedCategory !== "all" ? (
              <Button onClick={() => setSelectedCategory("all")} variant="outline">
                Show All {brand.name} Products
              </Button>
            ) : (
              <Link to="/products">
                <Button>View All Products</Button>
              </Link>
            )
          }
        />
      )}
    </div>
  )
}


export function ComparePage() {
  const { compareIds, toggleCompare, clearCompare, addToCart } = useStore()
  const { data: comparisonData, loading, error } = useProductComparison(compareIds)

  return (
    <div className="container-wide py-9">
      <PageHeader
        breadcrumbs="Home / Compare"
        title="Compare compatible products"
        description="Side-by-side comparison of technical specifications, prices, brands, and availability from our database."
        action={
          compareIds.length > 0 ? (
            <Button variant="ghost" onClick={clearCompare}>
              <Trash2 size={16} /> Clear Comparison
            </Button>
          ) : undefined
        }
      />

      {compareIds.length === 0 ? (
        <EmptyState
          icon={<GitCompareArrows />}
          title="No products selected for comparison"
          text="Select 'Compare equivalent' on product cards or the product details page to compare up to 6 products."
          action={
            <Link to="/products">
              <Button>Browse Products</Button>
            </Link>
          }
        />
      ) : loading ? (
        <div className="space-y-4">
          <div className="h-64 rounded-2xl bg-slate-100 animate-pulse border border-border" />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-sm font-semibold text-red-700">
          <p>{error}</p>
          <Button variant="outline" className="mt-4" onClick={clearCompare}>
            Clear and reset comparison
          </Button>
        </div>
      ) : comparisonData && comparisonData.products.length > 0 ? (
        <div className="space-y-6">
          <ComparisonTable
            comparison={comparisonData}
            onRemove={toggleCompare}
            onAddToCart={(productId) => addToCart(productId, 1)}
          />

          <Link
            className="inline-flex items-center gap-2 text-sm font-bold text-brand hover:underline"
            to="/products"
          >
            ← Add more products from the catalogue
          </Link>
        </div>
      ) : (
        <EmptyState
          icon={<GitCompareArrows />}
          title="Comparison details unavailable"
          text="The selected products could not be retrieved from the database catalogue."
          action={
            <Button onClick={clearCompare}>
              Reset Comparison
            </Button>
          }
        />
      )}
    </div>
  )
}
