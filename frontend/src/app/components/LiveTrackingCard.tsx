import React, { useEffect, useState } from "react"
import { useNavigate } from "react-router"
import { ExternalLink, Navigation, AlertTriangle, Clock, RefreshCw, CheckCircle2 } from "lucide-react"
import { LiveTrackingMap } from "./LiveTrackingMap"
import {
  deliveryTrackingApi,
  type FullDeliveryTrackingData,
} from "../features/deliveryTrackingApi"
import {
  trackingSocketService,
  type DeliveryLocationBroadcastPayload,
  type DeliveryStatusBroadcastPayload,
} from "../features/trackingSocketService"

interface LiveTrackingCardProps {
  orderId: string
  orderNumber?: string
  className?: string
  height?: string
  hideHeader?: boolean
}

export const LiveTrackingCard: React.FC<LiveTrackingCardProps> = ({
  orderId,
  orderNumber,
  className = "",
  height = "h-64",
  hideHeader = false,
}) => {
  const navigate = useNavigate()
  const [data, setData] = useState<FullDeliveryTrackingData | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [socketConnected, setSocketConnected] = useState<boolean>(false)

  const fetchTrackingData = async () => {
    if (!orderId) return
    setLoading(true)
    setError(null)

    try {
      // 1. Fetch Order Tracking & Delivery Assignment
      const orderTracking = await deliveryTrackingApi.getOrderTracking(orderId)

      let route = null
      let eta = null

      // 2. If assignment exists, fetch route and ETA if active
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
            // Non-fatal; map will render with available coordinates
          }
        }
      }

      setData((prev) => {
        // Prevent older REST responses from overwriting newer socket timestamps
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
      setError(err?.message || "Unable to load live delivery tracking.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTrackingData()
  }, [orderId])

  // Socket.IO Subscription to Delivery Assignment
  useEffect(() => {
    const assignmentId = data?.orderTracking?.assignment?.id
    const status = data?.orderTracking?.assignment?.status

    // Only subscribe if assignment exists and is not completed/cancelled
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

        // When delivery partner marks picked_up or out_for_delivery, recalculate active road route
        if (assignmentId && (statusUpdate.status === "picked_up" || statusUpdate.status === "out_for_delivery")) {
          deliveryTrackingApi.getDeliveryRoute(assignmentId).then((newRoute) => {
            if (newRoute) {
              setData((current) => current ? { ...current, route: newRoute } : current)
            }
          }).catch(() => {})
        }
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

  const handleOpenDedicatedTracking = () => {
    navigate(`/track-order/${orderId}/live`)
  }

  const assignment = data?.orderTracking?.assignment
  const latestLocation = data?.orderTracking?.latestLocation
  const isLive = data?.orderTracking?.isLiveTrackingAvailable ?? false
  const isStale = latestLocation?.isStale ?? false
  const isDelivered = assignment?.status === "delivered" || data?.orderTracking?.orderStatus === "delivered"

  // Detect whether partner is at destination
  const destCoords = data?.route?.destination || data?.orderTracking?.destination
  const isAtDestination = Boolean(
    !isDelivered &&
    (assignment?.status === "out_for_delivery" || assignment?.status === "picked_up") &&
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
      const distanceMeters = R * c
      return distanceMeters <= 85 || (data?.eta?.eta?.distanceMeters != null && data.eta.eta.distanceMeters <= 85)
    })()
  )

  const formatEtaMinutes = (seconds?: number) => {
    if (!seconds) return null
    const mins = Math.ceil(seconds / 60)
    if (mins < 60) return `${mins} mins`
    const hours = Math.floor(mins / 60)
    const remMins = mins % 60
    return `${hours} hr ${remMins > 0 ? `${remMins} m` : ""}`
  }

  return (
    <div
      className={`group relative flex flex-col overflow-hidden rounded-xl border border-border bg-white shadow-sm transition-all hover:border-accent hover:shadow-md ${className}`}
    >
      {/* Card Header (hidden if parent provides its own integrated header) */}
      {!hideHeader && (
        <div className="flex items-center justify-between border-b border-border bg-slate-900 px-5 py-3.5 text-white">
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              {isDelivered ? (
                <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500"></span>
              ) : isAtDestination ? (
                <>
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-amber-500"></span>
                </>
              ) : isLive ? (
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
            <h3 className="text-xs font-black tracking-wider text-slate-100 uppercase">
              {isAtDestination ? "Driver At Destination" : "Live Delivery Tracking"}
            </h3>
          </div>

          {/* Live Badge / Refresh */}
          <div className="flex items-center gap-2">
            {isAtDestination && (
              <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300 uppercase tracking-wider animate-pulse">
                At Destination
              </span>
            )}
            {isLive && !isDelivered && !isAtDestination && (
              <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                Live GPS
              </span>
            )}
            {isStale && !isAtDestination && (
              <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-400 uppercase tracking-wider">
                Signal Delayed
              </span>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation()
                fetchTrackingData()
              }}
              disabled={loading}
              title="Refresh Tracking"
              className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>
      )}

      {/* Map Area */}
      <div
        onClick={handleOpenDedicatedTracking}
        className={`relative ${height} w-full cursor-pointer bg-slate-100`}
      >
        {loading ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-slate-50 text-slate-400">
            <RefreshCw size={24} className="animate-spin text-accent" />
            <span className="text-xs font-semibold">Connecting to GPS tracker...</span>
          </div>
        ) : error ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-center">
            <AlertTriangle className="h-6 w-6 text-amber-600" />
            <p className="text-xs font-semibold text-slate-700">{error}</p>
            <button
              onClick={(e) => {
                e.stopPropagation()
                fetchTrackingData()
              }}
              className="mt-1 text-xs font-bold text-accent hover:underline"
            >
              Retry
            </button>
          </div>
        ) : !assignment ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-center">
            <Clock className="h-7 w-7 text-slate-400" />
            <b className="text-xs text-slate-700">Awaiting Partner Assignment</b>
            <p className="text-[11px] text-slate-500">
              A delivery partner will be assigned once your order is packed.
            </p>
          </div>
        ) : isDelivered ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-center bg-emerald-50/50">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            <b className="text-sm font-bold text-slate-800">Order Delivered Successfully</b>
            <p className="text-xs text-slate-500">
              Delivered by {assignment.deliveryPartner?.fullName || "store partner"}.
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
                data?.orderTracking?.destination ||
                undefined
              }
              routeCoordinates={data?.route?.geometry?.coordinates}
              isStale={isStale}
              interactive={false}
              onMapClick={handleOpenDedicatedTracking}
              height="100%"
            />

            {/* Connecting to GPS Floating Pill if no partner fix yet */}
            {!latestLocation && (
              <div className="pointer-events-none absolute top-3 left-3 right-3 z-[1000] flex items-center justify-between rounded-lg bg-slate-900/90 px-3 py-1.5 text-xs text-white shadow-md backdrop-blur-sm">
                <div className="flex items-center gap-2">
                  <Navigation className="h-3.5 w-3.5 text-accent animate-pulse shrink-0" />
                  <span className="font-semibold text-[11px]">
                    Assigned: {assignment.deliveryPartner?.fullName || "Driver"} • Route Preview
                  </span>
                </div>
              </div>
            )}

            {/* Click to Expand Overlay Pill */}
            <div className="pointer-events-none absolute bottom-3 right-3 z-[1000] flex items-center gap-1.5 rounded-full bg-slate-900/85 px-3 py-1.5 text-[11px] font-bold text-white shadow-lg backdrop-blur-sm">
              <span>View Full Screen</span>
              <ExternalLink size={12} className="text-accent" />
            </div>

            {/* Quick ETA Badge if Available */}
            {data?.eta?.isAvailable && data.eta.eta && (
              <div className="pointer-events-none absolute top-3 left-3 z-[1000] flex items-center gap-1.5 rounded-lg bg-white/95 px-2.5 py-1 text-xs font-bold text-slate-900 shadow-md backdrop-blur-sm border border-slate-200">
                <Clock size={13} className="text-accent" />
                <span>ETA: {formatEtaMinutes(data.eta.eta.estimatedDurationSeconds)}</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Card Footer / Summary Info */}
      <div className="flex items-center justify-between border-t border-border bg-slate-50/80 px-4 py-3">
        <div className="text-xs">
          {assignment ? (
            <div>
              <span className="font-semibold text-slate-800">
                Partner: {assignment.deliveryPartner?.fullName || "Assigned Driver"}
              </span>
              {assignment.deliveryPartner?.phone && (
                <span className="ml-2 font-mono text-slate-500">
                  ({assignment.deliveryPartner.phone})
                </span>
              )}
            </div>
          ) : (
            <span className="text-slate-500">Dispatch: Jehanabad Central Store</span>
          )}
        </div>

        <button
          onClick={handleOpenDedicatedTracking}
          className="flex items-center gap-1 text-xs font-bold text-slate-900 transition-colors hover:text-accent"
        >
          <span>Tap to track</span>
          <ExternalLink size={12} />
        </button>
      </div>
    </div>
  )
}
