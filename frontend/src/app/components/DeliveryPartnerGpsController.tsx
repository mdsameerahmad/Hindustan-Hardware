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
}

export const DeliveryPartnerGpsController: React.FC<DeliveryPartnerGpsControllerProps> = ({
  deliveryId,
  orderNumber = "ORDER-REF",
  customerName = "Customer",
  customerAddress = "Delivery Location",
  initialStatus = "assigned",
  onStatusChange,
}) => {
  const [currentStatus, setCurrentStatus] = useState<string>(initialStatus)
  const [statusUpdating, setStatusUpdating] = useState<boolean>(false)
  const [statusError, setStatusError] = useState<string | null>(null)

  const isTerminal = ["delivered", "failed", "cancelled"].includes(currentStatus)

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
      if (["delivered", "failed", "cancelled"].includes(newStatus)) {
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

        {/* Live GPS Telemetry Dashboard */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3 text-center">
            <small className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
              GPS BROADCAST
            </small>
            <div className="mt-1 flex items-center justify-center gap-1.5 font-bold text-xs">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  isTracking ? "bg-emerald-400 animate-pulse shadow-sm shadow-emerald-400/50" : "bg-slate-600"
                }`}
              />
              <span className={isTracking ? "text-emerald-400" : "text-slate-400"}>
                {isTracking ? "Active Fix" : "Standby"}
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3 text-center">
            <small className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
              ACCURACY
            </small>
            <div className="mt-1 font-mono font-bold text-xs text-slate-200">
              {currentPosition?.accuracy ? `±${Math.round(currentPosition.accuracy)}m` : "--"}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3 text-center">
            <small className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
              SPEED
            </small>
            <div className="mt-1 font-mono font-bold text-xs text-slate-200 flex items-center justify-center gap-1">
              <Gauge size={13} className="text-amber-400" />
              <span>
                {currentPosition?.speed != null
                  ? `${(currentPosition.speed * 3.6).toFixed(1)} km/h`
                  : "--"}
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3 text-center">
            <small className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
              FIXES TRANSMITTED
            </small>
            <div className="mt-1 font-mono font-bold text-xs text-amber-400">
              {submissionCount} fixes
            </div>
          </div>
        </div>

        {/* Current Coordinates Banner */}
        {currentPosition && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 rounded-xl bg-amber-500/10 border border-amber-500/25 px-3.5 py-2.5 text-xs text-amber-300">
            <div className="flex items-center gap-2">
              <Compass size={14} className="text-amber-400 shrink-0" />
              <span className="font-mono text-[11px] sm:text-xs">
                Lat: {currentPosition.latitude.toFixed(6)}, Lon: {currentPosition.longitude.toFixed(6)}
              </span>
            </div>
            <span className="text-[11px] text-amber-400/80 font-medium">
              Last synced: {formatTimestamp(lastSubmittedAt)}
            </span>
          </div>
        )}

        {/* Error Notices */}
        {gpsError && (
          <div className="rounded-xl border border-red-800 bg-red-950/80 p-4 space-y-2 text-xs text-red-200 shadow-lg">
            <div className="flex items-start gap-2.5">
              <AlertTriangle size={18} className="text-red-400 shrink-0 mt-0.5" />
              <div>
                <b className="block text-sm font-bold text-red-100">
                  {permissionStatus === "insecure_origin" ? "Mobile Browser Security Requirement" : "GPS Ingestion Alert"}
                </b>
                <p className="mt-1 leading-relaxed text-red-200/90">{gpsError}</p>
              </div>
            </div>

            {permissionStatus === "insecure_origin" && typeof window !== "undefined" && (
              <div className="mt-2.5 rounded-lg bg-black/40 p-3 border border-red-800/80 text-[11px] text-slate-200 space-y-1.5 font-sans">
                <span className="font-bold text-amber-400 block">⚡ Quick 30-Second Fix in Phone's Chrome:</span>
                <ol className="list-decimal list-inside space-y-1 text-slate-300">
                  <li>In Chrome on mobile, open a tab and type: <code className="bg-slate-800 px-1 py-0.5 rounded font-mono text-amber-400 font-bold">chrome://flags</code></li>
                  <li>Search for: <code className="bg-slate-800 px-1 py-0.5 rounded font-mono text-white">unsafely-treat-insecure-origin-as-secure</code></li>
                  <li>Paste this server URL: <code className="bg-amber-950 px-1.5 py-0.5 rounded font-mono text-amber-300 font-bold">http://{window.location.host}</code></li>
                  <li>Select <b>Enabled</b> from dropdown and tap <b>Relaunch</b>.</li>
                </ol>
              </div>
            )}
          </div>
        )}

        {statusError && (
          <div className="rounded-xl border border-red-800 bg-red-950/80 p-3 text-xs text-red-200">
            {statusError}
          </div>
        )}

        {/* GPS Capture & Progression Controls */}
        {!isTerminal ? (
          <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2.5 sm:gap-3 pt-2">
            {!isTracking ? (
              <button
                type="button"
                disabled={isRequesting}
                onClick={startTracking}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2.5 text-xs transition shadow-md shadow-emerald-950/50 disabled:opacity-50"
              >
                {isRequesting ? (
                  <>
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    <span>Requesting GPS Access...</span>
                  </>
                ) : (
                  <>
                    <Play size={14} className="fill-current" />
                    <span>{gpsError ? "Retry Location Access" : "Start Location Broadcast"}</span>
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={stopTracking}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold px-4 py-2.5 text-xs transition shadow-md shadow-red-950/50"
              >
                <Square size={14} className="fill-current" />
                <span>Pause Location Broadcast</span>
              </button>
            )}

            {/* Quick Status Progression Buttons for Driver */}
            {currentStatus === "assigned" && (
              <button
                type="button"
                disabled={statusUpdating}
                onClick={() => handleStatusTransition("picked_up")}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-400 font-bold px-4 py-2.5 text-xs transition shadow-sm disabled:opacity-50"
              >
                {statusUpdating ? "Updating..." : "Mark Picked Up"}
              </button>
            )}

            {currentStatus === "picked_up" && (
              <button
                type="button"
                disabled={statusUpdating}
                onClick={() => handleStatusTransition("out_for_delivery")}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold px-4 py-2.5 text-xs transition shadow-md shadow-blue-950/50 disabled:opacity-50"
              >
                {statusUpdating ? "Updating..." : "Out for Delivery"}
              </button>
            )}

            {currentStatus === "out_for_delivery" && (
              <div className="flex w-full sm:w-auto gap-2">
                <button
                  type="button"
                  disabled={statusUpdating}
                  onClick={() => handleStatusTransition("delivered")}
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black px-4 py-2.5 text-xs transition shadow-md shadow-emerald-950/50 disabled:opacity-50"
                >
                  <CheckCircle2 size={14} />
                  <span>{statusUpdating ? "Completing..." : "Complete Delivery"}</span>
                </button>
                <button
                  type="button"
                  disabled={statusUpdating}
                  onClick={() => handleStatusTransition("failed")}
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 rounded-xl bg-red-900/60 hover:bg-red-900 border border-red-700 text-red-200 font-bold px-3 py-2.5 text-xs transition disabled:opacity-50"
                >
                  {statusUpdating ? "Updating..." : "Mark Failed"}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2.5 rounded-xl bg-emerald-950/60 border border-emerald-800/80 p-3.5 text-xs text-emerald-300">
            <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
            <span className="font-semibold">Delivery completed. Live location broadcasts are concluded for this dispatch.</span>
          </div>
        )}
      </div>
    </div>
  )
}
