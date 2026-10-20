import { ArrowLeft, ArrowRight, ShoppingCart } from "lucide-react"
import { useEffect } from "react"
import { Link } from "react-router"
import {
  Button,
  EmptyState,
  PageHeader,
  Quantity,
  formatPrice,
} from "../components"
import { useStore } from "../store"
import { DEFAULT_PRODUCT_IMAGE } from "../utils/productTransform"

export function CartPage() {
  const {
    cart,
    products,
    backendCart,
    getProductAsync,
    updateCart,
    removeFromCart,
    cartTotal,
    toggleWishlist,
  } = useStore()

  // For any items in cart not yet present in products list, fetch asynchronously in background
  useEffect(() => {
    cart.forEach((line) => {
      if (!products.some((p) => p.id === line.productId)) {
        getProductAsync(line.productId).catch(() => {})
      }
    })
  }, [cart, products, getProductAsync])

  // Resolve product info from local catalogue products or backendCart item details
  const lines = cart.map((line) => {
    const localProduct = products.find((p) => p.id === line.productId)
    const backendItem = backendCart?.items.find((i) => i.productId === line.productId)

    const product = localProduct || {
      id: line.productId,
      slug: backendItem?.slug || line.productId,
      name: backendItem?.name || "Hardware Product",
      brand: backendItem?.brandName || "Hindustan Hardware",
      brandId: "hh-brand",
      brandName: backendItem?.brandName || "Hindustan Hardware",
      category: "General Hardware",
      categoryId: "hardware",
      productType: "Hardware",
      price: backendItem?.unitPrice || 0,
      stock: backendItem?.stockAvailable ?? 10,
      unit: backendItem?.unit || "Piece",
      unitOfSale: backendItem?.unitOfSale || "Piece",
      material: "",
      size: "",
      diameter: "",
      length: "",
      pressureRating: "",
      technicalStandard: "",
      intendedApplication: "",
      variantAttributes: backendItem?.variantAttributes || {},
      image: backendItem?.primaryImage || DEFAULT_PRODUCT_IMAGE,
      images: [backendItem?.primaryImage || DEFAULT_PRODUCT_IMAGE],
      description: backendItem?.name || "",
      specs: {},
    }

    return {
      ...line,
      product,
    }
  })

  if (!cart.length)
    return (
      <div className="container-wide py-12">
        <PageHeader title="Your cart" />
        <EmptyState
          icon={<ShoppingCart />}
          title="Your cart is empty"
          text="Browse pipes, tanks, fittings and hardware, then add the products you need."
          action={
            <Link to="/products">
              <Button>Continue shopping</Button>
            </Link>
          }
        />
      </div>
    )

  return (
    <div className="container-wide py-8">
      <PageHeader
        title={`Your cart (${cart.reduce((sum, line) => sum + line.quantity, 0)} items)`}
        description="Review quantities and variants before checkout. Pricing and stock are demo data."
      />
      <div className="grid gap-7 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          {lines.map(({ product, quantity }) => (
            <article
              key={product.id}
              className="grid grid-cols-[96px_1fr] gap-4 rounded-xl border border-border bg-white p-4 sm:grid-cols-[120px_1fr_auto]"
            >
              <img
                src={product.image}
                alt=""
                className="h-24 w-24 rounded-lg object-cover sm:h-28 sm:w-28"
              />
              <div>
                <Link
                  to={`/product/${product.id}`}
                  className="font-extrabold text-ink hover:text-brand"
                >
                  {product.name}
                </Link>
                <p className="mt-1 text-sm text-slate-500">
                  {product.size} · {product.unit}
                </p>
                <div className="mt-2 flex flex-wrap items-baseline gap-2">
                  <span className="text-lg font-black text-ink">
                    {formatPrice(product.price)}
                  </span>
                  {product.mrp && product.mrp > product.price && (
                    <span className="text-xs text-slate-400 line-through">
                      {formatPrice(product.mrp)}
                    </span>
                  )}
                  {(product.discountPercentage || (product.mrp && product.mrp > product.price)) && (
                    <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                      {product.discountPercentage ?? Math.round(((product.mrp! - product.price) / product.mrp!) * 100)}% OFF
                    </span>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-4 text-xs font-bold text-brand">
                  <button
                    onClick={() => {
                      toggleWishlist(product.id)
                      removeFromCart(product.id)
                    }}
                  >
                    Save for later
                  </button>
                  <button
                    className="text-red-600"
                    onClick={() => removeFromCart(product.id)}
                  >
                    Remove
                  </button>
                </div>
              </div>
              <div className="col-span-2 flex items-center justify-between border-t border-border pt-3 sm:col-span-1 sm:block sm:border-0 sm:pt-0">
                <Quantity
                  value={quantity}
                  onChange={(value) => updateCart(product.id, value)}
                />
                <p className="font-black sm:mt-5 sm:text-right">
                  {formatPrice(product.price * quantity)}
                </p>
              </div>
            </article>
          ))}
          <Link
            className="inline-flex items-center gap-2 text-sm font-bold text-brand"
            to="/products"
          >
            <ArrowLeft size={16} />
            Continue shopping
          </Link>
        </div>
        <aside className="h-fit rounded-xl border border-border bg-white p-6 lg:sticky lg:top-44">
          <h2 className="text-xl font-black">Order summary</h2>
          <div className="mt-5 space-y-3 text-sm">
            <div className="summary-line">
              <span>Items subtotal</span>
              <b>{formatPrice(cartTotal)}</b>
            </div>
            <div className="summary-line">
              <span>Delivery fee</span>
              <span>Calculated after PIN check</span>
            </div>
            {lines.some((l) => (l.product.mrp && l.product.mrp > l.product.price)) && (
              <div className="summary-line text-emerald-700">
                <span>Discount savings</span>
                <b>
                  -
                  {formatPrice(
                    lines.reduce((acc, l) => {
                      const mrp = l.product.mrp || l.product.price
                      return acc + Math.max(0, mrp - l.product.price) * l.quantity
                    }, 0)
                  )}
                </b>
              </div>
            )}
          </div>
          <div className="mt-5 flex justify-between border-t border-border pt-5 text-lg font-black">
            <span>Total</span>
            <span>{formatPrice(cartTotal)}</span>
          </div>
          <div className="mt-5 rounded-lg bg-blue-50 p-3 text-xs leading-5 text-brand">
            <b>Delivery availability:</b> Enter your PIN code during checkout.
            Store confirmation may be required.
          </div>
          <Link to="/checkout">
            <Button className="mt-5 w-full">
              Proceed to Checkout <ArrowRight size={16} />
            </Button>
          </Link>
        </aside>
      </div>
    </div>
  )
}
