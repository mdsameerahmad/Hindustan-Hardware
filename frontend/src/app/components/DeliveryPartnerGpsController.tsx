import {
  AlertTriangle,
  CheckCircle2,
  Compass,
  Gauge,
  MapPin,
  Navigation,
  Play,
  Square
} from "lucide-react"
import React, { useState } from "react"
import { Badge, Button } from "../components"
import { deliveryTrackingApi } from "../features/deliveryTrackingApi"
import { useDeviceGps } from "../features/useDeviceGps"

interface DeliveryPartnerGpsControllerProps {
  deliveryId: string
  orderNumber?: string
  customerName?: string
  customerAddress?: string
  initialStatus?: string
  onStatusChange?: (newStatus: string) => void
  onLocationChange?: (coords: { latitude: number; longitude: number } | null) => void
}

export const DeliveryPartnerGpsController: React.FC<DeliveryPartnerGpsControllerProps> = ({
  deliveryId,
  orderNumber = "ORDER-REF",
  customerName = "Customer",
  customerAddress = "Delivery Location",
  initialStatus = "assigned",
  onStatusChange,
  onLocationChange,
}) => {
  const [currentStatus, setCurrentStatus] = useState<string>(initialStatus)
  const [statusUpdating, setStatusUpdating] = useState<boolean>(false)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [rideEnded, setRideEnded] = useState<boolean>(false)

  const isTerminal = (currentStatus === "delivered" && rideEnded) || ["failed", "cancelled"].includes(currentStatus)

  const {
    isTracking,
    isRequesting,
    permissionStatus,
    currentPosition,
    lastSubmittedAt,
    error: gpsError,
    submissionCount,
    startTracking,
    stopTracking,
  } = useDeviceGps({
    deliveryId,
    isActiveDelivery: !isTerminal,
    minUpdateIntervalMs: 5000,
    minDistanceChangeMeters: 5,
  })

  // Sync latest partner device coordinates with parent live map
  React.useEffect(() => {
    if (onLocationChange) {
      if (currentPosition) {
        onLocationChange({
          latitude: currentPosition.latitude,
          longitude: currentPosition.longitude,
        })
      } else {
        onLocationChange(null)
      }
    }
  }, [currentPosition, onLocationChange])

  const handleStatusTransition = async (
    newStatus: "assigned" | "picked_up" | "out_for_delivery" | "delivered" | "failed" | "cancelled",
  ) => {
    setStatusUpdating(true)
    setStatusError(null)

    try {
      await deliveryTrackingApi.updateDeliveryStatus(deliveryId, newStatus)
      setCurrentStatus(newStatus)
      if (onStatusChange) {
        onStatusChange(newStatus)
      }

      // When partner marks picked_up or out_for_delivery, auto-start ride location broadcast if not already running
      if ((newStatus === "picked_up" || newStatus === "out_for_delivery") && !isTracking) {
        startTracking()
      }

      if (["failed", "cancelled"].includes(newStatus)) {
        stopTracking()
      }
    } catch (err: any) {
      setStatusError(err?.message || "Failed to update delivery status.")
    } finally {
      setStatusUpdating(false)
    }
  }

  const formatTimestamp = (iso?: string | null) => {
    if (!iso) return "None yet"
    try {
      return new Intl.DateTimeFormat("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(new Date(iso))
    } catch {
      return iso
    }
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950 shadow-xl overflow-hidden min-w-0 transition-all">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 px-4 py-3 sm:px-5 sm:py-3.5 text-white">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30 shrink-0">
            <Navigation size={16} />
          </span>
          <div className="min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 block truncate">
              Fleet GPS & Dispatch Control
            </span>
            <h3 className="text-xs sm:text-sm font-black text-white truncate">{orderNumber}</h3>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Badge
            tone={
              currentStatus === "delivered"
                ? "success"
                : currentStatus === "out_for_delivery"
                  ? "blue"
                  : currentStatus === "picked_up"
                    ? "warning"
                    : "neutral"
            }
          >
            <span className="capitalize text-[11px] font-bold">{currentStatus.replace(/_/g, " ")}</span>
          </Badge>
        </div>
      </div>

      <div className="p-4 sm:p-5 space-y-4 sm:space-y-5">
        {/* Destination & Customer Info */}
        <div className="rounded-xl bg-slate-900/80 p-3.5 sm:p-4 border border-slate-800 text-xs min-w-0">
          <div className="flex items-start gap-2.5 min-w-0">
            <MapPin size={16} className="text-amber-400 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <span className="text-slate-200 block text-xs sm:text-sm font-bold truncate">{customerName}</span>
              <span className="text-slate-400 block mt-0.5 break-words leading-relaxed">{customerAddress}</span>
            </div>
          </div>
        </div>

        {/* Sleek Delivery Partner Speedometer & Stats Card */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Circular/Digital Speedometer */}
          <div className="rounded-2xl border border-slate-800 bg-gradient-to-b from-slate-900 to-slate-950 p-4 flex flex-col items-center justify-center relative overflow-hidden shadow-inner">
            <div className="absolute top-2.5 left-3 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <Gauge size={13} className="text-amber-400" />
              <span>Speedometer</span>
            </div>
            
            <div className="my-2 flex flex-col items-center justify-center">
              <div className="relative flex items-baseline gap-1">
                <span className="text-4xl font-black tracking-tight text-white font-mono">
                  {currentPosition?.speed != null ? Math.round(currentPosition.speed * 3.6) : 0}
                </span>
                <span className="text-xs font-bold text-amber-400 uppercase">km/h</span>
              </div>
              <span className="text-[10px] text-slate-400 font-medium">
                {isTracking ? "Live Speed Tracking" : "Vehicle Idle / Standby"}
              </span>
            </div>

            <div className="w-full flex items-center justify-between text-[11px] pt-2 border-t border-slate-800/80">
              <span className="text-slate-400">Accuracy</span>
              <span className="font-mono font-bold text-slate-200">
                {currentPosition?.accuracy ? `±${Math.round(currentPosition.accuracy)}m` : "Standby"}
              </span>
            </div>
          </div>

          {/* GPS Broadcast & Transmission Stats */}
          <div className="md:col-span-2 grid grid-cols-2 gap-2.5">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3.5 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">GPS Broadcast</span>
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    isTracking ? "bg-emerald-400 animate-pulse shadow-sm shadow-emerald-400/50" : "bg-slate-600"
                  }`}
                />
              </div>
              <div className="mt-2">
                <span className={`text-sm font-black ${isTracking ? "text-emerald-400" : "text-slate-400"}`}>
                  {isTracking ? "Active & Broadcasting" : "Standby"}
                </span>
                <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                  {currentPosition
                    ? `Lat: ${currentPosition.latitude.toFixed(4)}, Lon: ${currentPosition.longitude.toFixed(4)}`
                    : "No location fix yet"}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3.5 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Sync Status</span>
                <Compass size={14} className="text-amber-400" />
              </div>
              <div className="mt-2">
                <span className="text-sm font-black text-amber-400 font-mono">
                  {submissionCount} fixes synced
                </span>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Last: {formatTimestamp(lastSubmittedAt)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Insecure Origin Alert only if mobile browser requires flag */}
        {gpsError && permissionStatus === "insecure_origin" && (
          <div className="rounded-xl border border-amber-800/80 bg-amber-950/80 p-3.5 space-y-1.5 text-xs text-amber-200">
            <div className="flex items-center gap-2">
              <AlertTriangle size={15} className="text-amber-400 shrink-0" />
              <b className="text-xs font-bold text-amber-100">Mobile Browser Location Setup</b>
            </div>
            <p className="text-[11px] leading-relaxed text-amber-200/90">
              On mobile Chrome, enable <code className="bg-amber-900/60 px-1 py-0.5 rounded font-mono text-white">chrome://flags/#unsafely-treat-insecure-origin-as-secure</code> for this server URL to broadcast live GPS.
            </p>
          </div>
        )}

        {statusError && (
          <div className="rounded-xl border border-red-800 bg-red-950/80 p-3 text-xs text-red-200">
            {statusError}
          </div>
        )}

        {/* GPS Capture & Progression Controls */}
        {!isTerminal ? (
          <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2.5 sm:gap-3 pt-1">
            {/* If Order is marked Delivered, show prominent End Ride button */}
            {currentStatus === "delivered" ? (
              <button
                type="button"
                onClick={() => {
                  stopTracking()
                  setRideEnded(true)
                }}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black px-6 py-3.5 text-xs transition shadow-lg shadow-red-950/50 animate-pulse"
              >
                <Square size={14} className="fill-current" />
                <span>End Ride &amp; Conclude Shift</span>
              </button>
            ) : (
              <>
                {/* 1. Start Ride / Live Tracking GPS */}
                {!isTracking ? (
                  <button
                    type="button"
                    disabled={isRequesting}
                    onClick={startTracking}
                    className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-5 py-3 text-xs transition shadow-md shadow-emerald-950/50 disabled:opacity-50"
                  >
                    {isRequesting ? (
                      <>
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        <span>Connecting GPS...</span>
                      </>
                    ) : (
                      <>
                        <Play size={15} className="fill-current" />
                        <span>Start Ride</span>
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopTracking}
                    className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold px-4 py-3 text-xs transition shadow-sm"
                  >
                    <Square size={14} className="fill-current" />
                    <span>Pause GPS</span>
                  </button>
                )}

                {/* 2. Order Progression Buttons */}
                {currentStatus === "assigned" && (
                  <button
                    type="button"
                    disabled={statusUpdating}
                    onClick={() => handleStatusTransition("picked_up")}
                    className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-400 font-bold px-4 py-3 text-xs transition shadow-sm disabled:opacity-50"
                  >
                    {statusUpdating ? "Updating..." : "Mark Picked Up"}
                  </button>
                )}

                {currentStatus === "picked_up" && (
                  <button
                    type="button"
                    disabled={statusUpdating}
                    onClick={() => handleStatusTransition("out_for_delivery")}
                    className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold px-4 py-3 text-xs transition shadow-md shadow-blue-950/50 disabled:opacity-50"
                  >
                    {statusUpdating ? "Updating..." : "Out for Delivery"}
                  </button>
                )}

                {/* 3. Separate Dedicated Order Delivered Button */}
                {(currentStatus === "out_for_delivery" || currentStatus === "picked_up") && (
                  <button
                    type="button"
                    disabled={statusUpdating}
                    onClick={() => handleStatusTransition("delivered")}
                    className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-black px-6 py-3 text-xs transition shadow-lg shadow-emerald-950/50 disabled:opacity-50"
                  >
                    <CheckCircle2 size={16} />
                    <span>{statusUpdating ? "Marking Delivered..." : "Order Delivered"}</span>
                  </button>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2.5 rounded-xl bg-emerald-950/60 border border-emerald-800/80 p-3.5 text-xs text-emerald-300">
            <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
            <span className="font-semibold">Ride concluded &amp; order delivered successfully.</span>
          </div>
        )}
      </div>
    </div>
  )
}
