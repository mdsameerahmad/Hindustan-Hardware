import { useState, useEffect, useRef, useCallback } from "react"
import { deliveryTrackingApi } from "./deliveryTrackingApi"

export interface GeolocationCoords {
  latitude: number
  longitude: number
  accuracy: number | null
  speed: number | null
  heading: number | null
  deviceTimestamp: string
}

export interface UseDeviceGpsOptions {
  deliveryId?: string | null
  isActiveDelivery?: boolean
  minUpdateIntervalMs?: number // Throttling: default 5000ms
  minDistanceChangeMeters?: number // Throttling: default 5 meters
}

export function useDeviceGps({
  deliveryId,
  isActiveDelivery = true,
  minUpdateIntervalMs = 5000,
  minDistanceChangeMeters = 5,
}: UseDeviceGpsOptions) {
  const [isTracking, setIsTracking] = useState<boolean>(false)
  const [isRequesting, setIsRequesting] = useState<boolean>(false)
  const [permissionStatus, setPermissionStatus] = useState<"prompt" | "granted" | "denied" | "unsupported" | "insecure_origin">("prompt")
  const [currentPosition, setCurrentPosition] = useState<GeolocationCoords | null>(null)
  const [lastSubmittedAt, setLastSubmittedAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submissionCount, setSubmissionCount] = useState<number>(0)

  const watchIdRef = useRef<number | null>(null)
  const lastSubmittedPosRef = useRef<GeolocationCoords | null>(null)
  const lastSubmitTimeRef = useRef<number>(0)
  const isSubmittingRef = useRef<boolean>(false)

  // Haversine formula to compute distance in meters between consecutive GPS readings
  const calculateDistanceMeters = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371e3 // Earth radius in meters
    const phi1 = (lat1 * Math.PI) / 180
    const phi2 = (lat2 * Math.PI) / 180
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
  }

  // Check secure context and initial permission status
  useEffect(() => {
    if (typeof window === "undefined") return

    // Insecure non-localhost context check:
    const isLocalhost =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1" ||
      window.location.hostname === "::1"

    if (!window.isSecureContext && !isLocalhost) {
      setPermissionStatus("insecure_origin")
      // Do not block initial render, but record accurate advisory
      return
    }

    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setPermissionStatus("unsupported")
      return
    }

    if ("permissions" in navigator && navigator.permissions?.query) {
      navigator.permissions
        .query({ name: "geolocation" as PermissionName })
        .then((result) => {
          setPermissionStatus(result.state)
          result.onchange = () => {
            setPermissionStatus(result.state)
          }
        })
        .catch(() => {
          // Permissions API query not supported for geolocation in some browsers
        })
    }
  }, [])

  // Process and submit real GPS coordinates to backend
  const handlePositionUpdate = useCallback(
    async (pos: GeolocationPosition) => {
      setIsRequesting(false)
      const { latitude, longitude, accuracy, speed, heading } = pos.coords
      const timestampIso = new Date(pos.timestamp || Date.now()).toISOString()

      // Validate geographic ranges
      if (
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180 ||
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude)
      ) {
        return
      }

      const newCoords: GeolocationCoords = {
        latitude,
        longitude,
        accuracy: accuracy != null && Number.isFinite(accuracy) ? accuracy : null,
        speed: speed != null && Number.isFinite(speed) && speed >= 0 ? speed : null,
        heading: heading != null && Number.isFinite(heading) && heading >= 0 ? heading : null,
        deviceTimestamp: timestampIso,
      }

      setCurrentPosition(newCoords)
      setPermissionStatus("granted")
      setError(null)

      if (!deliveryId || !isActiveDelivery) {
        return
      }

      const now = Date.now()
      const timeSinceLastSubmit = now - lastSubmitTimeRef.current

      // Throttling Check: Minimum time interval (default 5s)
      if (timeSinceLastSubmit < minUpdateIntervalMs && lastSubmitTimeRef.current !== 0) {
        return
      }

      // Displacement Check: Minimum distance displacement (default 5m)
      if (lastSubmittedPosRef.current) {
        const dist = calculateDistanceMeters(
          lastSubmittedPosRef.current.latitude,
          lastSubmittedPosRef.current.longitude,
          latitude,
          longitude,
        )
        // If moved less than minDistance and within 30 seconds, conserve network
        if (dist < minDistanceChangeMeters && timeSinceLastSubmit < 30000) {
          return
        }
      }

      if (isSubmittingRef.current) return
      isSubmittingRef.current = true

      try {
        await deliveryTrackingApi.submitLocationUpdate(deliveryId, {
          latitude: newCoords.latitude,
          longitude: newCoords.longitude,
          accuracy: newCoords.accuracy,
          speed: newCoords.speed,
          heading: newCoords.heading,
          deviceTimestamp: newCoords.deviceTimestamp,
        })

        lastSubmittedPosRef.current = newCoords
        lastSubmitTimeRef.current = Date.now()
        setLastSubmittedAt(new Date().toISOString())
        setSubmissionCount((c) => c + 1)
        setError(null)
      } catch (err: any) {
        const errorMsg = err?.message || "Failed to submit GPS location to server."
        setError(errorMsg)
      } finally {
        isSubmittingRef.current = false
      }
    },
    [deliveryId, isActiveDelivery, minUpdateIntervalMs, minDistanceChangeMeters],
  )

  const handlePositionError = useCallback((err: GeolocationPositionError) => {
    setIsRequesting(false)
    setIsTracking(false)
    if (watchIdRef.current != null && typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }

    let msg = "An unexpected GPS error occurred."
    switch (err.code) {
      case err.PERMISSION_DENIED: {
        const isLocalhost =
          typeof window !== "undefined" &&
          (window.location.hostname === "localhost" ||
            window.location.hostname === "127.0.0.1" ||
            window.location.hostname === "::1")

        if (typeof window !== "undefined" && !window.isSecureContext && !isLocalhost) {
          msg =
            "Location access is blocked because your mobile browser requires a secure context (HTTPS). To use GPS on mobile over LAN in Chrome, open 'chrome://flags/#unsafely-treat-insecure-origin-as-secure', add 'http://" +
            window.location.host +
            "', and relaunch Chrome."
          setPermissionStatus("insecure_origin")
        } else {
          msg =
            "Location permission was denied. Please tap the lock / site settings icon in your browser address bar and enable Location access for this site, then tap 'Retry Location Access'."
          setPermissionStatus("denied")
        }
        break
      }
      case err.POSITION_UNAVAILABLE:
        msg =
          "Device GPS position is unavailable. Please check that Location Services / GPS is turned ON in your device settings and that you have an open view of the sky."
        break
      case err.TIMEOUT:
        msg = "GPS location request timed out while waiting for a satellite lock. Please tap 'Retry Location Access'."
        break
    }
    setError(msg)
  }, [])

  const [wakeLockActive, setWakeLockActive] = useState<boolean>(false)
  const wakeLockSentinelRef = useRef<any>(null)
  const backgroundIntervalRef = useRef<any>(null)

  // Request Screen Wake Lock so screen doesn't dim/sleep prematurely during ride
  const requestWakeLock = useCallback(async () => {
    if (typeof navigator !== "undefined" && "wakeLock" in navigator && (navigator as any).wakeLock?.request) {
      try {
        const sentinel = await (navigator as any).wakeLock.request("screen")
        wakeLockSentinelRef.current = sentinel
        setWakeLockActive(true)
        sentinel.addEventListener("release", () => {
          wakeLockSentinelRef.current = null
          setWakeLockActive(false)
        })
      } catch {
        // Wake lock can fail if low battery or tab hidden, gracefully proceed
        setWakeLockActive(false)
      }
    }
  }, [])

  const releaseWakeLock = useCallback(async () => {
    if (wakeLockSentinelRef.current) {
      try {
        await wakeLockSentinelRef.current.release()
      } catch {
        // ignore
      }
      wakeLockSentinelRef.current = null
      setWakeLockActive(false)
    }
  }, [])

  // Start continuous GPS tracking
  const startTracking = useCallback(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setError("Geolocation is not supported by your current browser.")
      setPermissionStatus("unsupported")
      return
    }

    if (watchIdRef.current != null) {
      return
    }

    setIsRequesting(true)
    setIsTracking(true)
    setError(null)

    // Acquire WakeLock to keep screen awake
    requestWakeLock()

    try {
      watchIdRef.current = navigator.geolocation.watchPosition(
        handlePositionUpdate,
        handlePositionError,
        {
          enableHighAccuracy: true,
          maximumAge: 3000,
          timeout: 15000,
        },
      )

      // Fallback periodic polling for background / screen-off environments
      if (!backgroundIntervalRef.current) {
        backgroundIntervalRef.current = setInterval(() => {
          if (navigator.geolocation && isActiveDelivery && deliveryId) {
            navigator.geolocation.getCurrentPosition(
              handlePositionUpdate,
              () => {},
              {
                enableHighAccuracy: true,
                maximumAge: 4000,
                timeout: 10000,
              }
            )
          }
        }, Math.max(minUpdateIntervalMs, 6000))
      }
    } catch (e: any) {
      setIsRequesting(false)
      setIsTracking(false)
      setError(e?.message || "Failed to initialize geolocation watcher.")
    }
  }, [handlePositionUpdate, handlePositionError, requestWakeLock, isActiveDelivery, deliveryId, minUpdateIntervalMs])

  // Stop GPS tracking and clean up watcher
  const stopTracking = useCallback(() => {
    if (watchIdRef.current != null && typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    if (backgroundIntervalRef.current) {
      clearInterval(backgroundIntervalRef.current)
      backgroundIntervalRef.current = null
    }
    releaseWakeLock()
    setIsTracking(false)
    setIsRequesting(false)
  }, [releaseWakeLock])

  // Auto-recover wake lock and watcher on visibility change (when screen is turned back on or tab focused)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        if (isTracking) {
          // Re-acquire WakeLock if released
          requestWakeLock()
          // Trigger immediate GPS fix
          if (typeof navigator !== "undefined" && navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
              handlePositionUpdate,
              () => {},
              { enableHighAccuracy: true, maximumAge: 2000, timeout: 8000 }
            )
          }
        }
      }
    }

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange)
      return () => {
        document.removeEventListener("visibilitychange", handleVisibilityChange)
      }
    }
  }, [isTracking, requestWakeLock, handlePositionUpdate])

  // Auto-clean on component unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current != null && typeof navigator !== "undefined" && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
      if (backgroundIntervalRef.current) {
        clearInterval(backgroundIntervalRef.current)
        backgroundIntervalRef.current = null
      }
      releaseWakeLock()
    }
  }, [releaseWakeLock])

  return {
    isTracking,
    isRequesting,
    permissionStatus,
    currentPosition,
    lastSubmittedAt,
    error,
    submissionCount,
    wakeLockActive,
    startTracking,
    stopTracking,
  }
}
