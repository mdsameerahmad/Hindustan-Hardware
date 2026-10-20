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
    <div className="rounded-xl border border-border bg-white shadow-sm overflow-hidden">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between border-b border-border bg-slate-900 px-5 py-3 text-white">
        <div className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent/20 text-accent">
            <Navigation size={15} />
          </span>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Delivery Partner Fleet Tracker
            </span>
            <h3 className="text-sm font-black text-slate-100">{orderNumber}</h3>
          </div>
        </div>

        <div className="flex items-center gap-2">
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
            <span className="capitalize">{currentStatus.replace(/_/g, " ")}</span>
          </Badge>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* Destination & Customer Info */}
        <div className="rounded-lg bg-slate-50 p-3.5 border border-slate-200 text-xs">
          <div className="flex items-start gap-2">
            <MapPin size={16} className="text-slate-500 shrink-0 mt-0.5" />
            <div>
              <b className="text-slate-900 block text-sm font-bold">{customerName}</b>
              <span className="text-slate-600 block mt-0.5">{customerAddress}</span>
            </div>
          </div>
        </div>

        {/* Live GPS Telemetry Dashboard */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 text-center">
            <small className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
              GPS STATUS
            </small>
            <div className="mt-1 flex items-center justify-center gap-1.5 font-bold text-xs">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  isTracking ? "bg-emerald-500 animate-pulse" : "bg-slate-400"
                }`}
              />
              <span className={isTracking ? "text-emerald-700" : "text-slate-600"}>
                {isTracking ? "Broadcasting" : "Standby"}
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 text-center">
            <small className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
              ACCURACY
            </small>
            <div className="mt-1 font-mono font-bold text-xs text-slate-800">
              {currentPosition?.accuracy ? `±${Math.round(currentPosition.accuracy)}m` : "--"}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 text-center">
            <small className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
              SPEED
            </small>
            <div className="mt-1 font-mono font-bold text-xs text-slate-800 flex items-center justify-center gap-1">
              <Gauge size={13} className="text-slate-400" />
              <span>
                {currentPosition?.speed != null
                  ? `${(currentPosition.speed * 3.6).toFixed(1)} km/h`
                  : "--"}
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 text-center">
            <small className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
              UPDATES SENT
            </small>
            <div className="mt-1 font-mono font-bold text-xs text-slate-800">
              {submissionCount} fixes
            </div>
          </div>
        </div>

        {/* Current Coordinates Banner */}
        {currentPosition && (
          <div className="flex items-center justify-between rounded-lg bg-amber-50/60 border border-amber-200/80 px-3.5 py-2 text-xs text-amber-900">
            <div className="flex items-center gap-2">
              <Compass size={14} className="text-accent shrink-0" />
              <span className="font-mono">
                Lat: {currentPosition.latitude.toFixed(6)}, Lon: {currentPosition.longitude.toFixed(6)}
              </span>
            </div>
            <span className="text-[11px] text-amber-700 font-medium">
              Last sent: {formatTimestamp(lastSubmittedAt)}
            </span>
          </div>
        )}

        {/* Error Notices */}
        {gpsError && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-2 text-xs text-red-700 shadow-sm">
            <div className="flex items-start gap-2.5">
              <AlertTriangle size={17} className="text-red-600 shrink-0 mt-0.5" />
              <div>
                <b className="block text-sm font-bold text-red-950">
                  {permissionStatus === "insecure_origin" ? "Mobile Browser Security Requirement" : "GPS Ingestion Alert"}
                </b>
                <p className="mt-1 leading-relaxed text-red-800">{gpsError}</p>
              </div>
            </div>

            {permissionStatus === "insecure_origin" && typeof window !== "undefined" && (
              <div className="mt-2.5 rounded-lg bg-white/80 p-3 border border-red-200/80 text-[11px] text-slate-800 space-y-1.5 font-sans">
                <span className="font-bold text-slate-900 block">⚡ Quick 30-Second Fix in Phone's Chrome:</span>
                <ol className="list-decimal list-inside space-y-1 text-slate-700">
                  <li>In Chrome, open a new tab and type: <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-red-600 font-bold">chrome://flags</code></li>
                  <li>Search for: <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-slate-900">unsafely-treat-insecure-origin-as-secure</code></li>
                  <li>Paste this server URL: <code className="bg-amber-100 px-1.5 py-0.5 rounded font-mono text-amber-900 font-bold">http://{window.location.host}</code></li>
                  <li>Change dropdown to <b>Enabled</b> and tap <b>Relaunch</b>.</li>
                </ol>
              </div>
            )}
          </div>
        )}

        {statusError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            {statusError}
          </div>
        )}

        {/* GPS Capture Controls */}
        {!isTerminal ? (
          <div className="flex flex-wrap items-center gap-3 pt-2">
            {!isTracking ? (
              <Button
                variant="primary"
                disabled={isRequesting}
                onClick={startTracking}
                className="flex items-center gap-2 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {isRequesting ? (
                  <>
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    <span>Requesting GPS Access...</span>
                  </>
                ) : (
                  <>
                    <Play size={14} />
                    <span>{gpsError ? "Retry Location Access" : "Start Location Broadcast"}</span>
                  </>
                )}
              </Button>
            ) : (
              <Button
                variant="danger"
                onClick={stopTracking}
                className="flex items-center gap-2 text-xs"
              >
                <Square size={14} />
                <span>Pause Location Broadcast</span>
              </Button>
            )}

            {/* Quick Status Progression Buttons for Driver */}
            {currentStatus === "assigned" && (
              <Button
                variant="outline"
                disabled={statusUpdating}
                onClick={() => handleStatusTransition("picked_up")}
                className="text-xs"
              >
                {statusUpdating ? "Updating..." : "Mark Picked Up"}
              </Button>
            )}

            {currentStatus === "picked_up" && (
              <Button
                variant="outline"
                disabled={statusUpdating}
                onClick={() => handleStatusTransition("out_for_delivery")}
                className="text-xs"
              >
                {statusUpdating ? "Updating..." : "Out for Delivery"}
              </Button>
            )}

            {currentStatus === "out_for_delivery" && (
              <>
                <Button
                  variant="outline"
                  disabled={statusUpdating}
                  onClick={() => handleStatusTransition("delivered")}
                  className="text-xs text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                >
                  {statusUpdating ? "Updating..." : "Complete Delivery"}
                </Button>
                <Button
                  variant="outline"
                  disabled={statusUpdating}
                  onClick={() => handleStatusTransition("failed")}
                  className="text-xs text-red-600 border-red-200 hover:bg-red-50"
                >
                  {statusUpdating ? "Updating..." : "Mark Failed"}
                </Button>
              </>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800">
            <CheckCircle2 size={16} className="text-emerald-600" />
            <span>Delivery finished. Live location broadcasts are disabled for this order.</span>
          </div>
        )}
      </div>
    </div>
  )
}
