import {
  AlertCircle,
  ArrowLeft,
  Banknote,
  CheckCircle2,
  ChevronRight,
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
import { useCallback, useEffect, useRef, useState } from "react"
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
  const [liveEstimatedArrival, setLiveEstimatedArrival] = useState<{
    estimatedArrivalTimestamp?: string | null
    etaSeconds?: number | null
    distanceRemainingMeters?: number | null
  } | null>(null)
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

    } catch (err: any) {
      setError(err?.message || "Failed to load assigned deliveries.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDeliveries()
  }, [fetchDeliveries])

  const activeDeliveries = deliveries.filter((d) =>
    ["assigned", "picked_up", "out_for_delivery"].includes(d.status)
  )
  const completedDeliveries = deliveries.filter((d) =>
    ["delivered", "failed", "cancelled"].includes(d.status)
  )

  const currentDelivery = selectedDeliveryId ? deliveries.find((d) => d.id === selectedDeliveryId) || null : null

  const fetchRouteForDelivery = useCallback(async (deliveryId: string) => {
    setRouteLoading(true)
    try {
      const res = await deliveryTrackingApi.getDeliveryRoute(deliveryId)
      setRouteData(res)
      if (res) {
        setLiveEstimatedArrival((prev) => ({
          ...prev,
          etaSeconds: res.durationSeconds,
          distanceRemainingMeters: res.distanceMeters,
          estimatedArrivalTimestamp: new Date(Date.now() + res.durationSeconds * 1000).toISOString(),
        }))
      }
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

        if (payload.etaSeconds != null || payload.estimatedArrivalTimestamp) {
          setLiveEstimatedArrival({
            estimatedArrivalTimestamp: payload.estimatedArrivalTimestamp,
            etaSeconds: payload.etaSeconds,
            distanceRemainingMeters: payload.distanceRemainingMeters,
          })
        }

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

  const [isDutyOnline, setIsDutyOnline] = useState<boolean>(true)

  return (
    <div className="min-h-screen bg-[#F5F5F5] text-[#0B0B0B] pb-28 md:pb-16 font-sans">
      {/* Signature Black & Gold Hindustan Hardware Header */}
      <header className="sticky top-0 z-30 border-b border-[#1C1C1C] bg-[#0B0B0B] px-3 py-2.5 shadow-md sm:px-6 sm:py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          {/* Brand & Partner Profile */}
          <div className="flex items-center gap-2.5 min-w-0">
            {user?.profile?.avatar_url ? (
              <img
                src={user.profile.avatar_url}
                alt={user?.profile?.full_name || "Partner"}
                className="h-10 w-10 rounded-full object-cover border-2 border-[#D4AF37] shadow-md shadow-[#D4AF37]/20 shrink-0"
              />
            ) : (
              <img
                src="/logo.webp"
                alt="Hindustan Hardware"
                className="h-10 w-10 rounded-full object-cover border-2 border-[#D4AF37] shadow-md shadow-[#D4AF37]/20 shrink-0"
              />
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-black uppercase tracking-wider text-[#D4AF37] bg-white/5 border border-[#D4AF37]/30 px-1.5 py-0.5 rounded">
                  Hindustan Rider
                </span>
              </div>
              <h1 className="max-w-28 truncate text-xs font-black leading-tight text-white sm:max-w-none sm:text-base">
                {user?.profile?.full_name || user?.email?.split("@")[0] || "Partner"}
              </h1>
            </div>
          </div>

          {/* Right Controls: Online/Offline Duty Toggle + Actions */}
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            {/* Duty Status Switch with Brand Gold Glow */}
            <button
              type="button"
              onClick={() => setIsDutyOnline((prev) => !prev)}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[10px] font-black transition-all shadow-xs sm:px-3 sm:text-xs ${
                isDutyOnline
                  ? "bg-[#D4AF37] text-[#0B0B0B] border-[#E5C158] shadow-md shadow-[#D4AF37]/25"
                  : "bg-[#1C1C1C] text-slate-400 border-[#2A2A2A]"
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${isDutyOnline ? "bg-[#0B0B0B] animate-ping" : "bg-slate-500"}`} />
              <span>{isDutyOnline ? "ONLINE" : "OFFLINE"}</span>
            </button>

            <button
              onClick={fetchDeliveries}
              disabled={loading}
              title="Refresh assignments"
              className="p-2 rounded-xl bg-[#1C1C1C] text-slate-300 hover:text-[#D4AF37] hover:bg-[#2A2A2A] border border-[#262626] transition-all"
            >
              <RefreshCw size={15} className={loading ? "animate-spin text-[#D4AF37]" : ""} />
            </button>

            <button
              onClick={() => logout()}
              title="Sign out"
              className="p-2 rounded-xl bg-[#1C1C1C] text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 border border-[#262626] transition-all"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-4xl mx-auto px-3.5 sm:px-6 pt-4 space-y-4">
        {/* Metric Cards in Exact Brand Palette */}
        <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3.5">
          {/* Active Orders */}
          <div className="flex flex-col justify-between rounded-2xl border border-[#E8E8E8] bg-white p-3 shadow-xs transition-colors hover:border-[#D4AF37]/50 sm:p-4">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 sm:text-[11px]">
                Active Trips
              </span>
              <span className="h-6 w-6 rounded-lg bg-[#FFF9E6] text-[#B89124] border border-[#F3E5AB] flex items-center justify-center font-bold text-xs">
                <Package size={13} />
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-2xl sm:text-3xl font-black text-[#0B0B0B] leading-none">
                {activeDeliveries.length}
              </span>
              <span className="text-[10px] font-bold text-slate-400">pending</span>
            </div>
          </div>

          {/* Delivered Orders */}
          <div className="flex flex-col justify-between rounded-2xl border border-[#E8E8E8] bg-white p-3 shadow-xs transition-colors hover:border-emerald-300 sm:p-4">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 sm:text-[11px]">
                Completed
              </span>
              <span className="h-6 w-6 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center font-bold text-xs">
                <CheckCircle2 size={13} />
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-2xl sm:text-3xl font-black text-emerald-600 leading-none">
                {completedDeliveries.length}
              </span>
              <span className="text-[10px] font-bold text-emerald-700">orders</span>
            </div>
          </div>

          {/* Cash and delivery fee still to collect */}
          <div className="col-span-2 flex flex-col justify-between rounded-2xl border border-[#E8E8E8] bg-white p-3 shadow-xs transition-colors hover:border-[#D4AF37]/50 sm:col-span-1 sm:p-4">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 sm:text-[11px]">
                Total to Collect
              </span>
              <span className="h-6 w-6 rounded-lg bg-[#FFF9E6] text-[#B89124] border border-[#F3E5AB] flex items-center justify-center font-bold text-xs">
                <Banknote size={13} />
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="truncate font-mono text-xl font-black leading-none text-[#0B0B0B] sm:text-2xl">
                ₹{activeDeliveries.reduce((acc, d) => acc + (d.codAmount || 0), 0).toLocaleString("en-IN")}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 pt-2 text-[10px] font-semibold sm:gap-x-5">
              <span className="text-slate-500">
                Order balance: ₹{activeDeliveries.reduce((acc, d) => acc + d.orderAmountToCollect, 0).toLocaleString("en-IN")}
              </span>
              <span className="text-amber-800">
                Delivery fees: ₹{activeDeliveries.reduce((acc, d) => acc + d.deliveryFeeToCollect, 0).toLocaleString("en-IN")}
              </span>
            </div>
          </div>
        </section>

        {/* View Selection Tabs with Pill Buttons */}
        <div className="flex items-center gap-1 rounded-2xl bg-slate-200/90 p-1 text-[11px] font-black sm:text-xs">
          <button
            onClick={() => setActiveTab("active")}
            className={`flex-1 py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all ${
              activeTab === "active"
                ? "bg-[#0B0B0B] text-[#D4AF37] shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Package size={15} className={activeTab === "active" ? "text-[#D4AF37]" : ""} />
            <span className="sm:hidden">Active ({activeDeliveries.length})</span>
            <span className="hidden sm:inline">Active Deliveries ({activeDeliveries.length})</span>
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`flex-1 py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all ${
              activeTab === "history"
                ? "bg-[#0B0B0B] text-[#D4AF37] shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Clock size={15} className={activeTab === "history" ? "text-[#D4AF37]" : ""} />
            <span className="sm:hidden">History ({completedDeliveries.length})</span>
            <span className="hidden sm:inline">Trip History ({completedDeliveries.length})</span>
          </button>
        </div>

        {/* Error State */}
        {error && (
          <div className="rounded-2xl bg-red-50 border border-red-200 p-3.5 flex items-start gap-3 text-red-900 text-xs shadow-xs">
            <AlertCircle size={18} className="text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <b className="block text-red-950 font-bold">Failed to sync delivery assignments</b>
              <p className="mt-0.5 text-red-700">{error}</p>
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
            <div className="h-9 w-9 mx-auto animate-spin rounded-full border-4 border-[#F7C600] border-t-black" />
            <p className="text-xs font-bold text-slate-600">Syncing assigned rider trips...</p>
          </div>
        )}

        {/* Active Tab View */}
        {activeTab === "active" && !loading && (
          <div className="space-y-4">
            {activeDeliveries.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center space-y-3 shadow-xs">
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#FFF9E6] border border-[#F3E5AB] text-[#B89124]">
                  <CheckCircle2 size={32} />
                </div>
                <h3 className="text-base font-black text-[#0B0B0B]">No Orders in Queue</h3>
                <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
                  Keep your GPS on and stay tuned. New delivery dispatches will appear here instantly without refresh.
                </p>
                <button
                  onClick={fetchDeliveries}
                  className="btn-gold-gradient inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-black transition shadow-xs mt-1"
                >
                  <RefreshCw size={13} /> Check for Orders
                </button>
              </div>
            ) : (
              <>
                {/* When no delivery is opened, display all active deliveries as rich, engaging cards */}
                {!currentDelivery ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-xs font-black uppercase tracking-wider text-slate-500">
                        Assigned Orders ({activeDeliveries.length})
                      </span>
                      <span className="text-[11px] font-bold text-[#AA841E]">
                        Tap a card to start delivery
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                      {activeDeliveries.map((item) => (
                        <div
                          key={item.id}
                          onClick={() => setSelectedDeliveryId(item.id)}
                          className="group relative cursor-pointer overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs transition-all duration-200 hover:border-[#D4AF37] hover:shadow-md hover:-translate-y-0.5"
                        >
                          {/* Accent Top Bar */}
                          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#D4AF37] to-[#B89124] opacity-80 group-hover:opacity-100 transition" />

                          {/* Header: Order ID + Status Badge */}
                          <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
                            <div>
                              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                                ORDER REF
                              </span>
                              <h3 className="text-sm sm:text-base font-black text-slate-900 group-hover:text-[#AA841E] transition">
                                {item.orderNumber}
                              </h3>
                            </div>
                            <span
                              className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                item.status === "out_for_delivery"
                                  ? "bg-[#FFF9E6] text-[#8F6B12] border border-[#F3E5AB]"
                                  : item.status === "picked_up"
                                    ? "bg-blue-50 text-blue-900 border border-blue-200"
                                    : "bg-slate-100 text-slate-800"
                              }`}
                            >
                              {item.status.replace(/_/g, " ")}
                            </span>
                          </div>

                          {/* Recipient & Location Preview */}
                          <div className="py-3 space-y-2">
                            <div className="flex items-start gap-2.5">
                              <div className="h-8 w-8 rounded-xl bg-slate-100 group-hover:bg-[#FFF9E6] flex items-center justify-center shrink-0 text-slate-600 group-hover:text-[#AA841E] transition">
                                <MapPin size={16} />
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-black text-slate-900 truncate">
                                  {item.destination?.recipientName || "Customer"}
                                </p>
                                <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                                  {item.destination?.addressLine1}
                                  {item.destination?.city ? `, ${item.destination.city}` : ""}
                                </p>
                              </div>
                            </div>

                            {/* Summary Pills: Items & Payment */}
                            <div className="flex flex-wrap items-center gap-2 pt-1">
                              {item.codAmount != null ? (
                                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[11px] font-black">
                                  <Banknote size={13} className="text-amber-700" />
                                  <span>Total to collect: ₹{item.codAmount.toLocaleString("en-IN")}</span>
                                </div>
                              ) : (
                                <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-black">
                                  <CheckCircle2 size={12} className="text-emerald-600" />
                                  <span>Prepaid</span>
                                </div>
                              )}
                              <div className="grid w-full grid-cols-1 gap-2 pt-2 text-[10px] sm:grid-cols-3">
                                <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2">
                                  <span className="block font-semibold text-slate-600">Order balance</span>
                                  <b className="mt-0.5 block text-slate-900">₹{item.orderAmountToCollect.toLocaleString("en-IN")}</b>
                                </div>
                                <div className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-2">
                                  <span className="block font-semibold text-amber-800">Delivery fee</span>
                                  <b className="mt-0.5 block text-amber-950">₹{item.deliveryFeeToCollect.toLocaleString("en-IN")}</b>
                                </div>
                                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-2">
                                  <span className="block font-semibold text-emerald-800">Total to collect</span>
                                  <b className="mt-0.5 block text-emerald-950">₹{(item.codAmount || 0).toLocaleString("en-IN")}</b>
                                </div>
                              </div>

                              {item.itemsSummary && item.itemsSummary.length > 0 && (
                                <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-100 text-slate-700 text-[11px] font-bold">
                                  <Package size={12} className="text-slate-500" />
                                  <span>{item.itemsSummary.length} {item.itemsSummary.length === 1 ? "Item" : "Items"}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Card Footer Action */}
                          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                            <span className="text-[11px] font-bold text-slate-400 group-hover:text-slate-600 transition">
                              Click to open map & controls
                            </span>
                            <div className="btn-gold-gradient inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-black shadow-xs transition group-hover:shadow-md">
                              <span>Open Order</span>
                              <ChevronRight size={14} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  /* Detail View for the opened delivery */
                  <div className="space-y-3.5">
                    {/* Navigation Top Bar: Back to Cards + Delivery Switcher */}
                    <div className="flex flex-col items-stretch gap-2 rounded-2xl border border-slate-200 bg-white p-2.5 shadow-xs sm:flex-row sm:items-center sm:justify-between sm:p-3">
                      <button
                        onClick={() => setSelectedDeliveryId(null)}
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-100 px-3.5 py-2 text-xs font-black text-slate-800 transition hover:bg-slate-200 sm:justify-start"
                      >
                        <ArrowLeft size={15} />
                        <span>All Deliveries ({activeDeliveries.length})</span>
                      </button>

                      {activeDeliveries.length > 1 && (
                        <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto scrollbar-none sm:max-w-[65%]">
                          {activeDeliveries.map((item) => (
                            <button
                              key={item.id}
                              onClick={() => setSelectedDeliveryId(item.id)}
                              className={`px-2.5 py-1.5 rounded-xl text-xs font-black transition border whitespace-nowrap ${
                                currentDelivery.id === item.id
                                  ? "bg-[#0B0B0B] text-[#D4AF37] border-[#0B0B0B]"
                                  : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                              }`}
                            >
                              {item.orderNumber}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Destination & Order Highlights */}
                    <div className="min-w-0 space-y-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:space-y-3.5 sm:p-5">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                        <div className="min-w-0">
                          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                            Order ID
                          </span>
                          <h2 className="text-base sm:text-lg font-black text-slate-900 truncate">
                            {currentDelivery.orderNumber}
                          </h2>
                        </div>
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider ${
                          currentDelivery.status === "out_for_delivery"
                            ? "bg-[#FFF9E6] text-[#8F6B12] border border-[#F3E5AB]"
                            : currentDelivery.status === "picked_up"
                              ? "bg-blue-50 text-blue-900 border border-blue-200"
                              : "bg-slate-100 text-slate-800"
                        }`}>
                          {currentDelivery.status.replace(/_/g, " ")}
                        </span>
                      </div>

                      {/* Explicit collection breakdown, including fees on prepaid orders */}
                      <div className="rounded-2xl border border-[#E5C158] bg-gradient-to-br from-[#FFF9E6] via-[#FFFDF5] to-white p-3 text-slate-900 shadow-xs sm:p-4">
                        <div className="mb-2.5 flex items-center gap-2 border-b border-amber-200 pb-2.5 sm:mb-3 sm:gap-2.5">
                          <Banknote size={20} className="shrink-0 text-[#AA841E]" />
                          <span className="text-[10px] font-black uppercase tracking-wide text-[#8F6B12] sm:text-xs sm:tracking-wider">
                            Cash on delivery breakdown
                          </span>
                        </div>
                        <div className="space-y-2 text-[11px] sm:text-xs">
                          <div className="flex justify-between gap-3">
                            <span className="text-slate-600">Order balance to collect</span>
                            <b className="shrink-0 text-slate-900">₹{currentDelivery.orderAmountToCollect.toLocaleString("en-IN")}</b>
                          </div>
                          <div className="flex justify-between gap-3">
                            <span className="text-slate-600">Delivery fee to collect</span>
                            <b className="shrink-0 text-amber-900">₹{currentDelivery.deliveryFeeToCollect.toLocaleString("en-IN")}</b>
                          </div>
                          <div className="flex items-center justify-between gap-3 border-t border-amber-200 pt-2 text-xs sm:text-sm">
                            <span className="font-black text-slate-800">Total to collect</span>
                            <b className="shrink-0 font-mono text-base font-black text-[#0B0B0B] sm:text-lg">
                              ₹{(currentDelivery.codAmount || 0).toLocaleString("en-IN")}
                            </b>
                          </div>
                          <div className="flex justify-between gap-3 border-t border-dashed border-slate-200 pt-2 text-[11px]">
                            <span className="text-slate-500">Full order + delivery total</span>
                            <b className="text-slate-700">₹{currentDelivery.totalPayable.toLocaleString("en-IN")}</b>
                          </div>
                        </div>
                      </div>

                      {/* Delivery Address & Contact */}
                      <div className="min-w-0 space-y-3 rounded-2xl border border-slate-200 bg-[#F8FAFC] p-3 sm:space-y-3.5 sm:p-4">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="h-8 w-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center shrink-0 mt-0.5 text-[#B89124] shadow-xs">
                            <MapPin size={18} className="stroke-[2.5]" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                              Deliver to Customer
                            </span>
                            <h3 className="text-sm font-black text-slate-900 mt-0.5 break-words">
                              {currentDelivery.destination.recipientName}
                            </h3>
                            <p className="text-xs text-slate-600 mt-1 leading-relaxed break-words font-medium">
                              {currentDelivery.destination.addressLine1}
                              {currentDelivery.destination.addressLine2 ? `, ${currentDelivery.destination.addressLine2}` : ""}
                              {currentDelivery.destination.landmark ? ` (Near ${currentDelivery.destination.landmark})` : ""}
                              <br />
                              <span className="font-bold text-slate-800">
                                {currentDelivery.destination.city}, {currentDelivery.destination.state} - {currentDelivery.destination.postalCode}
                              </span>
                            </p>
                          </div>
                        </div>

                        {/* Customer call action */}
                        <div className="pt-2 border-t border-slate-200">
                          {currentDelivery.destination.phone ? (
                            <a
                              href={`tel:${currentDelivery.destination.phone}`}
                              className="btn-gold-gradient inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-3 py-3 text-center text-xs font-black shadow-sm transition active:scale-[0.99] sm:px-4"
                            >
                              <Phone size={16} className="stroke-[2.5]" /> Call Customer ({currentDelivery.destination.phone})
                            </a>
                          ) : null}
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
                              <div key={idx} className="flex items-center justify-between gap-2 p-3">
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
                            {(liveEstimatedArrival || routeData) && (
                              <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-[#8F6B12] font-bold bg-[#FFF9E6] border border-[#F3E5AB] px-2.5 py-0.5 rounded-full shadow-xs">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
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
                                  <span className="text-[10px] text-amber-700/80 font-normal hidden sm:inline">
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

                        {/* Full Screen Driver Navigation HUD Modal */}
                        {isFullScreenNav && (
                          <div className="fixed inset-0 z-[9999] bg-[#0B0B0B] flex flex-col font-sans">
                            {/* Navigation HUD Top Header — Brand Black & Gold */}
                            <div className="absolute top-0 left-0 right-0 z-[10000] p-3 sm:p-4 bg-gradient-to-b from-[#0B0B0B]/95 via-[#0B0B0B]/70 to-transparent pointer-events-none">
                              <div className="max-w-2xl mx-auto flex items-center justify-between gap-3 pointer-events-auto">
                                <div className="flex items-center gap-2.5 sm:gap-3 rounded-2xl bg-[#1C1C1C]/90 backdrop-blur-md text-white px-3.5 py-2.5 sm:px-4 sm:py-3 shadow-xl border border-[#D4AF37]/40 min-w-0 flex-1">
                                  <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-gradient-to-br from-[#E5C158] via-[#D4AF37] to-[#AA841E] text-[#0B0B0B] flex items-center justify-center shrink-0 shadow-md">
                                    <Navigation size={20} className="fill-[#0B0B0B] stroke-[#0B0B0B] animate-pulse" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <span className="block text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-[#D4AF37] truncate">
                                      Turn-by-Turn Navigation
                                    </span>
                                    <span className="block text-xs sm:text-sm font-black text-white truncate">
                                      Heading to {currentDelivery.destination.recipientName}
                                    </span>
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => setIsFullScreenNav(false)}
                                  className="flex items-center gap-1.5 px-3.5 py-2.5 sm:px-4 sm:py-3 rounded-2xl bg-[#1C1C1C]/90 hover:bg-[#252525] text-white font-black text-xs shadow-xl border border-[#333333] transition shrink-0 backdrop-blur-md active:scale-95"
                                >
                                  <Minimize2 size={15} className="text-[#D4AF37]" />
                                  <span>Exit HUD</span>
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

                            {/* Driver Navigation HUD Bottom Floating Card */}
                            <div className="absolute bottom-3 left-3 right-3 sm:bottom-5 sm:left-6 sm:right-6 z-[10000] pointer-events-auto">
                              <div className="mx-auto max-w-xl rounded-2xl bg-[#0B0B0B]/95 p-4 text-white shadow-2xl border border-[#262626] backdrop-blur-xl">
                                <div className="flex items-center justify-between border-b border-[#222222] pb-3 gap-3">
                                  <div className="flex items-center gap-3 min-w-0">
                                    {/* Speed Meter */}
                                    <div className="flex h-12 w-12 sm:h-14 sm:w-14 flex-col items-center justify-center rounded-2xl bg-[#1C1C1C] text-white font-mono border border-[#D4AF37]/50 shadow-inner shrink-0">
                                      <span className="text-lg sm:text-xl font-black leading-none text-[#D4AF37]">
                                        {partnerLocationInfo?.speed != null ? Math.round(partnerLocationInfo.speed * 3.6) : 0}
                                      </span>
                                      <span className="text-[9px] uppercase font-bold text-slate-400 mt-0.5">km/h</span>
                                    </div>

                                    <div className="min-w-0 flex-1">
                                      <span className="text-[10px] font-black uppercase tracking-wider text-[#D4AF37] block">
                                        Drop-off Location
                                      </span>
                                      <span className="text-xs sm:text-sm font-bold text-slate-100 block truncate">
                                        {currentDelivery.destination.addressLine1}, {currentDelivery.destination.city}
                                      </span>
                                      {currentDelivery.destination.phone && (
                                        <a
                                          href={`tel:${currentDelivery.destination.phone}`}
                                          className="inline-flex items-center gap-1 text-[11px] font-black text-[#D4AF37] hover:underline mt-0.5"
                                        >
                                          <Phone size={11} /> Call ({currentDelivery.destination.phone})
                                        </a>
                                      )}
                                    </div>
                                  </div>

                                  {(liveEstimatedArrival || routeData) && (
                                    <div className="text-right shrink-0">
                                      <span className="text-xl sm:text-2xl font-black text-[#D4AF37] font-mono leading-none block">
                                        ~{Math.max(1, Math.ceil((liveEstimatedArrival?.etaSeconds ?? routeData?.durationSeconds ?? 0) / 60))} min
                                      </span>
                                      <span className="text-xs text-slate-400 font-mono mt-0.5 block font-bold">
                                        {(((liveEstimatedArrival?.distanceRemainingMeters ?? routeData?.distanceMeters ?? 0)) / 1000).toFixed(1)} km left
                                      </span>
                                    </div>
                                  )}
                                </div>

                                {/* HUD Controls Strip */}
                                <div className="pt-3 flex items-center justify-between text-xs gap-2">
                                  <div className="flex items-center gap-2">
                                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
                                    <span className="text-slate-300 font-bold text-[11px] sm:text-xs">
                                      {autoFollow ? "GPS Centered • Auto-Nav" : "Manual Map View"}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setAutoFollow((p) => !p)}
                                      className={`px-3 py-1.5 rounded-xl text-xs font-black transition border ${
                                        autoFollow
                                          ? "btn-gold-gradient text-[#0B0B0B] border-[#E5C158]"
                                          : "bg-[#1C1C1C] text-slate-400 border-[#333333]"
                                      }`}
                                    >
                                      {autoFollow ? "Center on Me" : "Follow Off"}
                                    </button>
                                  </div>
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

                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-bold text-slate-800">
                      Order balance: ₹{item.orderAmountToCollect.toLocaleString("en-IN")}
                    </div>
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 font-bold text-amber-900">
                      Delivery fee: ₹{item.deliveryFeeToCollect.toLocaleString("en-IN")}
                    </div>
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 font-bold text-emerald-900">
                      Total to collect: ₹{(item.codAmount || 0).toLocaleString("en-IN")}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </main>
    </div>
  )
}
