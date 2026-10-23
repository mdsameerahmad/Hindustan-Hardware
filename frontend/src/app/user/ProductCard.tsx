import { Heart, ShoppingCart } from "lucide-react"
import { Link } from "react-router"
import type { Product } from "../data"
import { ProductImage } from "../features/components/ProductImage"
import { useStore } from "../store"
import { formatPrice } from "../utils/formatters"

export function ProductCard({ product }: { product: Product }) {
  const { addToCart, wishlist, toggleWishlist, compareIds, toggleCompare } =
    useStore()
  const discount =
    product.discountPercentage != null && product.discountPercentage > 0
      ? product.discountPercentage
      : product.mrp && product.mrp > product.price
        ? Math.round(((product.mrp - product.price) / product.mrp) * 100)
        : 0
  return (
    <article className="group flex min-w-0 flex-col overflow-hidden rounded-xl border border-[#E8E8E8] bg-white transition hover:-translate-y-1 hover:shadow-xl">
      <div className="relative aspect-[4/3] overflow-hidden bg-[#F5F5F5]">
        <Link to={`/product/${product.id}`}>
          <ProductImage
            src={product.image}
            alt={product.name}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        </Link>
        <button
          aria-label="Toggle wishlist"
          onClick={() => toggleWishlist(product.id)}
          className="absolute right-3 top-3 rounded-full bg-white/90 p-2 shadow-sm transition hover:scale-110"
        >
          <Heart
            size={16}
            className={
              wishlist.includes(product.id)
                ? "fill-red-500 text-red-500"
                : "text-[#888888]"
            }
          />
        </button>
        {discount > 0 && (
          <span className="absolute left-3 top-3 rounded bg-[#0B0B0B] px-2 py-0.5 text-[11px] font-bold text-[#D4AF37] border border-[#D4AF37]/30">
            {discount}% OFF
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-2.5 sm:p-4">
        <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-[#888888]">
          {product.brandName}
        </p>
        <Link
          to={`/product/${product.id}`}
          className="mt-0.5 sm:mt-1 line-clamp-2 min-h-8 sm:min-h-10 text-xs sm:text-sm font-bold leading-snug text-[#0B0B0B] hover:text-[#B89124] transition"
        >
          {product.name}
        </Link>
        {(product.material || product.diameter) && (
          <p className="mt-0.5 sm:mt-1 text-[11px] sm:text-xs text-[#777777] truncate">
            {[product.material, product.diameter].filter(Boolean).join(" · ")}
          </p>
        )}
        <div className="mt-2 sm:mt-3 flex flex-wrap items-baseline gap-1 sm:gap-2">
          <span className="text-sm sm:text-lg font-black text-[#0B0B0B]">
            {formatPrice(product.price)}
          </span>
          {product.mrp && (
            <span className="text-[10px] sm:text-xs text-[#999999] line-through">
              {formatPrice(product.mrp)}
            </span>
          )}
        </div>
        <p
          className={`mt-1 text-[10px] sm:text-[11px] font-bold ${
            product.stock > 10
              ? "text-emerald-700"
              : product.stock > 0
                ? "text-amber-700"
                : "text-slate-500"
          }`}
        >
          {product.stock > 10
            ? "In stock"
            : product.stock > 0
              ? `Only ${product.stock} left`
              : "Awaiting stock"}
        </p>
        {product.comparisonGroupId && (
          <label className="mt-2 flex cursor-pointer items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs font-semibold text-[#555555]">
            <input
              type="checkbox"
              checked={compareIds.includes(product.id)}
              onChange={() => toggleCompare(product.id)}
              className="accent-[#D4AF37]"
            />
            <span className="truncate">Compare equivalent</span>
          </label>
        )}
        <button
          onClick={() => addToCart(product.id)}
          className="btn-cart-gradient mt-2.5 sm:mt-4 flex w-full items-center justify-center gap-1.5 sm:gap-2 rounded-lg py-2 sm:py-2.5 text-[11px] sm:text-xs font-bold transition shadow-sm active:scale-95"
        >
          <ShoppingCart size={14} className="text-[#D4AF37]" />
          <span className="text-[#F3E5AB]">Add to Cart</span>
        </button>
      </div>
    </article>
  )
}
