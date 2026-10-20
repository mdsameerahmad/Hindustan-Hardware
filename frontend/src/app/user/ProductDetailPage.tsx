import { GitCompareArrows, Heart, ShoppingCart, Star } from "lucide-react"
import { useEffect, useState } from "react"
import { Link, useNavigate, useParams } from "react-router"
import { catalogueApi } from "../api/catalogueApi"
import { Button, EmptyState, ProductCard, Quantity, formatPrice } from "../components"
import { type Product } from "../data"
import { AlternativeProducts } from "../features/components/AlternativeProducts"
import { ProductGallery } from "../features/components/ProductGallery"
import { useProductAlternatives } from "../features/hooks/useProductAlternatives"
import { useProductImages } from "../features/hooks/useProductImages"
import { useStore } from "../store"
import { transformBackendProduct } from "../utils/productTransform"

export function ProductDetailPage() {
  const { id } = useParams()
  const {
    addToCart,
    toggleWishlist,
    wishlist,
    compareIds,
    toggleCompare,
  } = useStore()
  const navigate = useNavigate()

  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [moreFromBrand, setMoreFromBrand] = useState<Product[]>([])
  const [tab, setTab] = useState("Description")
  const [quantity, setQuantity] = useState(1)
  const [pin, setPin] = useState("")
  const [checked, setChecked] = useState(false)

  // Live Product Image Gallery from backend storage
  const {
    images: galleryImages,
    selectedImage,
    setSelectedImage,
    loading: loadingGallery,
  } = useProductImages(product?.id, product?.image)

  // Live Cross-Brand Alternatives from backend ComparisonService
  const {
    alternatives: alternativeItems,
    loading: loadingAlternatives,
  } = useProductAlternatives(product?.id, { limit: 6 })

  useEffect(() => {
    let isMounted = true
    if (!id) return

    setLoading(true)
    setError(null)

    // Check if ID is UUID or slug
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    const fetchPromise = isUuid
      ? catalogueApi.getProductById(id)
      : catalogueApi.getProductBySlug(id)

    fetchPromise
      .then(async (bp) => {
        if (!isMounted) return
        const transformed = transformBackendProduct(bp)
        setProduct(transformed)

        // Fetch authoritative products from the same brand
        if (bp.brand_id) {
          catalogueApi
            .listProducts({ brand: bp.brand_id, limit: 6 })
            .then((brandRes) => {
              if (isMounted && brandRes.items.length) {
                setMoreFromBrand(
                  brandRes.items
                    .filter((item) => item.id !== bp.id)
                    .slice(0, 5)
                    .map(transformBackendProduct),
                )
              }
            })
            .catch(() => {})
        }
      })
      .catch((err: any) => {
        if (!isMounted) return
        setError(err?.message || "Product could not be retrieved from the catalogue.")
      })
      .finally(() => {
        if (isMounted) setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [id])

  if (loading) {
    return (
      <div className="container-wide py-16">
        <div className="grid gap-8 rounded-2xl border border-border bg-white p-8 lg:grid-cols-[1fr_1fr] animate-pulse">
          <div className="aspect-square rounded-xl bg-slate-100" />
          <div className="space-y-4">
            <div className="h-6 w-32 bg-slate-100 rounded" />
            <div className="h-10 w-3/4 bg-slate-100 rounded" />
            <div className="h-12 w-48 bg-slate-100 rounded" />
            <div className="space-y-2">
              <div className="h-4 w-full bg-slate-100 rounded" />
              <div className="h-4 w-5/6 bg-slate-100 rounded" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error || !product) {
    return (
      <div className="container-wide py-16">
        <EmptyState
          title="Product not found"
          text={error || "This product may not be available or active in the catalogue."}
          action={
            <Link to="/products">
              <Button>Browse products</Button>
            </Link>
          }
        />
      </div>
    )
  }

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
          <ProductGallery
            mainImage={selectedImage || product.image}
            images={galleryImages}
            productName={product.name}
            onSelectImage={setSelectedImage}
            loading={loadingGallery}
          />
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
            SKU: HH-{product.id.substring(0, 8).toUpperCase()} · Verified catalogue item
          </p>
          <div className="mt-6 flex flex-wrap items-baseline gap-3">
            <span className="text-4xl font-black text-ink">
              {formatPrice(product.price)}
            </span>
            {product.mrp && product.mrp > product.price && (
              <span className="text-lg text-slate-400 line-through">
                {formatPrice(product.mrp)}
              </span>
            )}
            {(product.discountPercentage || (product.mrp && product.mrp > product.price)) && (
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                {product.discountPercentage ?? Math.round(((product.mrp! - product.price) / product.mrp!) * 100)}% OFF
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Authoritative catalogue pricing. GST invoice provided with order.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="spec-pill">
              <small>Material</small>
              <b>{product.material || "Standard"}</b>
            </div>
            <div className="spec-pill">
              <small>Size / capacity</small>
              <b>{product.size || product.diameter || "Standard"}</b>
            </div>
            <div className="spec-pill">
              <small>Unit of sale</small>
              <b>{product.unitOfSale || product.unit}</b>
            </div>
            <div className="spec-pill">
              <small>Stock Status</small>
              {product.stock > 0 ? (
                <b className="text-emerald-700">{product.stock} units available</b>
              ) : (
                <b className="text-amber-700">Awaiting stock verification</b>
              )}
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
                Delivery check complete. Delivery scheduling will be confirmed by
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
              Standard delivery applies for items in stock.
            </p>
          )}
          {tab === "Reviews" && (
            <EmptyState
              icon={<Star />}
              title="No verified reviews yet"
              text="Reviews will appear here only after verified customer reviews are submitted."
            />
          )}
        </div>
      </section>
      <section className="section-space rounded-2xl border border-border bg-white p-5 sm:p-7">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end mb-6">
          <div>
            <p className="eyebrow">Compare Other Brands</p>
            <h2 className="mt-2 text-2xl font-black">
              Verified Cross-Brand Alternatives
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Cross-brand alternatives sharing the same category and technical specifications.
            </p>
          </div>
          <Link to="/compare">
            <Button variant="outline">
              <GitCompareArrows size={17} /> Open side-by-side comparison
            </Button>
          </Link>
        </div>

        <AlternativeProducts
          alternatives={alternativeItems}
          currentProduct={product}
          loading={loadingAlternatives}
          onAddToCart={(altId) => addToCart(altId, 1)}
          onToggleCompare={toggleCompare}
          isCompared={(altId) => compareIds.includes(altId)}
        />
      </section>
      {moreFromBrand.length > 0 && (
        <section className="section-space">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <p className="eyebrow">{product.brandName}</p>
              <h2 className="text-2xl font-black">More from this Brand</h2>
            </div>
          </div>
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
