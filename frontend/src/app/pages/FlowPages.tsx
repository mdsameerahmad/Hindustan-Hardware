import { useState } from "react"
import { Link, useNavigate, useParams } from "react-router"
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Clock3,
  CreditCard,
  Heart,
  MapPin,
  Package,
  Phone,
  RefreshCcw,
  Route,
  ShoppingBag,
  ShoppingCart,
  Store,
  Trash2,
  Truck,
  UserRound,
} from "lucide-react"
import { orderStages, type Order, type OrderStatus } from "../data"
import {
  Badge,
  Button,
  EmptyState,
  PageHeader,
  ProductCard,
  Quantity,
  SectionHeading,
  formatPrice,
  statusTone,
} from "../components"
import { useStore } from "../store"

export function CartPage() {
  const {
    cart,
    products,
    updateCart,
    removeFromCart,
    cartTotal,
    toggleWishlist,
  } = useStore()
  const lines = cart
    .map((line) => ({
      ...line,
      product: products.find((product) => product.id === line.productId)!,
    }))
    .filter((line) => line.product)
  if (!lines.length)
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
                <p className="mt-2 text-lg font-black">
                  {formatPrice(product.price)}
                </p>
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
            <div className="summary-line">
              <span>Discount</span>
              <span>₹0</span>
            </div>
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

export function CheckoutPage() {
  const { cart, products, cartTotal, createOrder } = useStore()
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [payment, setPayment] = useState("Cash on Delivery")
  const [address, setAddress] = useState({
    name: "",
    phone: "",
    pin: "",
    street: "",
    landmark: "",
    city: "Jehanabad",
    state: "Bihar",
    type: "Home",
  })
  const update = (key: string, value: string) =>
    setAddress((current) => ({ ...current, [key]: value }))
  const validAddress =
    address.name &&
    address.phone.length >= 10 &&
    address.pin.length === 6 &&
    address.street
  const lines = cart
    .map((line) => ({
      ...line,
      product: products.find((product) => product.id === line.productId)!,
    }))
    .filter((line) => line.product)

  if (!cart.length)
    return (
      <div className="container-narrow py-12">
        <EmptyState
          title="No items to checkout"
          text="Add products to your cart before starting checkout."
          action={
            <Link to="/products">
              <Button>Browse products</Button>
            </Link>
          }
        />
      </div>
    )
  const placeOrder = () => {
    const fullAddress = `${address.name}, ${address.street}${
      address.landmark ? `, ${address.landmark}` : ""
    }, ${address.city}, ${address.state} ${address.pin}`
    const order = createOrder(fullAddress, payment)
    navigate(`/order-success/${order.id}`)
  }

  return (
    <div className="container-wide py-8">
      <PageHeader
        title="Secure demo checkout"
        description="No real payment credentials are collected. Order placement is simulated in this prototype."
      />
      <div className="mb-8 grid grid-cols-4 rounded-xl border border-border bg-white">
        {["Delivery", "Review", "Payment", "Confirmation"].map(
          (label, index) => (
            <div
              key={label}
              className={`checkout-step ${step >= index + 1 ? "active" : ""}`}
            >
              <span>{step > index + 1 ? <Check size={15} /> : index + 1}</span>
              <b>{label}</b>
            </div>
          ),
        )}
      </div>
      <div className="grid gap-7 lg:grid-cols-[1fr_350px]">
        <section className="rounded-xl border border-border bg-white p-5 sm:p-7">
          {step === 1 && (
            <>
              <h2 className="text-xl font-black">Delivery address</h2>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <Field
                  label="Full name"
                  value={address.name}
                  onChange={(value) => update("name", value)}
                />
                <Field
                  label="Phone number"
                  value={address.phone}
                  onChange={(value) =>
                    update("phone", value.replace(/\D/g, "").slice(0, 10))
                  }
                />
                <Field
                  label="PIN code"
                  value={address.pin}
                  onChange={(value) =>
                    update("pin", value.replace(/\D/g, "").slice(0, 6))
                  }
                />
                <Field
                  label="City"
                  value={address.city}
                  onChange={(value) => update("city", value)}
                />
                <div className="sm:col-span-2">
                  <Field
                    label="House / street"
                    value={address.street}
                    onChange={(value) => update("street", value)}
                  />
                </div>
                <Field
                  label="Landmark (optional)"
                  value={address.landmark}
                  onChange={(value) => update("landmark", value)}
                />
                <Field
                  label="State"
                  value={address.state}
                  onChange={(value) => update("state", value)}
                />
              </div>
              <div className="mt-6 flex gap-3">
                {["Home", "Work", "Other"].map((type) => (
                  <button
                    onClick={() => update("type", type)}
                    className={`variant ${
                      address.type === type ? "active" : ""
                    }`}
                    key={type}
                  >
                    {type}
                  </button>
                ))}
              </div>
              <Button
                disabled={!validAddress}
                onClick={() => setStep(2)}
                className="mt-7"
              >
                Continue to review
              </Button>
            </>
          )}
          {step === 2 && (
            <>
              <h2 className="text-xl font-black">Review your order</h2>
              <div className="mt-6 divide-y divide-border">
                {lines.map((line) => (
                  <div
                    key={line.productId}
                    className="flex gap-4 py-4 first:pt-0"
                  >
                    <img
                      src={line.product.image}
                      alt=""
                      className="h-16 w-16 rounded-lg object-cover"
                    />
                    <div className="flex-1">
                      <b>{line.product.name}</b>
                      <p className="text-sm text-slate-500">
                        {line.product.size} · Qty {line.quantity}
                      </p>
                    </div>
                    <b>{formatPrice(line.product.price * line.quantity)}</b>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-lg bg-slate-50 p-4 text-sm">
                <b>Deliver to:</b>
                <p className="mt-1 text-slate-600">
                  {address.name}, {address.street}, {address.city} —{" "}
                  {address.pin}
                </p>
              </div>
              <div className="mt-7 flex gap-3">
                <Button variant="outline" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button onClick={() => setStep(3)}>Choose payment</Button>
              </div>
            </>
          )}
          {step === 3 && (
            <>
              <h2 className="text-xl font-black">Payment method</h2>
              <p className="mt-2 text-sm text-slate-500">
                This prototype does not process actual payments or collect
                banking credentials.
              </p>
              <div className="mt-6 space-y-3">
                {[
                  "Cash on Delivery",
                  "UPI (Demo)",
                  "Online payment placeholder",
                ].map((method) => (
                  <label
                    key={method}
                    className={`flex cursor-pointer items-center gap-4 rounded-xl border p-4 ${
                      payment === method
                        ? "border-brand bg-blue-50"
                        : "border-border"
                    }`}
                  >
                    <input
                      type="radio"
                      checked={payment === method}
                      onChange={() => setPayment(method)}
                    />
                    <CreditCard className="text-brand" />
                    <span>
                      <b className="block">{method}</b>
                      <small className="text-slate-500">
                        {method === "Cash on Delivery"
                          ? "Pay when the store delivers your order"
                          : "Simulated only — no real transaction"}
                      </small>
                    </span>
                  </label>
                ))}
              </div>
              <div className="mt-7 flex gap-3">
                <Button variant="outline" onClick={() => setStep(2)}>
                  Back
                </Button>
                <Button onClick={placeOrder}>Place Demo Order</Button>
              </div>
            </>
          )}
        </section>
        <aside className="h-fit rounded-xl bg-ink p-6 text-white">
          <h2 className="text-lg font-black">Price details</h2>
          <div className="mt-5 space-y-3 text-sm text-slate-300">
            <div className="summary-line">
              <span>{cart.length} line items</span>
              <b className="text-white">{formatPrice(cartTotal)}</b>
            </div>
            <div className="summary-line">
              <span>Delivery</span>
              <span>To be confirmed</span>
            </div>
          </div>
          <div className="mt-5 flex justify-between border-t border-white/15 pt-5 text-xl font-black">
            <span>Payable</span>
            <span>{formatPrice(cartTotal)}</span>
          </div>
          <p className="mt-5 text-xs leading-5 text-slate-400">
            Tax is not automatically calculated because no store tax
            configuration has been supplied.
          </p>
        </aside>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
}) {
  return (
    <label className="field-label">
      {label}
      <input
        type={type}
        className="field mt-2"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

export function OrderSuccessPage() {
  const { id } = useParams()
  const { orders } = useStore()
  const order = orders.find((item) => item.id === id)
  if (!order)
    return (
      <div className="container-narrow py-12">
        <EmptyState
          title="Order not found"
          text="This demo order could not be found."
        />
      </div>
    )
  return (
    <div className="container-narrow py-12">
      <div className="rounded-2xl border border-border bg-white p-7 text-center shadow-lg sm:p-12">
        <span className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-emerald-100 text-emerald-700">
          <CheckCircle2 size={40} />
        </span>
        <Badge tone="success">Demo order created</Badge>
        <h1 className="mt-5 text-3xl font-black">
          Thank you, your order is placed.
        </h1>
        <p className="mt-3 text-slate-500">
          Order <b className="text-ink">{order.id}</b> has been added to My
          Orders.
        </p>
        <div className="mx-auto mt-7 max-w-md rounded-xl bg-slate-50 p-5 text-left">
          <div className="summary-line">
            <span>Total</span>
            <b>{formatPrice(order.total)}</b>
          </div>
          <div className="summary-line mt-3">
            <span>Payment</span>
            <b>{order.payment}</b>
          </div>
          <div className="mt-4 border-t border-border pt-4 text-sm text-slate-600">
            <b className="text-ink">Delivery address</b>
            <p className="mt-1">{order.address}</p>
          </div>
        </div>
        <p className="mt-6 text-sm text-slate-500">
          Estimated arrival: store-confirmed local delivery window
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link to={`/track-order/${order.id}`}>
            <Button>Track Order</Button>
          </Link>
          <Link to="/products">
            <Button variant="outline">Continue Shopping</Button>
          </Link>
        </div>
      </div>
    </div>
  )
}

export function OrdersPage() {
  const { orders, products, reorder, updateOrderStatus } = useStore()
  const navigate = useNavigate()
  const [tab, setTab] = useState("All Orders")
  const shown = orders.filter(
    (order) =>
      tab === "All Orders" ||
      (tab === "In Progress" &&
        !["Delivered", "Cancelled"].includes(order.status)) ||
      order.status === tab,
  )
  return (
    <div className="container-wide py-8">
      <PageHeader
        title="My Orders"
        description="View demo orders, reorder products and follow local delivery progress."
      />
      <div className="mb-6 flex gap-2 overflow-x-auto">
        {["All Orders", "In Progress", "Delivered", "Cancelled"].map((item) => (
          <button
            key={item}
            onClick={() => setTab(item)}
            className={`tab-pill ${tab === item ? "active" : ""}`}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="space-y-4">
        {shown.map((order) => {
          const first = products.find(
            (product) => product.id === order.items[0]?.productId,
          )
          return (
            <article
              key={order.id}
              className="overflow-hidden rounded-xl border border-border bg-white"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-slate-50 px-5 py-3 text-xs">
                <div className="flex gap-5">
                  <span>
                    <small className="block text-slate-500">ORDER</small>
                    <b>{order.id}</b>
                  </span>
                  <span>
                    <small className="block text-slate-500">PLACED</small>
                    <b>{order.date}</b>
                  </span>
                  <span>
                    <small className="block text-slate-500">TOTAL</small>
                    <b>{formatPrice(order.total)}</b>
                  </span>
                </div>
                <Badge tone={statusTone(order.status)}>{order.status}</Badge>
              </div>
              <div className="grid gap-4 p-5 sm:grid-cols-[80px_1fr_auto]">
                <img
                  src={first?.image}
                  alt=""
                  className="h-20 w-20 rounded-lg object-cover"
                />
                <div>
                  <h3 className="font-extrabold">
                    {first?.name}
                    {order.items.length > 1
                      ? ` + ${order.items.length - 1} more`
                      : ""}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {order.items.reduce((sum, item) => sum + item.quantity, 0)}{" "}
                    item(s) · {order.paymentStatus}
                  </p>
                  <p className="mt-3 text-sm font-semibold text-slate-600">
                    {order.status === "Delivered"
                      ? "Delivered to customer"
                      : order.status === "Cancelled"
                        ? "This order was cancelled"
                        : "Your order is moving through the fulfillment process"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 sm:flex-col">
                  <Button
                    onClick={() => navigate(`/my-orders/${order.id}`)}
                    variant="outline"
                  >
                    View Details
                  </Button>
                  {!["Delivered", "Cancelled"].includes(order.status) && (
                    <Link to={`/track-order/${order.id}`}>
                      <Button className="w-full">Track Order</Button>
                    </Link>
                  )}
                  <Button onClick={() => reorder(order.id)} variant="ghost">
                    <RefreshCcw size={15} />
                    Reorder
                  </Button>
                  {["Order Placed", "Order Confirmed"].includes(
                    order.status,
                  ) && (
                    <Button
                      onClick={() => updateOrderStatus(order.id, "Cancelled")}
                      variant="danger"
                    >
                      Cancel Order
                    </Button>
                  )}
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}

export function OrderDetailPage() {
  const { id } = useParams()
  const { orders, products } = useStore()
  const order = orders.find((item) => item.id === id)
  if (!order)
    return (
      <div className="container-wide py-12">
        <EmptyState
          title="Order not found"
          text="This demo order record is unavailable."
        />
      </div>
    )
  return (
    <div className="container-wide py-8">
      <PageHeader
        breadcrumbs="My Orders / Order Details"
        title={`Order ${order.id}`}
        description={`Placed ${order.date}`}
        action={
          !["Delivered", "Cancelled"].includes(order.status) ? (
            <Link to={`/track-order/${order.id}`}>
              <Button>Track delivery</Button>
            </Link>
          ) : undefined
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="rounded-xl border border-border bg-white p-6">
          <h2 className="font-black">Items in this order</h2>
          <div className="mt-4 divide-y divide-border">
            {order.items.map((item) => {
              const product = products.find((p) => p.id === item.productId)
              return product ? (
                <div key={item.productId} className="flex gap-4 py-4">
                  <img
                    src={product.image}
                    alt=""
                    className="h-16 w-16 rounded-lg object-cover"
                  />
                  <div className="flex-1">
                    <b>{product.name}</b>
                    <p className="text-sm text-slate-500">
                      {product.size} · Qty {item.quantity}
                    </p>
                  </div>
                  <b>{formatPrice(item.price * item.quantity)}</b>
                </div>
              ) : null
            })}
          </div>
        </div>
        <aside className="space-y-4">
          <div className="rounded-xl border border-border bg-white p-5">
            <h3 className="font-black">Order status</h3>
            <Badge tone={statusTone(order.status)}>{order.status}</Badge>
            <p className="mt-4 text-sm text-slate-500">
              Payment: {order.payment}
              <br />
              {order.paymentStatus}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-white p-5">
            <h3 className="font-black">Delivery address</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {order.address}
            </p>
          </div>
          <div className="rounded-xl bg-ink p-5 text-white">
            <div className="summary-line">
              <span>Order total</span>
              <b className="text-xl">{formatPrice(order.total)}</b>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

export function TrackingPage() {
  const { id } = useParams()
  const { orders, advanceOrder } = useStore()
  const order = orders.find((item) => item.id === id)
  if (!order)
    return (
      <div className="container-wide py-12">
        <EmptyState
          title="Order not found"
          text="Select an order from My Orders to open tracking."
          action={
            <Link to="/my-orders">
              <Button>My Orders</Button>
            </Link>
          }
        />
      </div>
    )
  const activeIndex = orderStages.indexOf(order.status)
  const eta =
    order.status === "Delivered"
      ? "Delivered"
      : order.status === "Out for Delivery"
        ? "Arriving in 35–55 min (demo)"
        : "Store-confirmed delivery window"
  return (
    <div className="container-wide py-8">
      <PageHeader
        breadcrumbs={`My Orders / ${order.id}`}
        title="Delivery tracking"
        description="A synchronized demo of the order journey. Real GPS, driver assignment and background location updates require backend integrations."
        action={
          <Button variant="outline">
            <CircleHelp size={16} />
            Contact support
          </Button>
        }
      />
      <div className="mb-6 grid gap-4 rounded-xl border border-border bg-white p-5 sm:grid-cols-4">
        <Info label="Order ID" value={order.id} />
        <Info label="Order date" value={order.date} />
        <Info label="Current status" value={order.status} />
        <Info label="Estimated delivery" value={eta} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-xl border border-border bg-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <Badge tone={statusTone(order.status)}>{order.status}</Badge>
              <h2 className="mt-3 text-2xl font-black">
                Your hardware order is on its way
              </h2>
            </div>
            <span className="hidden h-14 w-14 place-items-center rounded-full bg-blue-50 text-brand sm:grid">
              <Truck />
            </span>
          </div>
          <div className="tracking-timeline mt-9">
            {orderStages.map((stage, index) => {
              const completed = index <= activeIndex
              const active = index === activeIndex
              return (
                <div
                  key={stage}
                  className={`tracking-stage ${completed ? "complete" : ""} ${
                    active ? "current" : ""
                  }`}
                >
                  <span className="tracking-dot">
                    {completed ? <Check size={16} /> : index + 1}
                  </span>
                  <div>
                    <b>{stage}</b>
                    <small>
                      {completed
                        ? active
                          ? "Current status"
                          : "Completed"
                        : "Pending"}
                    </small>
                  </div>
                </div>
              )
            })}
          </div>
          {order.status !== "Delivered" && order.status !== "Cancelled" && (
            <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <b className="text-amber-900">Interactive demo tracking</b>
                  <p className="mt-1 text-sm text-amber-800">
                    Advance this order to preview synchronized customer and
                    admin status updates.
                  </p>
                </div>
                <Button
                  onClick={() => advanceOrder(order.id)}
                  variant="secondary"
                >
                  Advance status <ChevronRight size={16} />
                </Button>
              </div>
            </div>
          )}
        </section>
        <aside className="space-y-5">
          <div className="map-panel">
            <div className="route-road road-one" />
            <div className="route-road road-two" />
            <span className="map-pin store">
              <Store size={17} />
              <small>Hindustan Hardware</small>
            </span>
            <span className="map-pin customer">
              <MapPin size={17} />
              <small>Delivery address</small>
            </span>
            <span className="delivery-bike">
              <Truck size={20} />
            </span>
            <div className="absolute bottom-4 left-4 right-4 rounded-lg bg-white/95 p-3 shadow-lg">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                Illustrative route · not live GPS
              </p>
              <p className="mt-1 text-sm font-bold">{eta}</p>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-white p-5">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-brand text-white">
                <UserRound />
              </span>
              <div>
                <small className="text-slate-500">
                  Delivery partner placeholder
                </small>
                <b className="block">Partner assigned in demo</b>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button variant="outline">
                <Phone size={15} />
                Contact
              </Button>
              <Button variant="ghost">Report issue</Button>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-white p-5">
            <p className="text-sm font-bold">Delivering to</p>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {order.address}
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}

type InfoProps = {
  label: string
  value: string
}

function Info({ label, value }: InfoProps) {
  return (
    <div>
      <small className="block text-xs font-bold uppercase tracking-wide text-slate-400">
        {label}
      </small>
      <b className="mt-1 block text-sm">{value}</b>
    </div>
  )
}

export function WishlistPage() {
  const { products, wishlist } = useStore()
  const items = products.filter((product) => wishlist.includes(product.id))
  return (
    <div className="container-wide py-8">
      <PageHeader
        title="Your wishlist"
        description="Save products while planning your next repair or construction project."
      />
      {items.length ? (
        <div className="product-grid">
          {items.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Heart />}
          title="Your wishlist is empty"
          text="Tap the heart on a product to save it here."
          action={
            <Link to="/products">
              <Button>Discover products</Button>
            </Link>
          }
        />
      )}
    </div>
  )
}
