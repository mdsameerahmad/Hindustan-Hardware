import {
  CheckCircle2,
  Eye,
  FileCheck,
  IndianRupee,
  Loader2,
  RefreshCcw,
  Trash2,
  Truck,
  Upload
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useParams } from "react-router"
import {
  Badge,
  Button,
  EmptyState,
  PageHeader,
  formatPrice,
  statusTone,
} from "../components"
import { DeliveryPartnerGpsController } from "../components/DeliveryPartnerGpsController"
import { deliveryTrackingApi, type OrderLiveTrackingResponse } from "../features/deliveryTrackingApi"
import { useAdminOrderDetail } from "../features/hooks/useAdminOrderDetail"

export function AdminOrderDetailPage() {
  const { id } = useParams()
  const {
    order,
    loading,
    error,
    actionLoading,
    updateStatus,
    cancelOrder,
    collectCodPayment,
    uploadInvoice,
    refetch,
  } = useAdminOrderDetail(id)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadingInvoice, setUploadingInvoice] = useState(false)
  const [invoiceMessage, setInvoiceMessage] = useState<string | null>(null)
  const [cancelModalOpen, setCancelModalOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState("")
  const [codModalOpen, setCodModalOpen] = useState(false)
  const [codNotes, setCodNotes] = useState("")
  const [actionError, setActionError] = useState<string | null>(null)
  const [trackingInfo, setTrackingInfo] = useState<OrderLiveTrackingResponse | null>(null)
  const [partnersList, setPartnersList] = useState<any[]>([])
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>("")
  const [assigningPartner, setAssigningPartner] = useState<boolean>(false)

  const fetchTracking = () => {
    if (id) {
      deliveryTrackingApi
        .getOrderTracking(id)
        .then((res) => setTrackingInfo(res))
        .catch(() => {})
    }
  }

  useEffect(() => {
    fetchTracking()
    // Fetch verified delivery partners
    import("../features/commerceApi").then(({ adminApi }) => {
      adminApi
        .listCustomers({ role: "delivery_partner" as any, limit: 50 })
        .then((res: any) => {
          const items = res?.items || []
          if (items.length > 0) {
            setPartnersList(items)
          } else {
            // Also include driver default if list empty
            setPartnersList([
              {
                id: "f191b19b-58ae-4d03-a41c-6564ab022ad2",
                fullName: "Ramesh Driver (driver@hindustanhardware.com)",
                phone: "+919876543210",
              },
            ])
          }
        })
        .catch(() => {
          setPartnersList([
            {
              id: "f191b19b-58ae-4d03-a41c-6564ab022ad2",
              fullName: "Ramesh Driver (driver@hindustanhardware.com)",
              phone: "+919876543210",
            },
          ])
        })
    })
  }, [id])

  const handleAssignPartner = async () => {
    if (!id || !selectedPartnerId) return
    setAssigningPartner(true)
    setActionError(null)
    try {
      const { adminApi } = await import("../features/commerceApi")
      await adminApi.assignDeliveryPartner({
        orderId: id,
        deliveryPartnerId: selectedPartnerId,
        notes: "Assigned via Store Admin Console",
      })
      fetchTracking()
      refetch()
    } catch (err: any) {
      setActionError(err?.message || "Failed to assign delivery partner.")
    } finally {
      setAssigningPartner(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
        <p className="text-sm font-medium text-slate-500">Retrieving order details from database...</p>
      </div>
    )
  }

  if (error || !order) {
    return (
      <EmptyState
        title="Order not found"
        text={error || "The requested order is unavailable or you do not have permission to view it."}
      />
    )
  }

  const allowedTransitions: Record<string, string[]> = {
    pending: ["confirmed", "processing", "shipped", "delivered", "cancelled"],
    confirmed: ["pending", "processing", "shipped", "delivered", "cancelled"],
    processing: ["confirmed", "shipped", "delivered", "cancelled"],
    shipped: ["processing", "delivered", "cancelled"],
    delivered: [],
    cancelled: [],
  }

  const nextValidStatuses = allowedTransitions[order.status] || []

  const handleStatusTransition = async (targetStatus: string) => {
    setActionError(null)
    try {
      await updateStatus(targetStatus)
    } catch (err: any) {
      setActionError(err?.message || "Failed to update order status.")
    }
  }

  const handleCancel = async () => {
    if (!cancelReason.trim()) {
      setActionError("Cancellation reason is required (minimum 3 characters).")
      return
    }
    setActionError(null)
    try {
      await cancelOrder(cancelReason.trim())
      setCancelModalOpen(false)
      setCancelReason("")
    } catch (err: any) {
      setActionError(err?.message || "Failed to cancel order.")
    }
  }

  const handleCollectCod = async () => {
    setActionError(null)
    try {
      await collectCodPayment(codNotes.trim() || undefined)
      setCodModalOpen(false)
      setCodNotes("")
    } catch (err: any) {
      setActionError(err?.message || "Failed to record COD cash payment.")
    }
  }

  const handleInvoiceFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingInvoice(true)
    setActionError(null)
    setInvoiceMessage(null)
    try {
      await uploadInvoice(file)
      setInvoiceMessage("Invoice uploaded successfully!")
      setTimeout(() => setInvoiceMessage(null), 4000)
    } catch (err: any) {
      setActionError(err?.message || "Failed to upload invoice document.")
    } finally {
      setUploadingInvoice(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  const shippingAddr = (order.shippingAddress || {}) as any

  return (
    <>
      <PageHeader
        breadcrumbs="Orders / Order detail"
        title={order.orderNumber}
        description={`Placed ${new Date(order.createdAt).toLocaleString()} · ID: ${order.id}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={refetch} title="Refresh order">
              <RefreshCcw size={15} />
            </Button>

            {/* Hidden file input for invoice PDF/document */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleInvoiceFileChange}
              accept="application/pdf,.pdf,image/png,image/jpeg,image/webp"
              className="hidden"
            />

            {order.invoiceUrl && (
              <a
                href={order.invoiceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-xs hover:bg-slate-50 transition"
              >
                <Eye size={15} className="text-brand" />
                View invoice
              </a>
            )}

            <Button
              variant={order.invoiceUrl ? "outline" : "primary"}
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingInvoice || actionLoading}
              title={order.invoiceUrl ? "Upload a new/updated invoice to replace the existing one" : "Upload invoice PDF"}
              className="flex items-center gap-1.5"
            >
              {uploadingInvoice ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Upload size={15} />
              )}
              {uploadingInvoice
                ? "Uploading..."
                : order.invoiceUrl
                ? "Re-upload invoice"
                : "Upload invoice"}
            </Button>
          </div>
        }
      />

      {invoiceMessage && (
        <div className="mb-6 rounded-lg bg-emerald-50 p-4 border border-emerald-200 text-sm font-semibold text-emerald-800 flex items-center gap-2">
          <FileCheck size={18} className="text-emerald-600" />
          {invoiceMessage}
        </div>
      )}

      {actionError && (
        <div className="mb-6 rounded-lg bg-red-50 p-4 border border-red-200 text-sm text-red-700">
          {actionError}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <section className="rounded-xl border border-border bg-white p-6 shadow-xs">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black text-slate-900">Ordered items</h2>
              <Badge tone={statusTone(order.status as any)}>{order.status}</Badge>
            </div>
            <div className="mt-4 divide-y divide-border">
              {order.items.map((item) => (
                <div
                  className="flex items-center justify-between gap-4 py-4"
                  key={item.id}
                >
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 font-bold text-xs uppercase">
                      HH
                    </div>
                    <div>
                      <b className="block text-slate-900">{item.productName}</b>
                      <small className="block text-slate-500">
                        {item.sku ? `SKU: ${item.sku} · ` : ""}Qty: {item.quantity} × {formatPrice(item.unitPrice)}
                      </small>
                    </div>
                  </div>
                  <b className="text-slate-900">{formatPrice(item.lineSubtotal)}</b>
                </div>
              ))}
            </div>

            <div className="border-t border-border pt-4 space-y-2 text-sm text-slate-600">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{formatPrice(order.subtotal)}</span>
              </div>
              {order.shippingAmount > 0 && (
                <div className="flex justify-between">
                  <span>Shipping Fee</span>
                  <span>{formatPrice(order.shippingAmount)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-border pt-3 text-lg font-black text-slate-900">
                <span>Total Amount</span>
                <span>{formatPrice(order.totalAmount)}</span>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-white p-6 shadow-xs">
            <h2 className="text-lg font-black text-slate-900">Status timeline</h2>
            <p className="text-xs text-slate-500 mt-1 mb-4">
              Real-time milestone tracking directly synchronized with the customer storefront.
            </p>

            {/* Horizontal Timeline Bar matching user TrackingPage */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
              {[
                { status: "pending", label: "Order Placed" },
                { status: "confirmed", label: "Order Confirmed" },
                { status: "processing", label: "Preparing Your Order" },
                { status: "shipped", label: "Out for Delivery" },
              ].map((step, idx) => {
                const stageOrder = ["pending", "confirmed", "processing", "shipped", "delivered"]
                const currentIdx = stageOrder.indexOf(order.status)
                const thisIdx = stageOrder.indexOf(step.status)
                const isPassedOrActive = currentIdx >= thisIdx && order.status !== "cancelled"
                const isCurrent = order.status === step.status

                return (
                  <div
                    key={step.status}
                    className={`rounded-xl border p-3 text-center transition ${
                      isCurrent
                        ? "border-[#0b2447] bg-[#0b2447] text-white shadow-sm font-bold"
                        : isPassedOrActive
                        ? "border-emerald-300 bg-emerald-50 text-emerald-900 font-semibold"
                        : "border-slate-200 bg-white text-slate-500 font-medium"
                    }`}
                  >
                    <span className="block text-[11px] uppercase tracking-wider opacity-75">
                      Step {idx + 1}
                    </span>
                    <span className="text-xs font-bold block mt-0.5">
                      {step.label}
                    </span>
                  </div>
                )
              })}
            </div>

            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Audit trail & history</h3>
            <div className="space-y-3">
              {order.statusHistory.length === 0 ? (
                <p className="text-xs text-slate-400">No status transitions recorded yet.</p>
              ) : (
                order.statusHistory.map((h) => (
                  <div key={h.id} className="flex items-start gap-3 border-l-2 border-brand pl-3 py-1 text-sm">
                    <div className="flex-1">
                      <span className="font-bold text-slate-900 uppercase text-xs">
                        {h.previousStatus ? `${h.previousStatus} → ` : ""}{h.newStatus}
                      </span>
                      {h.reason && <p className="text-xs text-slate-600 mt-0.5">{h.reason}</p>}
                    </div>
                    <span className="text-xs text-slate-400">
                      {new Date(h.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        <aside className="space-y-5">
          {/* Delivery Partner Assignment & Telemetry */}
          <section className="rounded-xl border border-border bg-white p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-slate-900 flex items-center gap-1.5">
                <Truck size={17} className="text-amber-500" /> Delivery Assignment
              </h3>
              <Badge tone={trackingInfo?.assignment ? "blue" : "neutral"}>
                {trackingInfo?.assignment ? trackingInfo.assignment.status.replace(/_/g, " ") : "Unassigned"}
              </Badge>
            </div>

            {trackingInfo?.assignment ? (
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">Assigned Driver:</span>
                  <b className="text-slate-900 font-bold">
                    {trackingInfo.assignment.deliveryPartner?.fullName || "Assigned Partner"}
                  </b>
                </div>
                {trackingInfo.assignment.deliveryPartner?.phone && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Phone:</span>
                    <span className="text-slate-700 font-mono">{trackingInfo.assignment.deliveryPartner.phone}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-500">Status:</span>
                  <span className="font-semibold capitalize text-amber-700">
                    {trackingInfo.assignment.status.replace(/_/g, " ")}
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-slate-500">
                  Assign this order to a verified delivery partner so it appears on their driver dashboard.
                </p>
                <div className="space-y-2">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Select Driver
                  </label>
                  <select
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    value={selectedPartnerId}
                    onChange={(e) => setSelectedPartnerId(e.target.value)}
                  >
                    <option value="">-- Choose verified partner --</option>
                    {partnersList.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.fullName || p.name || p.email} ({p.phone || "No phone"})
                      </option>
                    ))}
                  </select>

                  <Button
                    variant="primary"
                    disabled={!selectedPartnerId || assigningPartner}
                    onClick={handleAssignPartner}
                    className="w-full text-xs font-bold bg-amber-500 hover:bg-amber-600 text-slate-950 mt-1"
                  >
                    {assigningPartner ? <Loader2 size={14} className="animate-spin" /> : <Truck size={14} />}
                    {assigningPartner ? "Assigning..." : "Assign to Driver"}
                  </Button>
                </div>
              </div>
            )}
          </section>

          {/* Active Delivery Partner GPS Controller & Dispatch Telemetry */}
          {trackingInfo?.assignment && (
            <DeliveryPartnerGpsController
              deliveryId={trackingInfo.assignment.id}
              orderNumber={order.orderNumber}
              customerName={shippingAddr.recipientName || "Customer"}
              customerAddress={`${shippingAddr.addressLine1 || ""}, ${shippingAddr.city || ""}`}
              initialStatus={trackingInfo.assignment.status}
              onStatusChange={() => {
                refetch()
              }}
            />
          )}

          <section className="rounded-xl border border-border bg-white p-5 shadow-xs">
            <h3 className="font-black text-slate-900">Customer & delivery snapshot</h3>
            <div className="mt-3 text-sm leading-6 text-slate-600">
              <b className="text-slate-900 block">{shippingAddr.recipientName || "Valued Customer"}</b>
              <span className="block">{shippingAddr.phone || "No phone provided"}</span>
              <p className="mt-1 text-xs text-slate-500">
                {shippingAddr.addressLine1}
                {shippingAddr.addressLine2 ? `, ${shippingAddr.addressLine2}` : ""}
                <br />
                {shippingAddr.city}, {shippingAddr.state} {shippingAddr.postalCode}
              </p>
            </div>
          </section>

          {/* Dedicated Order Invoice Card */}
          <section className="rounded-xl border border-border bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-slate-900">Order Invoice PDF</h3>
              <Badge tone={order.invoiceUrl ? "success" : "neutral"}>
                {order.invoiceUrl ? "Attached" : "Not uploaded"}
              </Badge>
            </div>

            <p className="mt-2 text-xs text-slate-500">
              {order.invoiceUrl
                ? "An invoice document is linked to this order and accessible to the customer."
                : "No invoice document uploaded yet. Upload a PDF or invoice image for the customer."}
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
              <Button
                variant={order.invoiceUrl ? "outline" : "primary"}
                className="w-full flex items-center justify-center gap-1.5"
                disabled={uploadingInvoice || actionLoading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploadingInvoice ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Upload size={15} />
                )}
                {uploadingInvoice
                  ? "Uploading..."
                  : order.invoiceUrl
                  ? "Re-upload / Change Invoice"
                  : "Upload Invoice PDF"}
              </Button>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-white p-5 shadow-xs">
            <h3 className="font-black text-slate-900">Cash on Delivery (COD)</h3>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Payment Status:</span>
                <Badge tone={order.paymentStatus === "paid" ? "success" : order.paymentStatus === "cancelled" ? "danger" : "warning"}>
                  {order.paymentStatus}
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Total to Collect:</span>
                <b className="text-slate-900">{formatPrice(order.totalAmount)}</b>
              </div>
            </div>

            {order.paymentStatus === "pending" && order.status !== "cancelled" && (
              <Button
                className="mt-4 w-full"
                variant="primary"
                disabled={actionLoading}
                onClick={() => setCodModalOpen(true)}
              >
                <CheckCircle2 size={16} /> Record Cash Collected
              </Button>
            )}
          </section>

          <section className="rounded-xl border border-border bg-white p-5 shadow-xs">
            <h3 className="font-black text-slate-900">Update order</h3>
            <p className="text-xs text-slate-500 mt-1 mb-3">
              Click a milestone to update order progress. The customer's tracking page updates live.
            </p>

            <div className="space-y-2">
              {[
                { status: "confirmed", label: "Confirm order" },
                { status: "processing", label: "Mark preparing" },
                { status: "shipped", label: "Ready for dispatch / Out for delivery" },
                { status: "delivered", label: "Mark delivered" },
              ].map((step) => {
                const isCurrent = order.status === step.status
                return (
                  <button
                    key={step.status}
                    type="button"
                    disabled={actionLoading || isCurrent}
                    onClick={() => handleStatusTransition(step.status)}
                    className={`w-full flex items-center justify-start gap-2.5 px-4 py-3 rounded-xl text-xs font-bold transition cursor-pointer border ${
                      isCurrent
                        ? "bg-[#0b2447] text-white border-[#0b2447] shadow-sm cursor-default"
                        : "bg-white text-slate-800 border-slate-200 hover:border-[#0b2447] hover:bg-slate-50"
                    } ${actionLoading ? "opacity-60 cursor-not-allowed" : ""}`}
                  >
                    {isCurrent ? (
                      <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                    ) : (
                      <span className="h-4 w-4 rounded-full border border-slate-300 shrink-0" />
                    )}
                    <span>{step.label}</span>
                  </button>
                )
              })}

              {order.status !== "cancelled" && order.status !== "delivered" && (
                <Button
                  className="w-full mt-2"
                  variant="danger"
                  disabled={actionLoading}
                  onClick={() => setCancelModalOpen(true)}
                >
                  <Trash2 size={14} /> Cancel order
                </Button>
              )}
            </div>
          </section>
        </aside>
      </div>

      {cancelModalOpen && (
        <div className="modal-backdrop">
          <div className="modal">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-red-50 text-red-600">
              <Trash2 />
            </span>
            <h2 className="mt-4 text-xl font-black">Cancel order {order.orderNumber}?</h2>
            <p className="mt-2 text-sm text-slate-500">
              Cancelling this order will release all allocated product inventory back into store stock.
            </p>

            <label className="field-label mt-4 block text-left">
              Cancellation reason (required)
              <textarea
                className="field mt-1.5"
                rows={3}
                placeholder="e.g. Customer requested cancellation / address unreachable"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              />
            </label>

            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="ghost"
                disabled={actionLoading}
                onClick={() => setCancelModalOpen(false)}
              >
                Back
              </Button>
              <Button
                variant="danger"
                disabled={actionLoading || !cancelReason.trim()}
                onClick={handleCancel}
              >
                {actionLoading ? "Cancelling..." : "Confirm Cancellation"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {codModalOpen && (
        <div className="modal-backdrop">
          <div className="modal">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-emerald-50 text-emerald-600">
              <IndianRupee />
            </span>
            <h2 className="mt-4 text-xl font-black">Record cash collection</h2>
            <p className="mt-2 text-sm text-slate-500">
              Confirm cash payment of <strong>{formatPrice(order.totalAmount)}</strong> received from the customer for {order.orderNumber}.
            </p>

            <label className="field-label mt-4 block text-left">
              Collection notes (optional)
              <input
                className="field mt-1.5"
                placeholder="e.g. Received by driver / store counter"
                value={codNotes}
                onChange={(e) => setCodNotes(e.target.value)}
              />
            </label>

            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="ghost"
                disabled={actionLoading}
                onClick={() => setCodModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={actionLoading}
                onClick={handleCollectCod}
              >
                {actionLoading ? "Recording..." : "Confirm Payment"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
