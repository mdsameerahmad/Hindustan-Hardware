import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  Clock,
  MapPin,
  Navigation,
  Phone,
  RefreshCw,
  ShieldCheck,
  Truck,
} from "lucide-react"
import { useEffect, useState } from "react"
import { Link, useParams } from "react-router"
import { useAuth } from "../authContext"
import { Button, PageHeader } from "../components"
import { LiveTrackingMap } from "../components/LiveTrackingMap"
import {
  deliveryTrackingApi,
  type FullDeliveryTrackingData,
} from "../features/deliveryTrackingApi"
import {
  trackingSocketService,
  type DeliveryLocationBroadcastPayload,
  type DeliveryStatusBroadcastPayload,
} from "../features/trackingSocketService"

export function LiveTrackingDetailPage() {
  const { id } = useParams()
  const { isAuthenticated } = useAuth()
  const [data, setData] = useState<FullDeliveryTrackingData | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [socketConnected, setSocketConnected] = useState<boolean>(false)
  const [customerCoords, setCustomerCoords] = useState<{ latitude: number; longitude: number } | null>(null)
  const [customerGpsLoading, setCustomerGpsLoading] = useState<boolean>(false)
  const [customerGpsError, setCustomerGpsError] = useState<string | null>(null)

  const handleUseCustomerLocation = () => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setCustomerGpsError("Geolocation is not supported by your browser.")
      return
    }

    setCustomerGpsLoading(true)
    setCustomerGpsError(null)

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCustomerGpsLoading(false)
        setCustomerCoords({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        })
      },
      (err) => {
        setCustomerGpsLoading(false)
        if (err.code === err.PERMISSION_DENIED) {
          setCustomerGpsError("Location permission was denied. Your saved order address is retained.")
        } else {
          setCustomerGpsError("Unable to acquire your device location. Retaining delivery address.")
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 10000 },
    )
  }

  const fetchFullTracking = async () => {
    if (!id) return
    setLoading(true)
    setError(null)

    try {
      // 1. Fetch Order Tracking & Delivery Assignment
      const orderTracking = await deliveryTrackingApi.getOrderTracking(id)

      let route = null
      let eta = null

      if (orderTracking.assignment?.id) {
        const assignmentId = orderTracking.assignment.id
        const isActive = ["assigned", "picked_up", "out_for_delivery"].includes(
          orderTracking.assignment.status,
        )

        if (isActive) {
          try {
            const [routeRes, etaRes] = await Promise.allSettled([
              deliveryTrackingApi.getDeliveryRoute(assignmentId),
              deliveryTrackingApi.getDeliveryEta(assignmentId),
            ])

            if (routeRes.status === "fulfilled") {
              route = routeRes.value
            }
            if (etaRes.status === "fulfilled") {
              eta = etaRes.value
            }
          } catch {
            // Non-fatal error; continue with partial location
          }
        }
      }

      setData((prev) => {
        // Prevent older REST responses from overwriting newer socket updates
        if (
          prev?.orderTracking?.latestLocation?.deviceTimestamp &&
          orderTracking?.latestLocation?.deviceTimestamp &&
          new Date(prev.orderTracking.latestLocation.deviceTimestamp).getTime() >
            new Date(orderTracking.latestLocation.deviceTimestamp).getTime()
        ) {
          return {
            ...prev,
            route: route || prev.route,
            eta: eta || prev.eta,
          }
        }

        return {
          orderTracking,
          route,
          eta,
        }
      })
    } catch (err: any) {
      setError(err?.message || "Failed to load live delivery tracking information.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchFullTracking()
  }, [id])

  // Real-Time Socket.IO Subscription to Delivery Assignment
  useEffect(() => {
    const assignmentId = data?.orderTracking?.assignment?.id
    const status = data?.orderTracking?.assignment?.status

    // Only subscribe if active assignment exists
    if (!assignmentId || ["delivered", "failed", "cancelled"].includes(status || "")) {
      return
    }

    setSocketConnected(true)

    const unsubscribe = trackingSocketService.subscribeToDelivery(
      assignmentId,
      (loc: DeliveryLocationBroadcastPayload) => {
        setData((prev) => {
          if (!prev) return prev

          // Avoid out-of-order timestamp overwrites
          const currentTimestamp = prev.orderTracking.latestLocation?.deviceTimestamp
          if (
            currentTimestamp &&
            loc.deviceTimestamp &&
            new Date(loc.deviceTimestamp).getTime() < new Date(currentTimestamp).getTime()
          ) {
            return prev
          }

          return {
            ...prev,
            orderTracking: {
              ...prev.orderTracking,
              isLiveTrackingAvailable: !loc.isStale,
              latestLocation: {
                latitude: loc.latitude,
                longitude: loc.longitude,
                accuracy: loc.accuracy,
                speed: loc.speed,
                heading: loc.heading,
                deviceTimestamp: loc.deviceTimestamp,
                serverReceivedAt: loc.serverReceivedAt,
                isStale: loc.isStale,
              },
            },
          }
        })
      },
      (statusUpdate: DeliveryStatusBroadcastPayload) => {
        setData((prev) => {
          if (!prev || !prev.orderTracking.assignment) return prev
          return {
            ...prev,
            orderTracking: {
              ...prev.orderTracking,
              assignment: {
                ...prev.orderTracking.assignment,
                status: statusUpdate.status,
              },
            },
          }
        })
      },
      (_err) => {
        // Safe non-crashing socket error notification
      },
    )

    return () => {
      unsubscribe()
      setSocketConnected(false)
    }
  }, [data?.orderTracking?.assignment?.id, data?.orderTracking?.assignment?.status])

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

  const formatEtaMinutes = (seconds?: number) => {
    if (!seconds) return null
    const mins = Math.ceil(seconds / 60)
    if (mins < 60) return `${mins} mins`
    const hours = Math.floor(mins / 60)
    const remMins = mins % 60
    return `${hours} hr ${remMins > 0 ? `${remMins} m` : ""}`
  }

  const assignment = data?.orderTracking?.assignment
  const latestLocation = data?.orderTracking?.latestLocation
  const isLive = data?.orderTracking?.isLiveTrackingAvailable ?? false
  const isStale = latestLocation?.isStale ?? false
  const isDelivered = assignment?.status === "delivered" || data?.orderTracking?.orderStatus === "delivered"
  const isCancelled = data?.orderTracking?.orderStatus === "cancelled" || assignment?.status === "cancelled"

  return (
    <div className="container-wide py-8">
      {/* Top Navigation & Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <Link
          to={`/track-order/${id}`}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 hover:text-black"
        >
          <ArrowLeft size={16} />
          <span>Back to Order Status</span>
        </Link>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={fetchFullTracking}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            <span>Refresh Map &amp; ETA</span>
          </Button>

          <Link to={`/my-orders/${id}`}>
            <Button variant="outline" className="text-xs">
              Order Details
            </Button>
          </Link>
        </div>
      </div>

      <PageHeader
        breadcrumbs={`My Orders / ${data?.orderTracking?.orderNumber || id || "Live Tracking"}`}
        title="Live Delivery Route &amp; GPS Tracker"
        description="Real-time road routing via OpenStreetMap &amp; OSRM for Hindustan Hardware deliveries."
      />

      {loading ? (
        <div className="my-16 flex flex-col items-center justify-center text-slate-500">
          <RefreshCw className="mb-3 h-8 w-8 animate-spin text-accent" />
          <p className="font-semibold">Loading map and live vehicle position...</p>
        </div>
      ) : error ? (
        <div className="my-10 rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-red-600" />
          <h3 className="text-base font-bold text-red-900">Tracking Unavailable</h3>
          <p className="mt-1 text-sm text-red-700">{error}</p>
          <Button onClick={fetchFullTracking} className="mt-4">
            Retry Connection
          </Button>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          {/* Main Map Viewport */}
          <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-white shadow-sm">
            {/* Map Header Status Bar */}
            <div className="flex flex-wrap items-center justify-between border-b border-border bg-slate-900 px-5 py-3 text-white">
              <div className="flex items-center gap-3">
                <span className="relative flex h-3 w-3">
                  {isLive && !isDelivered ? (
                    <>
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500"></span>
                    </>
                  ) : isStale ? (
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-amber-500"></span>
                  ) : (
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-slate-500"></span>
                  )}
                </span>
                <span className="text-xs font-black tracking-wider uppercase">
                  {isDelivered
                    ? "Order Delivered"
                    : isCancelled
                      ? "Delivery Cancelled"
                      : isLive
                        ? "Active Live Tracking"
                        : isStale
                          ? "GPS Signal Delayed"
                          : "Awaiting Vehicle GPS Signal"}
                </span>
              </div>

              <div className="flex items-center gap-3 text-xs text-slate-300">
                {latestLocation?.deviceTimestamp && (
                  <span>
                    Last fix: {formatDateTime(latestLocation.deviceTimestamp)}
                  </span>
                )}
              </div>
            </div>

            {/* Map Container */}
            <div className="relative h-[540px] w-full bg-slate-100">
              {!assignment ? (
                <div className="flex h-full w-full flex-col items-center justify-center p-8 text-center">
                  <Clock className="mb-3 h-10 w-10 text-slate-400" />
                  <h4 className="text-base font-bold text-slate-800">Delivery Partner Not Yet Assigned</h4>
                  <p className="mt-1 max-w-sm text-xs text-slate-500">
                    Your order is currently being prepared at the store warehouse. The map and delivery partner will appear here once dispatched.
                  </p>
                </div>
              ) : (
                <>
                  <LiveTrackingMap
                    storeLocation={data?.orderTracking?.store || data?.route?.store}
                    partnerLocation={
                      latestLocation
                        ? {
                            latitude: latestLocation.latitude,
                            longitude: latestLocation.longitude,
                          }
                        : null
                    }
                    destinationLocation={
                      data?.route?.destination ||
                      data?.orderTracking?.destination || {
                        latitude: 25.2185,
                        longitude: 84.9912,
                      }
                    }
                    customerLocation={customerCoords}
                    routeCoordinates={data?.route?.geometry?.coordinates}
                    isStale={isStale}
                    height="100%"
                  />

                  {/* Driver Standby / Waiting Notice Overlay (Non-blocking) */}
                  {!latestLocation && !isDelivered && (
                    <div className="absolute top-4 left-4 right-4 z-[1000] flex items-center justify-between rounded-xl border border-amber-300 bg-amber-50/95 px-4 py-3 shadow-md backdrop-blur-sm">
                      <div className="flex items-center gap-2.5">
                        <Navigation className="h-4 w-4 text-amber-600 animate-pulse shrink-0" />
                        <div>
                          <b className="text-xs font-bold text-amber-900 block">
                            Assigned to {assignment.deliveryPartner?.fullName || "Store Driver"}
                          </b>
                          <span className="text-[11px] text-amber-800">
                            Awaiting driver departure / GPS broadcast. Showing route preview from store to your address.
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={fetchFullTracking}
                        className="text-xs font-bold text-amber-900 underline hover:no-underline ml-2"
                      >
                        Refresh
                      </button>
                    </div>
                  )}

                  {/* Delivery Complete Overlay */}
                  {isDelivered && (
                    <div className="absolute top-4 left-4 right-4 z-[1000] flex items-center justify-between rounded-xl border border-emerald-300 bg-emerald-50/95 px-4 py-3 shadow-md backdrop-blur-sm">
                      <div className="flex items-center gap-2.5">
                        <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                        <div>
                          <b className="text-xs font-bold text-emerald-950 block">Package Delivered</b>
                          <span className="text-[11px] text-emerald-800">
                            Safely delivered to your address by {assignment.deliveryPartner?.fullName || "driver"}.
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Stale Warning Banner Overlay */}
                  {isStale && latestLocation && !isDelivered && (
                    <div className="absolute top-4 left-4 right-4 z-[1000] flex items-center justify-between rounded-lg border border-amber-300 bg-amber-50/95 px-4 py-2.5 shadow-md backdrop-blur-sm">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                        <span className="text-xs font-semibold text-amber-800">
                          Location signal delayed. Showing last verified position from vehicle.
                        </span>
                      </div>
                      <button
                        onClick={fetchFullTracking}
                        className="text-xs font-bold text-amber-900 underline hover:no-underline ml-2"
                      >
                        Refresh
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Map Legend & Tech Specs */}
            <div className="flex flex-wrap items-center justify-between border-t border-border bg-slate-50 px-5 py-3 text-xs text-slate-600 gap-3">
              <div className="flex flex-wrap items-center gap-4">
                <span className="flex items-center gap-1.5">
                  <span className="text-base">🏬</span>
                  <span className="font-semibold text-slate-800">Hindustan Hardware (Store)</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-full border border-amber-600 bg-white"></span>
                  <span className="font-medium">Driver Vehicle</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-full bg-slate-900"></span>
                  <span className="font-medium">Road Route</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="text-sm">📍</span>
                  <span className="font-medium">Delivery Address</span>
                </span>
                {customerCoords && (
                  <span className="flex items-center gap-1.5 text-blue-700">
                    <span className="h-2.5 w-2.5 rounded-full bg-blue-600 animate-pulse"></span>
                    <span className="font-bold">Your Location</span>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={customerGpsLoading}
                  onClick={handleUseCustomerLocation}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 transition shadow-xs"
                >
                  <MapPin size={13} className="text-blue-600" />
                  <span>{customerGpsLoading ? "Locating..." : customerCoords ? "Update My Location" : "Show My Current Location"}</span>
                </button>
                <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">
                  OSRM • OpenStreetMap
                </span>
              </div>
            </div>
            {customerGpsError && (
              <div className="bg-amber-50 border-t border-amber-200 px-5 py-2 text-[11px] text-amber-800">
                {customerGpsError}
              </div>
            )}
          </div>

          {/* Right Tracking Info Sidebar */}
          <div className="space-y-5">
            {/* ETA & Distance Card */}
            <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-accent" />
                <h3 className="font-bold text-ink">Estimated Arrival</h3>
              </div>

              {data?.eta?.isAvailable && data.eta.eta ? (
                <div className="mt-4 border-t border-border pt-4">
                  <div className="text-3xl font-black text-ink">
                    {formatEtaMinutes(data.eta.eta.estimatedDurationSeconds)}
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                    <span>
                      Est. Arrival: {formatDateTime(data.eta.eta.estimatedArrivalTimestamp)}
                    </span>
                    {data.eta.eta.distanceMeters && (
                      <span className="font-semibold text-slate-700">
                        {(data.eta.eta.distanceMeters / 1000).toFixed(1)} km away
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="mt-4 border-t border-border pt-4 text-xs text-slate-500">
                  <p>{data?.eta?.statusMessage || "Dynamic road ETA calculated once vehicle is in transit."}</p>
                </div>
              )}
            </div>

            {/* Delivery Partner Details Card */}
            <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <Truck className="h-5 w-5 text-accent" />
                <h3 className="font-bold text-ink">Delivery Partner</h3>
              </div>

              <div className="mt-4 border-t border-border pt-4">
                {assignment?.deliveryPartner ? (
                  <div className="space-y-3">
                    <div>
                      <b className="text-sm text-ink block">{assignment.deliveryPartner.fullName}</b>
                      <span className="text-xs text-slate-500">Verified Hindustan Store Driver</span>
                    </div>

                    {assignment.deliveryPartner.phone && (
                      <a
                        href={`tel:${assignment.deliveryPartner.phone}`}
                        className="flex items-center gap-2 rounded-lg border border-border bg-slate-50 px-3 py-2 text-xs font-bold text-slate-800 hover:bg-slate-100"
                      >
                        <Phone size={14} className="text-emerald-600" />
                        <span>Call Partner ({assignment.deliveryPartner.phone})</span>
                      </a>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-slate-500">
                    Store driver assignment in progress.
                  </div>
                )}
              </div>
            </div>

            {/* Store Hub & Dispatch Center Card */}
            <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-brand" />
                <h3 className="font-bold text-ink">Store Dispatch Hub</h3>
              </div>
              <p className="mt-2 text-xs text-slate-500 leading-relaxed">
                Central Warehouse, Hindustan Hardware &amp; Sanitary, Jehanabad, Bihar.
              </p>
              <div className="mt-4 flex items-center gap-2 border-t border-border pt-3 text-xs text-slate-600">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                <span>Contactless delivery &amp; verified COD receipt</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
