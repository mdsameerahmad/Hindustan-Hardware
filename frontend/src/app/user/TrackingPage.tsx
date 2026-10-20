import { AlertCircle, Check, Loader2, RefreshCcw, ShieldCheck, Store, Truck } from "lucide-react"
import React, { useState } from "react"
import { Link, useParams } from "react-router"
import { useAuth } from "../authContext"
import { Badge, Button, EmptyState, PageHeader } from "../components"
import { useOrderStatus } from "../features/hooks/useOrderStatus"

import { LiveTrackingCard } from "../components/LiveTrackingCard"

type InfoProps = {
  label: string
  value: React.ReactNode
}

function Info({ label, value }: InfoProps) {
  return (
    <div>
      <small className="block text-xs font-bold uppercase tracking-wide text-slate-400">
        {label}
      </small>
      <div className="mt-1 block text-sm">{value}</div>
    </div>
  )
}

export function TrackingPage() {
  const { id } = useParams()
  const { isAuthenticated } = useAuth()
  const { tracking, loading, error, cancelling, cancelError, cancelCurrentOrder, refetch } =
    useOrderStatus(id, isAuthenticated)

  const [showCancelModal, setShowCancelModal] = useState(false)
  const [reasonInput, setReasonInput] = useState("Customer requested cancellation")

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
        <p className="font-semibold">Loading order status tracking...</p>
      </div>
    )
  }

  if (error || !tracking) {
    return (
      <div className="container-wide py-12">
        <EmptyState
          title="Order tracking unavailable"
          text={error || "Could not retrieve tracking details for this order reference."}
          action={
            <Link to="/my-orders">
              <Button>My Orders</Button>
            </Link>
          }
        />
      </div>
    )
  }

  // Authoritative status order stages defined in backend
  const stages = ["pending", "confirmed", "processing", "shipped", "delivered"]
  const currentStatusLower = tracking.currentStatus?.toLowerCase()
  const isCancelled = currentStatusLower === "cancelled"
  const activeIndex = isCancelled ? -1 : stages.indexOf(currentStatusLower)

  return (
    <div className="container-wide py-8">
      <PageHeader
        breadcrumbs={`My Orders / ${tracking.orderNumber}`}
        title="Delivery Tracking"
        description="Authentic order milestones recorded in the Hindustan Hardware database."
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => refetch()} className="flex items-center gap-1.5">
              <RefreshCcw size={15} /> Refresh Status
            </Button>
            <Link to={`/my-orders/${tracking.orderId}`}>
              <Button variant="outline">Order Details</Button>
            </Link>
          </div>
        }
      />

      <div className="mb-6 grid gap-4 rounded-xl border border-border bg-white p-5 sm:grid-cols-4 shadow-sm">
        <Info label="Order Reference" value={tracking.orderNumber} />
        <Info label="Placed Date" value={formatDateTime(tracking.createdAt)} />
        <Info
          label="Current Status"
          value={
            <span className="capitalize font-bold text-ink">
              {tracking.currentStatus}
            </span>
          }
        />
        <Info
          label="Payment Status"
          value={
            <span className="capitalize text-amber-700 font-bold">
              Cash on Delivery ({tracking.paymentStatus})
            </span>
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-xl border border-border bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <Badge tone={isCancelled ? "danger" : currentStatusLower === "delivered" ? "success" : "blue"}>
                <span className="capitalize">{tracking.currentStatus}</span>
              </Badge>
              <h2 className="mt-3 text-2xl font-black text-ink">
                {isCancelled
                  ? "Order Cancelled"
                  : currentStatusLower === "delivered"
                    ? "Order Delivered"
                    : "Your order is progressing"}
              </h2>
            </div>
            <span className="hidden h-14 w-14 place-items-center rounded-full bg-blue-50 text-brand sm:grid">
              <Truck />
            </span>
          </div>

          {/* Standard Status Timeline */}
          {!isCancelled ? (
            <div className="tracking-timeline mt-9">
              {stages.map((stage, index) => {
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
                      <b className="capitalize">{stage}</b>
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
          ) : (
            <div className="mt-8 rounded-xl border border-red-200 bg-red-50 p-5">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-6 w-6 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <b className="text-red-900 block text-base">Order Cancelled</b>
                  <p className="text-sm text-red-700 mt-1">
                    This order was cancelled. Deducted inventory has been returned to store stock.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Chronological Event History */}
          {tracking.history && tracking.history.length > 0 && (
            <div className="mt-9 border-t border-border pt-6">
              <h3 className="text-base font-black text-ink mb-4">Event Log</h3>
              <div className="space-y-3">
                {tracking.history.map((event, idx) => (
                  <div key={event.id || idx} className="rounded-lg bg-slate-50 p-3 text-xs text-slate-700 flex justify-between items-center">
                    <div>
                      <b className="capitalize text-ink">{event.newStatus}</b>
                      {event.reason && <span className="text-slate-500"> — {event.reason}</span>}
                    </div>
                    <span className="font-mono text-slate-400">
                      {formatDateTime(event.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cancellation Option */}
          {tracking.canCancel && (
            <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <b className="text-ink">Need to cancel this order?</b>
                <p className="text-xs text-slate-500 mt-0.5">
                  Cancellation is allowed prior to dispatch.
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
          )}
        </section>

        {/* Informational Sidebar */}
        <aside className="space-y-5">
          {/* Live Delivery Tracking Map Card */}
          <LiveTrackingCard
            orderId={tracking.orderId}
            orderNumber={tracking.orderNumber}
          />

          <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
            <h3 className="font-bold text-ink">Store Fulfillment Dispatch</h3>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Dispatched directly from the Hindustan Hardware &amp; Sanitary central warehouse in Jehanabad, Bihar.
            </p>
            <div className="mt-4 flex items-center gap-3 border-t border-border pt-4">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-blue-50 text-brand">
                <Store size={18} />
              </span>
              <div>
                <b className="text-sm text-ink block">Hindustan Hardware</b>
                <small className="text-slate-500">Local Verified Store Delivery</small>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-emerald-50 text-emerald-700">
                <ShieldCheck size={20} />
              </span>
              <div>
                <b className="text-sm text-ink block">Cash on Delivery Verification</b>
                <small className="text-slate-500">Zero Advance Required</small>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-600 leading-relaxed">
              Our store driver will provide a physical invoice upon arrival. Inspect pipes and fittings before paying in cash.
            </p>
          </div>
        </aside>
      </div>

      {/* Cancellation Modal in Tracking */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-black text-ink">Confirm Order Cancellation</h3>
            <p className="mt-2 text-sm text-slate-600">
              Are you sure you want to cancel order <b>{tracking.orderNumber}</b>?
            </p>

            <div className="mt-4">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                Reason for cancellation:
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
