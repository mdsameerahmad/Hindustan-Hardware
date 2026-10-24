import * as L from "leaflet"
import "leaflet/dist/leaflet.css"
import * as React from "react"
import { useEffect, useRef } from "react"

export interface Coordinate {
  latitude: number
  longitude: number
}

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
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const storeMarkerRef = useRef<L.Marker | null>(null)
  const partnerMarkerRef = useRef<L.Marker | null>(null)
  const destinationMarkerRef = useRef<L.Marker | null>(null)
  const customerMarkerRef = useRef<L.Marker | null>(null)
  const routePolylineRef = useRef<L.Polyline | null>(null)
  const initialBoundsSetRef = useRef<boolean>(false)

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return

    // Avoid duplicate initialization
    if (!mapInstanceRef.current) {
      const initialLat =
        storeLocation?.latitude ??
        partnerLocation?.latitude ??
        destinationLocation?.latitude ??
        25.215474989473233
      const initialLng =
        storeLocation?.longitude ??
        partnerLocation?.longitude ??
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
      }
    }
  }, [])

  // Create Delivery Partner Custom Truck Icon
  const createTruckIcon = (stale: boolean) => {
    return L.divIcon({
      className: "custom-truck-marker",
      html: `
        <div style="position: relative; display: flex; flex-direction: column; align-items: center; transform: translate(-50%, -50%);">
          <div style="background: #0f172a; color: #38bdf8; padding: 3px 8px; border-radius: 9999px; font-size: 10px; font-weight: 800; border: 1.5px solid #38bdf8; box-shadow: 0 4px 12px rgba(0,0,0,0.5); white-space: nowrap; margin-bottom: 2px; display: flex; align-items: center; gap: 4px;">
            <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: ${stale ? '#94a3b8' : '#22c55e'}; animation: ${stale ? 'none' : 'ping 1.5s cubic-bezier(0,0,0.2,1) infinite'};"></span>
            <span>Delivery Partner</span>
          </div>
          <div style="
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 2;
          ">
            <img 
              src="/truckLogo.png" 
              alt="Delivery Partner Truck" 
              style="
                width: 76px; 
                height: 76px; 
                object-fit: contain;
                filter: ${stale ? "grayscale(80%) drop-shadow(0 6px 12px rgba(0,0,0,0.4))" : "drop-shadow(0 8px 16px rgba(0,0,0,0.5))"};
              "
            />
          </div>
        </div>
      `,
      iconSize: [80, 100],
      iconAnchor: [40, 50],
      popupAnchor: [0, -50],
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

    // 2. Partner Marker (Moving Delivery Partner - starts at store origin by default)
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
      const icon = createTruckIcon(isStale)

      if (partnerMarkerRef.current) {
        partnerMarkerRef.current.setLatLng(partnerLatLng)
        partnerMarkerRef.current.setIcon(icon)
      } else {
        const marker = L.marker(partnerLatLng, { icon }).addTo(map)
        marker.bindPopup(
          `<b>Hindustan Hardware Delivery Partner</b><br/>${
            partnerLocation
              ? isStale
                ? "Status: Signal delayed"
                : "Status: Active & moving"
              : "Status: Starting from Store Warehouse"
          }`
        )
        partnerMarkerRef.current = marker
      }
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

      if (routePolylineRef.current) {
        routePolylineRef.current.setLatLngs(leafletCoords)
      } else {
        const polyline = L.polyline(leafletCoords, {
          color: "#2563eb", // Vibrant navigation blue (Blinkit / Google Maps style)
          weight: 6,
          opacity: 0.95,
          lineJoin: "round",
          lineCap: "round",
          dashArray: isStale ? "6, 8" : undefined,
        }).addTo(map)
        routePolylineRef.current = polyline
      }

      leafletCoords.forEach((coord) => bounds.extend(coord))
      hasPoints = true
    } else if (routePolylineRef.current) {
      map.removeLayer(routePolylineRef.current)
      routePolylineRef.current = null
    }

    // 6. Fit Viewport to Route & Markers (re-fit on points/route availability)
    if (hasPoints && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [45, 45], maxZoom: 16 })
    }

    // Invalidate map size to handle container dimension settling
    setTimeout(() => {
      map.invalidateSize()
    }, 150)
  }, [storeLocation, partnerLocation, destinationLocation, customerLocation, routeCoordinates, isStale])

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

      {/* Pulse keyframe animation for truck live ring */}
      <style>
        {`
          @keyframes ping {
            75%, 100% {
              transform: scale(1.6);
              opacity: 0;
            }
          }
          .leaflet-control-attribution {
            display: none !important;
          }
        `}
      </style>
    </div>
  )
}
