import { SlidersHorizontal, X } from "lucide-react"
import React, { useEffect, useMemo, useState } from "react"
import { useNavigate, useParams, useSearchParams } from "react-router"
import { catalogueApi, type BackendCategory, type PaginationMeta } from "../api/catalogueApi"
import {
  Badge,
  Button,
  EmptyState,
  PageHeader,
  ProductCard,
  formatPrice,
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

  const clear = () => {
    setMaxPrice(10000)
    setSort("newest")
    navigate("/products")
  }

  const filters = (
    <div className="space-y-7">
      <div className="flex items-center justify-between">
        <h3 className="font-extrabold text-ink">Filters</h3>
        <button onClick={clear} className="text-sm font-bold text-brand hover:underline">
          Clear all
        </button>
      </div>

      <FilterGroup label="Category">
        <label className="filter-option">
          <input
            type="radio"
            name="category"
            checked={!categoryParam}
            onChange={() => setCategoryFilter("")}
          />
          All Categories
        </label>
        {effectiveCategories.map((item) => (
          <label key={item.id} className="filter-option">
            <input
              type="radio"
              name="category"
              checked={categoryParam === item.slug || categoryParam === item.id}
              onChange={() => setCategoryFilter(item.slug)}
            />
            {item.name}
          </label>
        ))}
      </FilterGroup>

      <FilterGroup label="Brand">
        <label className="filter-option">
          <input
            type="radio"
            name="brand"
            checked={!brandParam}
            onChange={() => setBrandFilter("")}
          />
          All Brands
        </label>
        {brands.map((brand) => (
          <label key={brand.id} className="filter-option">
            <input
              type="radio"
              name="brand"
              checked={brandParam === brand.id || brandParam === brand.slug}
              onChange={() => setBrandFilter(brand.slug || brand.id)}
            />
            {brand.name}
          </label>
        ))}
      </FilterGroup>

      <FilterGroup label={`Price up to ${formatPrice(maxPrice)}`}>
        <input
          aria-label="Maximum price"
          type="range"
          min="100"
          max="15000"
          step="100"
          value={maxPrice}
          onChange={(event) => setMaxPrice(Number(event.target.value))}
          className="w-full accent-[#D4AF37]"
        />
        <div className="mt-2 flex justify-between text-xs text-slate-500">
          <span>₹100</span>
          <span>₹15,000</span>
        </div>
      </FilterGroup>
    </div>
  )

  return (
    <div className="container-wide py-8">
      <PageHeader
        breadcrumbs="Home / Products"
        title={
          matchedCategory?.name ??
          (query
            ? `Search results for “${query}”`
            : "All Hardware & Sanitary Products")
        }
        description={
          matchedCategory?.description ||
          "Browse authentic plumbing supplies, fittings, pipes, water storage and building hardware."
        }
      />

      <div className="mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-border bg-white p-3 sm:p-4 shadow-sm">
        <div className="flex items-center justify-between sm:justify-start gap-3">
          <Button
            variant="outline"
            className="lg:hidden shrink-0 border-[#D4AF37]/50 text-slate-800 hover:border-[#D4AF37] hover:bg-[#FAF8F5]"
            onClick={() => setMobileFilters(true)}
          >
            <SlidersHorizontal size={16} className="text-[#B89124]" />
            <span className="font-semibold text-xs sm:text-sm">Filters</span>
          </Button>
          <span className="text-xs sm:text-sm text-slate-500 font-medium">
            <b className="text-ink font-bold">{pagination.total}</b> products available
          </span>
        </div>
        <div className="w-full sm:w-auto">
          <select
            value={sort}
            onChange={(event) => handleSortChange(event.target.value)}
            className="field w-full sm:w-56 text-xs sm:text-sm py-2 px-3 rounded-lg border-border bg-slate-50/50 hover:bg-white focus:bg-white transition"
            aria-label="Sort products"
          >
            <option value="newest">Sort: Newest First</option>
            <option value="low">Price: Low to high</option>
            <option value="high">Price: High to low</option>
            <option value="name">Name: A to Z</option>
          </select>
        </div>
      </div>

      {(categoryParam || brandParam || query) && (
        <div className="mb-5 flex flex-wrap gap-2">
          {query && <Badge tone="blue">Search: {query}</Badge>}
          {categoryParam && <Badge tone="blue">Category: {matchedCategory?.name || categoryParam}</Badge>}
          {brandParam && (
            <Badge tone="blue">
              Brand: {brands.find((b) => b.id === brandParam || b.slug === brandParam)?.name || brandParam}
            </Badge>
          )}
        </div>
      )}

      <div className="grid gap-7 lg:grid-cols-[260px_1fr]">
        <aside className="hidden rounded-xl border border-border bg-white p-5 lg:block h-fit sticky top-20">
          {filters}
        </aside>

        <div>
          {loading ? (
            <div className="product-grid">
              {[...Array(6)].map((_, i) => (
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
          ) : productsList.length ? (
            <>
              <div className="product-grid">
                {productsList.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>

              {pagination.totalPages > 1 && (
                <div className="mt-10 flex items-center justify-center gap-3 border-t border-border pt-6">
                  <Button
                    variant="outline"
                    disabled={!pagination.hasPrevPage}
                    onClick={() => handlePageChange(pagination.page - 1)}
                  >
                    Previous
                  </Button>
                  <span className="text-sm font-semibold text-slate-600">
                    Page {pagination.page} of {pagination.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    disabled={!pagination.hasNextPage}
                    onClick={() => handlePageChange(pagination.page + 1)}
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
