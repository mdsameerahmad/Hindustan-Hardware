import * as L from "leaflet"
import "leaflet/dist/leaflet.css"
import * as React from "react"
import { useEffect, useRef } from "react"

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
  zoom = 13,
  interactive = true,
  height = "100%",
  onMapClick,
  markerMode = "truck",
  partnerHeading = null,
  autoFollow = false,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const storeMarkerRef = useRef<L.Marker | null>(null)
  const partnerMarkerRef = useRef<L.Marker | null>(null)
  const destinationMarkerRef = useRef<L.Marker | null>(null)
  const customerMarkerRef = useRef<L.Marker | null>(null)
  const routePolylineRef = useRef<L.Polyline | null>(null)
  const routeGlowPolylineRef = useRef<L.Polyline | null>(null)
  const prevPartnerLocationRef = useRef<Coordinate | null>(null)
  const lastHeadingRef = useRef<number>(0)
  const hasInitializedBoundsRef = useRef<boolean>(false)

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return

    // Avoid duplicate initialization
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

      const map = L.map(mapContainerRef.current, {
        center: [initialLat, initialLng],
        zoom,
        zoomControl: interactive,
        dragging: interactive,
        touchZoom: interactive,
        scrollWheelZoom: false, // Prevent page scroll hijack
        doubleClickZoom: interactive,
        attributionControl: true,
      })

      // Standard OpenStreetMap tiles
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map)

      if (onMapClick) {
        map.on("click", onMapClick)
      }

      mapInstanceRef.current = map
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
        partnerMarkerRef.current = null
        destinationMarkerRef.current = null
        routePolylineRef.current = null
        routeGlowPolylineRef.current = null
      }
    }
  }, [])

  // Calculate bearing angle (0 - 360) between two coordinates for turn-by-turn arrow rotation
  const calculateBearing = (from: Coordinate, to: Coordinate): number => {
    const lat1 = (from.latitude * Math.PI) / 180
    const lat2 = (to.latitude * Math.PI) / 180
    const dLon = ((to.longitude - from.longitude) * Math.PI) / 180
    const y = Math.sin(dLon) * Math.cos(lat2)
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
    const brng = (Math.atan2(y, x) * 180) / Math.PI
    return (brng + 360) % 360
  }

  // Create Modern Turn-by-Turn Navigation Arrow (Google Maps / Uber / Blinkit Driver Navigation style)
  const createNavigationArrowIcon = (heading: number, stale: boolean) => {
    return L.divIcon({
      className: "custom-nav-arrow-marker",
      html: `
        <div style="position: relative; width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; pointer-events: auto;">
          <!-- GPS Accuracy Pulse Glow Wave -->
          <div style="
            position: absolute;
            width: 48px;
            height: 48px;
            border-radius: 50%;
            background: ${stale ? "rgba(148, 163, 184, 0.25)" : "rgba(37, 99, 235, 0.28)"};
            animation: ${stale ? "none" : "nav-ping 2s cubic-bezier(0, 0, 0.2, 1) infinite"};
            pointer-events: none;
          "></div>
          
          <!-- Outer Floating Halo Ring -->
          <div style="
            position: absolute;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            background: #ffffff;
            box-shadow: 0 4px 18px rgba(0, 0, 0, 0.35), 0 0 0 2.5px ${stale ? "#94a3b8" : "#2563eb"};
            display: flex;
            align-items: center;
            justify-content: center;
            transform: rotate(${Math.round(heading)}deg);
            transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1);
          ">
            <!-- 3D Navigation Arrow Pointer -->
            <svg viewBox="0 0 24 24" width="22" height="22" style="fill: ${stale ? "#64748b" : "#2563eb"}; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.3));">
              <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z" />
            </svg>
          </div>

          <!-- Live Indicator Badge -->
          <div style="
            position: absolute;
            bottom: -6px;
            background: #0f172a;
            color: ${stale ? "#cbd5e1" : "#38bdf8"};
            padding: 1.5px 6px;
            border-radius: 9999px;
            font-size: 8.5px;
            font-weight: 800;
            letter-spacing: 0.5px;
            border: 1px solid ${stale ? "#64748b" : "#38bdf8"};
            box-shadow: 0 2px 6px rgba(0,0,0,0.4);
            white-space: nowrap;
            display: flex;
            align-items: center;
            gap: 3px;
          ">
            <span style="display: inline-block; width: 4.5px; height: 4.5px; border-radius: 50%; background: ${stale ? "#94a3b8" : "#22c55e"};"></span>
            <span>YOU</span>
          </div>
        </div>
      `,
      iconSize: [56, 56],
      iconAnchor: [28, 28],
      popupAnchor: [0, -28],
    })
  }

  // Create Delivery Partner Custom Truck Icon (for customer tracking view)
  const createTruckIcon = (heading: number, stale: boolean) => {
    // truckLogo.png is drawn facing DOWNWARDS (180 deg). To align with GPS standard 0 deg (North), add 180 deg.
    const rotationDeg = (Math.round(heading) + 180) % 360

    return L.divIcon({
      className: "custom-truck-marker",
      html: `
        <div style="position: relative; width: 96px; height: 96px; display: flex; align-items: center; justify-content: center; pointer-events: auto;">
          <!-- Floating status pill above truck -->
          <div style="
            position: absolute;
            top: -28px;
            background: #0f172a;
            color: #38bdf8;
            padding: 3px 9px;
            border-radius: 9999px;
            font-size: 10px;
            font-weight: 800;
            border: 1.5px solid #38bdf8;
            box-shadow: 0 4px 12px rgba(0,0,0,0.55);
            white-space: nowrap;
            display: flex;
            align-items: center;
            gap: 4px;
            z-index: 10;
            pointer-events: none;
          ">
            <span style="display: inline-block; width: 5.5px; height: 5.5px; border-radius: 50%; background: ${stale ? '#94a3b8' : '#22c55e'}; animation: ${stale ? 'none' : 'ping 1.5s cubic-bezier(0,0,0.2,1) infinite'};"></span>
            <span>Delivery Partner</span>
          </div>

          <!-- Rotating Truck Centered on GPS Coordinate (1.5x scale: 82px) -->
          <div style="
            width: 88px;
            height: 88px;
            display: flex;
            align-items: center;
            justify-content: center;
            transform: rotate(${rotationDeg}deg);
            transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1);
            z-index: 2;
          ">
            <img 
              src="/truckLogo.png" 
              alt="Delivery Partner Truck" 
              style="
                width: 82px; 
                height: 82px; 
                object-fit: contain;
                filter: ${stale ? "grayscale(80%) drop-shadow(0 6px 12px rgba(0,0,0,0.4))" : "drop-shadow(0 8px 16px rgba(0,0,0,0.6))"};
              "
            />
          </div>
        </div>
      `,
      iconSize: [96, 96],
      iconAnchor: [48, 48],
      popupAnchor: [0, -48],
    })
  }

  // Create Hindustan Hardware Store Icon
  const createStoreIcon = () => {
    return L.divIcon({
      className: "custom-store-marker",
      html: `
        <div style="position: relative; display: flex; flex-direction: column; align-items: center; transform: translate(-50%, -100%);">
          <div style="background: #0f172a; color: #fbbf24; padding: 4px 8px; border-radius: 9999px; font-size: 10px; font-weight: 800; border: 1.5px solid #fbbf24; box-shadow: 0 4px 12px rgba(0,0,0,0.5); white-space: nowrap; margin-bottom: 2px; display: flex; align-items: center; gap: 4px;">
            <span>🏬 Store Origin</span>
          </div>
          <div style="width: 28px; height: 28px; background: #0f172a; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); border: 2px solid #fbbf24; box-shadow: 0 4px 14px rgba(251,191,36,0.4); display: flex; align-items: center; justify-content: center;">
            <div style="transform: rotate(45deg); font-size: 13px;">🏬</div>
          </div>
        </div>
      `,
      iconSize: [36, 52],
      iconAnchor: [18, 52],
      popupAnchor: [0, -52],
    })
  }

  // Create Destination Pin Icon (Matching Address Picker Pin)
  const createDestinationIcon = () => {
    return L.divIcon({
      className: "custom-destination-marker",
      html: `
        <div style="position: relative; display: flex; flex-direction: column; align-items: center; transform: translate(-50%, -100%);">
          <div style="background: #111827; color: #D4AF37; padding: 5px 9px; border-radius: 9999px; font-size: 10.5px; font-weight: 800; border: 2px solid #D4AF37; box-shadow: 0 4px 12px rgba(0,0,0,0.45); white-space: nowrap; margin-bottom: 3px; display: flex; align-items: center; gap: 4px;">
            <span>📍 Delivery Address</span>
          </div>
          <div style="width: 28px; height: 28px; background: #D4AF37; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); border: 2px solid #ffffff; box-shadow: 0 6px 14px rgba(212,175,55,0.6); display: flex; align-items: center; justify-content: center;">
            <div style="width: 10px; height: 10px; background: #111827; border-radius: 50%;"></div>
          </div>
        </div>
      `,
      iconSize: [36, 54],
      iconAnchor: [18, 54],
      popupAnchor: [0, -54],
    })
  }

  // Create Customer Current Location (Blue Dot) Icon
  const createCustomerDotIcon = () => {
    return L.divIcon({
      className: "custom-customer-dot",
      html: `
        <div style="
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
        ">
          <div style="
            position: absolute;
            width: 24px;
            height: 24px;
            border-radius: 50%;
            background: rgba(59, 130, 246, 0.35);
            animation: ping 1.8s cubic-bezier(0, 0, 0.2, 1) infinite;
          "></div>
          <div style="
            width: 14px;
            height: 14px;
            border-radius: 50%;
            background: #2563eb;
            border: 2px solid #ffffff;
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
          "></div>
        </div>
      `,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      popupAnchor: [0, -14],
    })
  }

  // Update Route, Markers, and Viewport Bounds
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return

    const bounds = L.latLngBounds([])
    let hasPoints = false

    // 1. Store Marker (Fixed Hindustan Hardware Hub)
    if (
      storeLocation &&
      typeof storeLocation.latitude === "number" &&
      typeof storeLocation.longitude === "number"
    ) {
      const storeLatLng: L.LatLngExpression = [storeLocation.latitude, storeLocation.longitude]
      const icon = createStoreIcon()

      if (storeMarkerRef.current) {
        storeMarkerRef.current.setLatLng(storeLatLng)
      } else {
        const marker = L.marker(storeLatLng, { icon }).addTo(map)
        marker.bindPopup(
          `<b>${storeLocation.name || "Hindustan Hardware"}</b><br/>${storeLocation.address || "PG Road, Opposite Eidgah"}<br/><small style="color:#d97706;">Origin Warehouse (Approximate Locality)</small>`
        )
        storeMarkerRef.current = marker
      }
      bounds.extend(storeLatLng)
      hasPoints = true
    } else if (storeMarkerRef.current) {
      map.removeLayer(storeMarkerRef.current)
      storeMarkerRef.current = null
    }

    // 2. Partner / Rider Marker
    const effectivePartnerLocation =
      partnerLocation &&
      typeof partnerLocation.latitude === "number" &&
      typeof partnerLocation.longitude === "number"
        ? partnerLocation
        : storeLocation && typeof storeLocation.latitude === "number" && typeof storeLocation.longitude === "number"
          ? { latitude: storeLocation.latitude, longitude: storeLocation.longitude }
          : null

    if (effectivePartnerLocation) {
      const partnerLatLng: L.LatLngExpression = [effectivePartnerLocation.latitude, effectivePartnerLocation.longitude]

      // Determine Heading / Bearing
      let activeHeading = lastHeadingRef.current
      if (partnerHeading != null && Number.isFinite(partnerHeading)) {
        activeHeading = partnerHeading
        lastHeadingRef.current = partnerHeading
      } else if (
        prevPartnerLocationRef.current &&
        (prevPartnerLocationRef.current.latitude !== effectivePartnerLocation.latitude ||
          prevPartnerLocationRef.current.longitude !== effectivePartnerLocation.longitude)
      ) {
        const computed = calculateBearing(prevPartnerLocationRef.current, effectivePartnerLocation)
        activeHeading = computed
        lastHeadingRef.current = computed
      }

      const icon =
        markerMode === "navigation"
          ? createNavigationArrowIcon(activeHeading, isStale)
          : createTruckIcon(activeHeading, isStale)

      if (partnerMarkerRef.current) {
        partnerMarkerRef.current.setLatLng(partnerLatLng)
        partnerMarkerRef.current.setIcon(icon)
      } else {
        const marker = L.marker(partnerLatLng, { icon, zIndexOffset: 1000 }).addTo(map)
        marker.bindPopup(
          markerMode === "navigation"
            ? `<b>You (Delivery Partner)</b><br/>${isStale ? "GPS Signal delayed" : "Live GPS Navigating"}`
            : `<b>Hindustan Hardware Delivery Partner</b><br/>${
                partnerLocation
                  ? isStale
                    ? "Status: Signal delayed"
                    : "Status: Active & moving"
                  : "Status: Starting from Store Warehouse"
              }`
        )
        partnerMarkerRef.current = marker
      }

      prevPartnerLocationRef.current = effectivePartnerLocation
      bounds.extend(partnerLatLng)
      hasPoints = true
    } else if (partnerMarkerRef.current) {
      map.removeLayer(partnerMarkerRef.current)
      partnerMarkerRef.current = null
    }

    // 3. Destination Marker (Customer Shipping Address)
    if (
      destinationLocation &&
      typeof destinationLocation.latitude === "number" &&
      typeof destinationLocation.longitude === "number"
    ) {
      const destLatLng: L.LatLngExpression = [destinationLocation.latitude, destinationLocation.longitude]
      const destIcon = createDestinationIcon()

      if (destinationMarkerRef.current) {
        destinationMarkerRef.current.setLatLng(destLatLng)
        destinationMarkerRef.current.setIcon(destIcon)
      } else {
        const marker = L.marker(destLatLng, { icon: destIcon }).addTo(map)
        marker.bindPopup("<b>Delivery Destination</b><br/>Confirmed Order Delivery Address")
        destinationMarkerRef.current = marker
      }
      bounds.extend(destLatLng)
      hasPoints = true
    } else if (destinationMarkerRef.current) {
      map.removeLayer(destinationMarkerRef.current)
      destinationMarkerRef.current = null
    }

    // 4. Customer Reference Location Marker (if customer shares GPS)
    if (
      customerLocation &&
      typeof customerLocation.latitude === "number" &&
      typeof customerLocation.longitude === "number"
    ) {
      const custLatLng: L.LatLngExpression = [customerLocation.latitude, customerLocation.longitude]
      const custIcon = createCustomerDotIcon()

      if (customerMarkerRef.current) {
        customerMarkerRef.current.setLatLng(custLatLng)
      } else {
        const marker = L.marker(custLatLng, { icon: custIcon }).addTo(map)
        marker.bindPopup("<b>Your Current Location</b><br/>Device GPS Reference")
        customerMarkerRef.current = marker
      }
      bounds.extend(custLatLng)
      hasPoints = true
    } else if (customerMarkerRef.current) {
      map.removeLayer(customerMarkerRef.current)
      customerMarkerRef.current = null
    }

    // 5. Road Route Polyline (Convert GeoJSON [lng, lat] to Leaflet [lat, lng])
    if (routeCoordinates && routeCoordinates.length > 0) {
      const leafletCoords: [number, number][] = routeCoordinates.map(([lng, lat]) => [lat, lng])

      // Outer glow polyline for professional crispness
      if (routeGlowPolylineRef.current) {
        routeGlowPolylineRef.current.setLatLngs(leafletCoords)
      } else {
        const glowPolyline = L.polyline(leafletCoords, {
          color: "#1d4ed8",
          weight: 9,
          opacity: 0.45,
          lineJoin: "round",
          lineCap: "round",
        }).addTo(map)
        routeGlowPolylineRef.current = glowPolyline
      }

      if (routePolylineRef.current) {
        routePolylineRef.current.setLatLngs(leafletCoords)
      } else {
        const polyline = L.polyline(leafletCoords, {
          color: "#3b82f6", // Vibrant turn-by-turn navigation blue
          weight: 5,
          opacity: 0.95,
          lineJoin: "round",
          lineCap: "round",
          dashArray: isStale ? "6, 8" : undefined,
        }).addTo(map)
        routePolylineRef.current = polyline
      }

      leafletCoords.forEach((coord) => bounds.extend(coord))
      hasPoints = true
    } else {
      if (routePolylineRef.current) {
        map.removeLayer(routePolylineRef.current)
        routePolylineRef.current = null
      }
      if (routeGlowPolylineRef.current) {
        map.removeLayer(routeGlowPolylineRef.current)
        routeGlowPolylineRef.current = null
      }
    }

    // 6. Viewport handling: PREVENT UNWANTED ZOOM-OUT ON LIVE UPDATES
    // On the first render with valid points, fit the full route bounds.
    // On subsequent live location updates:
    // - If autoFollow is enabled, smooth pan to partner WITHOUT resetting the user's zoom level!
    // - If autoFollow is disabled, do not touch the map viewport so the user can freely zoom and pan.
    if (!hasInitializedBoundsRef.current && hasPoints && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [45, 45], maxZoom: 16 })
      hasInitializedBoundsRef.current = true
    } else if (autoFollow && effectivePartnerLocation) {
      // Smoothly pan to new partner coordinate while PRESERVING the user-chosen zoom level
      map.panTo([effectivePartnerLocation.latitude, effectivePartnerLocation.longitude], {
        animate: true,
        duration: 0.8,
      })
    }

    // Invalidate map size to handle container dimension settling
    setTimeout(() => {
      map.invalidateSize()
    }, 150)
  }, [storeLocation, partnerLocation, partnerHeading, destinationLocation, customerLocation, routeCoordinates, isStale, markerMode, autoFollow])

  return (
    <div
      style={{ height, width: "100%", position: "relative" }}
      className={`overflow-hidden rounded-lg ${className}`}
    >
      <div ref={mapContainerRef} style={{ height: "100%", width: "100%", zIndex: 1 }} />
      
      {/* Frosted Glass Blur Bar overlapping the bottom watermark */}
      <div
        className="pointer-events-none absolute bottom-0 left-0 right-0 h-6 z-[400] backdrop-blur-lg bg-white/10 dark:bg-white/5 border-t border-white/20 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]"
      />

      {/* Pulse keyframe animation for truck live ring and nav arrow */}
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
          .custom-nav-arrow-marker {
            background: transparent !important;
            border: none !important;
          }
          .custom-truck-marker {
            background: transparent !important;
            border: none !important;
          }
          .leaflet-control-attribution {
            display: none !important;
          }
        `}
      </style>
    </div>
  )
}
