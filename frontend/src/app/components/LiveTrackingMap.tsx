import * as React from "react"
import { useEffect, useRef } from "react"
import { loadGoogleMapsSDK } from "../utils/googleMapsLoader"

declare const google: any

export interface Coordinate {
  latitude: number
  longitude: number
}

export interface StoreLocationInfo {
  name?: string
  address?: string
  city?: string
  latitude: number
  longitude: number
}

export interface LiveTrackingMapProps {
  storeLocation?: StoreLocationInfo | null
  partnerLocation?: Coordinate | null
  destinationLocation?: Coordinate | null
  customerLocation?: Coordinate | null
  routeCoordinates?: [number, number][] | null // [longitude, latitude] GeoJSON format
  isStale?: boolean
  className?: string
  zoom?: number
  interactive?: boolean
  height?: string | number
  onMapClick?: () => void
  markerMode?: "truck" | "navigation"
  partnerHeading?: number | null
  autoFollow?: boolean
  headingUp?: boolean
}

export const LiveTrackingMap: React.FC<LiveTrackingMapProps> = ({
  storeLocation = {
    name: "Hindustan Hardware",
    address: "PG Road, Jehanabad, Bihar 804408",
    city: "Jehanabad",
    latitude: 25.215474989473233,
    longitude: 84.9867635966286,
  },
  partnerLocation,
  destinationLocation,
  customerLocation,
  routeCoordinates,
  isStale = false,
  className = "",
  zoom = 14,
  interactive = true,
  height = "100%",
  onMapClick,
  markerMode = "truck",
  partnerHeading = null,
  autoFollow = false,
  headingUp = false,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapInstanceRef = useRef<any>(null)
  const storeMarkerRef = useRef<any>(null)
  const partnerOverlayRef = useRef<any>(null)
  const destinationMarkerRef = useRef<any>(null)
  const customerMarkerRef = useRef<any>(null)
  const routePolylineRef = useRef<any>(null)
  const routeGlowPolylineRef = useRef<any>(null)

  const targetPartnerLocationRef = useRef<Coordinate | null>(null)
  const lastPartnerTargetTimeRef = useRef<number | null>(null)
  const currentRenderedPosRef = useRef<Coordinate | null>(null)
  const currentRenderedHeadingRef = useRef<number>(0)
  const animFrameIdRef = useRef<number | null>(null)
  const lastHeadingRef = useRef<number>(0)
  const hasInitializedBoundsRef = useRef<boolean>(false)

  // Calculate bearing angle between two coordinates
  const calculateBearing = (from: Coordinate, to: Coordinate): number => {
    const lat1 = (from.latitude * Math.PI) / 180
    const lat2 = (to.latitude * Math.PI) / 180
    const dLon = ((to.longitude - from.longitude) * Math.PI) / 180
    const y = Math.sin(dLon) * Math.cos(lat2)
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
    const brng = (Math.atan2(y, x) * 180) / Math.PI
    return (brng + 360) % 360
  }

  // Calculate shortest angular rotation distance (-180 to +180)
  const getShortestAngle = (start: number, end: number) => {
    let diff = (end - start) % 360
    if (diff > 180) diff -= 360
    if (diff < -180) diff += 360
    return diff
  }

  // 1. Initialize Google Map
  useEffect(() => {
    if (!mapContainerRef.current) return
    let isSubscribed = true

    loadGoogleMapsSDK()
      .then(() => {
        if (!isSubscribed || !mapContainerRef.current || typeof google === "undefined" || !google.maps) return

        if (!mapInstanceRef.current) {
          const initialLat =
            partnerLocation?.latitude ??
            storeLocation?.latitude ??
            destinationLocation?.latitude ??
            25.215474989473233
          const initialLng =
            partnerLocation?.longitude ??
            storeLocation?.longitude ??
            destinationLocation?.longitude ??
            84.9867635966286

          const map = new google.maps.Map(mapContainerRef.current, {
            center: { lat: initialLat, lng: initialLng },
            zoom,
            mapId: "DEMO_MAP_ID",
            zoomControl: interactive,
            gestureHandling: interactive ? "greedy" : "none",
            streetViewControl: false,
            mapTypeControl: false,
            fullscreenControl: false,
            rotateControl: true,
          })

          if (onMapClick) {
            map.addListener("click", onMapClick)
          }

          mapInstanceRef.current = map
        }
      })
      .catch((err) => {
        console.warn("Google Maps script load error:", err)
      })

    return () => {
      isSubscribed = false
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current)
        animFrameIdRef.current = null
      }
    }
  }, [])

  // 2. Custom OverlayView class for HTML elements (Truck / Nav arrow, Destination Pin, Store Pin)
  const createHtmlOverlay = (position: { lat: number; lng: number }, contentHtml: string, onClick?: () => void) => {
    if (typeof google === "undefined" || !google.maps) return null

    class CustomMarkerOverlay extends google.maps.OverlayView {
      div: HTMLDivElement | null = null
      pos: { lat: number; lng: number }

      constructor(pos: { lat: number; lng: number }) {
        super()
        this.pos = pos
      }

      onAdd() {
        this.div = document.createElement("div")
        this.div.style.position = "absolute"
        this.div.style.cursor = onClick ? "pointer" : "default"
        this.div.style.transform = "translate(-50%, -50%)"
        this.div.style.zIndex = "100"
        this.div.innerHTML = contentHtml

        if (onClick) {
          this.div.addEventListener("click", onClick)
        }

        const panes = this.getPanes()
        panes?.overlayMouseTarget.appendChild(this.div)
      }

      draw() {
        if (!this.div) return
        const overlayProjection = this.getProjection()
        if (!overlayProjection) return
        const googlePos = new google.maps.LatLng(this.pos.lat, this.pos.lng)
        const point = overlayProjection.fromLatLngToDivPixel(googlePos)
        if (point) {
          this.div.style.left = `${point.x}px`
          this.div.style.top = `${point.y}px`
        }
      }

      onRemove() {
        if (this.div && this.div.parentNode) {
          this.div.parentNode.removeChild(this.div)
          this.div = null
        }
      }

      setPosition(newPos: { lat: number; lng: number }) {
        this.pos = newPos
        this.draw()
      }

      setHtml(newHtml: string) {
        if (this.div) {
          this.div.innerHTML = newHtml
        }
      }

      getRotationElement(): HTMLElement | null {
        return this.div?.querySelector(".tracking-marker-rotation") || null
      }
    }

    const overlay = new CustomMarkerOverlay(position)
    overlay.setMap(mapInstanceRef.current)
    return overlay
  }

  // HTML content generators
  const getNavArrowHtml = (heading: number, stale: boolean) => `
    <div style="position: relative; width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; pointer-events: auto;">
      <div style="position: absolute; width: 48px; height: 48px; border-radius: 50%; background: ${stale ? "rgba(148, 163, 184, 0.25)" : "rgba(37, 99, 235, 0.28)"}; animation: ${stale ? "none" : "nav-ping 2s cubic-bezier(0, 0, 0.2, 1) infinite"}; pointer-events: none;"></div>
      <div class="tracking-marker-rotation" style="position: absolute; width: 40px; height: 40px; border-radius: 50%; background: #ffffff; box-shadow: 0 4px 18px rgba(0, 0, 0, 0.35), 0 0 0 2.5px ${stale ? "#94a3b8" : "#2563eb"}; display: flex; align-items: center; justify-content: center; transform: rotate(${Math.round(heading)}deg); will-change: transform;">
        <svg viewBox="0 0 24 24" width="22" height="22" style="fill: ${stale ? "#64748b" : "#2563eb"}; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.3));">
          <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z" />
        </svg>
      </div>
      <div style="position: absolute; bottom: -6px; background: #0f172a; color: ${stale ? "#cbd5e1" : "#38bdf8"}; padding: 1.5px 6px; border-radius: 9999px; font-size: 8.5px; font-weight: 800; letter-spacing: 0.5px; border: 1px solid ${stale ? "#64748b" : "#38bdf8"}; box-shadow: 0 2px 6px rgba(0,0,0,0.4); white-space: nowrap; display: flex; align-items: center; gap: 3px;">
        <span style="display: inline-block; width: 4.5px; height: 4.5px; border-radius: 50%; background: ${stale ? "#94a3b8" : "#22c55e"};"></span>
        <span>YOU</span>
      </div>
    </div>
  `

  const getTruckHtml = (heading: number, stale: boolean) => {
    const rotationDeg = (Math.round(heading) + 180) % 360
    return `
      <div style="position: relative; width: 96px; height: 96px; display: flex; align-items: center; justify-content: center; pointer-events: auto;">
        <div style="position: absolute; top: -28px; background: #0f172a; color: #38bdf8; padding: 3px 9px; border-radius: 9999px; font-size: 10px; font-weight: 800; border: 1.5px solid #38bdf8; box-shadow: 0 4px 12px rgba(0,0,0,0.55); white-space: nowrap; display: flex; align-items: center; gap: 4px; z-index: 10; pointer-events: none;">
          <span style="display: inline-block; width: 5.5px; height: 5.5px; border-radius: 50%; background: ${stale ? '#94a3b8' : '#22c55e'}; animation: ${stale ? 'none' : 'ping 1.5s cubic-bezier(0,0,0.2,1) infinite'};"></span>
          <span>Delivery Partner</span>
        </div>
        <div class="tracking-marker-rotation" style="width: 88px; height: 88px; display: flex; align-items: center; justify-content: center; transform: rotate(${rotationDeg}deg); will-change: transform; z-index: 2;">
          <img src="/truckLogo.png" alt="Delivery Partner Truck" style="width: 82px; height: 82px; object-fit: contain; filter: ${stale ? "grayscale(80%) drop-shadow(0 6px 12px rgba(0,0,0,0.4))" : "drop-shadow(0 8px 16px rgba(0,0,0,0.6))"};" />
        </div>
      </div>
    `
  }

  const getStoreHtml = () => `
    <div style="position: relative; display: flex; flex-direction: column; align-items: center; transform: translate(0, -50%); pointer-events: auto;">
      <div style="background: #0f172a; color: #fbbf24; padding: 4px 8px; border-radius: 9999px; font-size: 10px; font-weight: 800; border: 1.5px solid #fbbf24; box-shadow: 0 4px 12px rgba(0,0,0,0.5); white-space: nowrap; margin-bottom: 2px; display: flex; align-items: center; gap: 4px;">
        <span>🏬 Store Origin</span>
      </div>
      <div style="width: 28px; height: 28px; background: #0f172a; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); border: 2px solid #fbbf24; box-shadow: 0 4px 14px rgba(251,191,36,0.4); display: flex; align-items: center; justify-content: center;">
        <div style="transform: rotate(45deg); font-size: 13px;">🏬</div>
      </div>
    </div>
  `

  const getDestinationHtml = () => `
    <div style="position: relative; display: flex; flex-direction: column; align-items: center; transform: translate(0, -50%); pointer-events: auto;">
      <div style="background: #111827; color: #D4AF37; padding: 5px 9px; border-radius: 9999px; font-size: 10.5px; font-weight: 800; border: 2px solid #D4AF37; box-shadow: 0 4px 12px rgba(0,0,0,0.45); white-space: nowrap; margin-bottom: 3px; display: flex; align-items: center; gap: 4px;">
        <span>📍 Delivery Address</span>
      </div>
      <div style="width: 28px; height: 28px; background: #D4AF37; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); border: 2px solid #ffffff; box-shadow: 0 6px 14px rgba(212,175,55,0.6); display: flex; align-items: center; justify-content: center;">
        <div style="width: 10px; height: 10px; background: #111827; border-radius: 50%;"></div>
      </div>
    </div>
  `

  const getCustomerDotHtml = () => `
    <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 28px; height: 28px;">
      <div style="position: absolute; width: 24px; height: 24px; border-radius: 50%; background: rgba(59, 130, 246, 0.35); animation: ping 1.8s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
      <div style="width: 14px; height: 14px; border-radius: 50%; background: #2563eb; border: 2px solid #ffffff; box-shadow: 0 2px 6px rgba(0,0,0,0.3);"></div>
    </div>
  `

  // 3. Update Markers, Polyline, and Viewport
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || typeof google === "undefined" || !google.maps) return

    const bounds = new google.maps.LatLngBounds()
    let hasPoints = false

    // A. Store Marker
    if (storeLocation && typeof storeLocation.latitude === "number" && typeof storeLocation.longitude === "number") {
      const pos = { lat: storeLocation.latitude, lng: storeLocation.longitude }
      if (storeMarkerRef.current) {
        storeMarkerRef.current.setPosition(pos)
      } else {
        storeMarkerRef.current = createHtmlOverlay(pos, getStoreHtml())
      }
      bounds.extend(pos)
      hasPoints = true
    } else if (storeMarkerRef.current) {
      storeMarkerRef.current.setMap(null)
      storeMarkerRef.current = null
    }

    // B. Partner / Rider Marker
    const effectivePartnerLocation =
      partnerLocation &&
      typeof partnerLocation.latitude === "number" &&
      typeof partnerLocation.longitude === "number"
        ? partnerLocation
        : storeLocation && typeof storeLocation.latitude === "number" && typeof storeLocation.longitude === "number"
          ? { latitude: storeLocation.latitude, longitude: storeLocation.longitude }
          : null

    if (effectivePartnerLocation) {
      const partnerPos = { lat: effectivePartnerLocation.latitude, lng: effectivePartnerLocation.longitude }

      let targetHeading = lastHeadingRef.current
      if (partnerHeading != null && Number.isFinite(partnerHeading)) {
        targetHeading = partnerHeading
      } else if (
        targetPartnerLocationRef.current &&
        (targetPartnerLocationRef.current.latitude !== effectivePartnerLocation.latitude ||
          targetPartnerLocationRef.current.longitude !== effectivePartnerLocation.longitude)
      ) {
        targetHeading = calculateBearing(targetPartnerLocationRef.current, effectivePartnerLocation)
      }

      if (!partnerOverlayRef.current || !currentRenderedPosRef.current) {
        currentRenderedPosRef.current = effectivePartnerLocation
        currentRenderedHeadingRef.current = targetHeading
        lastHeadingRef.current = targetHeading
        targetPartnerLocationRef.current = effectivePartnerLocation
        lastPartnerTargetTimeRef.current = performance.now()

        const html = markerMode === "navigation" ? getNavArrowHtml(targetHeading, isStale) : getTruckHtml(targetHeading, isStale)
        partnerOverlayRef.current = createHtmlOverlay(partnerPos, html)
      } else {
        const targetChanged =
          targetPartnerLocationRef.current?.latitude !== effectivePartnerLocation.latitude ||
          targetPartnerLocationRef.current?.longitude !== effectivePartnerLocation.longitude

        if (targetChanged) {
          if (animFrameIdRef.current) {
            cancelAnimationFrame(animFrameIdRef.current)
            animFrameIdRef.current = null
          }

          const now = performance.now()
          const previousTargetTime = lastPartnerTargetTimeRef.current
          const updateInterval = previousTargetTime == null ? 3000 : now - previousTargetTime
          const startLat = currentRenderedPosRef.current.latitude
          const startLng = currentRenderedPosRef.current.longitude
          const endLat = effectivePartnerLocation.latitude
          const endLng = effectivePartnerLocation.longitude
          const startHeading = currentRenderedHeadingRef.current
          const deltaAngle = getShortestAngle(startHeading, targetHeading)
          const animDuration = Math.min(Math.max(updateInterval, 1200), 12000)

          const html = markerMode === "navigation" ? getNavArrowHtml(startHeading, isStale) : getTruckHtml(startHeading, isStale)
          partnerOverlayRef.current.setHtml(html)
          lastHeadingRef.current = targetHeading

          targetPartnerLocationRef.current = effectivePartnerLocation
          lastPartnerTargetTimeRef.current = now

          const animateStep = (frameTime: number) => {
            const progress = Math.min((frameTime - now) / animDuration, 1)
            const currLat = startLat + (endLat - startLat) * progress
            const currLng = startLng + (endLng - startLng) * progress
            const currHeading = (startHeading + deltaAngle * progress + 360) % 360

            currentRenderedPosRef.current = { latitude: currLat, longitude: currLng }
            currentRenderedHeadingRef.current = currHeading

            if (partnerOverlayRef.current) {
              partnerOverlayRef.current.setPosition({ lat: currLat, lng: currLng })
              const rotationNode = partnerOverlayRef.current.getRotationElement()
              if (rotationNode) {
                const rotation = markerMode === "navigation" ? currHeading : (currHeading + 180) % 360
                rotationNode.style.transform = `rotate(${rotation}deg)`
              }
            }

            if (progress < 1) {
              animFrameIdRef.current = requestAnimationFrame(animateStep)
            } else {
              animFrameIdRef.current = null
            }
          }

          animFrameIdRef.current = requestAnimationFrame(animateStep)
        } else {
          const html = markerMode === "navigation" ? getNavArrowHtml(targetHeading, isStale) : getTruckHtml(targetHeading, isStale)
          partnerOverlayRef.current.setHtml(html)
          currentRenderedHeadingRef.current = targetHeading
          lastHeadingRef.current = targetHeading
        }
      }

      bounds.extend(partnerPos)
      hasPoints = true
    } else if (partnerOverlayRef.current) {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current)
        animFrameIdRef.current = null
      }
      partnerOverlayRef.current.setMap(null)
      partnerOverlayRef.current = null
      currentRenderedPosRef.current = null
      targetPartnerLocationRef.current = null
      lastPartnerTargetTimeRef.current = null
    }

    // C. Destination Marker
    if (destinationLocation && typeof destinationLocation.latitude === "number" && typeof destinationLocation.longitude === "number") {
      const destPos = { lat: destinationLocation.latitude, lng: destinationLocation.longitude }
      if (destinationMarkerRef.current) {
        destinationMarkerRef.current.setPosition(destPos)
      } else {
        destinationMarkerRef.current = createHtmlOverlay(destPos, getDestinationHtml())
      }
      bounds.extend(destPos)
      hasPoints = true
    } else if (destinationMarkerRef.current) {
      destinationMarkerRef.current.setMap(null)
      destinationMarkerRef.current = null
    }

    // D. Customer Dot Marker
    if (customerLocation && typeof customerLocation.latitude === "number" && typeof customerLocation.longitude === "number") {
      const custPos = { lat: customerLocation.latitude, lng: customerLocation.longitude }
      if (customerMarkerRef.current) {
        customerMarkerRef.current.setPosition(custPos)
      } else {
        customerMarkerRef.current = createHtmlOverlay(custPos, getCustomerDotHtml())
      }
      bounds.extend(custPos)
      hasPoints = true
    } else if (customerMarkerRef.current) {
      customerMarkerRef.current.setMap(null)
      customerMarkerRef.current = null
    }

    // E. Road Route Polyline (GeoJSON [lng, lat] -> Google Maps {lat, lng})
    if (routeCoordinates && routeCoordinates.length > 0) {
      const gCoords = routeCoordinates.map(([lng, lat]) => ({ lat, lng }))

      if (routeGlowPolylineRef.current) {
        routeGlowPolylineRef.current.setPath(gCoords)
      } else {
        routeGlowPolylineRef.current = new google.maps.Polyline({
          path: gCoords,
          geodesic: true,
          strokeColor: "#1d4ed8",
          strokeOpacity: 0.45,
          strokeWeight: 9,
          map,
        })
      }

      if (routePolylineRef.current) {
        routePolylineRef.current.setPath(gCoords)
      } else {
        routePolylineRef.current = new google.maps.Polyline({
          path: gCoords,
          geodesic: true,
          strokeColor: "#3b82f6",
          strokeOpacity: 0.95,
          strokeWeight: 5,
          map,
        })
      }

      gCoords.forEach((pt) => bounds.extend(pt))
      hasPoints = true
    } else {
      if (routePolylineRef.current) {
        routePolylineRef.current.setMap(null)
        routePolylineRef.current = null
      }
      if (routeGlowPolylineRef.current) {
        routeGlowPolylineRef.current.setMap(null)
        routeGlowPolylineRef.current = null
      }
    }

    // F. Viewport handling
    if (headingUp && effectivePartnerLocation) {
      if (!hasInitializedBoundsRef.current) {
        map.setCenter({ lat: effectivePartnerLocation.latitude, lng: effectivePartnerLocation.longitude })
        map.setZoom(zoom)
        hasInitializedBoundsRef.current = true
      } else if (autoFollow) {
        map.panTo({ lat: effectivePartnerLocation.latitude, lng: effectivePartnerLocation.longitude })
      }
    } else if (!hasInitializedBoundsRef.current && hasPoints) {
      map.fitBounds(bounds, { top: 45, right: 45, bottom: 45, left: 45 })
      hasInitializedBoundsRef.current = true
    } else if (autoFollow && effectivePartnerLocation) {
      map.panTo({ lat: effectivePartnerLocation.latitude, lng: effectivePartnerLocation.longitude })
    }
  }, [storeLocation, partnerLocation, partnerHeading, destinationLocation, customerLocation, routeCoordinates, isStale, markerMode, autoFollow, headingUp, zoom])

  return (
    <div
      style={{ height, width: "100%", position: "relative" }}
      className={`overflow-hidden rounded-lg ${className}`}
    >
      <div ref={mapContainerRef} style={{ height: "100%", width: "100%", zIndex: 1 }} />

      {/* Animations */}
      <style>
        {`
          @keyframes ping {
            75%, 100% {
              transform: scale(1.6);
              opacity: 0;
            }
          }
          @keyframes nav-ping {
            0% {
              transform: scale(0.9);
              opacity: 0.8;
            }
            70% {
              transform: scale(1.7);
              opacity: 0;
            }
            100% {
              transform: scale(1.7);
              opacity: 0;
            }
          }
        `}
      </style>
    </div>
  )
}
