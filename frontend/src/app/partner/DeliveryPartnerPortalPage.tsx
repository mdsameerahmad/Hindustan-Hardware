import {
  AlertCircle,
  Banknote,
  CheckCircle2,
  Clock,
  LogOut,
  MapPin,
  Navigation,
  Package,
  Phone,
  RefreshCw,
  Shield,
  Truck
} from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { useAuth } from "../authContext"
import { Badge } from "../components"
import { DeliveryPartnerGpsController } from "../components/DeliveryPartnerGpsController"
import { LiveTrackingMap } from "../components/LiveTrackingMap"
import {
  deliveryTrackingApi,
  type AssignedDeliveryItem,
  type DeliveryRouteResponse,
} from "../features/deliveryTrackingApi"

export function DeliveryPartnerPortalPage() {
  const { user, logout } = useAuth()
  const [activeTab, setActiveTab] = useState<"active" | "history">("active")
  const [deliveries, setDeliveries] = useState<AssignedDeliveryItem[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string | null>(null)
  const [routeData, setRouteData] = useState<DeliveryRouteResponse | null>(null)
  const [routeLoading, setRouteLoading] = useState<boolean>(false)

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

  const [partnerCoords, setPartnerCoords] = useState<{ latitude: number; longitude: number } | null>(null)

  const fetchRouteForDelivery = useCallback(async (deliveryId: string) => {
    setRouteLoading(true)
    try {
      const res = await deliveryTrackingApi.getDeliveryRoute(deliveryId)
      setRouteData(res)
    } catch {
      setRouteData(null)
    } finally {
      setRouteLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!currentDelivery?.id) {
      setRouteData(null)
      return
    }

    fetchRouteForDelivery(currentDelivery.id)
  }, [currentDelivery?.id, currentDelivery?.status, fetchRouteForDelivery])

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
    <div className="min-h-screen bg-slate-900 text-slate-100 pb-16 font-sans">
      {/* Driver Header — High contrast outdoor-readable */}
      <header className="sticky top-0 z-30 bg-slate-950/95 backdrop-blur border-b border-slate-800 px-3.5 py-2.5 sm:px-6 sm:py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-amber-500 flex items-center justify-center text-slate-950 font-black shadow-lg shadow-amber-500/20 shrink-0">
              <Truck size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-amber-400 truncate">
                  Partner Portal
                </span>
                <span className="hidden xs:inline-flex items-center gap-1 text-[9px] sm:text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-300 font-mono shrink-0">
                  <Shield size={10} className="text-emerald-400" />
                  Verified
                </span>
              </div>
              <h1 className="text-sm sm:text-base font-black text-white leading-tight truncate">
                {user?.profile?.full_name || user?.email || "Partner"}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              onClick={fetchDeliveries}
              disabled={loading}
              title="Refresh assignments"
              className="p-1.5 sm:p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition"
            >
              <RefreshCw size={16} className={loading ? "animate-spin text-amber-400" : ""} />
            </button>
            <button
              onClick={() => logout()}
              title="Sign out"
              className="p-1.5 sm:p-2 rounded-lg bg-slate-800 text-red-400 hover:text-red-300 hover:bg-slate-700 transition"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-4xl mx-auto px-3.5 sm:px-6 pt-4 sm:pt-5 space-y-4 sm:space-y-5">
        {/* Metric Badges Strip */}
        <section className="grid grid-cols-3 gap-2 sm:gap-4">
          <div className="rounded-xl bg-slate-950 border border-slate-800 p-2.5 sm:p-3 text-center min-w-0">
            <span className="block text-[10px] sm:text-[11px] font-bold uppercase text-slate-400 truncate">Active</span>
            <span className="text-lg sm:text-xl font-black text-amber-400">{activeDeliveries.length}</span>
          </div>
          <div className="rounded-xl bg-slate-950 border border-slate-800 p-2.5 sm:p-3 text-center min-w-0">
            <span className="block text-[10px] sm:text-[11px] font-bold uppercase text-slate-400 truncate">Completed</span>
            <span className="text-lg sm:text-xl font-black text-emerald-400">{completedDeliveries.length}</span>
          </div>
          <div className="rounded-xl bg-slate-950 border border-slate-800 p-2.5 sm:p-3 text-center min-w-0">
            <span className="block text-[10px] sm:text-[11px] font-bold uppercase text-slate-400 truncate">Total</span>
            <span className="text-lg sm:text-xl font-black text-slate-200">{deliveries.length}</span>
          </div>
        </section>

        {/* View Selection Tabs */}
        <div className="flex border-b border-slate-800 gap-4 sm:gap-6 text-xs sm:text-sm font-bold overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveTab("active")}
            className={`pb-2.5 sm:pb-3 flex items-center gap-1.5 sm:gap-2 border-b-2 whitespace-nowrap transition ${
              activeTab === "active"
                ? "border-amber-400 text-amber-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Package size={16} />
            <span>Active Deliveries ({activeDeliveries.length})</span>
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`pb-2.5 sm:pb-3 flex items-center gap-1.5 sm:gap-2 border-b-2 whitespace-nowrap transition ${
              activeTab === "history"
                ? "border-amber-400 text-amber-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Clock size={16} />
            <span>Delivery History ({completedDeliveries.length})</span>
          </button>
        </div>

        {/* Error State */}
        {error && (
          <div className="rounded-xl bg-red-950/80 border border-red-800 p-4 flex items-start gap-3 text-red-200 text-sm">
            <AlertCircle size={18} className="text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <b className="block text-red-300 font-bold">Failed to sync delivery assignments</b>
              <p className="mt-0.5 text-xs text-red-200/90">{error}</p>
            </div>
            <button
              onClick={fetchDeliveries}
              className="text-xs bg-red-900/60 hover:bg-red-900 text-red-100 font-bold px-3 py-1.5 rounded-lg transition"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading Skeleton */}
        {loading && deliveries.length === 0 && (
          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-8 text-center space-y-3">
            <div className="h-8 w-8 mx-auto animate-spin rounded-full border-4 border-amber-500 border-t-transparent" />
            <p className="text-sm font-semibold text-slate-400">Loading your assigned deliveries...</p>
          </div>
        )}

        {/* Active Tab View */}
        {activeTab === "active" && !loading && (
          <div className="space-y-5">
            {activeDeliveries.length === 0 ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-10 text-center space-y-3">
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-900 text-slate-500">
                  <CheckCircle2 size={30} className="text-slate-600" />
                </div>
                <h3 className="text-lg font-black text-white">No Active Deliveries</h3>
                <p className="text-sm text-slate-400 max-w-sm mx-auto">
                  You are fully caught up! When an administrator assigns a delivery dispatch to you, it will show up here.
                </p>
                <button
                  onClick={fetchDeliveries}
                  className="mt-2 inline-flex items-center gap-2 rounded-xl bg-slate-800 hover:bg-slate-700 px-4 py-2 text-xs font-bold text-amber-400 transition"
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
                          (currentDelivery?.id === item.id)
                            ? "bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/20"
                            : "bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800"
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
                    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 sm:p-5 space-y-3.5 sm:space-y-4 shadow-xl min-w-0">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                        <div className="min-w-0">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                            Current Order Reference
                          </span>
                          <h2 className="text-base sm:text-lg font-black text-white truncate">{currentDelivery.orderNumber}</h2>
                        </div>
                        <Badge tone={getStatusTone(currentDelivery.status)}>
                          <span className="capitalize">{currentDelivery.status.replace(/_/g, " ")}</span>
                        </Badge>
                      </div>

                      {/* Cash on Delivery Banner */}
                      {currentDelivery.codAmount != null && (
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 sm:px-4 sm:py-3 text-amber-300">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Banknote size={20} className="text-amber-400 shrink-0" />
                            <div className="min-w-0">
                              <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider block text-amber-400/90 truncate">
                                Cash on Delivery (COD)
                              </span>
                              <span className="text-[11px] sm:text-xs text-amber-200/80 block">
                                Collect cash payment upon final delivery
                              </span>
                            </div>
                          </div>
                          <span className="text-base sm:text-lg font-black font-mono text-amber-400 self-end sm:self-auto">
                            ₹{currentDelivery.codAmount.toLocaleString("en-IN")}
                          </span>
                        </div>
                      )}

                      {/* Delivery Address & Contact */}
                      <div className="rounded-xl bg-slate-900 border border-slate-800 p-3.5 sm:p-4 space-y-3 min-w-0">
                        <div className="flex items-start gap-2.5 sm:gap-3 min-w-0">
                          <MapPin size={18} className="text-amber-400 shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                              Delivery Destination
                            </span>
                            <h3 className="text-xs sm:text-sm font-bold text-white mt-0.5 break-words">
                              {currentDelivery.destination.recipientName}
                            </h3>
                            <p className="text-xs text-slate-300 mt-1 leading-relaxed break-words">
                              {currentDelivery.destination.addressLine1}
                              {currentDelivery.destination.addressLine2 ? `, ${currentDelivery.destination.addressLine2}` : ""}
                              {currentDelivery.destination.landmark ? ` (Near: ${currentDelivery.destination.landmark})` : ""}
                              <br />
                              {currentDelivery.destination.city}, {currentDelivery.destination.state} - {currentDelivery.destination.postalCode}
                            </p>
                          </div>
                        </div>

                        {/* Action buttons: Call Customer & Turn-by-Turn Directions in Maps */}
                        <div className="pt-2.5 border-t border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2">
                          <a
                            href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                              `${currentDelivery.destination.addressLine1}, ${currentDelivery.destination.city}, ${currentDelivery.destination.state}`
                            )}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 px-3.5 py-2.5 text-xs font-bold transition shadow-sm"
                          >
                            <Navigation size={14} /> Open in Google Maps
                          </a>
                          {currentDelivery.destination.phone && (
                            <a
                              href={`tel:${currentDelivery.destination.phone}`}
                              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-4 py-2.5 text-xs font-bold text-white transition shadow-sm"
                            >
                              <Phone size={14} /> Call Customer ({currentDelivery.destination.phone})
                            </a>
                          )}
                        </div>
                      </div>

                      {/* Package Item Summary */}
                      {currentDelivery.itemsSummary && currentDelivery.itemsSummary.length > 0 && (
                        <div className="space-y-2">
                          <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                            Package Contents ({currentDelivery.itemsSummary.length} items)
                          </span>
                          <div className="rounded-xl bg-slate-900/60 border border-slate-800/80 divide-y divide-slate-800 text-xs">
                            {currentDelivery.itemsSummary.map((item, idx) => (
                              <div key={idx} className="p-2.5 sm:p-3 flex items-center justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <span className="font-semibold text-slate-200 block truncate">{item.productName}</span>
                                  {item.variantTitle && (
                                    <span className="block text-[11px] text-slate-400 truncate">{item.variantTitle}</span>
                                  )}
                                </div>
                                <span className="font-mono font-bold text-slate-400 shrink-0">x{item.quantity}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Live Delivery Route & Map View */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                            <Truck size={13} className="text-amber-400" /> Delivery Route & Destination Map
                          </span>
                          {routeData && (
                            <span className="text-[11px] font-mono text-amber-400/90 font-bold">
                              {(routeData.distanceMeters / 1000).toFixed(1)} km • ~{Math.ceil(routeData.durationSeconds / 60)} mins
                            </span>
                          )}
                        </div>
                        <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden shadow-lg h-[280px] w-full">
                          <LiveTrackingMap
                            storeLocation={routeData?.store}
                            partnerLocation={partnerCoords}
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
                      </div>
                    </div>

                    {/* Integrated Live GPS Controller */}
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                          <Navigation size={14} className="text-amber-400" /> Live GPS Ingestion & Lifecycle Actions
                        </span>
                      </div>

                      <DeliveryPartnerGpsController
                        key={currentDelivery.id}
                        deliveryId={currentDelivery.id}
                        orderNumber={currentDelivery.orderNumber}
                        customerName={currentDelivery.destination.recipientName}
                        customerAddress={`${currentDelivery.destination.addressLine1}, ${currentDelivery.destination.city}`}
                        initialStatus={currentDelivery.status}
                        onStatusChange={handleStatusChange}
                        onLocationChange={(coords) => setPartnerCoords(coords)}
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
              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-10 text-center space-y-2">
                <Clock size={28} className="mx-auto text-slate-600" />
                <h3 className="text-base font-bold text-white">No Completed Deliveries Yet</h3>
                <p className="text-xs text-slate-400">
                  Deliveries you mark as delivered, failed, or cancelled will appear here.
                </p>
              </div>
            ) : (
              completedDeliveries.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-black text-white">{item.orderNumber}</span>
                      <span className="block text-[11px] text-slate-400">
                        Assigned: {formatDateTime(item.assignedAt)}
                        {item.completedAt && ` • Completed: ${formatDateTime(item.completedAt)}`}
                      </span>
                    </div>
                    <Badge tone={getStatusTone(item.status)}>
                      <span className="capitalize">{item.status.replace(/_/g, " ")}</span>
                    </Badge>
                  </div>

                  <div className="text-xs text-slate-300 flex items-start gap-2">
                    <MapPin size={14} className="text-slate-500 shrink-0 mt-0.5" />
                    <span>
                      {item.destination.recipientName} • {item.destination.addressLine1}, {item.destination.city}
                    </span>
                  </div>

                  {item.codAmount != null && (
                    <div className="text-xs font-mono font-bold text-amber-400 flex items-center gap-1.5">
                      <Banknote size={14} /> COD: ₹{item.codAmount.toLocaleString("en-IN")} ({item.paymentStatus})
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
