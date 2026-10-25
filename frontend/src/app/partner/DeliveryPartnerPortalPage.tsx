import {
  AlertCircle,
  Banknote,
  CheckCircle2,
  Clock,
  Compass,
  Crosshair,
  LogOut,
  MapPin,
  Maximize2,
  Minimize2,
  Navigation,
  Package,
  Phone,
  RefreshCw,
  Shield,
  Truck
} from "lucide-react"
import { useCallback, useEffect, useState, useRef } from "react"
import { useAuth } from "../authContext"
import { Badge } from "../components"
import {
  DeliveryPartnerGpsController,
  type DeliveryPartnerLocationUpdate,
} from "../components/DeliveryPartnerGpsController"
import { LiveTrackingMap } from "../components/LiveTrackingMap"
import {
  deliveryTrackingApi,
  type AssignedDeliveryItem,
  type DeliveryRouteResponse,
} from "../features/deliveryTrackingApi"
import {
  trackingSocketService,
  type DeliveryLocationBroadcastPayload,
  type DeliveryStatusBroadcastPayload,
} from "../features/trackingSocketService"

export function DeliveryPartnerPortalPage() {
  const { user, logout } = useAuth()
  const [activeTab, setActiveTab] = useState<"active" | "history">("active")
  const [deliveries, setDeliveries] = useState<AssignedDeliveryItem[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string | null>(null)
  const [routeData, setRouteData] = useState<DeliveryRouteResponse | null>(null)
  const [routeLoading, setRouteLoading] = useState<boolean>(false)
  const [isRideActive, setIsRideActive] = useState<boolean>(false)
  const [autoFollow, setAutoFollow] = useState<boolean>(true)
  const [isFullScreenNav, setIsFullScreenNav] = useState<boolean>(false)
  const [partnerLocationInfo, setPartnerLocationInfo] = useState<DeliveryPartnerLocationUpdate | null>(null)
  const [socketStatus, setSocketStatus] = useState<"connected" | "reconnecting" | "disconnected">("disconnected")
  const [isLocationStale, setIsLocationStale] = useState<boolean>(false)
  const [lastLocationTimestamp, setLastLocationTimestamp] = useState<string | null>(null)
  const lastRouteFetchTimeRef = useRef<number>(0)

  const fetchDeliveries = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await deliveryTrackingApi.getAssignedDeliveries({
        limit: 50,
      })
      const items = res?.items || []
      setDeliveries(items)

      // Auto-select first active delivery if none selected
      const activeList = items.filter((d) =>
        ["assigned", "picked_up", "out_for_delivery"].includes(d.status)
      )
      if (activeList.length > 0 && (!selectedDeliveryId || !items.some(i => i.id === selectedDeliveryId))) {
        setSelectedDeliveryId(activeList[0].id)
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load assigned deliveries.")
    } finally {
      setLoading(false)
    }
  }, [selectedDeliveryId])

  useEffect(() => {
    fetchDeliveries()
  }, [])

  const activeDeliveries = deliveries.filter((d) =>
    ["assigned", "picked_up", "out_for_delivery"].includes(d.status)
  )
  const completedDeliveries = deliveries.filter((d) =>
    ["delivered", "failed", "cancelled"].includes(d.status)
  )

  const currentDelivery = deliveries.find((d) => d.id === selectedDeliveryId) || activeDeliveries[0]

  const fetchRouteForDelivery = useCallback(async (deliveryId: string) => {
    setRouteLoading(true)
    try {
      const res = await deliveryTrackingApi.getDeliveryRoute(deliveryId)
      setRouteData(res)
      lastRouteFetchTimeRef.current = Date.now()
    } catch {
      setRouteData(null)
    } finally {
      setRouteLoading(false)
    }
  }, [])

  // 1. Initial Load: Fetch last persisted location from database so map never starts empty
  useEffect(() => {
    if (!currentDelivery?.id) {
      setPartnerLocationInfo(null)
      setLastLocationTimestamp(null)
      setIsLocationStale(false)
      return
    }

    deliveryTrackingApi
      .getLatestLocation(currentDelivery.id)
      .then((res) => {
        if (res?.latestLocation) {
          const loc = res.latestLocation
          setPartnerLocationInfo({
            latitude: Number(loc.latitude),
            longitude: Number(loc.longitude),
            heading: loc.heading,
            speed: loc.speed,
            accuracy: loc.accuracy,
          })
          setLastLocationTimestamp(loc.deviceTimestamp || loc.serverReceivedAt || null)
          setIsLocationStale(Boolean(loc.isStale))
        }
      })
      .catch(() => {})
  }, [currentDelivery?.id])

  // 2. Real-Time Socket.IO Subscription to Delivery Room
  useEffect(() => {
    if (!currentDelivery?.id) return

    const deliveryId = currentDelivery.id

    // Monitor socket connection state
    const unsubStatus = trackingSocketService.onConnectionStatusChange((status) => {
      setSocketStatus(status)
      // When reconnected, refresh latest persisted location from DB
      if (status === "connected") {
        deliveryTrackingApi
          .getLatestLocation(deliveryId)
          .then((res) => {
            if (res?.latestLocation) {
              const loc = res.latestLocation
              setPartnerLocationInfo((prev) => {
                // Avoid out-of-order overwrite
                if (
                  prev &&
                  lastLocationTimestamp &&
                  loc.deviceTimestamp &&
                  new Date(loc.deviceTimestamp).getTime() < new Date(lastLocationTimestamp).getTime()
                ) {
                  return prev
                }
                return {
                  latitude: Number(loc.latitude),
                  longitude: Number(loc.longitude),
                  heading: loc.heading,
                  speed: loc.speed,
                  accuracy: loc.accuracy,
                }
              })
              setLastLocationTimestamp(loc.deviceTimestamp || loc.serverReceivedAt || null)
              setIsLocationStale(Boolean(loc.isStale))
            }
          })
          .catch(() => {})
      }
    })

    // Subscribe to real-time events for this delivery
    const unsubDelivery = trackingSocketService.subscribeToDelivery(
      deliveryId,
      (payload: DeliveryLocationBroadcastPayload) => {
        // Discard out-of-order timestamp updates
        setLastLocationTimestamp((prevTime) => {
          if (prevTime && payload.deviceTimestamp && new Date(payload.deviceTimestamp).getTime() < new Date(prevTime).getTime()) {
            return prevTime
          }
          return payload.deviceTimestamp
        })

        setPartnerLocationInfo({
          latitude: payload.latitude,
          longitude: payload.longitude,
          heading: payload.heading,
          speed: payload.speed,
          accuracy: payload.accuracy,
        })
        setIsLocationStale(Boolean(payload.isStale))

        // Recalculate route if significant distance or time elapsed
        if (Date.now() - lastRouteFetchTimeRef.current > 25000) {
          fetchRouteForDelivery(deliveryId)
        }
      },
      (statusPayload: DeliveryStatusBroadcastPayload) => {
        if (statusPayload.deliveryId === deliveryId) {
          setDeliveries((prev) =>
            prev.map((d) => (d.id === deliveryId ? { ...d, status: statusPayload.status as any } : d))
          )
          fetchRouteForDelivery(deliveryId)
        }
      }
    )

    return () => {
      unsubStatus()
      unsubDelivery()
    }
  }, [currentDelivery?.id, fetchRouteForDelivery, lastLocationTimestamp])

  useEffect(() => {
    if (!currentDelivery?.id) {
      setRouteData(null)
      return
    }

    fetchRouteForDelivery(currentDelivery.id)
  }, [currentDelivery?.id, currentDelivery?.status, fetchRouteForDelivery])

  const handleLocationUpdate = useCallback((coords: DeliveryPartnerLocationUpdate | null) => {
    if (coords) {
      setPartnerLocationInfo(coords)
      setLastLocationTimestamp(new Date().toISOString())
      setIsLocationStale(false)
      // If partner is moving and it has been more than 25 seconds since last road route recalculation, update route
      if (currentDelivery?.id && Date.now() - lastRouteFetchTimeRef.current > 25000) {
        fetchRouteForDelivery(currentDelivery.id)
      }
    }
  }, [currentDelivery?.id, fetchRouteForDelivery])

  const handleStatusChange = (newStatus: string) => {
    setDeliveries((prev) =>
      prev.map((d) => (d.id === selectedDeliveryId ? { ...d, status: newStatus as any } : d))
    )
    if (currentDelivery?.id) {
      // Immediately refresh route and ETA on status change
      fetchRouteForDelivery(currentDelivery.id)
    }
  }

  const formatDateTime = (iso?: string | null) => {
    if (!iso) return "--"
    try {
      return new Intl.DateTimeFormat("en-IN", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(iso))
    } catch {
      return iso
    }
  }

  const getStatusTone = (status: string): "success" | "blue" | "warning" | "danger" | "neutral" => {
    switch (status) {
      case "delivered":
        return "success"
      case "out_for_delivery":
        return "blue"
      case "picked_up":
        return "warning"
      case "failed":
      case "cancelled":
        return "danger"
      default:
        return "neutral"
    }
  }

  return (
    <div className="min-h-screen bg-[#F5F5F5] text-slate-900 pb-16 font-sans">
      {/* Driver Header — Signature Black & Gold Hindustan Hardware Theme */}
      <header className="sticky top-0 z-30 bg-[#0B0B0B]/95 backdrop-blur-md border-b border-[#1C1C1C] px-3.5 py-2.5 sm:px-6 sm:py-3.5 shadow-md">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-gradient-to-br from-[#E5C158] via-[#D4AF37] to-[#AA841E] flex items-center justify-center text-[#0B0B0B] font-black shadow-md shadow-[#D4AF37]/25 shrink-0 border border-[#E5C158]">
              <Truck size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="text-[10px] sm:text-[11px] font-extrabold uppercase tracking-widest text-[#D4AF37] truncate font-serif">
                  Hindustan Partner
                </span>
                <span className="hidden xs:inline-flex items-center gap-1 text-[9px] sm:text-[10px] bg-[#1C1C1C] border border-[#2A2A2A] px-2 py-0.5 rounded-full text-slate-200 font-mono shrink-0">
                  <Shield size={10} className="text-[#D4AF37]" />
                  Verified Fleet
                </span>
              </div>
              <h1 className="text-sm sm:text-base font-black text-white leading-tight truncate">
                {user?.profile?.full_name || user?.email || "Partner"}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={fetchDeliveries}
              disabled={loading}
              title="Refresh assignments"
              className="p-2 rounded-xl bg-[#181818] text-slate-300 hover:text-[#D4AF37] hover:bg-[#222222] border border-[#2C2C2C] transition-all shadow-sm"
            >
              <RefreshCw size={15} className={loading ? "animate-spin text-[#D4AF37]" : ""} />
            </button>
            <button
              onClick={() => logout()}
              title="Sign out"
              className="px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl bg-[#181818] text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 border border-[#2C2C2C] text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
            >
              <LogOut size={14} />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-4xl mx-auto px-3.5 sm:px-6 pt-5 sm:pt-6 space-y-4 sm:space-y-5">
        {/* Metric Badges Strip */}
        <section className="grid grid-cols-3 gap-2.5 sm:gap-4">
          <div className="rounded-2xl bg-white border border-slate-200/90 p-3 sm:p-4 text-center min-w-0 shadow-xs hover:border-[#D4AF37]/50 transition-colors">
            <span className="block text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 truncate">Active Dispatches</span>
            <span className="text-xl sm:text-2xl font-black text-[#B89124]">{activeDeliveries.length}</span>
          </div>
          <div className="rounded-2xl bg-white border border-slate-200/90 p-3 sm:p-4 text-center min-w-0 shadow-xs hover:border-emerald-300 transition-colors">
            <span className="block text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 truncate">Delivered</span>
            <span className="text-xl sm:text-2xl font-black text-emerald-600">{completedDeliveries.length}</span>
          </div>
          <div className="rounded-2xl bg-white border border-slate-200/90 p-3 sm:p-4 text-center min-w-0 shadow-xs hover:border-slate-300 transition-colors">
            <span className="block text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 truncate">Total Orders</span>
            <span className="text-xl sm:text-2xl font-black text-[#0B0B0B]">{deliveries.length}</span>
          </div>
        </section>

        {/* View Selection Tabs */}
        <div className="flex border-b border-slate-200 gap-4 sm:gap-6 text-xs sm:text-sm font-bold overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveTab("active")}
            className={`pb-3 flex items-center gap-1.5 sm:gap-2 border-b-2 whitespace-nowrap transition font-bold ${
              activeTab === "active"
                ? "border-[#D4AF37] text-[#0B0B0B]"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Package size={16} className={activeTab === "active" ? "text-[#B89124]" : ""} />
            <span>Active Deliveries ({activeDeliveries.length})</span>
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`pb-3 flex items-center gap-1.5 sm:gap-2 border-b-2 whitespace-nowrap transition font-bold ${
              activeTab === "history"
                ? "border-[#D4AF37] text-[#0B0B0B]"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Clock size={16} className={activeTab === "history" ? "text-[#B89124]" : ""} />
            <span>Delivery History ({completedDeliveries.length})</span>
          </button>
        </div>

        {/* Error State */}
        {error && (
          <div className="rounded-2xl bg-red-50 border border-red-200 p-4 flex items-start gap-3 text-red-900 text-sm shadow-xs">
            <AlertCircle size={18} className="text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <b className="block text-red-950 font-bold">Failed to sync delivery assignments</b>
              <p className="mt-0.5 text-xs text-red-700">{error}</p>
            </div>
            <button
              onClick={fetchDeliveries}
              className="text-xs bg-red-600 hover:bg-red-700 text-white font-bold px-3 py-1.5 rounded-lg transition"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading Skeleton */}
        {loading && deliveries.length === 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center space-y-3 shadow-xs">
            <div className="h-8 w-8 mx-auto animate-spin rounded-full border-4 border-[#D4AF37] border-t-transparent" />
            <p className="text-sm font-semibold text-slate-600">Loading your assigned deliveries...</p>
          </div>
        )}

        {/* Active Tab View */}
        {activeTab === "active" && !loading && (
          <div className="space-y-5">
            {activeDeliveries.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center space-y-3 shadow-xs">
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#FFF9E6] border border-[#F3E5AB] text-[#B89124]">
                  <CheckCircle2 size={30} />
                </div>
                <h3 className="text-lg font-black text-[#0B0B0B]">No Active Deliveries</h3>
                <p className="text-sm text-slate-500 max-w-sm mx-auto leading-relaxed">
                  You are fully caught up! When an administrator assigns a delivery dispatch to you, it will appear right here.
                </p>
                <button
                  onClick={fetchDeliveries}
                  className="btn-gold-gradient inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-bold transition shadow-sm mt-2"
                >
                  <RefreshCw size={14} /> Check for New Dispatches
                </button>
              </div>
            ) : (
              <>
                {/* Active Deliveries Selector (if multiple) */}
                {activeDeliveries.length > 1 && (
                  <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
                    {activeDeliveries.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => setSelectedDeliveryId(item.id)}
                        className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition border ${
                          currentDelivery?.id === item.id
                            ? "btn-gold-gradient text-[#0B0B0B] border-[#D4AF37]"
                            : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        {item.orderNumber} • <span className="capitalize">{item.status.replace(/_/g, " ")}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Selected Active Delivery Detail Card */}
                {currentDelivery && (
                  <div className="space-y-4">
                    {/* Destination & Order Highlights */}
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 space-y-4 shadow-sm min-w-0">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3.5">
                        <div className="min-w-0">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                            Current Order Reference
                          </span>
                          <h2 className="text-base sm:text-lg font-black text-[#0B0B0B] truncate">
                            {currentDelivery.orderNumber}
                          </h2>
                        </div>
                        <Badge tone={getStatusTone(currentDelivery.status)}>
                          <span className="capitalize">{currentDelivery.status.replace(/_/g, " ")}</span>
                        </Badge>
                      </div>

                      {/* Cash on Delivery Banner */}
                      {currentDelivery.codAmount != null && (
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl bg-gradient-to-r from-[#FFF9E6] via-[#FFFDF5] to-white border border-[#E5C158]/70 p-3.5 sm:px-4 sm:py-3.5 text-[#0B0B0B] shadow-xs">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="h-8 w-8 rounded-lg bg-[#D4AF37]/20 border border-[#D4AF37]/40 flex items-center justify-center shrink-0">
                              <Banknote size={18} className="text-[#B89124]" />
                            </div>
                            <div className="min-w-0">
                              <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider block text-[#8F6B12] truncate">
                                Cash on Delivery (COD)
                              </span>
                              <span className="text-[11px] sm:text-xs text-slate-600 block">
                                Collect cash payment upon final delivery
                              </span>
                            </div>
                          </div>
                          <span className="text-lg sm:text-xl font-black font-mono text-[#0B0B0B] self-end sm:self-auto">
                            ₹{currentDelivery.codAmount.toLocaleString("en-IN")}
                          </span>
                        </div>
                      )}

                      {/* Delivery Address & Contact */}
                      <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-4 space-y-3 min-w-0">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="h-7 w-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0 mt-0.5 text-[#B89124]">
                            <MapPin size={16} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                              Delivery Destination
                            </span>
                            <h3 className="text-xs sm:text-sm font-bold text-[#0B0B0B] mt-0.5 break-words">
                              {currentDelivery.destination.recipientName}
                            </h3>
                            <p className="text-xs text-slate-600 mt-1 leading-relaxed break-words">
                              {currentDelivery.destination.addressLine1}
                              {currentDelivery.destination.addressLine2 ? `, ${currentDelivery.destination.addressLine2}` : ""}
                              {currentDelivery.destination.landmark ? ` (Near: ${currentDelivery.destination.landmark})` : ""}
                              <br />
                              {currentDelivery.destination.city}, {currentDelivery.destination.state} - {currentDelivery.destination.postalCode}
                            </p>
                          </div>
                        </div>

                        {/* Action buttons: Call Customer & Turn-by-Turn Directions in Maps */}
                        <div className="pt-3 border-t border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5">
                          <a
                            href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                              `${currentDelivery.destination.addressLine1}, ${currentDelivery.destination.city}, ${currentDelivery.destination.state}`
                            )}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-cart-gradient w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition shadow-xs"
                          >
                            <Navigation size={14} className="text-[#D4AF37]" /> Open in Google Maps
                          </a>
                          {currentDelivery.destination.phone && (
                            <a
                              href={`tel:${currentDelivery.destination.phone}`}
                              className="btn-gold-gradient w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold text-[#0B0B0B] transition shadow-xs"
                            >
                              <Phone size={14} /> Call Customer ({currentDelivery.destination.phone})
                            </a>
                          )}
                        </div>
                      </div>

                      {/* Package Item Summary */}
                      {currentDelivery.itemsSummary && currentDelivery.itemsSummary.length > 0 && (
                        <div className="space-y-2">
                          <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                            Package Contents ({currentDelivery.itemsSummary.length} items)
                          </span>
                          <div className="rounded-xl bg-slate-50 border border-slate-200 divide-y divide-slate-200 text-xs">
                            {currentDelivery.itemsSummary.map((item, idx) => (
                              <div key={idx} className="p-3 flex items-center justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <span className="font-semibold text-slate-800 block truncate">{item.productName}</span>
                                  {item.variantTitle && (
                                    <span className="block text-[11px] text-slate-500 truncate">{item.variantTitle}</span>
                                  )}
                                </div>
                                <span className="font-mono font-bold text-slate-700 bg-white border border-slate-200 px-2 py-0.5 rounded-md shrink-0">
                                  x{item.quantity}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Live Delivery Route & Real-Time Tracking Map */}
                      <div className="space-y-2 pt-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                              <Truck size={14} className="text-[#B89124]" /> Live Fleet Dispatch & Navigation
                            </span>
                            {/* Real-time Socket Connection Badge */}
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                socketStatus === "connected"
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : socketStatus === "reconnecting"
                                    ? "bg-amber-50 text-amber-700 border border-amber-200 animate-pulse"
                                    : "bg-red-50 text-red-700 border border-red-200"
                              }`}
                            >
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${
                                  socketStatus === "connected"
                                    ? "bg-emerald-500 animate-ping"
                                    : socketStatus === "reconnecting"
                                      ? "bg-amber-500"
                                      : "bg-red-500"
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
                            {routeData && (
                              <span className="text-[11px] font-mono text-[#8F6B12] font-bold bg-[#FFF9E6] border border-[#F3E5AB] px-2 py-0.5 rounded-full">
                                {(routeData.distanceMeters / 1000).toFixed(1)} km • ~{Math.ceil(routeData.durationSeconds / 60)} mins
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => setAutoFollow((prev) => !prev)}
                              title={autoFollow ? "Auto-following location updates" : "Manual map panning"}
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold transition border ${
                                autoFollow
                                  ? "bg-blue-50 text-blue-700 border-blue-200 shadow-xs"
                                  : "bg-slate-100 text-slate-600 border-slate-200"
                              }`}
                            >
                              <Crosshair size={12} className={autoFollow ? "text-blue-600 animate-pulse" : ""} />
                              <span>{autoFollow ? "Auto-Follow ON" : "Auto-Follow OFF"}</span>
                            </button>

                            {/* Full-Screen Google Maps Navigation Button */}
                            <button
                              type="button"
                              onClick={() => setIsFullScreenNav(true)}
                              title="Enter Full Screen Turn-by-Turn Navigation"
                              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[#0b2447] text-white hover:bg-[#19376d] transition shadow-xs"
                            >
                              <Maximize2 size={13} className="text-[#D4AF37]" />
                              <span>Full Screen</span>
                            </button>
                          </div>
                        </div>

                        {/* Stale Warning Banner */}
                        {isLocationStale && partnerLocationInfo && (
                          <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900 shadow-xs">
                            <div className="flex items-center gap-2">
                              <AlertCircle size={15} className="text-amber-600 shrink-0" />
                              <span className="font-semibold text-amber-800">
                                Location signal delayed. Displaying last verified GPS broadcast.
                              </span>
                            </div>
                            {lastLocationTimestamp && (
                              <span className="text-[11px] font-mono text-amber-700 shrink-0">
                                {formatDateTime(lastLocationTimestamp)}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Live Tracking Active Banner */}
                        {partnerLocationInfo && (
                          <div className="flex items-center justify-between px-3 py-2 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white rounded-xl text-xs border border-slate-700 shadow-xs">
                            <div className="flex items-center gap-2">
                              <span className={`h-2 w-2 rounded-full ${isLocationStale ? "bg-amber-400" : "bg-emerald-400 animate-ping"}`} />
                              <span className="font-bold text-[#D4AF37]">
                                {isRideActive ? "Device GPS Broadcasting" : "Live Location Tracking"}
                              </span>
                              <span className="text-slate-400 hidden xs:inline">• Syncing via Socket.IO</span>
                            </div>
                            <div className="flex items-center gap-2.5 font-mono text-[11px]">
                              {partnerLocationInfo.speed != null && (
                                <span className="bg-slate-800 text-slate-200 px-2 py-0.5 rounded font-bold border border-slate-700">
                                  {Math.round(partnerLocationInfo.speed * 3.6)} km/h
                                </span>
                              )}
                              {partnerLocationInfo.heading != null && (
                                <span className="text-slate-300 flex items-center gap-1">
                                  <Compass size={12} className="text-[#D4AF37]" />
                                  {Math.round(partnerLocationInfo.heading)}°
                                </span>
                              )}
                              {lastLocationTimestamp && (
                                <span className="text-slate-400 hidden sm:inline">
                                  {formatDateTime(lastLocationTimestamp)}
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs h-[300px] sm:h-[340px] w-full">
                          <LiveTrackingMap
                            storeLocation={routeData?.store}
                            partnerLocation={
                              partnerLocationInfo
                                ? { latitude: partnerLocationInfo.latitude, longitude: partnerLocationInfo.longitude }
                                : null
                            }
                            markerMode="navigation"
                            partnerHeading={partnerLocationInfo?.heading ?? null}
                            autoFollow={autoFollow}
                            isStale={isLocationStale}
                            destinationLocation={
                              routeData?.destination ||
                              (currentDelivery.destination.latitude && currentDelivery.destination.longitude
                                ? { latitude: currentDelivery.destination.latitude, longitude: currentDelivery.destination.longitude }
                                : undefined)
                            }
                            routeCoordinates={routeData?.geometry?.coordinates}
                            height="100%"
                          />
                        </div>

                        {/* Full Screen Google Maps Style Navigation Modal */}
                        {isFullScreenNav && (
                          <div className="fixed inset-0 z-[9999] bg-slate-950 flex flex-col">
                            {/* Google Maps Style Navigation Top Bar */}
                            <div className="absolute top-0 left-0 right-0 z-[10000] p-3 sm:p-4 bg-gradient-to-b from-slate-950/90 via-slate-950/60 to-transparent pointer-events-none">
                              <div className="flex items-center justify-between pointer-events-auto">
                                <div className="flex items-center gap-2.5 rounded-2xl bg-emerald-700 text-white px-4 py-2.5 shadow-xl border border-emerald-500/30">
                                  <Navigation size={22} className="text-emerald-100 fill-emerald-100 shrink-0 animate-pulse" />
                                  <div>
                                    <span className="block text-[11px] font-bold uppercase tracking-wider text-emerald-200">
                                      Turn-by-Turn Navigation
                                    </span>
                                    <span className="block text-sm sm:text-base font-black">
                                      Heading to {currentDelivery.destination.recipientName}
                                    </span>
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => setIsFullScreenNav(false)}
                                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-white font-bold text-xs shadow-lg border border-slate-700 transition"
                                >
                                  <Minimize2 size={16} className="text-[#D4AF37]" />
                                  <span>Exit Navigation</span>
                                </button>
                              </div>
                            </div>

                            {/* Full Map Canvas */}
                            <div className="h-full w-full flex-1">
                              <LiveTrackingMap
                                storeLocation={routeData?.store}
                                partnerLocation={
                                  partnerLocationInfo
                                    ? { latitude: partnerLocationInfo.latitude, longitude: partnerLocationInfo.longitude }
                                    : null
                                }
                                markerMode="navigation"
                                partnerHeading={partnerLocationInfo?.heading ?? null}
                                autoFollow={autoFollow}
                                isStale={isLocationStale}
                                destinationLocation={
                                  routeData?.destination ||
                                  (currentDelivery.destination.latitude && currentDelivery.destination.longitude
                                    ? { latitude: currentDelivery.destination.latitude, longitude: currentDelivery.destination.longitude }
                                    : undefined)
                                }
                                routeCoordinates={routeData?.geometry?.coordinates}
                                height="100%"
                              />
                            </div>

                            {/* Google Maps Style Navigation Bottom Floating Card */}
                            <div className="absolute bottom-4 left-3 right-3 sm:left-6 sm:right-6 z-[10000] pointer-events-auto">
                              <div className="mx-auto max-w-xl rounded-2xl bg-slate-900/95 p-4 text-white shadow-2xl border border-slate-800 backdrop-blur-md">
                                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                                  <div className="flex items-center gap-3">
                                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 font-mono text-xl font-black border border-emerald-500/30">
                                      {partnerLocationInfo?.speed != null ? Math.round(partnerLocationInfo.speed * 3.6) : 0}
                                      <span className="text-[10px] ml-0.5">km/h</span>
                                    </div>
                                    <div>
                                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                                        Destination Address
                                      </span>
                                      <span className="text-xs sm:text-sm font-semibold text-slate-200 line-clamp-1">
                                        {currentDelivery.destination.addressLine1}, {currentDelivery.destination.city}
                                      </span>
                                    </div>
                                  </div>

                                  {routeData && (
                                    <div className="text-right">
                                      <span className="text-lg sm:text-xl font-black text-[#D4AF37] block">
                                        ~{Math.ceil(routeData.durationSeconds / 60)} min
                                      </span>
                                      <span className="text-xs text-slate-400 font-mono">
                                        {(routeData.distanceMeters / 1000).toFixed(1)} km left
                                      </span>
                                    </div>
                                  )}
                                </div>

                                <div className="pt-3 flex items-center justify-between text-xs">
                                  <div className="flex items-center gap-2">
                                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                                    <span className="text-slate-300 font-medium">GPS Active & Auto-Tracking</span>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => setAutoFollow((p) => !p)}
                                    className={`px-3 py-1 rounded-lg text-xs font-bold border ${
                                      autoFollow
                                        ? "bg-blue-600/30 text-blue-300 border-blue-500/40"
                                        : "bg-slate-800 text-slate-400 border-slate-700"
                                    }`}
                                  >
                                    {autoFollow ? "Center on Me" : "Follow Off"}
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Delivery Partner Action Controls */}
                    <div className="pt-1">
                      <DeliveryPartnerGpsController
                        key={currentDelivery.id}
                        deliveryId={currentDelivery.id}
                        orderNumber={currentDelivery.orderNumber}
                        customerName={currentDelivery.destination.recipientName}
                        customerAddress={`${currentDelivery.destination.addressLine1}, ${currentDelivery.destination.city}`}
                        destinationLat={currentDelivery.destination.latitude || routeData?.destination?.latitude}
                        destinationLng={currentDelivery.destination.longitude || routeData?.destination?.longitude}
                        initialStatus={currentDelivery.status}
                        onStatusChange={handleStatusChange}
                        onLocationChange={handleLocationUpdate}
                        onTrackingChange={(tracking) => setIsRideActive(tracking)}
                      />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* History Tab View */}
        {activeTab === "history" && !loading && (
          <div className="space-y-3">
            {completedDeliveries.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center space-y-2 shadow-xs">
                <Clock size={28} className="mx-auto text-slate-400" />
                <h3 className="text-base font-bold text-[#0B0B0B]">No Completed Deliveries Yet</h3>
                <p className="text-xs text-slate-500">
                  Deliveries you mark as delivered, failed, or cancelled will appear here.
                </p>
              </div>
            ) : (
              completedDeliveries.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 space-y-3 shadow-xs hover:border-[#D4AF37]/50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-black text-[#0B0B0B]">{item.orderNumber}</span>
                      <span className="block text-[11px] text-slate-500">
                        Assigned: {formatDateTime(item.assignedAt)}
                        {item.completedAt && ` • Completed: ${formatDateTime(item.completedAt)}`}
                      </span>
                    </div>
                    <Badge tone={getStatusTone(item.status)}>
                      <span className="capitalize">{item.status.replace(/_/g, " ")}</span>
                    </Badge>
                  </div>

                  <div className="text-xs text-slate-600 flex items-start gap-2">
                    <MapPin size={14} className="text-[#B89124] shrink-0 mt-0.5" />
                    <span>
                      {item.destination.recipientName} • {item.destination.addressLine1}, {item.destination.city}
                    </span>
                  </div>

                  {item.codAmount != null && (
                    <div className="text-xs font-mono font-bold text-[#0B0B0B] flex items-center gap-1.5 bg-[#FFF9E6] border border-[#F3E5AB] px-2.5 py-1 rounded-lg w-fit">
                      <Banknote size={14} className="text-[#B89124]" /> COD: ₹{item.codAmount.toLocaleString("en-IN")} ({item.paymentStatus})
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </main>
    </div>
  )
}
