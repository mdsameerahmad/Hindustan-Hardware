import { useMemo, useState } from "react"
import { Link, useParams } from "react-router"
import {
  ArrowLeft,
  ArrowRight,
  Check,
  GitCompareArrows,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
} from "lucide-react"
import type { Brand, Product } from "../data"
import {
  Badge,
  Button,
  EmptyState,
  PageHeader,
  ProductCard,
  SectionHeading,
  formatPrice,
} from "../components"
import { useStore } from "../store"

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
          .map((brand) => (
            <Link
              key={brand.id}
              to={`/brands/${brand.slug}`}
              className="brand-tile"
            >
              <BrandMark brand={brand} />
              <span className="mt-3 line-clamp-1 text-xs text-slate-500">
                {brand.description}
              </span>
            </Link>
          ))}
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
  const [filter, setFilter] = useState("All")
  const shown = brands.filter(
    (brand) =>
      brand.active &&
      brand.name.toLowerCase().includes(query.toLowerCase()) &&
      (filter === "All" ||
        products.some(
          (product) =>
            product.brandId === brand.id && product.productType === filter,
        )),
  )
  return (
    <div className="container-wide py-9">
      <PageHeader
        breadcrumbs="Home / Brands"
        title="Plumbing brands"
        description="Browse the configurable manufacturer catalog and compare products that share verified demo specifications."
      />
      <div className="rounded-xl border border-border bg-white p-4">
        <div className="relative max-w-lg">
          <Search className="absolute left-3 top-3 text-slate-400" size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="field pl-10"
            placeholder="Search pipe brands..."
          />
        </div>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {brandFilters
            .filter(
              (item) =>
                item === "All" ||
                products.some((product) => product.productType === item),
            )
            .map((item) => (
              <button
                key={item}
                onClick={() => setFilter(item)}
                className={`tab-pill ${filter === item ? "active" : ""}`}
              >
                {item}
              </button>
            ))}
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
              className="rounded-xl border border-border bg-white p-6 transition hover:-translate-y-1 hover:shadow-lg"
            >
              <BrandMark brand={brand} />
              <p className="mt-4 min-h-10 text-sm leading-6 text-slate-500">
                {brand.description}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {actualCategories.slice(0, 3).map((category) => (
                  <Badge key={category} tone="blue">
                    {category}
                  </Badge>
                ))}
              </div>
              <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
                <span className="text-sm font-semibold text-slate-500">
                  {count} listed product{count === 1 ? "" : "s"}
                </span>
                <Link to={`/brands/${brand.slug}`}>
                  <Button variant="outline">Browse Brand</Button>
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
  const { brands, products } = useStore()
  const brand = brands.find((item) => item.slug === slug)
  if (!brand)
    return (
      <div className="container-wide py-12">
        <EmptyState
          title="Brand not found"
          text="This manufacturer is not active in the demo catalog."
        />
      </div>
    )
  const items = products.filter(
    (product) => product.brandId === brand.id && product.active !== false,
  )
  return (
    <div className="container-wide py-9">
      <div className="mb-8 rounded-2xl border border-border bg-white p-7">
        <BrandMark brand={brand} />
        <h1 className="mt-6 text-3xl font-black">{brand.name} products</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
          {brand.description}. Prices, specifications and availability below are
          editable prototype data, not official manufacturer listings.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {[...new Set(items.map((product) => product.productType))].map(
            (category) => (
              <Badge key={category} tone="blue">
                {category}
              </Badge>
            ),
          )}
        </div>
      </div>
      <div className="product-grid">
        {items.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </div>
  )
}

const specs: Array<[string, (product: Product) => string]> = [
  ["Brand", (product) => product.brandName],
  ["Product name", (product) => product.name],
  ["Material", (product) => product.material || "Not specified"],
  ["Diameter", (product) => product.diameter || "Not specified"],
  ["Length", (product) => product.length || "Not specified"],
  ["Pressure rating", (product) => product.pressureRating || "Not specified"],
  [
    "Intended application",
    (product) => product.intendedApplication || "Not specified",
  ],
  [
    "Technical standard",
    (product) => product.technicalStandard || "Not specified",
  ],
  ["Unit of sale", (product) => product.unitOfSale || "Not specified"],
]

export function ComparePage() {
  const { products, compareIds, toggleCompare, clearCompare, addToCart } =
    useStore()
  const selected = compareIds
    .map((id) => products.find((product) => product.id === id))
    .filter(Boolean) as Product[]
  const groupId = selected[0]?.comparisonGroupId
  const available = products.filter(
    (product) =>
      product.comparisonGroupId === groupId && !compareIds.includes(product.id),
  )
  const lowest = Math.min(...selected.map((product) => product.price))
  return (
    <div className="container-wide py-9">
      <PageHeader
        breadcrumbs="Home / Compare"
        title="Compare compatible products"
        description="Compare up to four products sharing an explicit compatibility group. Demo prices use the same configured sale unit."
        action={
          selected.length ? (
            <Button variant="ghost" onClick={clearCompare}>
              <Trash2 size={16} /> Clear Comparison
            </Button>
          ) : undefined
        }
      />
      {!selected.length ? (
        <EmptyState
          icon={<GitCompareArrows />}
          title="No products selected"
          text="Use the Compare action on a product card or product detail page. Compatible selections must share a comparison group."
          action={
            <Link to="/products">
              <Button>Back to Shopping</Button>
            </Link>
          }
        />
      ) : (
        <>
          <div className="comparison-wrap">
            <table className="comparison-table">
              <thead>
                <tr>
                  <th>Specification</th>
                  {selected.map((product) => (
                    <th key={product.id}>
                      <button
                        onClick={() => toggleCompare(product.id)}
                        className="float-right text-slate-400 hover:text-red-600"
                        aria-label={`Remove ${product.name}`}
                      >
                        <Trash2 size={15} />
                      </button>
                      <img
                        src={product.image}
                        alt=""
                        className="mb-3 h-24 w-full rounded-lg object-cover"
                      />
                      <span className="block text-sm font-black">
                        {product.brandName}
                      </span>
                      {product.price === lowest && (
                        <Badge tone="success">Lowest comparable price</Badge>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {specs.map(([label, getter]) => {
                  const values = selected.map(getter)
                  const differs = new Set(values).size > 1
                  return (
                    <tr key={label}>
                      <th>{label}</th>
                      {values.map((value, index) => (
                        <td
                          key={`${label}-${selected[index].id}`}
                          className={differs ? "comparison-difference" : ""}
                        >
                          {value}
                        </td>
                      ))}
                    </tr>
                  )
                })}
                <tr>
                  <th>Demo price</th>
                  {selected.map((product) => (
                    <td key={product.id}>
                      <b className="text-lg">{formatPrice(product.price)}</b>
                      <small className="block text-slate-500">
                        {product.unitOfSale}
                      </small>
                    </td>
                  ))}
                </tr>
                <tr>
                  <th>Stock status</th>
                  {selected.map((product) => (
                    <td key={product.id}>
                      {product.stock > 0
                        ? `${product.stock} in demo stock`
                        : "Out of stock"}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th>Actions</th>
                  {selected.map((product) => (
                    <td key={product.id}>
                      <Button
                        onClick={() => addToCart(product.id)}
                        className="w-full"
                      >
                        <ShoppingCart size={15} /> Add to Cart
                      </Button>
                      <Link
                        className="mt-2 block text-center text-xs font-bold text-brand"
                        to={`/product/${product.id}`}
                      >
                        View Product
                      </Link>
                      <label className="mt-3 block text-xs font-bold text-slate-500">
                        Replace product
                        <select
                          className="field mt-1"
                          value=""
                          onChange={(event) => {
                            if (!event.target.value) return
                            toggleCompare(product.id)
                            toggleCompare(event.target.value)
                          }}
                        >
                          <option value="">Choose compatible product</option>
                          {products
                            .filter(
                              (item) =>
                                item.comparisonGroupId ===
                                  product.comparisonGroupId &&
                                !compareIds.includes(item.id),
                            )
                            .map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.brandName} · {formatPrice(item.price)}
                              </option>
                            ))}
                        </select>
                      </label>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          {available.length > 0 && selected.length < 4 && (
            <div className="mt-6 rounded-xl border border-border bg-white p-5">
              <h2 className="font-black">Add another compatible product</h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {available.map((product) => (
                  <Button
                    key={product.id}
                    variant="outline"
                    onClick={() => toggleCompare(product.id)}
                  >
                    <Plus size={15} />
                    {product.brandName} · {formatPrice(product.price)}
                  </Button>
                ))}
              </div>
            </div>
          )}
          <Link
            className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-brand"
            to="/products"
          >
            <ArrowLeft size={16} /> Back to Shopping
          </Link>
        </>
      )}
    </div>
  )
}
