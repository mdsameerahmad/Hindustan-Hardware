import { CheckCircle2 } from "lucide-react"
import { Link, useLocation, useParams } from "react-router"
import { Badge, Button, formatPrice } from "../components"
import { DeliveryOtpCard } from "../components/DeliveryOtpCard"

export function OrderSuccessPage() {
  const { id } = useParams()
  const location = useLocation()

  // Retrieve authoritative order returned by backend checkout response
  const routeOrder = (location.state as { order?: any })?.order

  const orderNumber = routeOrder?.orderNumber || routeOrder?.id || id
  const totalAmount = routeOrder?.totalAmount ?? 0
  const paymentMethod = routeOrder?.paymentMethod === "cod" ? "Cash on Delivery" : (routeOrder?.paymentMethod || "Cash on Delivery")
  const paymentStatus = routeOrder?.paymentStatus || "pending"
  const orderStatus = routeOrder?.status || "pending"

  // Shipping address snapshot
  const rawAddr = routeOrder?.shippingAddress
  const addressText = rawAddr
    ? `${rawAddr.recipient_name || rawAddr.recipientName}, ${rawAddr.address_line1 || rawAddr.addressLine1}${
        rawAddr.address_line2 || rawAddr.addressLine2 ? `, ${rawAddr.address_line2 || rawAddr.addressLine2}` : ""
      }, ${rawAddr.city}, ${rawAddr.state} ${rawAddr.postal_code || rawAddr.postalCode}`
    : "Address confirmed on file"

  const items = routeOrder?.items || []

  return (
    <div className="container-narrow py-12">
      <div className="rounded-2xl border border-border bg-white p-7 text-center shadow-lg sm:p-12">
        <span className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-emerald-100 text-emerald-700">
          <CheckCircle2 size={40} />
        </span>
        <div className="mt-4">
          <Badge tone="success">Order Placed Successfully</Badge>
        </div>
        <h1 className="mt-4 text-3xl font-black text-ink">
          Thank you, your order is placed!
        </h1>
        <p className="mt-2 text-slate-500">
          Order Reference: <b className="text-ink font-mono">{orderNumber}</b>
        </p>

        <div className="mx-auto mt-6 max-w-lg text-left">
          <DeliveryOtpCard otp={routeOrder?.deliveryOtp} />
        </div>

        <div className="mx-auto mt-7 max-w-lg rounded-xl bg-slate-50 p-6 text-left border border-slate-200">
          <div className="summary-line">
            <span>Order Status</span>
            <b className="capitalize text-ink">{orderStatus}</b>
          </div>
          <div className="summary-line mt-2">
            <span>Payment Method</span>
            <b className="text-ink">{paymentMethod}</b>
          </div>
          <div className="summary-line mt-2">
            <span>Payment Status</span>
            <b className="capitalize text-amber-700">{paymentStatus} (Pay upon delivery)</b>
          </div>
          <div className="summary-line mt-2 text-base">
            <span className="font-bold text-ink">Total Payable</span>
            <b className="font-black text-ink text-lg">{formatPrice(totalAmount)}</b>
          </div>

          <div className="mt-4 border-t border-border pt-4 text-sm text-slate-600">
            <b className="text-ink block">Delivery Address:</b>
            <p className="mt-1 leading-relaxed">{addressText}</p>
          </div>

          {items.length > 0 && (
            <div className="mt-4 border-t border-border pt-4">
              <b className="text-ink block text-xs uppercase tracking-wider mb-2">Ordered Items:</b>
              <div className="space-y-2 text-sm">
                {items.map((it: any) => (
                  <div key={it.id || it.productId} className="flex justify-between items-center text-slate-700">
                    <span>
                      {it.productName || it.name} &times; <b>{it.quantity}</b>
                    </span>
                    <span className="font-semibold text-ink">
                      {formatPrice(it.lineSubtotal || it.unitPrice * it.quantity)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <p className="mt-6 text-sm text-slate-500">
          Estimated arrival: local store delivery dispatched from Jehanabad warehouse within 24–48 hours.
        </p>

        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link to={`/track-order/${id || routeOrder?.id || orderNumber}`}>
            <Button>Track Order</Button>
          </Link>
          <Link to="/my-orders">
            <Button variant="outline">View All Orders</Button>
          </Link>
          <Link to="/products">
            <Button variant="ghost">Continue Shopping</Button>
          </Link>
        </div>

      </div>
    </div>
  )
}
