import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Download,
  FileText,
  Home,
  Loader2,
  MapPin,
  Package,
  RefreshCcw,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  Truck,
} from "lucide-react"
import React, { useState, useEffect } from "react"
import { Link, useParams } from "react-router"
import { useAuth } from "../authContext"
import { Badge, Button, EmptyState, PageHeader } from "../components"
import { useOrderStatus } from "../features/hooks/useOrderStatus"
import { deliveryTrackingApi, type OrderLiveTrackingResponse } from "../features/deliveryTrackingApi"
import { trackingSocketService } from "../features/trackingSocketService"

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
  const [liveTracking, setLiveTracking] = useState<OrderLiveTrackingResponse | null>(null)
  const [liveEta, setLiveEta] = useState<{
    estimatedArrivalTimestamp?: string | null
    etaSeconds?: number | null
    distanceRemainingMeters?: number | null
  } | null>(null)

  useEffect(() => {
    if (!id) return
    deliveryTrackingApi.getOrderTracking(id).then((res) => {
      setLiveTracking(res)
    }).catch(() => {})
  }, [id, tracking?.currentStatus])

  // Real-time delivery updates (location, ETA & status) from rider via WebSockets
  useEffect(() => {
    const deliveryId = liveTracking?.assignment?.id
    if (!deliveryId) return

    // Fetch initial route / ETA if available
    deliveryTrackingApi.getDeliveryRoute(deliveryId).then((r) => {
      if (r) {
        setLiveEta({
          etaSeconds: r.durationSeconds,
          distanceRemainingMeters: r.distanceMeters,
          estimatedArrivalTimestamp: new Date(Date.now() + r.durationSeconds * 1000).toISOString(),
        })
      }
    }).catch(() => {})

    const unsubscribe = trackingSocketService.subscribeToDelivery(
      deliveryId,
      (location) => {
        setLiveTracking((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            latestLocation: location,
          }
        })

        if (location.etaSeconds != null || location.estimatedArrivalTimestamp) {
          setLiveEta({
            estimatedArrivalTimestamp: location.estimatedArrivalTimestamp,
            etaSeconds: location.etaSeconds,
            distanceRemainingMeters: location.distanceRemainingMeters,
          })
        }
      },
      (deliveryStatus) => {
        const newAssignmentStatus = deliveryStatus.status
        setLiveTracking((prev) => {
          if (!prev || !prev.assignment) return prev
          return {
            ...prev,
            assignment: {
              ...prev.assignment,
              status: newAssignmentStatus,
              pickedUpAt: newAssignmentStatus === "picked_up" ? deliveryStatus.timestamp : prev.assignment.pickedUpAt,
              deliveredAt: newAssignmentStatus === "delivered" ? deliveryStatus.timestamp : prev.assignment.deliveredAt,
            },
          }
        })
        // Trigger a background refresh to synchronize server-side milestones
        refetch()
      },
      (err) => {
        console.warn("[TrackingPage] Delivery socket error:", err)
      }
    )

    return () => {
      unsubscribe()
    }
  }, [liveTracking?.assignment?.id, refetch])

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

  // 5 Canonical Order Status Stages across Hindustan Hardware:
  // 1. Order Confirmed
  // 2. Dispatched from Store
  // 3. Out for Delivery
  // 4. At Destination
  // 5. Order Delivered
  const canonicalStages = [
    { key: "confirmed", label: "Order Confirmed" },
    { key: "dispatched", label: "Dispatched from Store" },
    { key: "out_for_delivery", label: "Out for Delivery" },
    { key: "at_destination", label: "At Destination" },
    { key: "delivered", label: "Order Delivered" },
  ]

  const currentStatusLower = tracking.currentStatus?.toLowerCase() || ""
  const isCancelled = currentStatusLower === "cancelled"
  const assignmentStatus = liveTracking?.assignment?.status

  // Check if delivery partner is at destination (within 85 meters or flagged)
  const latestLocation = liveTracking?.latestLocation
  const destCoords = liveTracking?.destination
  const isAtDestination = Boolean(
    !isCancelled &&
    (currentStatusLower === "delivered" ||
      ((assignmentStatus === "out_for_delivery" || assignmentStatus === "picked_up") &&
        latestLocation &&
        destCoords?.latitude &&
        destCoords?.longitude &&
        (() => {
          const R = 6371e3
          const lat1 = (latestLocation.latitude * Math.PI) / 180
          const lat2 = (destCoords.latitude * Math.PI) / 180
          const dLat = ((destCoords.latitude - latestLocation.latitude) * Math.PI) / 180
          const dLon = ((destCoords.longitude - latestLocation.longitude) * Math.PI) / 180
          const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
          return R * c <= 85
        })()))
  )

  const isDelivered = currentStatusLower === "delivered" || assignmentStatus === "delivered"
  const isOutForDelivery = isDelivered || isAtDestination || assignmentStatus === "out_for_delivery"
  const isDispatched =
    isOutForDelivery ||
    Boolean(
      liveTracking?.assignment?.pickedUpAt ||
        assignmentStatus === "picked_up" ||
        currentStatusLower === "shipped" ||
        currentStatusLower === "dispatched from store"
    )

  // Determine current active milestone index (0 to 4)
  let activeIndex = 0
  if (isDelivered) {
    activeIndex = 4
  } else if (isAtDestination) {
    activeIndex = 3
  } else if (isOutForDelivery) {
    activeIndex = 2
  } else if (isDispatched) {
    activeIndex = 1
  } else {
    activeIndex = 0
  }

  // Helper to extract timestamp for each canonical stage from status history and assignment
  const getStageTimestamp = (key: string, idx: number): string | null => {
    if (idx > activeIndex) return null

    const history = tracking?.history || []

    if (key === "confirmed") {
      const match = history.find((h) => h.newStatus?.toLowerCase() === "confirmed")
      return match?.createdAt || tracking.createdAt
    }

    if (key === "dispatched") {
      const match = history.find(
        (h) =>
          h.newStatus?.toLowerCase() === "shipped" ||
          h.newStatus?.toLowerCase() === "picked_up" ||
          h.newStatus?.toLowerCase().includes("dispatch")
      )
      return match?.createdAt || liveTracking?.assignment?.pickedUpAt || null
    }

    if (key === "out_for_delivery") {
      const match = history.find((h) => h.newStatus?.toLowerCase() === "out_for_delivery")
      return match?.createdAt || (liveTracking?.assignment?.pickedUpAt ? liveTracking.assignment.pickedUpAt : null)
    }

    if (key === "at_destination") {
      const match = history.find(
        (h) => h.newStatus?.toLowerCase() === "at_destination" || h.newStatus?.toLowerCase().includes("destination")
      )
      return match?.createdAt || (liveTracking?.latestLocation?.deviceTimestamp || null)
    }

    if (key === "delivered") {
      const match = history.find((h) => h.newStatus?.toLowerCase() === "delivered")
      return match?.createdAt || liveTracking?.assignment?.completedAt || null
    }

    return null
  }

  // Format date and time for stepper: e.g. "14 Oct 2026" and "04:32 PM"
  const formatStepDateParts = (isoStr: string | null) => {
    if (!isoStr) return null
    try {
      const date = new Date(isoStr)
      const datePart = new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(date)
      const timePart = new Intl.DateTimeFormat("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }).format(date)
      return { datePart, timePart }
    } catch {
      return null
    }
  }

  // Stage configuration with icons matching the modern UI
  const stageIcons = [
    ShoppingBag, // Order Confirmed
    Package,     // Dispatched from Store
    Truck,       // Out for Delivery
    MapPin,      // At Destination
    Home,        // Order Delivered
  ]

  // Delivery destination snapshot formatted address
  const destinationAddress =
    (tracking as any).shippingAddress?.streetAddress ||
    (tracking as any).shippingAddress?.addressLine1 ||
    (tracking as any).shippingAddress?.fullAddress ||
    "Home Address"

  // Direct device download for invoice
  const handleDownloadInvoice = async () => {
    if (!tracking.invoiceUrl) {
      window.print()
      return
    }
    try {
      const res = await fetch(tracking.invoiceUrl)
      const blob = await res.blob()
      const blobUrl = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = blobUrl
      a.download = tracking.invoiceFileName || `Invoice-${tracking.orderNumber}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(blobUrl)
    } catch {
      window.open(tracking.invoiceUrl, "_blank")
    }
  }

  // Display label for current order status
  const displayStatusLabel = isCancelled
    ? "Order Cancelled"
    : canonicalStages[activeIndex].label

  return (
    <div className="container-wide py-4 sm:py-8 pb-24 md:pb-8 px-3 sm:px-6">
      <PageHeader
        breadcrumbs={`My Orders / ${tracking.orderNumber}`}
        title="Delivery Tracking"
        description="Authentic order milestones recorded in the Hindustan Hardware database."
        action={
          <div className="flex flex-wrap gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              onClick={() => {
                refetch()
                if (id) {
                  deliveryTrackingApi.getOrderTracking(id).then(setLiveTracking).catch(() => {})
                }
              }}
              className="flex items-center gap-1.5 flex-1 sm:flex-initial justify-center text-xs sm:text-sm"
            >
              <RefreshCcw size={15} /> Refresh Status
            </Button>
            <Link to={`/my-orders/${tracking.orderId}`} className="flex-1 sm:flex-initial">
              <Button variant="outline" className="w-full text-xs sm:text-sm">Order Details</Button>
            </Link>
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 rounded-xl border border-border bg-white p-4 sm:p-5 sm:grid-cols-7 shadow-sm">
        <Info label="Order Reference" value={<span className="font-semibold break-all text-xs sm:text-sm">{tracking.orderNumber}</span>} />
        <Info label="Placed Date" value={<span className="text-xs sm:text-sm">{formatDateTime(tracking.createdAt)}</span>} />
        <Info
          label="Current Status"
          value={
            <span className="font-bold text-ink text-xs sm:text-sm">
              {displayStatusLabel}
            </span>
          }
        />
        <Info
          label="Estimated Arrival"
          value={
            liveEta?.etaSeconds != null || liveEta?.estimatedArrivalTimestamp ? (
              <span className="font-bold text-emerald-700 flex flex-wrap items-center gap-1.5 text-xs sm:text-sm">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping inline-block" />
                <span>
                  {liveEta.etaSeconds != null
                    ? `~${Math.max(1, Math.ceil(liveEta.etaSeconds / 60))} mins`
                    : "In transit"}
                </span>
                {liveEta.distanceRemainingMeters != null && (
                  <span className="text-[10px] sm:text-[11px] font-normal text-slate-500">
                    ({(liveEta.distanceRemainingMeters / 1000).toFixed(1)} km)
                  </span>
                )}
              </span>
            ) : isDelivered ? (
              <span className="text-emerald-700 font-bold text-xs sm:text-sm">Delivered</span>
            ) : (
              <span className="text-slate-500 font-medium text-xs sm:text-sm">Standard delivery (24-48h)</span>
            )
          }
        />
        <div className="col-span-2 sm:col-span-1">
          <Info
            label="Payment Status"
            value={
              <span className="capitalize text-amber-700 font-bold text-xs sm:text-sm">
                Cash on Delivery ({tracking.paymentStatus.replace(/_/g, " ")})
              </span>
            }
          />
        </div>
        <Info
          label="Delivery Fee"
          value={<span className="font-bold text-ink text-xs sm:text-sm">₹{(tracking.deliveryFee || 0).toLocaleString("en-IN")}</span>}
        />
        <Info
          label="Total Payable"
          value={<span className="font-bold text-ink text-xs sm:text-sm">₹{(tracking.totalPayable || 0).toLocaleString("en-IN")}</span>}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-2xl border border-border bg-white p-4 sm:p-6 md:p-8 shadow-sm">
          {/* Header row with status and Delivered to badge */}
          <div className="flex flex-col gap-4 pb-6 border-b border-slate-100">
            <div className="flex items-start gap-3 sm:gap-3.5">
              <span className={`grid h-10 w-10 sm:h-12 sm:w-12 place-items-center rounded-full shrink-0 ${
                isDelivered ? "bg-emerald-100 text-emerald-600" : isCancelled ? "bg-red-100 text-red-600" : "bg-emerald-50 text-emerald-600"
              }`}>
                {isDelivered ? (
                  <CheckCircle2 size={24} className="stroke-[2.5] sm:w-7 sm:h-7" />
                ) : isCancelled ? (
                  <AlertCircle size={22} className="sm:w-6 sm:h-6" />
                ) : (
                  <Check size={22} className="stroke-[2.5] sm:w-6 sm:h-6" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <span className="inline-block rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-emerald-700">
                  {isCancelled ? "CANCELLED" : isDelivered ? "DELIVERED" : displayStatusLabel.toUpperCase()}
                </span>
                <h2 className="mt-1 text-lg sm:text-2xl font-black text-slate-900 tracking-tight leading-snug break-words">
                  {isCancelled
                    ? "Order Cancelled"
                    : isDelivered
                      ? "Your order has been delivered"
                      : isAtDestination
                        ? "Delivery Partner at your doorstep"
                        : isOutForDelivery
                          ? "Your order is out for delivery"
                          : isDispatched
                            ? "Dispatched from Store warehouse"
                            : "Your order is confirmed"}
                </h2>
                <p className="text-[11px] sm:text-xs text-slate-500 font-medium mt-0.5">
                  {isDelivered && (getStageTimestamp("delivered", 4) || tracking.updatedAt)
                    ? `Delivered on ${formatDateTime(getStageTimestamp("delivered", 4) || tracking.updatedAt)}`
                    : `Last updated: ${formatDateTime(tracking.updatedAt || tracking.createdAt)}`}
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2.5">
              {/* Live ETA Chip if active and not delivered */}
              {!isDelivered && (liveEta?.etaSeconds != null || liveEta?.estimatedArrivalTimestamp) && (
                <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/80 px-3.5 py-2">
                  <Clock className="h-5 w-5 text-emerald-600 animate-pulse shrink-0" />
                  <div className="text-left">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 block">
                      Estimated Arrival
                    </span>
                    <span className="text-xs font-black text-emerald-950 block">
                      ~{Math.max(1, Math.ceil((liveEta.etaSeconds || 300) / 60))} mins
                      {liveEta.distanceRemainingMeters && (
                        <span className="font-medium text-emerald-700 ml-1">
                          ({(liveEta.distanceRemainingMeters / 1000).toFixed(1)} km)
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              )}

              {/* Delivered to Home Address pill */}
              <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/70 px-3.5 sm:px-4 py-2 sm:py-2.5">
                <div className="relative shrink-0">
                  <Truck className="h-5 w-5 sm:h-6 sm:w-6 text-slate-700" />
                  <span className="absolute -bottom-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-600 text-white">
                    <Check size={9} className="stroke-[3]" />
                  </span>
                </div>
                <div className="text-left min-w-0 flex-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    Delivered to
                  </span>
                  <span className="text-xs font-bold text-slate-800 block truncate max-w-[200px] sm:max-w-[240px]" title={destinationAddress}>
                    {destinationAddress}
                  </span>
                  <Link
                    to={`/my-orders/${tracking.orderId}`}
                    className="text-[11px] font-bold text-blue-600 hover:underline inline-flex items-center gap-0.5 mt-0.5"
                  >
                    <span>View details</span>
                    <ChevronRight size={12} />
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* Stepper Timeline */}
          {!isCancelled ? (
            <div className="py-6 sm:py-8">
              {/* Desktop / Tablet Stepper (Horizontal) */}
              <div className="hidden md:block">
                <div className="relative">
                  {/* Connecting background track positioned at exactly 18px (center of 36px node) */}
                  <div className="absolute left-[10%] right-[10%] top-[18px] h-[3px] -translate-y-1/2 bg-slate-200 z-0" />

                  {/* Filled completed green track */}
                  <div
                    className="absolute left-[10%] top-[18px] h-[3px] -translate-y-1/2 bg-emerald-600 transition-all duration-500 z-0"
                    style={{
                      width: `${(activeIndex / (canonicalStages.length - 1)) * 80}%`,
                    }}
                  />

                  <div className="relative z-10 flex items-start justify-between">
                    {canonicalStages.map((stage, index) => {
                      const completed = index <= activeIndex
                      const isCurrent = index === activeIndex
                      const Icon = stageIcons[index]
                      const timestamp = getStageTimestamp(stage.key, index)
                      const dateParts = formatStepDateParts(timestamp)

                      return (
                        <div
                          key={stage.key}
                          className="flex flex-1 flex-col items-center text-center px-1"
                        >
                          {/* Check Circle Node */}
                          <div
                            className={`flex h-9 w-9 items-center justify-center rounded-full text-white transition-all shadow-xs shrink-0 ${
                              completed
                                ? "bg-emerald-600 ring-4 ring-emerald-50"
                                : "border-2 border-slate-300 bg-white text-slate-500"
                            }`}
                          >
                            {completed ? (
                              <Check size={18} className="stroke-[3]" />
                            ) : (
                              <span className="text-xs font-black text-slate-500 leading-none flex items-center justify-center">
                                {index + 1}
                              </span>
                            )}
                          </div>

                          {/* Icon Pill Under Checkmark */}
                          <div className="mt-3 flex h-8 w-8 items-center justify-center rounded-full bg-slate-50 border border-slate-100 text-slate-600">
                            <Icon size={15} />
                          </div>

                          {/* Milestone Title */}
                          <b className="mt-2 text-xs sm:text-sm font-extrabold text-slate-900 leading-tight">
                            {stage.label}
                          </b>

                          {/* Date & Time from Database */}
                          {dateParts ? (
                            <div className="mt-1 text-[11px] leading-snug">
                              <span className="block font-medium text-slate-600">{dateParts.datePart}</span>
                              <span className="block font-bold text-slate-800">{dateParts.timePart}</span>
                            </div>
                          ) : (
                            <div className="mt-1 text-[11px] leading-snug">
                              <span className={`block font-semibold ${isCurrent ? "text-emerald-700" : "text-slate-400"}`}>
                                {isCurrent ? "In Progress" : "Pending"}
                              </span>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Mobile Stepper (Vertical Timeline - perfectly fitted for all screen sizes) */}
              <div className="block md:hidden">
                <div className="relative space-y-5">
                  {/* Vertical connecting line aligned to node center (node width is 2rem = 32px, center is 16px) */}
                  <div className="absolute left-[15px] top-4 bottom-4 w-[2px] bg-slate-200" />
                  {/* Active line progress */}
                  <div
                    className="absolute left-[15px] top-4 w-[2px] bg-emerald-600 transition-all duration-500"
                    style={{
                      height: `${(activeIndex / (canonicalStages.length - 1)) * 100}%`,
                    }}
                  />

                  {canonicalStages.map((stage, index) => {
                    const completed = index <= activeIndex
                    const isCurrent = index === activeIndex
                    const Icon = stageIcons[index]
                    const timestamp = getStageTimestamp(stage.key, index)
                    const dateParts = formatStepDateParts(timestamp)

                    return (
                      <div key={stage.key} className="relative flex items-start gap-3">
                        {/* Circle node centered over connecting line */}
                        <div
                          className={`relative flex h-8 w-8 items-center justify-center rounded-full text-white transition-all shadow-xs shrink-0 z-10 ${
                            completed
                              ? "bg-emerald-600 ring-4 ring-emerald-50"
                              : "border-2 border-slate-300 bg-white text-slate-500"
                          }`}
                        >
                          {completed ? (
                            <Check size={16} className="stroke-[3]" />
                          ) : (
                            <span className="text-xs font-black text-slate-500 leading-none">
                              {index + 1}
                            </span>
                          )}
                        </div>

                        {/* Step Details */}
                        <div className="flex-1 min-w-0 bg-slate-50/80 border border-slate-100 rounded-xl p-3">
                          <div className="flex flex-wrap items-center justify-between gap-1.5">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white border border-slate-200 text-slate-600 shrink-0">
                                <Icon size={13} />
                              </span>
                              <b className="text-xs sm:text-sm font-extrabold text-slate-900 truncate">
                                {stage.label}
                              </b>
                            </div>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                                completed
                                  ? "bg-emerald-100 text-emerald-800"
                                  : isCurrent
                                    ? "bg-amber-100 text-amber-800 animate-pulse"
                                    : "bg-slate-200 text-slate-600"
                              }`}
                            >
                              {completed ? "Completed" : isCurrent ? "In Progress" : "Pending"}
                            </span>
                          </div>

                          {/* Timestamp info */}
                          {dateParts ? (
                            <div className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-600">
                              <span className="font-medium">{dateParts.datePart}</span>
                              <span className="text-slate-300">•</span>
                              <span className="font-bold text-slate-900">{dateParts.timePart}</span>
                            </div>
                          ) : (
                            <p className="mt-1 text-[11px] text-slate-400">
                              {isCurrent ? "Status will update shortly" : "Awaiting previous steps"}
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
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

          {/* Delivered Successfully Banner with View / Download Invoice Button */}
          {isDelivered && (
            <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-emerald-100 text-emerald-700 shrink-0">
                  <Sparkles size={20} />
                </span>
                <div>
                  <b className="text-sm font-extrabold text-emerald-950 block">Delivered Successfully!</b>
                  <p className="text-xs text-emerald-800 font-medium mt-0.5">
                    Your order has been delivered. Thank you for shopping with us!
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleDownloadInvoice}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-white hover:bg-emerald-50 px-4 py-2.5 text-xs font-black text-emerald-800 shadow-xs transition hover:shadow-sm shrink-0 cursor-pointer w-full sm:w-auto"
                title="Download invoice document to your device"
              >
                <Download size={15} className="text-emerald-700" />
                <span>Download Invoice</span>
              </button>
            </div>
          )}

          {/* Chronological Event History */}
          {tracking.history && tracking.history.length > 0 && (
            <div className="mt-9 border-t border-border pt-6">
              <h3 className="text-base font-black text-ink mb-4">Event Log</h3>
              <div className="space-y-3">
                {tracking.history.map((event, idx) => (
                  <div key={event.id || idx} className="rounded-lg bg-slate-50 p-3 text-xs text-slate-700 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1.5 sm:gap-4">
                    <div className="min-w-0">
                      <b className="capitalize text-ink">{event.newStatus}</b>
                      {event.reason && <span className="text-slate-500 break-words"> — {event.reason}</span>}
                    </div>
                    <span className="font-mono text-[11px] text-slate-400 shrink-0 self-start sm:self-auto">
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
