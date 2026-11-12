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
import { deliveryTrackingApi } from "../features/deliveryTrackingApi"
import { useDeviceGps } from "../features/useDeviceGps"

export interface DeliveryPartnerLocationUpdate {
  latitude: number
  longitude: number
  heading?: number | null
  speed?: number | null
  accuracy?: number | null
}

interface DeliveryPartnerGpsControllerProps {
  deliveryId: string
  orderNumber?: string
  customerName?: string
  customerAddress?: string
  destinationLat?: number | null
  destinationLng?: number | null
  initialStatus?: string
  onStatusChange?: (newStatus: string) => void
  onLocationChange?: (coords: DeliveryPartnerLocationUpdate | null) => void
  onTrackingChange?: (isTracking: boolean) => void
}

export const DeliveryPartnerGpsController: React.FC<DeliveryPartnerGpsControllerProps> = ({
  deliveryId,
  orderNumber = "ORDER-REF",
  customerName = "Customer",
  customerAddress = "Delivery Location",
  destinationLat,
  destinationLng,
  initialStatus = "assigned",
  onStatusChange,
  onLocationChange,
  onTrackingChange,
}) => {
  const [currentStatus, setCurrentStatus] = useState<string>(initialStatus)
  const [statusUpdating, setStatusUpdating] = useState<boolean>(false)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [deliveryOtp, setDeliveryOtp] = useState("")
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
    wakeLockActive,
    startTracking,
    stopTracking,
  } = useDeviceGps({
    deliveryId,
    isActiveDelivery: !isTerminal,
    minUpdateIntervalMs: 5000,
    minDistanceChangeMeters: 5,
  })

  // Notify parent of tracking state
  React.useEffect(() => {
    if (onTrackingChange) {
      onTrackingChange(isTracking)
    }
  }, [isTracking, onTrackingChange])

  // Sync latest partner device coordinates, heading, and speed with parent live map
  React.useEffect(() => {
    if (onLocationChange) {
      if (currentPosition) {
        onLocationChange({
          latitude: currentPosition.latitude,
          longitude: currentPosition.longitude,
          heading: currentPosition.heading,
          speed: currentPosition.speed,
          accuracy: currentPosition.accuracy,
        })
      } else {
        onLocationChange(null)
      }
    }
  }, [currentPosition, onLocationChange])

  const handleStatusTransition = async (
    newStatus: "assigned" | "picked_up" | "out_for_delivery" | "failed" | "cancelled",
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

      // If partner clicks "At Destination", immediately submit their exact GPS fix
      if (newStatus === "out_for_delivery" && currentPosition && onLocationChange) {
        onLocationChange({
          latitude: currentPosition.latitude,
          longitude: currentPosition.longitude,
          heading: currentPosition.heading,
          speed: currentPosition.speed,
          accuracy: currentPosition.accuracy,
        })
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

  const handleAtDestination = async () => {
    setStatusUpdating(true)
    setStatusError(null)
    try {
      let targetLat = destinationLat
      let targetLng = destinationLng
      if (
        targetLat == null ||
        targetLng == null ||
        !Number.isFinite(targetLat) ||
        !Number.isFinite(targetLng)
      ) {
        const route = await deliveryTrackingApi.getDeliveryRoute(deliveryId)
        targetLat = route.destination.latitude
        targetLng = route.destination.longitude
      }

      if (
        !Number.isFinite(targetLat) ||
        !Number.isFinite(targetLng) ||
        targetLat < -90 ||
        targetLat > 90 ||
        targetLng < -180 ||
        targetLng > 180
      ) {
        throw new Error("Valid delivery destination coordinates are unavailable.")
      }

      const coords = {
        latitude: destinationLat,
        longitude: destinationLng,
        heading: currentPosition?.heading ?? 0,
        speed: 0,
        accuracy: 5,
      }

      await deliveryTrackingApi.submitLocationUpdate(deliveryId, {
        ...coords,
        deviceTimestamp: new Date().toISOString(),
      })

      // Immediately update local partner map
      if (onLocationChange) {
        onLocationChange(coords)
      }
    } catch (err: any) {
      setStatusError(err?.message || "Could not update your location to the delivery destination.")
    } finally {
      setStatusUpdating(false)
    }
  }

  const handleVerifyDeliveryOtp = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!/^\d{6}$/.test(deliveryOtp)) {
      setStatusError("Enter the customer's 6-digit delivery OTP.")
      return
    }

    setStatusUpdating(true)
    setStatusError(null)
    try {
      await deliveryTrackingApi.verifyDeliveryOtp(deliveryId, deliveryOtp)
      setDeliveryOtp("")
      setCurrentStatus("delivered")
      setRideEnded(true)
      stopTracking()
      onStatusChange?.("delivered")
    } catch (err: any) {
      setStatusError(err?.message || "Delivery OTP verification failed.")
    } finally {
      setStatusUpdating(false)
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs min-w-0 transition-all">
      {statusError && (
        <div className="mb-3.5 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 font-semibold flex items-center gap-2">
          <AlertTriangle size={15} className="text-red-600 shrink-0" />
          <span>{statusError}</span>
        </div>
      )}

      {/* GPS & Order Progression Buttons — Exact Brand Theme */}
      {!isTerminal ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2.5">
            {/* 1. Start Ride / Pause Ride */}
            {!isTracking ? (
              <button
                type="button"
                disabled={isRequesting}
                onClick={startTracking}
                className="btn-gold-gradient flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 rounded-xl text-[#0B0B0B] font-black px-5 py-3.5 text-xs transition shadow-md active:scale-[0.98] disabled:opacity-50"
              >
                {isRequesting ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#0B0B0B] border-t-transparent" />
                    <span>Connecting GPS...</span>
                  </>
                ) : (
                  <>
                    <Play size={16} className="fill-current text-[#0B0B0B] stroke-none" />
                    <span>START GPS RIDE</span>
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={stopTracking}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 font-black px-4 py-3.5 text-xs transition shadow-xs"
              >
                <Square size={13} className="fill-current text-slate-700" />
                <span>Pause Ride</span>
              </button>
            )}

            {/* 2. Order Picked Up Button */}
            {currentStatus === "assigned" && (
              <button
                type="button"
                disabled={statusUpdating}
                onClick={() => handleStatusTransition("picked_up")}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 rounded-xl bg-[#0B0B0B] hover:bg-black text-[#D4AF37] border border-[#D4AF37]/40 font-black px-6 py-3.5 text-xs transition shadow-md active:scale-[0.98] disabled:opacity-50"
              >
                <CheckCircle2 size={16} />
                <span>{statusUpdating ? "Updating..." : "Order Picked Up"}</span>
              </button>
            )}

            {/* 3. Start Delivery / Out for Delivery */}
            {currentStatus === "picked_up" && (
              <button
                type="button"
                disabled={statusUpdating}
                onClick={() => handleStatusTransition("out_for_delivery")}
                className="btn-gold-gradient flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 rounded-xl text-[#0B0B0B] font-black px-6 py-3.5 text-xs transition shadow-md active:scale-[0.98] disabled:opacity-50"
              >
                <Navigation size={16} />
                <span>{statusUpdating ? "Updating..." : "Out for Delivery"}</span>
              </button>
            )}

            {/* 4. At Destination Button */}
            {(currentStatus === "out_for_delivery" || currentStatus === "picked_up") && (
              <button
                type="button"
                disabled={statusUpdating}
                onClick={handleAtDestination}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-black px-5 py-3.5 text-xs transition shadow-xs active:scale-[0.98] disabled:opacity-50 border border-slate-700"
              >
                <MapPin size={15} className="text-[#D4AF37]" />
                <span>{statusUpdating ? "Updating..." : "At Destination"}</span>
              </button>
            )}
          </div>

          {/* OTP Verification Form — Brand Gold Palette */}
          {currentStatus === "out_for_delivery" && (
            <form onSubmit={handleVerifyDeliveryOtp} className="w-full rounded-2xl border-2 border-[#D4AF37] bg-[#FFFDF5] p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 size={18} className="text-[#B89124] shrink-0" />
                <label htmlFor="delivery-otp" className="text-xs font-black uppercase tracking-wider text-[#0B0B0B]">
                  Customer Delivery OTP
                </label>
              </div>
              <p className="text-xs text-slate-600 mb-3 font-medium">
                Ask the customer for their 6-digit confirmation code:
              </p>
              <div className="flex flex-col sm:flex-row gap-2.5">
                <input
                  id="delivery-otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  placeholder="••••••"
                  value={deliveryOtp}
                  onChange={(event) => setDeliveryOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  disabled={statusUpdating}
                  className="min-w-0 flex-1 rounded-xl border-2 border-[#D4AF37]/50 bg-white px-4 py-3 font-mono text-xl tracking-[0.4em] text-slate-900 text-center font-black outline-none focus:border-[#D4AF37] focus:ring-4 focus:ring-[#D4AF37]/20 disabled:opacity-60 shadow-inner"
                  aria-describedby="delivery-otp-help"
                />
                <button
                  type="submit"
                  disabled={statusUpdating || deliveryOtp.length !== 6}
                  className="btn-gold-gradient inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-xs font-black shadow-md transition disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]"
                >
                  <CheckCircle2 size={16} />
                  <span>{statusUpdating ? "Verifying..." : "Verify & Complete Delivery"}</span>
                </button>
              </div>
              <p id="delivery-otp-help" className="mt-2 text-[11px] font-bold text-slate-500">
                Delivered status activates once verified.
              </p>
            </form>
          )}

          {/* End Ride / Conclude when marked Delivered */}
          {currentStatus === "delivered" && (
            <button
              type="button"
              onClick={() => {
                stopTracking()
                setRideEnded(true)
              }}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black px-6 py-3.5 text-xs transition shadow-md"
            >
              <Square size={14} className="fill-current" />
              <span>Conclude Trip &amp; Go Next</span>
            </button>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2.5 rounded-xl bg-emerald-50 border border-emerald-200 p-3.5 text-xs text-emerald-900 font-bold">
          <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
          <span>Trip finished! Order delivered to customer doorstep successfully.</span>
        </div>
      )}
    </div>
  )
}
