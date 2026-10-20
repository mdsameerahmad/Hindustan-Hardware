import {
  ArrowRight,
  GitCompareArrows,
  Search,
  Trash2
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
  const initials = brand.name
    .split(" ")
    .map((word) => word[0])
    .slice(0, 2)
    .join("")
  return brand.logo ? (
    <img
      src={brand.logo}
      alt={`${brand.name} logo`}
      className={
        compact ? "h-9 max-w-28 object-contain" : "h-12 max-w-36 object-contain"
      }
    />
  ) : (
    <div className="flex items-center gap-3">
      <span
        className={`grid shrink-0 place-items-center rounded-lg bg-[#0B0B0B] border border-[#D4AF37]/50 font-black text-[#D4AF37] ${
          compact ? "h-9 w-9 text-xs" : "h-12 w-12"
        }`}
      >
        {initials}
      </span>
      <b className={compact ? "text-sm text-[#0B0B0B]" : "text-base text-[#0B0B0B]"}>{brand.name}</b>
    </div>
  )
}

export function BrandStrip({ className = "" }: { className?: string }) {
  const { brands } = useStore()
  return (
    <section className={`container-wide ${className}`}>
      <SectionHeading
        eyebrow="Manufacturer catalog"
        title="Shop by Brand"
        action={
          <Link className="link-arrow" to="/brands">
            View All Brands <ArrowRight size={16} />
          </Link>
        }
      />
      <p className="-mt-4 mb-6 text-sm text-slate-500">
        Explore trusted plumbing brands and find the right product for your
        project.
      </p>
      <div className="brand-strip">
        {brands
          .filter((brand) => brand.active)
          .sort((a, b) => a.displayOrder - b.displayOrder)
          .map((brand) => {
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
                className="brand-circle-item group"
              >
                <div className="brand-circle-avatar">
                  {brand.logo ? (
                    <img
                      src={brand.logo}
                      alt={brand.name}
                      className="h-full w-full object-contain p-1"
                    />
                  ) : (
                    <div className="grid h-full w-full place-items-center rounded-full bg-gradient-to-br from-[#1C1C1C] to-[#0B0B0B] text-base font-black tracking-wider text-[#D4AF37] border border-[#D4AF37]/30 shadow-inner">
                      {initials}
                    </div>
                  )}
                </div>
                <span className="brand-circle-name">
                  {brand.name}
                </span>
              </Link>
            )
          })}
      </div>
    </section>
  )
}

const brandFilters = [
  "All",
  "CPVC Pipes",
  "PVC Pipes",
  "UPVC Pipes",
  "HDPE Pipes",
  "SWR and Drainage",
  "Pipe Fittings",
  "Water Supply Systems",
]

export function BrandsPage() {
  const { brands, products } = useStore()
  const [query, setQuery] = useState("")

  const shown = useMemo(() => {
    return brands.filter(
      (brand) =>
        brand.active &&
        brand.name.toLowerCase().includes(query.toLowerCase()),
    )
  }, [brands, query])

  return (
    <div className="container-wide py-9">
      <PageHeader
        breadcrumbs="Home / Brands"
        title="Manufacturer Brands"
        description="Browse certified manufacturers and trusted hardware brands available at Hindustan Hardware."
      />
      <div className="rounded-xl border border-border bg-white p-4">
        <div className="relative max-w-lg">
          <Search className="absolute left-3 top-3 text-slate-400" size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="field pl-10"
            placeholder="Search brands (e.g. Ashirvad, Astral, Supreme, CRI, Zoloto)..."
          />
        </div>
      </div>
      <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((brand) => {
          const count = products.filter(
            (product) =>
              product.brandId === brand.id && product.active !== false,
          ).length
          const actualCategories = [
            ...new Set(
              products
                .filter((product) => product.brandId === brand.id)
                .map((product) => product.productType),
            ),
          ]
          return (
            <article
              key={brand.id}
              className="rounded-xl border border-border bg-white p-6 transition hover:-translate-y-1 hover:shadow-lg flex flex-col justify-between"
            >
              <div>
                <BrandMark brand={brand} />
                <p className="mt-4 text-sm leading-6 text-slate-500">
                  {brand.description}
                </p>
              </div>
              <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
                <span className="text-xs font-semibold text-[#D4AF37] uppercase tracking-wider">
                  Verified Brand
                </span>
                <Link to={`/brands/${brand.slug}`}>
                  <Button variant="outline">Browse Products</Button>
                </Link>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}

export function BrandDetailPage() {
  const { slug } = useParams()
  const { brands } = useStore()
  const [brand, setBrand] = useState<Brand | null>(() => brands.find((item) => item.slug === slug) || null)
  const [items, setItems] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true
    if (!slug) return
    setLoading(true)
    setError(null)

    // 1. Fetch brand details
    catalogueApi
      .getBrandBySlug(slug)
      .then((b) => {
        if (!isMounted) return
        const mappedBrand: Brand = {
          id: b.id,
          name: b.name,
          slug: b.slug,
          logo: b.logo_url || undefined,
          description: b.description || `${b.name} genuine plumbing and hardware solutions.`,
          supportedCategories: [],
          active: b.is_active,
          displayOrder: b.display_order ?? 0,
        }
        setBrand(mappedBrand)

        // 2. Fetch products by this brand
        return catalogueApi.listProducts({ brand: b.id, limit: 50 })
      })
      .then((res) => {
        if (!isMounted || !res) return
        setItems(res.items.map(transformBackendProduct))
      })
      .catch((err: any) => {
        if (!isMounted) return
        setError(err?.message || "Manufacturer details could not be loaded from the catalogue.")
      })
      .finally(() => {
        if (isMounted) setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [slug, brands])

  if (loading) {
    return (
      <div className="container-wide py-12">
        <div className="h-40 rounded-2xl bg-white border border-border p-7 animate-pulse mb-8" />
        <div className="product-grid">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-72 rounded-xl bg-slate-100 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (error || !brand) {
    return (
      <div className="container-wide py-12">
        <EmptyState
          title="Brand not found"
          text={error || "This manufacturer is not active in the catalogue."}
          action={
            <Link to="/brands">
              <Button>Browse all brands</Button>
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <div className="container-wide py-9">
      <div className="mb-8 rounded-2xl border border-border bg-white p-7">
        <BrandMark brand={brand} />
        <h1 className="mt-6 text-3xl font-black">{brand.name} products</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
          {brand.description}. Authoritative manufacturer catalogue products.
        </p>
      </div>

      {items.length ? (
        <div className="product-grid">
          {items.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="No products listed"
          text={`There are currently no active products under ${brand.name}.`}
          action={
            <Link to="/products">
              <Button>View all products</Button>
            </Link>
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
