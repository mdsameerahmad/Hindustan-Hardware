import {
    AlertCircle,
    CheckCircle2,
    Clock,
    Compass,
    Crosshair,
    Eye,
    FileCheck,
    FileText,
    IndianRupee,
    Loader2,
    MapPin,
    Package,
    Phone,
    RefreshCcw,
    Trash2,
    Truck,
    Upload,
    User
} from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useParams } from "react-router"
import {
    Badge,
    Button,
    EmptyState,
    PageHeader,
    formatPrice,
    statusTone,
} from "../components"
import { LiveTrackingMap } from "../components/LiveTrackingMap"
import {
    deliveryTrackingApi,
    type DeliveryRouteResponse,
    type OrderLiveTrackingResponse,
} from "../features/deliveryTrackingApi"
import { useAdminOrderDetail } from "../features/hooks/useAdminOrderDetail"
import {
    trackingSocketService,
    type DeliveryLocationBroadcastPayload,
    type DeliveryStatusBroadcastPayload,
} from "../features/trackingSocketService"

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
  const [codAmount, setCodAmount] = useState("")
  const [codMethod, setCodMethod] = useState<"cash" | "online">("cash")
  const [actionError, setActionError] = useState<string | null>(null)
  const [trackingInfo, setTrackingInfo] = useState<OrderLiveTrackingResponse | null>(null)
  const [partnersList, setPartnersList] = useState<any[]>([])
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>("")
  const [assigningPartner, setAssigningPartner] = useState<boolean>(false)
  const amountCollected = order?.amountCollected ?? (order?.paymentStatus === "paid" ? order.totalAmount : 0)
  const amountDue = order?.amountDue ?? (
    order?.status === "cancelled" ? 0 : Math.max(0, (order?.totalAmount ?? 0) - amountCollected)
  )

  // Real-Time Delivery Partner Tracking & Route state
  const [routeData, setRouteData] = useState<DeliveryRouteResponse | null>(null)
  const [liveEstimatedArrival, setLiveEstimatedArrival] = useState<{
    estimatedArrivalTimestamp?: string | null
    etaSeconds?: number | null
    distanceRemainingMeters?: number | null
  } | null>(null)
  const [partnerLocation, setPartnerLocation] = useState<{
    latitude: number
    longitude: number
    heading?: number | null
    speed?: number | null
    accuracy?: number | null
  } | null>(null)
  const [isLocationStale, setIsLocationStale] = useState<boolean>(false)
  const [lastLocationTimestamp, setLastLocationTimestamp] = useState<string | null>(null)
  const [socketStatus, setSocketStatus] = useState<"connected" | "connecting" | "reconnecting" | "disconnected">("disconnected")
  const [autoFollow, setAutoFollow] = useState<boolean>(true)
  const lastRouteFetchTimeRef = useRef<number>(0)

  const fetchRouteForDelivery = useCallback((deliveryId: string) => {
    lastRouteFetchTimeRef.current = Date.now()
    deliveryTrackingApi
      .getDeliveryRoute(deliveryId)
      .then((res) => {
        if (res) {
          setRouteData(res)
          setLiveEstimatedArrival((prev) => ({
            ...prev,
            etaSeconds: res.durationSeconds,
            distanceRemainingMeters: res.distanceMeters,
            estimatedArrivalTimestamp: new Date(Date.now() + res.durationSeconds * 1000).toISOString(),
          }))
        }
      })
      .catch(() => {})
  }, [])

  const fetchTracking = useCallback(() => {
    if (id) {
      deliveryTrackingApi
        .getOrderTracking(id)
        .then((res) => {
          setTrackingInfo(res)
          if (res?.latestLocation) {
            setPartnerLocation({
              latitude: Number(res.latestLocation.latitude),
              longitude: Number(res.latestLocation.longitude),
              heading: res.latestLocation.heading,
              speed: res.latestLocation.speed,
              accuracy: res.latestLocation.accuracy,
            })
            setLastLocationTimestamp(res.latestLocation.deviceTimestamp || res.latestLocation.serverReceivedAt || null)
            setIsLocationStale(Boolean(res.latestLocation.isStale))
          }
          if (res?.assignment?.id) {
            fetchRouteForDelivery(res.assignment.id)
          }
        })
        .catch(() => {})
    }
  }, [id, fetchRouteForDelivery])

  // Real-time socket subscription to partner dispatch room
  useEffect(() => {
    const deliveryId = trackingInfo?.assignment?.id
    if (!deliveryId) return

    // Fetch initial route and latest location
    fetchRouteForDelivery(deliveryId)

    deliveryTrackingApi
      .getLatestLocation(deliveryId)
      .then((res) => {
        if (res?.latestLocation) {
          setPartnerLocation({
            latitude: Number(res.latestLocation.latitude),
            longitude: Number(res.latestLocation.longitude),
            heading: res.latestLocation.heading,
            speed: res.latestLocation.speed,
            accuracy: res.latestLocation.accuracy,
          })
          setLastLocationTimestamp(res.latestLocation.deviceTimestamp || res.latestLocation.serverReceivedAt || null)
          setIsLocationStale(Boolean(res.latestLocation.isStale))
        }
      })
      .catch(() => {})

    const unsubStatus = trackingSocketService.onConnectionStatusChange((status) => {
      setSocketStatus(status)
      if (status === "connected") {
        deliveryTrackingApi
          .getLatestLocation(deliveryId)
          .then((res) => {
            if (res?.latestLocation) {
              setPartnerLocation({
                latitude: Number(res.latestLocation.latitude),
                longitude: Number(res.latestLocation.longitude),
                heading: res.latestLocation.heading,
                speed: res.latestLocation.speed,
                accuracy: res.latestLocation.accuracy,
              })
              setLastLocationTimestamp(res.latestLocation.deviceTimestamp || res.latestLocation.serverReceivedAt || null)
              setIsLocationStale(Boolean(res.latestLocation.isStale))
            }
          })
          .catch(() => {})
      }
    })

    const unsubDelivery = trackingSocketService.subscribeToDelivery(
      deliveryId,
      (payload: DeliveryLocationBroadcastPayload) => {
        setLastLocationTimestamp((prevTime) => {
          if (prevTime && payload.deviceTimestamp && new Date(payload.deviceTimestamp).getTime() < new Date(prevTime).getTime()) {
            return prevTime
          }
          return payload.deviceTimestamp
        })
        setPartnerLocation({
          latitude: payload.latitude,
          longitude: payload.longitude,
          heading: payload.heading,
          speed: payload.speed,
          accuracy: payload.accuracy,
        })
        setIsLocationStale(Boolean(payload.isStale))

        if (payload.etaSeconds != null || payload.estimatedArrivalTimestamp) {
          setLiveEstimatedArrival({
            estimatedArrivalTimestamp: payload.estimatedArrivalTimestamp,
            etaSeconds: payload.etaSeconds,
            distanceRemainingMeters: payload.distanceRemainingMeters,
          })
        }

        // Recalculate route if 25s elapsed
        if (Date.now() - lastRouteFetchTimeRef.current > 25000) {
          fetchRouteForDelivery(deliveryId)
        }
      },
      (statusPayload: DeliveryStatusBroadcastPayload) => {
        if (statusPayload.deliveryId === deliveryId) {
          setTrackingInfo((prev) => {
            if (!prev || !prev.assignment) return prev
            return {
              ...prev,
              assignment: {
                ...prev.assignment,
                status: statusPayload.status,
              },
            }
          })
          fetchRouteForDelivery(deliveryId)
        }
      }
    )

    return () => {
      unsubStatus()
      unsubDelivery()
    }
  }, [trackingInfo?.assignment?.id, fetchRouteForDelivery])

  useEffect(() => {
    fetchTracking()
    // Fetch verified delivery partners from Delivery Partner Registry
    import("../features/commerceApi").then(({ adminApi }) => {
      adminApi
        .listDeliveryPartners()
        .then((items: any) => {
          if (Array.isArray(items) && items.length > 0) {
            setPartnersList(items)
          } else {
            // Fallback to customer query or driver default
            adminApi.listCustomers({ role: "delivery_partner" as any, limit: 50 }).then((res: any) => {
              const custItems = res?.items || []
              if (custItems.length > 0) {
                setPartnersList(custItems)
              } else {
                setPartnersList([
                  {
                    id: "f191b19b-58ae-4d03-a41c-6564ab022ad2",
                    fullName: "Ramesh Driver (driver@hindustanhardware.com)",
                    phone: "+918935926021",
                  },
                ])
              }
            })
          }
        })
        .catch(() => {
          setPartnersList([
            {
              id: "f191b19b-58ae-4d03-a41c-6564ab022ad2",
              fullName: "Ramesh Driver (driver@hindustanhardware.com)",
              phone: "+918935926021",
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
    pending: ["confirmed", "processing", "shipped", "cancelled"],
    confirmed: ["pending", "processing", "shipped", "cancelled"],
    processing: ["confirmed", "shipped", "cancelled"],
    shipped: ["processing", "cancelled"],
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
    const amount = Number(codAmount)
    if (!Number.isFinite(amount) || amount <= 0 || amount > amountDue) {
      setActionError("Enter an amount greater than zero and no more than the remaining due.")
      return
    }

    try {
      await collectCodPayment(amount, codMethod, codNotes.trim() || undefined)
      setCodModalOpen(false)
      setCodNotes("")
      setCodAmount("")
      setCodMethod("cash")
    } catch (err: any) {
      setActionError(err?.message || "Failed to record payment collection.")
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

  // Detect whether delivery partner is at destination
  const isTerminal = ["delivered", "failed", "cancelled"].includes(
    trackingInfo?.assignment?.status || ""
  )
  const destCoords = routeData?.destination || (
    trackingInfo?.destination?.latitude && trackingInfo?.destination?.longitude
      ? { latitude: trackingInfo.destination.latitude, longitude: trackingInfo.destination.longitude }
      : null
  )
  const isAtDestination = Boolean(
    !isTerminal &&
    (trackingInfo?.assignment?.status === "out_for_delivery" || trackingInfo?.assignment?.status === "picked_up") &&
    partnerLocation &&
    destCoords?.latitude &&
    destCoords?.longitude &&
    (() => {
      const R = 6371e3
      const lat1 = (partnerLocation.latitude * Math.PI) / 180
      const lat2 = (destCoords.latitude * Math.PI) / 180
      const dLat = ((destCoords.latitude - partnerLocation.latitude) * Math.PI) / 180
      const dLon = ((destCoords.longitude - partnerLocation.longitude) * Math.PI) / 180
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
      const distanceMeters = R * c
      return distanceMeters <= 85 || (routeData?.distanceMeters != null && routeData.distanceMeters <= 85)
    })()
  )

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

      {/* Top Highlights Banner */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-white p-4 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Status</span>
          <div className="mt-1 flex items-center gap-2">
            <Badge tone={statusTone(order.status as any)}>{order.status}</Badge>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-white p-4 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Amount</span>
          <p className="mt-1 text-base font-black text-slate-900">{formatPrice(order.totalAmount)}</p>
        </div>
        <div className="rounded-xl border border-border bg-white p-4 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Payment</span>
          <div className="mt-1 flex items-center gap-2">
            <Badge tone={order.paymentStatus === "paid" ? "success" : order.paymentStatus === "cancelled" ? "danger" : "warning"}>
              {order.paymentStatus}
            </Badge>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-white p-4 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Assigned Driver</span>
          <p className="mt-1 truncate text-xs font-bold text-slate-800">
            {trackingInfo?.assignment?.deliveryPartner?.fullName || (
              <span className="font-normal text-slate-400">Not assigned</span>
            )}
          </p>
        </div>
      </div>

      {/* Main 2-Column Responsive Workspace */}
      <div className="grid gap-6 lg:grid-cols-12 items-start">
        {/* Left Column: 7 Cols on desktop (Live Tracking & Items) */}
        <div className="space-y-6 lg:col-span-7">
          {/* 1. Live Fleet Dispatch & Real-Time Partner Navigation Map */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
            {/* Header matching Delivery Partner View */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-900 px-4 py-3 text-white">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-100 flex items-center gap-1.5">
                  <Truck size={15} className="text-accent" /> Live Fleet Dispatch & Navigation
                </span>

                {/* Real-time Socket Connection Badge */}
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    socketStatus === "connected"
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                      : socketStatus === "reconnecting"
                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse"
                      : "bg-red-500/20 text-red-300 border border-red-500/30"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      socketStatus === "connected"
                        ? "bg-emerald-400 animate-ping"
                        : socketStatus === "reconnecting"
                        ? "bg-amber-400"
                        : "bg-red-400"
                    }`}
                  />
                  <span>
                    {socketStatus === "connected"
                      ? "Live Connected"
                      : socketStatus === "reconnecting"
                      ? "Reconnecting..."
                      : "Disconnected"}
                  </span>
                </span>
              </div>

              <div className="flex items-center gap-2">
                {(liveEstimatedArrival || routeData) && (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-[#D4AF37] font-bold bg-slate-800 border border-slate-700 px-2.5 py-0.5 rounded-full shadow-xs">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                    <span>
                      {liveEstimatedArrival?.distanceRemainingMeters != null
                        ? `${(liveEstimatedArrival.distanceRemainingMeters / 1000).toFixed(1)} km`
                        : routeData
                        ? `${(routeData.distanceMeters / 1000).toFixed(1)} km`
                        : ""}
                    </span>
                    <span>•</span>
                    <span>
                      {liveEstimatedArrival?.etaSeconds != null
                        ? `ETA ~${Math.max(1, Math.ceil(liveEstimatedArrival.etaSeconds / 60))} mins`
                        : routeData
                        ? `~${Math.ceil(routeData.durationSeconds / 60)} mins`
                        : ""}
                    </span>
                    {liveEstimatedArrival?.estimatedArrivalTimestamp && (
                      <span className="text-[10px] text-slate-400 font-normal hidden sm:inline">
                        ({new Date(liveEstimatedArrival.estimatedArrivalTimestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})
                      </span>
                    )}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setAutoFollow((prev) => !prev)}
                  title={autoFollow ? "Auto-following location updates" : "Manual map panning"}
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold transition border ${
                    autoFollow
                      ? "bg-blue-500/20 text-blue-300 border-blue-400/40 shadow-xs"
                      : "bg-slate-800 text-slate-400 border-slate-700"
                  }`}
                >
                  <Crosshair size={12} className={autoFollow ? "text-blue-400 animate-pulse" : ""} />
                  <span>{autoFollow ? "Auto-Follow ON" : "Auto-Follow OFF"}</span>
                </button>
              </div>
            </div>

            {/* Stale Location Alert */}
            {isLocationStale && partnerLocation && (
              <div className="flex items-center justify-between border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
                <div className="flex items-center gap-2">
                  <AlertCircle size={15} className="text-amber-600 shrink-0" />
                  <span className="font-semibold text-amber-800">
                    Location signal delayed. Showing last verified GPS broadcast.
                  </span>
                </div>
                {lastLocationTimestamp && (
                  <span className="text-[11px] font-mono text-amber-700 shrink-0">
                    {new Date(lastLocationTimestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
              </div>
            )}

            {/* Partner Speed & Heading Telemetry Strip */}
            {partnerLocation && (
              <div className="flex flex-wrap items-center justify-between gap-2 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 px-4 py-2 text-xs text-white border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      isTerminal
                        ? "bg-slate-400"
                        : isAtDestination
                        ? "bg-amber-400 animate-ping"
                        : isLocationStale
                        ? "bg-amber-400"
                        : "bg-emerald-400 animate-ping"
                    }`}
                  />
                  <span className="font-bold text-accent">
                    {isAtDestination
                      ? "Driver At Destination"
                      : `Driver Active: ${trackingInfo?.assignment?.deliveryPartner?.fullName || "Assigned Driver"}`}
                  </span>
                  {isAtDestination && (
                    <span className="bg-amber-500/20 text-amber-300 font-bold px-2 py-0.5 rounded-full border border-amber-500/30 text-[10px] uppercase">
                      At Customer Location
                    </span>
                  )}
                  <span className="text-slate-400 hidden xs:inline">• Syncing via Socket.IO</span>
                </div>
                <div className="flex items-center gap-2.5 font-mono text-[11px]">
                  {partnerLocation.speed != null && (
                    <span className="bg-slate-800 text-slate-200 px-2 py-0.5 rounded font-bold border border-slate-700">
                      {Math.round(partnerLocation.speed * 3.6)} km/h
                    </span>
                  )}
                  {partnerLocation.heading != null && (
                    <span className="text-slate-300 flex items-center gap-1">
                      <Compass size={12} className="text-accent" />
                      {Math.round(partnerLocation.heading)}°
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Interactive Leaflet Map View */}
            <div className="relative h-[340px] w-full bg-slate-100">
              <LiveTrackingMap
                storeLocation={routeData?.store}
                partnerLocation={
                  partnerLocation
                    ? { latitude: partnerLocation.latitude, longitude: partnerLocation.longitude }
                    : null
                }
                markerMode="truck"
                partnerHeading={partnerLocation?.heading ?? null}
                autoFollow={autoFollow}
                isStale={isLocationStale}
                destinationLocation={
                  routeData?.destination ||
                  (trackingInfo?.destination?.latitude && trackingInfo?.destination?.longitude
                    ? { latitude: trackingInfo.destination.latitude, longitude: trackingInfo.destination.longitude }
                    : undefined)
                }
                routeCoordinates={routeData?.geometry?.coordinates}
                height="100%"
              />

              {!trackingInfo?.assignment && (
                <div className="absolute inset-0 z-[1000] flex flex-col items-center justify-center gap-2 bg-slate-900/60 p-4 text-center backdrop-blur-xs text-white">
                  <Truck size={32} className="text-accent opacity-80" />
                  <p className="text-sm font-bold">No Delivery Partner Assigned</p>
                  <p className="text-xs text-slate-300 max-w-xs">
                    Assign a driver using the "Partner Assignment" section on the right to start live tracking.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* 2. Ordered Items & Financial Summary */}
          <section className="rounded-xl border border-border bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-2">
                <Package size={18} className="text-slate-600" />
                <h2 className="text-base font-black text-slate-900">Ordered Items ({order.items.length})</h2>
              </div>
              <span className="text-xs font-medium text-slate-500">ID: {order.orderNumber}</span>
            </div>

            <div className="divide-y divide-border">
              {order.items.map((item) => (
                <div
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                  key={item.id}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold uppercase text-slate-400">
                      HH
                    </div>
                    <div className="min-w-0">
                      <b className="block text-sm leading-snug text-slate-900">{item.productName}</b>
                      <small className="block text-xs text-slate-500">
                        {item.sku ? `SKU: ${item.sku} · ` : ""}Qty: {item.quantity} × {formatPrice(item.unitPrice)}
                      </small>
                    </div>
                  </div>
                  <b className="self-end text-sm text-slate-900 sm:self-center sm:text-base">
                    {formatPrice(item.lineSubtotal)}
                  </b>
                </div>
              ))}
            </div>

            {/* Price Calculations */}
            <div className="mt-4 border-t border-border pt-4 space-y-2 text-sm text-slate-600">
              <div className="flex justify-between">
                <span>Items Subtotal</span>
                <span>{formatPrice(order.subtotal)}</span>
              </div>
              {order.shippingAmount > 0 && (
                <div className="flex justify-between">
                  <span>Delivery / Shipping Fee</span>
                  <span>{formatPrice(order.shippingAmount)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-border pt-3 text-base font-black text-slate-900">
                <span>Total Order Amount</span>
                <span className="text-lg text-brand">{formatPrice(order.totalAmount)}</span>
              </div>
            </div>
          </section>

          {/* 3. Status Timeline & Audit History */}
          <section className="rounded-xl border border-border bg-white p-5 shadow-xs">
            <div className="flex items-center gap-2 border-b border-border pb-3 mb-4">
              <Clock size={17} className="text-slate-600" />
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                Order Lifecycle Timeline
              </h2>
            </div>

            {/* Horizontal Timeline Bar: 5 Canonical Stages */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 mb-5">
              {[
                { status: "confirmed", label: "Order Confirmed" },
                { status: "dispatched", label: "Dispatched from Store" },
                { status: "out_for_delivery", label: "Out for Delivery" },
                { status: "at_destination", label: "At Destination" },
                { status: "delivered", label: "Order Delivered" },
              ].map((step, idx) => {
                const isDeliveredStep = order.status === "delivered" || trackingInfo?.assignment?.status === "delivered"
                const isAtDestStep = isAtDestination || isDeliveredStep
                const isOutForDeliveryStep =
                  trackingInfo?.assignment?.status === "out_for_delivery" || isAtDestStep
                const isDispatchedStep =
                  Boolean(trackingInfo?.assignment?.pickedUpAt || trackingInfo?.assignment?.status === "picked_up") ||
                  isOutForDeliveryStep ||
                  order.status === "shipped"

                let isPassedOrActive = false
                let isCurrent = false

                if (idx === 0) {
                  isPassedOrActive = order.status !== "cancelled"
                  isCurrent = !isDispatchedStep && !isDeliveredStep && order.status !== "cancelled"
                } else if (idx === 1) {
                  isPassedOrActive = isDispatchedStep
                  isCurrent = isDispatchedStep && !isOutForDeliveryStep
                } else if (idx === 2) {
                  isPassedOrActive = isOutForDeliveryStep
                  isCurrent = isOutForDeliveryStep && !isAtDestStep
                } else if (idx === 3) {
                  isPassedOrActive = isAtDestStep
                  isCurrent = isAtDestStep && !isDeliveredStep
                } else if (idx === 4) {
                  isPassedOrActive = isDeliveredStep
                  isCurrent = isDeliveredStep
                }

                return (
                  <div
                    key={step.status}
                    className={`rounded-xl border p-2 text-center transition ${
                      isCurrent
                        ? "border-[#0b2447] bg-[#0b2447] text-white shadow-xs font-bold"
                        : isPassedOrActive
                        ? "border-emerald-300 bg-emerald-50 text-emerald-900 font-semibold"
                        : "border-slate-200 bg-white text-slate-400 font-medium"
                    }`}
                  >
                    <span className="block text-[10px] uppercase tracking-wider opacity-75">
                      Step {idx + 1}
                    </span>
                    <span className="mt-0.5 block text-[11px] font-bold leading-tight">
                      {step.label}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* Audit Log list */}
            <div className="rounded-lg bg-slate-50 p-3.5 border border-slate-100">
              <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                Status Transitions
              </span>
              <div className="space-y-2.5">
                {order.statusHistory.length === 0 ? (
                  <p className="text-xs text-slate-400">No transitions logged yet.</p>
                ) : (
                  order.statusHistory.map((h) => (
                    <div key={h.id} className="flex items-start justify-between gap-3 text-xs">
                      <div>
                        <span className="font-bold text-slate-800 uppercase">
                          {h.previousStatus ? `${h.previousStatus} → ` : ""}{h.newStatus}
                        </span>
                        {h.reason && <p className="text-[11px] text-slate-500 mt-0.5">{h.reason}</p>}
                      </div>
                      <span className="shrink-0 font-mono text-[10px] text-slate-400">
                        {new Date(h.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
        </div>

        {/* Right Column: 5 Cols on desktop (Dispatch, Customer, Payment, Actions) */}
        <div className="space-y-5 lg:col-span-5">
          {/* Card 1: Dispatch & Delivery Partner Assignment */}
          <section className="rounded-xl border border-border bg-white p-5 shadow-xs space-y-3.5">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-black text-slate-900 flex items-center gap-2 text-sm">
                <Truck size={17} className="text-amber-500" /> Partner Assignment
              </h3>
              <Badge tone={isAtDestination ? "warning" : trackingInfo?.assignment ? "blue" : "neutral"}>
                {isAtDestination
                  ? "At Destination"
                  : trackingInfo?.assignment
                  ? trackingInfo.assignment.status.replace(/_/g, " ")
                  : "Unassigned"}
              </Badge>
            </div>

            {trackingInfo?.assignment ? (
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3.5 text-xs space-y-2.5">
                <div className="flex items-center gap-3 pb-2 border-b border-slate-200">
                  {trackingInfo.assignment.deliveryPartner?.avatarUrl ? (
                    <img
                      src={trackingInfo.assignment.deliveryPartner.avatarUrl}
                      alt={trackingInfo.assignment.deliveryPartner.fullName}
                      className="h-10 w-10 rounded-full object-cover border-2 border-amber-500 shrink-0 shadow-xs"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-amber-100 border border-amber-400 flex items-center justify-center text-amber-800 font-black text-sm shrink-0">
                      {trackingInfo.assignment.deliveryPartner?.fullName?.charAt(0)?.toUpperCase() || "P"}
                    </div>
                  )}
                  <div className="min-w-0">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-medium">Assigned Partner</span>
                    <b className="text-slate-900 font-bold text-sm block truncate">
                      {trackingInfo.assignment.deliveryPartner?.fullName || "Assigned Partner"}
                    </b>
                  </div>
                </div>
                {trackingInfo.assignment.deliveryPartner?.phone && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Driver Phone:</span>
                    <a
                      href={`tel:${trackingInfo.assignment.deliveryPartner.phone}`}
                      className="text-brand font-mono font-semibold hover:underline flex items-center gap-1"
                    >
                      <Phone size={11} />
                      {trackingInfo.assignment.deliveryPartner.phone}
                    </a>
                  </div>
                )}
                <div className="flex justify-between items-center pt-1 border-t border-slate-200">
                  <span className="text-slate-500">Dispatch Status:</span>
                  <span
                    className={`font-semibold capitalize px-2 py-0.5 rounded ${
                      isAtDestination
                        ? "text-amber-900 bg-amber-100 font-black animate-pulse"
                        : "text-amber-700 bg-amber-50"
                    }`}
                  >
                    {isAtDestination ? "At Destination" : trackingInfo.assignment.status.replace(/_/g, " ")}
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-slate-500 leading-relaxed">
                  Assign this order to a verified delivery partner so it appears on their partner portal.
                </p>
                <div className="space-y-2">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Select Verified Driver
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
                    {assigningPartner ? "Assigning Driver..." : "Assign to Driver"}
                  </Button>
                </div>
              </div>
            )}
          </section>

          {/* Card 2: Customer & Delivery Address Snapshot */}
          <section className="rounded-xl border border-border bg-white p-5 shadow-xs">
            <div className="flex items-center gap-2 border-b border-border pb-3">
              <User size={16} className="text-slate-600" />
              <h3 className="font-black text-slate-900 text-sm">Customer & Shipping Address</h3>
            </div>
            <div className="mt-3 text-xs leading-relaxed text-slate-600 space-y-1">
              <b className="text-slate-900 text-sm block">{shippingAddr.recipientName || "Valued Customer"}</b>
              {shippingAddr.phone && (
                <div className="flex items-center gap-1.5 text-slate-700">
                  <Phone size={12} className="text-slate-400" />
                  <span>{shippingAddr.phone}</span>
                </div>
              )}
              <div className="flex items-start gap-1.5 pt-1 text-slate-600">
                <MapPin size={13} className="text-slate-400 shrink-0 mt-0.5" />
                <span>
                  {shippingAddr.addressLine1}
                  {shippingAddr.addressLine2 ? `, ${shippingAddr.addressLine2}` : ""}
                  <br />
                  {shippingAddr.city}, {shippingAddr.state} {shippingAddr.postalCode}
                </span>
              </div>
            </div>
          </section>

          {/* Card 3: Payment & COD Details */}
          <section className="rounded-xl border border-border bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-black text-slate-900 text-sm flex items-center gap-1.5">
                <IndianRupee size={15} className="text-emerald-600" /> Payment Status
              </h3>
              <Badge tone={order.paymentStatus === "paid" ? "success" : order.paymentStatus === "cancelled" ? "danger" : "warning"}>
                {order.paymentStatus}
              </Badge>
            </div>
            <div className="mt-3 space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Payment Method:</span>
                <span className="font-semibold text-slate-800 uppercase">
                  {order.paymentMethod || "COD (Cash on Delivery)"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Order total:</span>
                <b className="text-slate-900">{formatPrice(order.totalAmount)}</b>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Amount collected:</span>
                <b className="text-emerald-700">{formatPrice(amountCollected)}</b>
              </div>
              <div className="flex justify-between items-center border-t border-border pt-2">
                <span className="font-bold text-slate-700">Remaining / Due:</span>
                <b className="text-amber-700 text-sm font-black">{formatPrice(amountDue)}</b>
              </div>
            </div>

            {amountDue > 0 && order.paymentStatus === "pending" && order.status !== "cancelled" && (
              <Button
                className="mt-4 w-full text-xs font-bold"
                variant="primary"
                disabled={actionLoading}
                onClick={() => {
                  setCodAmount(amountDue.toFixed(2))
                  setCodMethod("cash")
                  setCodModalOpen(true)
                }}
              >
                <CheckCircle2 size={15} /> Record Payment
              </Button>
            )}

            <div className="mt-4 border-t border-border pt-3">
              <h4 className="text-xs font-bold text-slate-700">Collection history</h4>
              {order.paymentCollections?.length ? (
                <div className="mt-2 max-h-40 space-y-2 overflow-y-auto">
                  {order.paymentCollections.map((payment) => (
                    <div key={payment.id} className="flex items-start justify-between gap-3 text-xs">
                      <div className="min-w-0">
                        <b className="block capitalize text-slate-800">{payment.method}</b>
                        <span className="block text-slate-500">
                          {new Date(payment.createdAt).toLocaleString()}
                        </span>
                        {payment.notes && (
                          <span className="block break-words text-slate-500">{payment.notes}</span>
                        )}
                      </div>
                      <b className="shrink-0 text-emerald-700">{formatPrice(payment.amount)}</b>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-1 text-[11px] text-slate-500">
                  {amountCollected > 0
                    ? "This payment was recorded before collection history was enabled."
                    : "No payments recorded yet."}
                </p>
              )}
            </div>
          </section>

          {/* Card 4: Order Milestone Status Controller */}
          <section className="rounded-xl border border-border bg-white p-5 shadow-xs">
            <h3 className="font-black text-slate-900 text-sm">Update Order Milestone</h3>
            <p className="text-[11px] text-slate-500 mt-1 mb-3">
              Advances order status; the assigned delivery partner completes delivery after OTP verification.
            </p>

            <div className="space-y-1.5">
              {[
                { status: "confirmed", label: "1. Confirm Order" },
                { status: "shipped", label: "2. Dispatched from Store" },
              ].map((step) => {
                const isCurrent = order.status === step.status || (step.status === "confirmed" && order.status === "processing")
                return (
                  <button
                    key={step.status}
                    type="button"
                    disabled={actionLoading || isCurrent}
                    onClick={() => handleStatusTransition(step.status)}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-bold transition cursor-pointer border ${
                      isCurrent
                        ? "bg-[#0b2447] text-white border-[#0b2447] shadow-xs cursor-default"
                        : "bg-white text-slate-800 border-slate-200 hover:border-[#0b2447] hover:bg-slate-50"
                    } ${actionLoading ? "opacity-60 cursor-not-allowed" : ""}`}
                  >
                    <span>{step.label}</span>
                    {isCurrent ? (
                      <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                    ) : (
                      <span className="h-3.5 w-3.5 rounded-full border border-slate-300 shrink-0" />
                    )}
                  </button>
                )
              })}

              {order.status !== "cancelled" && order.status !== "delivered" && (
                <Button
                  className="w-full mt-3 text-xs"
                  variant="danger"
                  disabled={actionLoading}
                  onClick={() => setCancelModalOpen(true)}
                >
                  <Trash2 size={13} /> Cancel Order
                </Button>
              )}
            </div>
          </section>

          {/* Card 5: Invoice Document Card */}
          <section className="rounded-xl border border-border bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-black text-slate-900 text-sm flex items-center gap-1.5">
                <FileText size={15} className="text-slate-600" /> Invoice Document
              </h3>
              <Badge tone={order.invoiceUrl ? "success" : "neutral"}>
                {order.invoiceUrl ? "Attached" : "Not uploaded"}
              </Badge>
            </div>

            {order.invoiceUrl ? (
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs space-y-1.5">
                <div className="font-medium text-slate-800 truncate" title={order.invoiceFileName || "invoice.pdf"}>
                  📄 {order.invoiceFileName || "invoice.pdf"}
                </div>
                {order.invoiceUploadedAt && (
                  <div className="text-[10px] text-slate-400">
                    Uploaded: {new Date(order.invoiceUploadedAt).toLocaleString()}
                  </div>
                )}
                <div className="pt-1">
                  <a
                    href={order.invoiceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-brand hover:underline"
                  >
                    <Eye size={12} /> View Invoice
                  </a>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-500">
                Upload an official PDF or invoice image for the customer.
              </p>
            )}

            <div className="mt-3">
              <Button
                variant={order.invoiceUrl ? "outline" : "primary"}
                className="w-full text-xs flex items-center justify-center gap-1.5"
                disabled={uploadingInvoice || actionLoading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploadingInvoice ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Upload size={13} />
                )}
                {uploadingInvoice
                  ? "Uploading..."
                  : order.invoiceUrl
                  ? "Re-upload / Change Invoice"
                  : "Upload Invoice PDF"}
              </Button>
            </div>
          </section>
        </div>
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
            <h2 className="mt-4 text-xl font-black">Record payment collection</h2>
            <p className="mt-2 text-sm text-slate-500">
              Record a partial or final payment for {order.orderNumber}. The remaining balance updates automatically.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-3 text-left">
              <div className="rounded-lg bg-slate-50 p-3">
                <span className="block text-xs text-slate-500">Total amount</span>
                <b className="text-sm text-slate-900">{formatPrice(order.totalAmount)}</b>
              </div>
              <div className="rounded-lg bg-amber-50 p-3">
                <span className="block text-xs text-amber-700">Currently due</span>
                <b className="text-sm text-amber-800">{formatPrice(amountDue)}</b>
              </div>
            </div>

            <label className="field-label mt-4 block text-left">
              Amount collected
              <input
                className="field mt-1.5"
                type="number"
                min="0.01"
                max={amountDue}
                step="0.01"
                value={codAmount}
                onChange={(e) => setCodAmount(e.target.value)}
                required
              />
            </label>

            <label className="field-label mt-4 block text-left">
              Collected via
              <select
                className="field mt-1.5"
                value={codMethod}
                onChange={(e) => setCodMethod(e.target.value as "cash" | "online")}
              >
                <option value="cash">Cash</option>
                <option value="online">Online</option>
              </select>
            </label>

            <div className="mt-3 flex items-center justify-between rounded-lg border border-border p-3 text-sm">
              <span className="font-semibold text-slate-600">Remaining after this payment</span>
              <b className="text-amber-700">
                {formatPrice(Math.max(0, amountDue - (Number(codAmount) || 0)))}
              </b>
            </div>

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
                disabled={
                  actionLoading ||
                  !Number.isFinite(Number(codAmount)) ||
                  Number(codAmount) <= 0 ||
                  Number(codAmount) > amountDue
                }
                onClick={handleCollectCod}
              >
                {actionLoading ? "Recording..." : "Record Amount"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
