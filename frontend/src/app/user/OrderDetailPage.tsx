import { AlertCircle, Check, Download, Eye, FileText, Loader2, Printer, RefreshCcw } from "lucide-react"
import { useState } from "react"
import { Link, useNavigate, useParams } from "react-router"
import { useAuth } from "../authContext"
import { Badge, Button, EmptyState, PageHeader, formatPrice } from "../components"
import { useOrderDetails } from "../features/hooks/useOrderDetails"

export function OrderDetailPage() {
  const { id } = useParams()
  const { isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const { order, loading, error, cancelling, cancelError, cancelCurrentOrder, refetch } =
    useOrderDetails(id, isAuthenticated)

  const [reasonInput, setReasonInput] = useState("Customer requested cancellation")
  const [showCancelModal, setShowCancelModal] = useState(false)

  const formatDateTime = (isoStr?: string) => {
    if (!isoStr) return ""
    try {
      return new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(isoStr))
    } catch {
      return isoStr
    }
  }

  const handleConfirmCancel = async () => {
    if (reasonInput.trim().length < 3) return
    const success = await cancelCurrentOrder(reasonInput.trim())
    if (success) {
      setShowCancelModal(false)
    }
  }

  if (loading) {
    return (
      <div className="container-wide py-20 text-center text-slate-500">
        <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-brand" />
        <p className="font-semibold">Loading order details...</p>
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="container-wide py-12">
        <EmptyState
          title="Order not found"
          text={error || "This order record could not be found or does not belong to your account."}
          action={
            <Link to="/my-orders">
              <Button>Back to My Orders</Button>
            </Link>
          }
        />
      </div>
    )
  }

  const rawAddr = order.shippingAddress as any
  const addressText = rawAddr
    ? `${rawAddr.recipient_name || rawAddr.recipientName}, ${rawAddr.address_line1 || rawAddr.addressLine1}${
        rawAddr.address_line2 || rawAddr.addressLine2 ? `, ${rawAddr.address_line2 || rawAddr.addressLine2}` : ""
      }, ${rawAddr.city}, ${rawAddr.state} ${rawAddr.postal_code || rawAddr.postalCode}`
    : "Address on file"

  return (
    <div className="container-wide py-8">
      <PageHeader
        breadcrumbs="My Orders / Order Details"
        title={`Order ${order.orderNumber}`}
        description={`Placed on ${formatDateTime(order.createdAt)}`}
        action={
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <Button variant="outline" onClick={() => refetch()} className="flex items-center gap-1.5 flex-1 sm:flex-initial text-xs">
              <RefreshCcw size={15} /> Refresh
            </Button>
            {order.invoiceUrl ? (
              <a
                href={order.invoiceUrl}
                target="_blank"
                rel="noopener noreferrer"
                download
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#D4AF37] via-[#F3E5AB] to-[#D4AF37] text-black font-extrabold px-3 py-2 text-xs shadow-md hover:brightness-105 active:scale-[0.98] transition border border-[#B89124]/40 flex-1 sm:flex-initial"
                title="Download / View the official invoice receipt uploaded by the store"
              >
                <Printer size={15} className="text-black" /> Print invoice
              </a>
            ) : (
              <Button
                variant="outline"
                onClick={() => window.print()}
                className="flex items-center gap-1.5 flex-1 sm:flex-initial text-xs"
                title="Print order receipt"
              >
                <Printer size={15} /> Print invoice
              </Button>
            )}
            {!["delivered", "cancelled"].includes(order.status) && (
              <Link to={`/track-order/${order.id}`} className="w-full sm:w-auto">
                <Button className="w-full sm:w-auto text-xs">Track delivery</Button>
              </Link>
            )}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          {/* Order Items Snapshot */}
          <div className="rounded-xl border border-border bg-white p-4 sm:p-6 shadow-sm">
            <h2 className="font-black text-lg text-ink">Items in this order</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Immutable prices recorded at checkout from verified backend store catalogue.
            </p>
            <div className="mt-4 divide-y divide-border">
              {order.items.map((item) => (
                <div key={item.id} className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1.5 sm:gap-4 py-3 sm:py-4 first:pt-0">
                  <div className="flex-1 min-w-0">
                    <b className="text-ink block text-sm sm:text-base leading-snug">{item.productName}</b>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {item.variantTitle ? `Variant: ${item.variantTitle} · ` : ""}
                      {item.sku ? `SKU: ${item.sku} · ` : ""}
                      Qty: {item.quantity} &times; {formatPrice(item.unitPrice)}
                    </p>
                  </div>
                  <b className="text-ink text-sm sm:text-base font-black self-end sm:self-center">
                    {formatPrice(item.lineSubtotal)}
                  </b>
                </div>
              ))}
            </div>
          </div>

          {/* Status Timeline History */}
          {order.statusHistory && order.statusHistory.length > 0 && (
            <div className="rounded-xl border border-border bg-white p-6 shadow-sm">
              <h2 className="font-black text-lg text-ink">Status History</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Chronological timeline recorded by Hindustan Hardware order fulfillment system.
              </p>
              <div className="mt-4 space-y-4">
                {order.statusHistory.map((h, idx) => (
                  <div key={h.id || idx} className="flex items-start gap-3">
                    <div className="grid h-6 w-6 place-items-center rounded-full bg-blue-100 text-brand mt-0.5 shrink-0">
                      <Check size={14} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-ink capitalize">
                        {h.newStatus}
                        {h.previousStatus ? ` (from ${h.previousStatus})` : ""}
                      </p>
                      {h.reason && (
                        <p className="text-xs text-slate-600 mt-0.5">
                          Reason: {h.reason}
                        </p>
                      )}
                      <p className="text-xs text-slate-400 mt-0.5 font-mono">
                        {formatDateTime(h.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cancellation Control Section */}
          {order.canCancel && (
            <div className="rounded-xl border border-red-200 bg-red-50/50 p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-red-900">Need to cancel this order?</h3>
                  <p className="text-xs text-red-700 mt-1">
                    Orders can be cancelled while in &quot;pending&quot; or &quot;confirmed&quot; status. Inventory is automatically restored.
                  </p>
                </div>
                <Button
                  variant="danger"
                  onClick={() => setShowCancelModal(true)}
                  disabled={cancelling}
                >
                  Cancel Order
                </Button>
              </div>

              {cancelError && (
                <div className="mt-3 text-xs font-semibold text-red-700 flex items-center gap-1.5">
                  <AlertCircle size={14} />
                  {cancelError}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar Summary */}
        <aside className="space-y-4">
          <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
            <h3 className="font-black text-base">Order status</h3>
            <div className="mt-2">
              <Badge tone={order.status === "cancelled" ? "danger" : order.status === "delivered" ? "success" : "blue"}>
                <span className="capitalize">{order.status}</span>
              </Badge>
            </div>
            <p className="mt-4 text-sm text-slate-600">
              Payment: <b>Cash on Delivery</b>
              <br />
              Payment status: <b className="capitalize text-amber-700">{order.paymentStatus}</b>
            </p>
            {order.customerNotes && (
              <div className="mt-3 border-t border-border pt-3 text-xs text-slate-500">
                <b>Delivery notes:</b> {order.customerNotes}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
            <h3 className="font-black text-base">Delivery address</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              {addressText}
            </p>
          </div>

          {/* Dedicated Order Invoice Card */}
          <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-slate-900 text-base">Order Invoice PDF</h3>
              <Badge tone={order.invoiceUrl ? "success" : "neutral"}>
                {order.invoiceUrl ? "Attached" : "Not uploaded"}
              </Badge>
            </div>

            <p className="mt-2 text-xs text-slate-500">
              {order.invoiceUrl
                ? "An invoice document is linked to this order and accessible to the customer."
                : "Official invoice document will be uploaded once your order is confirmed and packed."}
            </p>

            {order.invoiceUrl && (
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs space-y-1.5">
                <div className="font-medium text-slate-800 truncate" title={order.invoiceFileName || "invoice.pdf"}>
                  📄 {order.invoiceFileName || "invoice.pdf"}
                </div>
                {order.invoiceUploadedAt && (
                  <div className="text-[11px] text-slate-400">
                    Uploaded: {new Date(order.invoiceUploadedAt).toLocaleString()}
                  </div>
                )}
                <div className="pt-1 flex gap-2">
                  <a
                    href={order.invoiceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-brand hover:underline"
                  >
                    <Eye size={13} /> View / Download
                  </a>
                </div>
              </div>
            )}

            <div className="mt-4 flex gap-2">
              {order.invoiceUrl ? (
                <a
                  href={order.invoiceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  download
                  className="flex items-center justify-center gap-2 w-full rounded-xl bg-gradient-to-r from-[#D4AF37] via-[#F3E5AB] to-[#D4AF37] py-2.5 px-4 text-xs font-black text-black shadow-md hover:brightness-105 active:scale-[0.98] transition border border-[#B89124]/40 uppercase tracking-wider"
                  title="Print / Download the uploaded official invoice"
                >
                  <Printer size={15} className="text-black" /> Print invoice
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex items-center justify-center gap-2 w-full rounded-xl bg-gradient-to-r from-[#D4AF37] via-[#F3E5AB] to-[#D4AF37] py-2.5 px-4 text-xs font-black text-black shadow-md hover:brightness-105 active:scale-[0.98] transition border border-[#B89124]/40 uppercase tracking-wider cursor-pointer"
                >
                  <Printer size={15} className="text-black" /> Print invoice
                </button>
              )}
            </div>
          </div>

          <div className="rounded-xl bg-ink p-5 text-white shadow-sm">
            <div className="space-y-2 text-sm text-slate-300">
              <div className="summary-line">
                <span>Items subtotal</span>
                <b className="text-white">{formatPrice(order.subtotal)}</b>
              </div>
              <div className="summary-line">
                <span>Delivery fee</span>
                <span className="text-emerald-400 font-semibold">Free Delivery</span>
              </div>
            </div>
            <div className="mt-4 border-t border-white/20 pt-4 flex justify-between items-center text-xl font-black">
              <span>Total Amount</span>
              <span>{formatPrice(order.totalAmount)}</span>
            </div>
          </div>
        </aside>
      </div>

      {/* Cancellation Confirmation Dialog */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-black text-ink">Confirm Cancellation</h3>
            <p className="mt-2 text-sm text-slate-600">
              Are you sure you want to cancel order <b>{order.orderNumber}</b>? This action cannot be undone.
            </p>

            <div className="mt-4">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                Reason for cancellation (min 3 chars):
              </label>
              <textarea
                className="w-full rounded-xl border border-border p-3 text-sm focus:border-brand focus:outline-none"
                rows={3}
                value={reasonInput}
                onChange={(e) => setReasonInput(e.target.value)}
                maxLength={500}
              />
            </div>

            {cancelError && (
              <p className="mt-2 text-xs text-red-600 font-semibold">{cancelError}</p>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="outline"
                disabled={cancelling}
                onClick={() => setShowCancelModal(false)}
              >
                Keep Order
              </Button>
              <Button
                variant="danger"
                disabled={cancelling || reasonInput.trim().length < 3}
                onClick={handleConfirmCancel}
                className="flex items-center gap-2"
              >
                {cancelling ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Cancelling...
                  </>
                ) : (
                  "Confirm Cancellation"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
