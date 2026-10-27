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
      // 1. Determine destination coordinates
      const targetLat = destinationLat ?? currentPosition?.latitude ?? 25.19833
      const targetLng = destinationLng ?? currentPosition?.longitude ?? 84.98437

      const coords = {
        latitude: targetLat,
        longitude: targetLng,
        heading: currentPosition?.heading ?? 0,
        speed: 0,
        accuracy: 5,
      }

      // Record to database & broadcast via Socket.IO to customer + admin rooms
      try {
        await deliveryTrackingApi.recordDeliveryLocation(deliveryId, {
          ...coords,
          deviceTimestamp: new Date().toISOString(),
        })
      } catch (err) {
        console.warn("Could not save destination fix to REST API:", err)
      }

      // Immediately update local partner map
      if (onLocationChange) {
        onLocationChange(coords)
      }
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
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs min-w-0 transition-all">
      {statusError && (
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-800">
          {statusError}
        </div>
      )}

      {/* GPS & Order Progression Buttons */}
      {!isTerminal ? (
        <div className="flex flex-wrap items-center gap-2.5">
          {/* 1. Start Ride / Pause Ride */}
          {!isTracking ? (
            <button
              type="button"
              disabled={isRequesting}
              onClick={startTracking}
              className="btn-gold-gradient flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 rounded-xl text-[#0B0B0B] font-bold px-5 py-3 text-xs transition shadow-sm disabled:opacity-50"
            >
              {isRequesting ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#0B0B0B] border-t-transparent" />
                  <span>Connecting GPS...</span>
                </>
              ) : (
                <>
                  <Play size={15} className="fill-current text-[#0B0B0B]" />
                  <span>Start Ride</span>
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={stopTracking}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 font-bold px-4 py-3 text-xs transition shadow-xs"
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
              className="btn-cart-gradient flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 rounded-xl px-5 py-3 text-xs font-bold transition shadow-xs disabled:opacity-50"
            >
              {statusUpdating ? "Updating..." : "Order Picked Up"}
            </button>
          )}

          {/* 3. Start Delivery / Out for Delivery */}
          {currentStatus === "picked_up" && (
            <button
              type="button"
              disabled={statusUpdating}
              onClick={() => handleStatusTransition("out_for_delivery")}
              className="btn-gold-gradient flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 rounded-xl text-[#0B0B0B] font-bold px-5 py-3 text-xs transition shadow-sm disabled:opacity-50"
            >
              {statusUpdating ? "Updating..." : "Out for Delivery"}
            </button>
          )}

          {/* 4. At Destination Button (Updates Map with Exact Partner Location at Customer Destination) */}
          {(currentStatus === "out_for_delivery" || currentStatus === "picked_up") && (
            <button
              type="button"
              disabled={statusUpdating}
              onClick={handleAtDestination}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-3 text-xs transition shadow-xs disabled:opacity-50"
            >
              <MapPin size={14} className="text-white" />
              <span>{statusUpdating ? "Updating..." : "At Destination"}</span>
            </button>
          )}

          {currentStatus === "out_for_delivery" && (
            <form onSubmit={handleVerifyDeliveryOtp} className="w-full rounded-xl border border-amber-200 bg-amber-50 p-3">
              <label htmlFor="delivery-otp" className="block text-xs font-bold text-amber-950">
                Enter customer&apos;s 6-digit OTP to complete delivery
              </label>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input
                  id="delivery-otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={deliveryOtp}
                  onChange={(event) => setDeliveryOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  disabled={statusUpdating}
                  className="min-w-0 flex-1 rounded-lg border border-amber-300 bg-white px-3 py-2 font-mono text-lg tracking-[0.35em] text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 disabled:opacity-60"
                  aria-describedby="delivery-otp-help"
                />
                <button
                  type="submit"
                  disabled={statusUpdating || deliveryOtp.length !== 6}
                  className="btn-cart-gradient inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-xs font-black shadow-xs disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <CheckCircle2 size={16} className="text-[#D4AF37]" />
                  {statusUpdating ? "Verifying..." : "Verify & Mark Delivered"}
                </button>
              </div>
              <p id="delivery-otp-help" className="mt-1.5 text-[11px] text-amber-800">
                The order status changes only after the code is verified.
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
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black px-6 py-3 text-xs transition shadow-md"
            >
              <Square size={13} className="fill-current" />
              <span>End Ride &amp; Conclude</span>
            </button>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2.5 rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800">
          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          <span className="font-semibold">Ride concluded &amp; order delivered successfully.</span>
        </div>
      )}
    </div>
  )
}
