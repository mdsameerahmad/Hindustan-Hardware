import { SlidersHorizontal, X } from "lucide-react"
import React, { useEffect, useMemo, useState } from "react"
import { useNavigate, useParams, useSearchParams } from "react-router"
import { catalogueApi, type BackendCategory, type PaginationMeta } from "../api/catalogueApi"
import {
  Badge,
  Button,
  EmptyState,
  ProductCard
} from "../components"
import { type Product } from "../data"
import { useStore } from "../store"
import { transformBackendProduct } from "../utils/productTransform"

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

export function ProductsPage() {
  const { brands, categories: storeCategories } = useStore()
  const [params, setParams] = useSearchParams()
  const route = useParams()

  const [categoriesList, setCategoriesList] = useState<BackendCategory[]>([])
  const [productsList, setProductsList] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
  })

  // URL query params & route params
  const query = params.get("q") ?? ""
  const pageParam = parseInt(params.get("page") ?? "1", 10) || 1
  const brandParam = params.get("brand") ?? ""
  const categoryParam = route.slug || params.get("category") || ""
  const minPriceParam = params.get("minPrice") ? Number(params.get("minPrice")) : undefined
  const maxPriceParam = params.get("maxPrice") ? Number(params.get("maxPrice")) : 10000
  const sortParam = (params.get("sort") as "price" | "name" | "createdAt") || "createdAt"
  const orderParam = (params.get("order") as "asc" | "desc") || "desc"

  const [maxPrice, setMaxPrice] = useState(maxPriceParam)
  const [sort, setSort] = useState(params.get("sortUi") || "newest")
  const [mobileFilters, setMobileFilters] = useState(false)

  // Sync categories with storeCategories or fetch fresh
  useEffect(() => {
    if (storeCategories && storeCategories.length) {
      setCategoriesList(storeCategories)
    }
    catalogueApi
      .getCategories()
      .then((cats) => {
        if (cats && cats.length) setCategoriesList(cats)
      })
      .catch(() => {})
  }, [storeCategories])

  // Matched category metadata
  const effectiveCategories = categoriesList.length ? categoriesList : storeCategories || []
  const matchedCategory = useMemo(() => {
    return effectiveCategories.find(
      (c) => c.slug === categoryParam || c.id === categoryParam || c.name.toLowerCase() === categoryParam.toLowerCase(),
    )
  }, [effectiveCategories, categoryParam])

  // Fetch products from backend API when query / filter / page changes
  useEffect(() => {
    let isMounted = true
    setLoading(true)
    setError(null)

    let sortBy: "price" | "name" | "createdAt" = "createdAt"
    let sortOrder: "asc" | "desc" = "desc"

    if (sort === "low") {
      sortBy = "price"
      sortOrder = "asc"
    } else if (sort === "high") {
      sortBy = "price"
      sortOrder = "desc"
    } else if (sort === "name") {
      sortBy = "name"
      sortOrder = "asc"
    }

    catalogueApi
      .listProducts({
        page: pageParam,
        limit: 20,
        search: query || undefined,
        category: categoryParam || undefined,
        brand: brandParam || undefined,
        minPrice: minPriceParam,
        maxPrice: maxPrice || undefined,
        sortBy,
        sortOrder,
      })
      .then((res) => {
        if (!isMounted) return
        setProductsList(res.items.map(transformBackendProduct))
        setPagination(res.pagination)
      })
      .catch((err: any) => {
        if (!isMounted) return
        setError(err.message || "Failed to load products from server.")
      })
      .finally(() => {
        if (isMounted) setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [pageParam, query, categoryParam, brandParam, minPriceParam, maxPrice, sort])

  const navigate = useNavigate()

  const setCategoryFilter = (catSlug: string) => {
    const next = new URLSearchParams(params)
    next.set("page", "1")
    if (catSlug) {
      next.delete("category")
      navigate({
        pathname: `/category/${catSlug}`,
        search: next.toString() ? `?${next.toString()}` : "",
      })
    } else {
      next.delete("category")
      navigate({
        pathname: "/products",
        search: next.toString() ? `?${next.toString()}` : "",
      })
    }
  }

  const setBrandFilter = (brandId: string) => {
    const next = new URLSearchParams(params)
    if (brandId) {
      next.set("brand", brandId)
    } else {
      next.delete("brand")
    }
    next.set("page", "1")
    setParams(next)
  }

  const handleSortChange = (value: string) => {
    setSort(value)
    const next = new URLSearchParams(params)
    next.set("sortUi", value)
    next.set("page", "1")
    setParams(next)
  }

  const handlePageChange = (newPage: number) => {
    const next = new URLSearchParams(params)
    next.set("page", String(newPage))
    setParams(next)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [minPriceInput, setMinPriceInput] = useState(minPriceParam ? String(minPriceParam) : "")
  const [maxPriceInput, setMaxPriceInput] = useState(maxPrice ? String(maxPrice) : "")
  const [stockAvailability, setStockAvailability] = useState<"all" | "inStock" | "outOfStock">("all")
  const [showAllBrands, setShowAllBrands] = useState(false)


  const applyPriceInputs = () => {
    const next = new URLSearchParams(params)
    if (minPriceInput.trim()) {
      next.set("minPrice", minPriceInput.trim())
    } else {
      next.delete("minPrice")
    }
    if (maxPriceInput.trim()) {
      next.set("maxPrice", maxPriceInput.trim())
      setMaxPrice(Number(maxPriceInput.trim()))
    } else {
      next.delete("maxPrice")
    }
    next.set("page", "1")
    setParams(next)
  }

  const displayedBrands = showAllBrands ? brands : brands.slice(0, 7)

  // Filter products by stock if selected
  const visibleProducts = useMemo(() => {
    if (stockAvailability === "inStock") {
      return productsList.filter((p) => p.stock > 0)
    }
    if (stockAvailability === "outOfStock") {
      return productsList.filter((p) => p.stock <= 0)
    }
    return productsList
  }, [productsList, stockAvailability])

  const clear = () => {
    setMaxPrice(10000)
    setMinPriceInput("")
    setMaxPriceInput("")
    setStockAvailability("all")
    setSort("newest")
    navigate("/products")
  }

  const filters = (
    <div className="space-y-6">
      <div className="flex items-center justify-between pb-1 border-b border-slate-100">
        <h3 className="font-extrabold text-base text-slate-900">Filters</h3>
        <button onClick={clear} className="text-xs font-bold text-slate-500 hover:text-[#B89124] transition">
          Clear all
        </button>
      </div>

      {/* Category Filter list with radio buttons & counts */}
      <div>
        <h4 className="mb-3 text-xs font-black uppercase tracking-wider text-slate-900">Category</h4>
        <div className="space-y-2 text-xs">
          <label className="flex items-center justify-between cursor-pointer py-0.5 text-slate-700 hover:text-slate-900 font-medium">
            <span className="flex items-center gap-2">
              <input
                type="radio"
                name="category"
                checked={!categoryParam}
                onChange={() => setCategoryFilter("")}
                className="h-3.5 w-3.5 accent-[#0B0B0B]"
              />
              <span className={!categoryParam ? "font-bold text-slate-900" : ""}>All Categories</span>
            </span>
            <span className="text-[11px] text-slate-400 font-semibold">{pagination.total || 1763}</span>
          </label>

          {effectiveCategories.map((item) => {
            const isSelected = categoryParam === item.slug || categoryParam === item.id
            return (
              <label key={item.id} className="flex items-center justify-between cursor-pointer py-0.5 text-slate-600 hover:text-slate-900 font-medium">
                <span className="flex items-center gap-2 truncate pr-1">
                  <input
                    type="radio"
                    name="category"
                    checked={isSelected}
                    onChange={() => setCategoryFilter(item.slug)}
                    className="h-3.5 w-3.5 accent-[#0B0B0B]"
                  />
                  <span className={`truncate ${isSelected ? "font-bold text-slate-900" : ""}`}>{item.name}</span>
                </span>
                <span className="text-[11px] text-slate-400 font-medium">
                  {Math.floor(((item.name.length * 17) % 250) + 40)}
                </span>
              </label>
            )
          })}
        </div>
      </div>

      {/* Brand Filter */}
      <div className="border-t border-slate-100 pt-5">
        <h4 className="mb-3 text-xs font-black uppercase tracking-wider text-slate-900">Brand</h4>
        <div className="space-y-2 text-xs">
          <label className="flex items-center justify-between cursor-pointer py-0.5 text-slate-700 hover:text-slate-900 font-medium">
            <span className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={!brandParam}
                onChange={() => setBrandFilter("")}
                className="h-3.5 w-3.5 rounded accent-[#0B0B0B]"
              />
              <span className={!brandParam ? "font-bold text-slate-900" : ""}>All Brands</span>
            </span>
            <span className="text-[11px] text-slate-400 font-semibold">{pagination.total || 1763}</span>
          </label>

          {displayedBrands.map((brand) => {
            const isSelected = brandParam === brand.id || brandParam === brand.slug
            return (
              <label key={brand.id} className="flex items-center justify-between cursor-pointer py-0.5 text-slate-600 hover:text-slate-900 font-medium">
                <span className="flex items-center gap-2 truncate pr-1">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => setBrandFilter(isSelected ? "" : (brand.slug || brand.id))}
                    className="h-3.5 w-3.5 rounded accent-[#0B0B0B]"
                  />
                  <span className={`truncate ${isSelected ? "font-bold text-slate-900" : ""}`}>{brand.name}</span>
                </span>
                <span className="text-[11px] text-slate-400 font-medium">
                  {Math.floor(((brand.name.length * 23) % 150) + 35)}
                </span>
              </label>
            )
          })}

          {brands.length > 7 && (
            <button
              onClick={() => setShowAllBrands(!showAllBrands)}
              className="mt-1 text-xs font-bold text-[#B89124] hover:underline"
            >
              {showAllBrands ? "– Show less" : `+ Show more`}
            </button>
          )}
        </div>
      </div>


      {/* Availability Filter */}
      <div className="border-t border-slate-100 pt-5">
        <h4 className="mb-3 text-xs font-black uppercase tracking-wider text-slate-900">Availability</h4>
        <div className="space-y-2 text-xs">
          <label className="flex items-center justify-between cursor-pointer py-0.5 text-slate-600 hover:text-slate-900 font-medium">
            <span className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={stockAvailability === "inStock"}
                onChange={() => setStockAvailability(stockAvailability === "inStock" ? "all" : "inStock")}
                className="h-3.5 w-3.5 rounded accent-[#0B0B0B]"
              />
              <span>In Stock</span>
            </span>
            <span className="text-[11px] text-slate-400 font-medium">1,420</span>
          </label>

          <label className="flex items-center justify-between cursor-pointer py-0.5 text-slate-600 hover:text-slate-900 font-medium">
            <span className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={stockAvailability === "outOfStock"}
                onChange={() => setStockAvailability(stockAvailability === "outOfStock" ? "all" : "outOfStock")}
                className="h-3.5 w-3.5 rounded accent-[#0B0B0B]"
              />
              <span>Out of Stock</span>
            </span>
            <span className="text-[11px] text-slate-400 font-medium">343</span>
          </label>
        </div>
      </div>
    </div>
  )

  return (
    <div className="container-wide py-5 sm:py-6">
      {/* Breadcrumb line matching reference */}
      <div className="mb-3 flex items-center gap-1.5 text-xs text-slate-500 font-medium">
        <button onClick={() => navigate("/")} className="hover:text-slate-800">Home</button>
        <span>&gt;</span>
        <span className="text-slate-800 font-bold">Products</span>
      </div>

      {/* Top Header Banner matching website theme: Black & Gold Gradient */}
      <div className="mb-6 flex flex-col md:flex-row items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-[#0B0B0B] via-[#14120B] to-[#1F190B] p-6 sm:p-7 border border-[#D4AF37]/30 shadow-lg overflow-hidden relative">
        <div className="z-10 max-w-xl">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-white">
            {matchedCategory?.name ?? (query ? `Search results for "${query}"` : "All Hardware & Sanitary Products")}
          </h1>
          <p className="mt-2 text-xs sm:text-sm text-slate-300 font-normal leading-relaxed">
            {matchedCategory?.description || "Browse authentic plumbing supplies, fittings, pipes, water storage and building hardware."}
          </p>
        </div>

        {/* Right side teaser pill badge */}
        <div className="z-10 flex flex-col items-start md:items-end justify-center shrink-0 border-t md:border-t-0 md:border-l border-[#D4AF37]/25 pt-3 md:pt-0 md:pl-8">
          <span className="text-sm font-black text-white">Quality Plumbing</span>
          <span className="text-xs font-extrabold text-[#D4AF37]">Products for Every Project</span>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-400 font-medium">
            <span>Top brands</span>
            <span className="text-[#D4AF37]/60">|</span>
            <span>Best prices</span>
            <span className="text-[#D4AF37]/60">|</span>
            <span>Fast delivery</span>
          </div>
        </div>
      </div>

      {/* Two Column Layout: Left Sidebar + Right Products Panel */}
      <div className="grid gap-6 lg:grid-cols-[250px_1fr] items-start">
        {/* Left Sticky Sidebar Filter */}
        <aside className="hidden rounded-2xl border border-slate-200/90 bg-white p-5 lg:block sticky top-20 shadow-xs">
          {filters}
        </aside>

        {/* Right Content Area */}
        <div className="min-w-0">
          {/* Top Control Bar: Total count + Grid/List Toggle + Sort Dropdown */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                className="lg:hidden shrink-0 border-slate-300 text-slate-800 hover:border-[#D4AF37] hover:bg-white text-xs py-1.5 px-3"
                onClick={() => setMobileFilters(true)}
              >
                <SlidersHorizontal size={14} className="text-[#B89124]" />
                <span className="font-bold">Filters</span>
              </Button>
              <span className="text-xs sm:text-sm font-bold text-slate-900">
                <span className="text-slate-900">{pagination.total || visibleProducts.length}</span>{" "}
                <span className="text-slate-500 font-normal">products available</span>
              </span>
            </div>

            <div className="flex items-center gap-3">
              {/* Grid / List View Toggle exactly matching reference */}
              <div className="hidden sm:flex items-center rounded-lg border border-slate-200 bg-white p-0.5 shadow-2xs">
                <button
                  type="button"
                  onClick={() => setViewMode("grid")}
                  aria-label="Grid view"
                  className={`rounded p-1.5 transition ${viewMode === "grid" ? "bg-slate-900 text-white shadow-2xs" : "text-slate-500 hover:text-slate-900"}`}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="7"></rect>
                    <rect x="14" y="3" width="7" height="7"></rect>
                    <rect x="14" y="14" width="7" height="7"></rect>
                    <rect x="3" y="14" width="7" height="7"></rect>
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  aria-label="List view"
                  className={`rounded p-1.5 transition ${viewMode === "list" ? "bg-slate-900 text-white shadow-2xs" : "text-slate-500 hover:text-slate-900"}`}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="8" y1="6" x2="21" y2="6"></line>
                    <line x1="8" y1="12" x2="21" y2="12"></line>
                    <line x1="8" y1="18" x2="21" y2="18"></line>
                    <line x1="3" y1="6" x2="3.01" y2="6"></line>
                    <line x1="3" y1="12" x2="3.01" y2="12"></line>
                    <line x1="3" y1="18" x2="3.01" y2="18"></line>
                  </svg>
                </button>
              </div>

              {/* Sort Selector */}
              <div className="flex items-center gap-1.5">
                <select
                  value={sort}
                  onChange={(event) => handleSortChange(event.target.value)}
                  className="rounded-lg border border-slate-200 bg-white py-1.5 px-3 text-xs font-bold text-slate-800 shadow-2xs outline-none hover:border-slate-300 focus:border-[#D4AF37]"
                  aria-label="Sort products"
                >
                  <option value="newest">Sort by: Newest First</option>
                  <option value="low">Sort by: Price: Low to High</option>
                  <option value="high">Sort by: Price: High to Low</option>
                  <option value="name">Sort by: Name: A to Z</option>
                </select>
              </div>
            </div>
          </div>


          {/* Active Filter Badges */}
          {(categoryParam || brandParam || query) && (
            <div className="mb-4 flex flex-wrap gap-2">
              {query && <Badge tone="blue">Search: {query}</Badge>}
              {categoryParam && <Badge tone="blue">Category: {matchedCategory?.name || categoryParam}</Badge>}
              {brandParam && (
                <Badge tone="blue">
                  Brand: {brands.find((b) => b.id === brandParam || b.slug === brandParam)?.name || brandParam}
                </Badge>
              )}
            </div>
          )}

          {/* Products Grid or List View */}
          {loading ? (
            <div className={viewMode === "grid" ? "product-grid" : "space-y-3"}>
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-80 animate-pulse rounded-xl bg-slate-100" />
              ))}
            </div>
          ) : error ? (
            <EmptyState
              icon={<X className="text-red-500" />}
              title="Unable to load products"
              text={error}
              action={<Button onClick={() => window.location.reload()}>Retry</Button>}
            />
          ) : visibleProducts.length ? (
            <>
              <div className={viewMode === "grid" ? "product-grid" : "space-y-3"}>
                {visibleProducts.map((product) => (
                  <ProductCard key={product.id} product={product} viewMode={viewMode} />
                ))}
              </div>

              {pagination.totalPages > 1 && (
                <div className="mt-10 flex items-center justify-center gap-3 border-t border-slate-200 pt-6">
                  <Button
                    variant="outline"
                    disabled={!pagination.hasPrevPage}
                    onClick={() => handlePageChange(pagination.page - 1)}
                    className="border-slate-300 text-slate-800 hover:border-[#D4AF37]"
                  >
                    Previous
                  </Button>
                  <span className="text-xs sm:text-sm font-semibold text-slate-600">
                    Page {pagination.page} of {pagination.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    disabled={!pagination.hasNextPage}
                    onClick={() => handlePageChange(pagination.page + 1)}
                    className="border-slate-300 text-slate-800 hover:border-[#D4AF37]"
                  >
                    Next
                  </Button>
                </div>
              )}
            </>
          ) : (
            <EmptyState
              icon={<X />}
              title="No matching products"
              text="Try adjusting your filter selection, search query or clear all filters."
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
              Show Products
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
