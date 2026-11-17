import { Heart, ShoppingCart, Star } from "lucide-react"
import { useEffect, useState } from "react"
import { Link, useNavigate, useParams } from "react-router"
import { catalogueApi, type BackendProduct } from "../api/catalogueApi"
import { Button, EmptyState, ProductCard, Quantity, formatPrice } from "../components"
import { type Product } from "../data"
import { AlternativeProducts } from "../features/components/AlternativeProducts"
import { ProductGallery } from "../features/components/ProductGallery"
import { useProductAlternatives } from "../features/hooks/useProductAlternatives"
import { useProductImages } from "../features/hooks/useProductImages"
import { useStore } from "../store"
import { transformBackendProduct } from "../utils/productTransform"

const productSizePattern = /\b\d+(?:\.\d+)?(?:\s*[-/]\s*\d+(?:\/\d+)?)?\s*(?:"|inches?|inch|mm|cm|feet|ft)/i

function getProductSize(product: Product): string {
  const nameSize = product.name.match(productSizePattern)?.[0]
  return (nameSize || product.size || product.diameter || product.length || "").trim().toLowerCase()
}

function getProductFamily(name: string): string {
  return name
    .replace(new RegExp(productSizePattern.source, "gi"), " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

async function getProductsForBrand(brandId: string): Promise<BackendProduct[]> {
  const products: BackendProduct[] = []
  let page = 1
  let hasNextPage = true

  while (hasNextPage) {
    const result = await catalogueApi.listProducts({ brand: brandId, page, limit: 100 })
    products.push(...result.items)
    hasNextPage = result.pagination.hasNextPage
    page += 1
  }

  return products
}

export function ProductDetailPage() {
  const { id } = useParams()
  const {
    addToCart,
    toggleWishlist,
    wishlist,
  } = useStore()
  const navigate = useNavigate()

  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [moreFromBrand, setMoreFromBrand] = useState<Product[]>([])
  const [sizeVariants, setSizeVariants] = useState<Product[]>([])
  const [loadingSizeVariants, setLoadingSizeVariants] = useState(false)
  const [tab, setTab] = useState("Description")
  const [quantity, setQuantity] = useState(1)

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
    setSizeVariants([])
    setLoadingSizeVariants(false)
    setMoreFromBrand([])

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

        // Fetch the same-brand catalogue to find other sizes of this product.
        if (bp.brand_id) {
          setSizeVariants([transformed])
          setLoadingSizeVariants(true)
          getProductsForBrand(bp.brand_id)
            .then((brandProducts) => {
              if (!isMounted) return
              const sameBrandProducts = brandProducts
                .filter((item) => item.id !== bp.id)
                .map(transformBackendProduct)
              setMoreFromBrand(sameBrandProducts.slice(0, 5))

              const currentFamily = getProductFamily(transformed.name)
              const currentSize = getProductSize(transformed)
              const matchingSizes = sameBrandProducts.filter((candidate) =>
                getProductFamily(candidate.name) === currentFamily
                && getProductSize(candidate) !== ""
                && getProductSize(candidate) !== currentSize,
              )
              setSizeVariants([transformed, ...matchingSizes])
            })
            .catch((err: unknown) => {
              console.error("Failed to load same-brand product sizes.", err)
            })
            .finally(() => {
              if (isMounted) setLoadingSizeVariants(false)
            })
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
    <div className="container-wide max-w-6xl py-5 sm:py-6 pb-28 md:pb-8">
      {/* Breadcrumb line */}
      <div className="mb-4 flex items-center gap-1.5 text-xs text-slate-500 font-medium">
        <Link to="/" className="hover:text-slate-800">Home</Link>
        <span>&gt;</span>
        <Link to="/products" className="hover:text-slate-800">Products</Link>
        <span>&gt;</span>
        <span className="text-slate-800 font-bold truncate max-w-md">{product.name}</span>
      </div>

      {/* Main Product Showcase Card */}
      <div className="grid gap-6 md:gap-8 rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 lg:grid-cols-[420px_1fr] shadow-xs items-start">
        {/* Left Column: Product Gallery with constrained max-height */}
        <div className="w-full max-w-md mx-auto">
          <ProductGallery
            mainImage={selectedImage || product.image}
            images={galleryImages}
            productName={product.name}
            onSelectImage={setSelectedImage}
            loading={loadingGallery}
          />
        </div>

        {/* Right Column: Product Info & Actions */}
        <div className="flex flex-col min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="inline-block text-[11px] font-black uppercase tracking-wider text-[#B89124]">
                {product.brandName || "AUTHENTIC PRODUCT"}
              </span>
              <h1 className="mt-1 text-xl sm:text-2xl font-black leading-snug text-slate-900">
                {product.name}
              </h1>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <button
                onClick={() => toggleWishlist(product.id)}
                aria-label="Toggle Wishlist"
                className="rounded-full border border-slate-200 p-2.5 hover:bg-slate-50 transition"
              >
                <Heart
                  size={18}
                  className={
                    wishlist.includes(product.id)
                      ? "fill-red-500 text-red-500"
                      : "text-slate-400"
                  }
                />
              </button>
              {(sizeVariants.length > 1 || loadingSizeVariants) && (
                <label className="block">
                  <span className="mb-1 block text-right text-[9px] font-bold uppercase tracking-wider text-slate-500">
                    Size
                  </span>
                  <select
                    value={product.id}
                    disabled={loadingSizeVariants}
                    onChange={(event) => navigate(`/product/${event.target.value}`)}
                    aria-label="Choose an available product size"
                    className="w-32 max-w-[36vw] rounded-lg border border-[#D4AF37]/60 bg-amber-50/60 px-2 py-1.5 text-xs font-bold text-slate-800 outline-none transition hover:border-[#D4AF37] focus:border-[#D4AF37] disabled:bg-slate-50"
                  >
                    {sizeVariants.map((variant) => (
                      <option key={variant.id} value={variant.id}>
                        {getProductSize(variant) || variant.name} · {formatPrice(variant.price)}
                      </option>
                    ))}
                    {loadingSizeVariants && sizeVariants.length === 0 && (
                      <option value={product.id}>Loading sizes…</option>
                    )}
                  </select>
                </label>
              )}
            </div>
          </div>

          <p className="mt-1.5 text-xs text-slate-400 font-medium">
            Item Code: {product.sku || `HH-${product.id.substring(0, 8).toUpperCase()}`} · Verified Original Item
          </p>

          {/* Pricing Row */}
          <div className="mt-4 flex flex-wrap items-baseline gap-2.5">
            <span className="text-2xl sm:text-3xl font-black text-slate-900">
              {formatPrice(product.price)}
            </span>
            {product.mrp && product.mrp > product.price && (
              <span className="text-sm sm:text-base text-slate-400 line-through">
                {formatPrice(product.mrp)}
              </span>
            )}
            {(product.discountPercentage || (product.mrp && product.mrp > product.price)) && (
              <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-black text-emerald-700 border border-emerald-200/50">
                {product.discountPercentage ?? Math.round(((product.mrp! - product.price) / product.mrp!) * 100)}% OFF
              </span>
            )}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            GST invoice included with every order. Includes all applicable taxes.
          </p>

          {/* Key Technical Specs Grid */}
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Material</span>
              <span className="text-xs font-extrabold text-slate-800">{product.material || "Industrial Grade"}</span>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Size / Capacity</span>
              <span className="text-xs font-extrabold text-slate-800">{product.size || product.diameter || "Standard Size"}</span>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Unit of Sale</span>
              <span className="text-xs font-extrabold text-slate-800">{product.unitOfSale || product.unit || "Piece"}</span>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Stock Status</span>
              {product.stock > 0 ? (
                <span className="text-xs font-extrabold text-emerald-600">{product.stock} units in stock</span>
              ) : (
                <span className="text-xs font-extrabold text-amber-600">Awaiting restock</span>
              )}
            </div>
          </div>

          {/* Action Buttons: Quantity, Add to Cart, Buy Now */}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Quantity value={quantity} onChange={setQuantity} />
            <Button
              onClick={() => addToCart(product.id, quantity)}
              className="flex-1 py-2.5 text-xs font-bold"
            >
              <ShoppingCart size={16} />
              Add to Cart
            </Button>
            <Button onClick={buyNow} variant="secondary" className="flex-1 py-2.5 text-xs font-bold">
              Buy Now
            </Button>
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
        </div>

        <AlternativeProducts
          alternatives={alternativeItems}
          currentProduct={product}
          loading={loadingAlternatives}
          onAddToCart={(altId) => addToCart(altId, 1)}
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
      <div className="fixed bottom-14 left-0 right-0 z-30 flex gap-2 border-t border-border bg-white p-3 md:hidden shadow-lg">
        <Button
          variant="outline"
          className="flex-1 py-2 text-xs sm:text-sm"
          onClick={() => addToCart(product.id, quantity)}
        >
          Add to Cart
        </Button>
        <Button className="flex-1 py-2 text-xs sm:text-sm" onClick={buyNow}>
          Buy Now
        </Button>
      </div>
    </div>
  )
}
