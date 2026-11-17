import { Check, CheckCircle2, Copy, ExternalLink, QrCode, Smartphone } from "lucide-react"
import { useState } from "react"
import { Link, useLocation, useParams } from "react-router"
import { Badge, Button, formatPrice } from "../components"
import { DeliveryOtpCard } from "../components/DeliveryOtpCard"

export function OrderSuccessPage() {
  const { id } = useParams()
  const location = useLocation()
  const [copiedUpi, setCopiedUpi] = useState(false)
  const [copiedPhone, setCopiedPhone] = useState(false)

  // Retrieve authoritative order returned by backend checkout response
  const stateData = location.state as { order?: any; chosenPaymentMethod?: "cod" | "upi" } | undefined
  const routeOrder = stateData?.order
  const chosenPaymentMethod = stateData?.chosenPaymentMethod

  const orderNumber = routeOrder?.orderNumber || routeOrder?.id || id
  const totalAmount = routeOrder?.totalPayable ?? routeOrder?.totalAmount ?? 0
  const deliveryFee = routeOrder?.deliveryFee ?? 0
  const paymentMethod = chosenPaymentMethod === "upi"
    ? "Online via UPI"
    : routeOrder?.paymentMethod === "cod"
    ? "Cash on Delivery"
    : (routeOrder?.paymentMethod || "Cash on Delivery")
  const paymentStatus = routeOrder?.paymentStatus || "pending"
  const orderStatus = routeOrder?.status || "pending"

  const UPI_ID = "eazypay.2fw1ea1efmkfv8f@icici"
  const UPI_PHONE = "8935926021"
  const PAYEE_NAME = "Hindustan Hardware"

  const upiIntentUri = `upi://pay?pa=${UPI_ID}&pn=${encodeURIComponent(PAYEE_NAME)}&am=${Number(totalAmount).toFixed(2)}&cu=INR&tn=${encodeURIComponent(`Order ${orderNumber}`)}`
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(upiIntentUri)}`

  const copyToClipboard = (text: string, type: "upi" | "phone") => {
    try {
      navigator.clipboard.writeText(text)
      if (type === "upi") {
        setCopiedUpi(true)
        setTimeout(() => setCopiedUpi(false), 2000)
      } else {
        setCopiedPhone(true)
        setTimeout(() => setCopiedPhone(false), 2000)
      }
    } catch {}
  }

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
            <b className="capitalize text-amber-700">
              {chosenPaymentMethod === "upi" ? "Pending UPI Transfer Verification" : `${paymentStatus.replace(/_/g, " ")} (Pay upon delivery)`}
            </b>
          </div>
          <div className="summary-line mt-2">
            <span>Delivery Fee</span>
            <b className="text-ink">{formatPrice(deliveryFee)}</b>
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

          {/* If UPI Payment was chosen, show quick action & QR */}
          {chosenPaymentMethod === "upi" && (
            <div className="mt-5 border-t border-border pt-5 space-y-3.5">
              <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Smartphone className="h-5 w-5 text-amber-700" />
                  <b className="text-sm font-bold text-slate-900">Complete Your UPI Payment</b>
                </div>

                {/* Direct App Open Button for Mobile */}
                <div className="block sm:hidden">
                  <a
                    href={upiIntentUri}
                    className="flex items-center justify-center gap-2 w-full rounded-xl bg-black text-[#D4AF37] font-bold text-sm py-2.5 px-4 shadow-sm"
                  >
                    <Smartphone size={16} />
                    <span>Open PhonePe / GPay / Paytm ({formatPrice(totalAmount)})</span>
                    <ExternalLink size={14} className="opacity-70" />
                  </a>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block uppercase">UPI ID</span>
                      <code className="font-mono font-bold text-slate-800">{UPI_ID}</code>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(UPI_ID, "upi")}
                      className="p-1 text-slate-500 hover:text-amber-700"
                    >
                      {copiedUpi ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                    </button>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block uppercase">Phone Number</span>
                      <span className="font-bold text-slate-800">+91 {UPI_PHONE}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(UPI_PHONE, "phone")}
                      className="p-1 text-slate-500 hover:text-amber-700"
                    >
                      {copiedPhone ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-3 bg-white p-3 rounded-lg border border-slate-200">
                  <img src={qrCodeUrl} alt="UPI QR" className="h-16 w-16 object-contain shrink-0" />
                  <p className="text-[11px] text-slate-600">
                    Scan with any UPI app to pay <b>{formatPrice(totalAmount)}</b>. Include order #{orderNumber} in remarks.
                  </p>
                </div>
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
