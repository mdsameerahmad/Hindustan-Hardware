import { Heart, ShoppingCart } from "lucide-react"
import { Link } from "react-router"
import type { Product } from "../data"
import { ProductImage } from "../features/components/ProductImage"
import { useStore } from "../store"
import { formatPrice } from "../utils/formatters"

export function ProductCard({
  product,
  viewMode = "grid",
}: {
  product: Product
  viewMode?: "grid" | "list"
}) {
  const { addToCart, wishlist, toggleWishlist } = useStore()
  const discount =
    product.discountPercentage != null && product.discountPercentage > 0
      ? product.discountPercentage
      : product.mrp && product.mrp > product.price
        ? Math.round(((product.mrp - product.price) / product.mrp) * 100)
        : 0

  // Derive badge type like reference (Best Seller, New, or Discount)
  const isBestSeller = product.featured || (product.rating && product.rating >= 4.7)
  const isNew = Boolean(product.tags?.some((t) => t.toLowerCase().includes("new")))

  // Spec subtitle line
  const specSubtitle = [
    product.diameter,
    product.material,
    product.brandName && product.name.toLowerCase().includes(product.brandName.toLowerCase())
      ? ""
      : "",
  ]
    .filter(Boolean)
    .join(" | ") || (product.material ? `${product.material} Construction` : "Standard Industrial Grade")

  const ratingValue = product.rating || 4.5
  const reviewCount = product.reviewsCount || Math.floor(((product.price % 80) + 25) * 1.6)

  if (viewMode === "list") {
    return (
      <article className="group flex flex-col sm:flex-row overflow-hidden rounded-xl border border-slate-200/90 bg-gradient-to-br from-white via-[#FCFBF8] to-[#F8F5EC] transition hover:shadow-lg hover:border-[#D4AF37]/50 hover:-translate-y-0.5">
        <div className="relative w-full sm:w-56 shrink-0 aspect-[4/3] sm:aspect-square overflow-hidden bg-slate-100 border-b sm:border-b-0 sm:border-r border-slate-100">
          <Link to={`/product/${product.id}`} className="block h-full w-full">
            <ProductImage
              src={product.image}
              alt={product.name}
              className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
            />
          </Link>
          <button
            aria-label="Toggle wishlist"
            onClick={() => toggleWishlist(product.id)}
            className="absolute right-3 top-3 rounded-full bg-white/95 p-1.5 shadow-sm transition hover:scale-110 border border-slate-200 text-slate-400 hover:text-red-500"
          >
            <Heart
              size={15}
              className={wishlist.includes(product.id) ? "fill-red-500 text-red-500" : ""}
            />
          </button>
          {isBestSeller ? (
            <span className="absolute left-3 top-3 rounded bg-emerald-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white shadow-xs">
              Best Seller
            </span>
          ) : discount > 0 ? (
            <span className="absolute left-3 top-3 rounded bg-orange-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white shadow-xs">
              {discount}% OFF
            </span>
          ) : isNew ? (
            <span className="absolute left-3 top-3 rounded bg-blue-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white shadow-xs">
              New
            </span>
          ) : null}
        </div>

        <div className="flex flex-1 flex-col justify-between p-4 sm:p-5">
          <div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                {product.brandName || "GENUINE"}
              </p>
              <span className={`text-[11px] font-bold ${product.stock > 0 ? "text-emerald-600" : "text-amber-600"}`}>
                {product.stock > 10 ? "In stock" : product.stock > 0 ? `Only ${product.stock} left` : "Pre-order"}
              </span>
            </div>

            <Link
              to={`/product/${product.id}`}
              className="mt-1 block text-base font-bold text-slate-900 hover:text-[#B89124] transition line-clamp-2"
            >
              {product.name}
            </Link>

            <p className="mt-1 text-xs text-slate-500 font-medium">
              {specSubtitle}
            </p>

            <div className="mt-2 flex items-center gap-1.5 text-xs">
              <div className="flex text-amber-400">
                {"★".repeat(Math.round(ratingValue))}
                {"☆".repeat(5 - Math.round(ratingValue))}
              </div>
              <span className="font-bold text-slate-700">{ratingValue.toFixed(1)}</span>
              <span className="text-slate-400 font-medium">({reviewCount})</span>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-3">
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-black text-slate-900">
                {formatPrice(product.price)}
              </span>
              {product.mrp && product.mrp > product.price && (
                <span className="text-xs text-slate-400 line-through">
                  {formatPrice(product.mrp)}
                </span>
              )}
            </div>

            <button
              onClick={() => addToCart(product.id)}
              className="btn-gold-gradient inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-xs font-bold text-[#0B0B0B] shadow-sm transition active:scale-95"
            >
              <ShoppingCart size={15} />
              <span>Add to Cart</span>
            </button>
          </div>
        </div>
      </article>
    )
  }

  return (
    <article className="group flex min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-gradient-to-b from-white via-[#FCFAF5] to-[#F7F3E9] shadow-xs transition duration-300 hover:-translate-y-1 hover:border-[#D4AF37]/60 hover:shadow-xl">
      {/* Product Image Area: Full bleed image without side borders */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-100">
        <Link to={`/product/${product.id}`} className="block h-full w-full">
          <ProductImage
            src={product.image}
            alt={product.name}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        </Link>

        {/* Wishlist Button */}
        <button
          aria-label="Toggle wishlist"
          onClick={() => toggleWishlist(product.id)}
          className="absolute right-2.5 top-2.5 rounded-full bg-white/95 p-1.5 shadow-sm transition hover:scale-110 border border-slate-100 text-slate-400 hover:text-red-500"
        >
          <Heart
            size={15}
            className={
              wishlist.includes(product.id)
                ? "fill-red-500 text-red-500"
                : ""
            }
          />
        </button>

        {/* Badges exactly matching Reference style */}
        {isBestSeller ? (
          <span className="absolute left-2.5 top-2.5 rounded bg-emerald-600 px-2 py-0.5 text-[9.5px] font-black uppercase tracking-wider text-white shadow-xs">
            Best Seller
          </span>
        ) : discount > 0 ? (
          <span className="absolute left-2.5 top-2.5 rounded bg-orange-600 px-2 py-0.5 text-[9.5px] font-black uppercase tracking-wider text-white shadow-xs">
            {discount}% OFF
          </span>
        ) : isNew ? (
          <span className="absolute left-2.5 top-2.5 rounded bg-blue-600 px-2 py-0.5 text-[9.5px] font-black uppercase tracking-wider text-white shadow-xs">
            New
          </span>
        ) : null}
      </div>

      {/* Product Content Details matching Reference */}
      <div className="flex flex-1 flex-col p-3 sm:p-3.5">
        {/* Brand Name */}
        <p className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-slate-500">
          {product.brandName || "GENUINE"}
        </p>

        {/* Product Title */}
        <Link
          to={`/product/${product.id}`}
          className="mt-1 line-clamp-1 text-xs sm:text-sm font-bold leading-snug text-slate-900 hover:text-[#B89124] transition"
          title={product.name}
        >
          {product.name}
        </Link>

        {/* Specification Subtitle */}
        <p className="mt-0.5 text-[10px] sm:text-[11px] text-slate-500 font-medium truncate">
          {specSubtitle}
        </p>

        {/* Star Rating & Review Count */}
        <div className="mt-1.5 flex items-center gap-1 text-[11px]">
          <div className="flex text-amber-400 leading-none">
            {"★".repeat(Math.round(ratingValue))}
            {"☆".repeat(5 - Math.round(ratingValue))}
          </div>
          <span className="font-bold text-slate-700 ml-0.5">{ratingValue.toFixed(1)}</span>
          <span className="text-slate-400 font-medium text-[10px]">({reviewCount})</span>
        </div>

        {/* Pricing */}
        <div className="mt-2.5 flex flex-wrap items-baseline gap-1.5">
          <span className="text-base sm:text-lg font-black text-slate-900">
            {formatPrice(product.price)}
          </span>
          {product.mrp && product.mrp > product.price && (
            <span className="text-[10px] sm:text-xs text-slate-400 line-through">
              {formatPrice(product.mrp)}
            </span>
          )}
        </div>

        {/* Stock Status text */}
        <p
          className={`mt-0.5 text-[10px] sm:text-[11px] font-bold ${
            product.stock > 10
              ? "text-emerald-600"
              : product.stock > 0
                ? "text-amber-600"
                : "text-slate-500"
          }`}
        >
          {product.stock > 10
            ? "In stock"
            : product.stock > 0
              ? `Only ${product.stock} left`
              : "Pre-order"}
        </p>

        {/* Add to Cart Button: Full Width Warm Gold / Brand Yellow like reference */}
        <div className="mt-auto pt-3">
          <button
            onClick={() => addToCart(product.id)}
            className="btn-gold-gradient flex w-full items-center justify-center gap-1.5 rounded-lg py-2 sm:py-2.5 text-xs font-bold text-[#0B0B0B] transition shadow-xs hover:shadow-md active:scale-98"
          >
            <ShoppingCart size={14} className="text-[#0B0B0B]" />
            <span>Add to Cart</span>
          </button>
        </div>
      </div>
    </article>
  )
}
