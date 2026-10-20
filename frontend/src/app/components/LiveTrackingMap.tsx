import * as React from "react"
import { useEffect, useRef } from "react"
import * as L from "leaflet"
import "leaflet/dist/leaflet.css"

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
    address: "PG Road, Opposite Eidgah",
    city: "Jehanabad",
    latitude: 25.213196,
    longitude: 84.982696,
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
        partnerLocation?.latitude ??
        destinationLocation?.latitude ??
        storeLocation?.latitude ??
        25.213196
      const initialLng =
        partnerLocation?.longitude ??
        destinationLocation?.longitude ??
        storeLocation?.longitude ??
        84.982696

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
        <div style="
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 52px;
          height: 52px;
        ">
          ${
            !stale
              ? `<div style="
                  position: absolute;
                  width: 52px;
                  height: 52px;
                  border-radius: 50%;
                  background: rgba(212, 175, 55, 0.35);
                  animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;
                "></div>`
              : ""
          }
          <div style="
            width: 44px;
            height: 44px;
            border-radius: 50%;
            background: #ffffff;
            box-shadow: 0 4px 14px rgba(0,0,0,0.25);
            border: 2.5px solid ${stale ? "#94a3b8" : "#d4af37"};
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            z-index: 2;
          ">
            <img 
              src="/truckLogo.png" 
              alt="Delivery Partner Truck" 
              style="
                width: 32px; 
                height: 32px; 
                object-fit: contain;
                filter: ${stale ? "grayscale(80%)" : "none"};
              "
            />
          </div>
        </div>
      `,
      iconSize: [52, 52],
      iconAnchor: [26, 26],
      popupAnchor: [0, -26],
    })
  }

  // Create Hindustan Hardware Store Icon
  const createStoreIcon = () => {
    return L.divIcon({
      className: "custom-store-marker",
      html: `
        <div style="
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
        ">
          <div style="
            width: 36px;
            height: 36px;
            border-radius: 10px;
            background: #1e293b;
            color: #f59e0b;
            box-shadow: 0 4px 14px rgba(0,0,0,0.4);
            border: 2px solid #f59e0b;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
            font-weight: bold;
          ">
            🏬
          </div>
        </div>
      `,
      iconSize: [40, 40],
      iconAnchor: [20, 20],
      popupAnchor: [0, -20],
    })
  }

  // Create Destination Pin Icon
  const createDestinationIcon = () => {
    return L.divIcon({
      className: "custom-destination-marker",
      html: `
        <div style="
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
        ">
          <div style="
            width: 32px;
            height: 32px;
            border-radius: 50%;
            background: #0b0b0b;
            color: #d4af37;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            border: 2px solid #d4af37;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
            font-weight: bold;
          ">
            📍
          </div>
        </div>
      `,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
      popupAnchor: [0, -18],
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

    // 2. Partner Marker (Moving Delivery Partner)
    if (
      partnerLocation &&
      typeof partnerLocation.latitude === "number" &&
      typeof partnerLocation.longitude === "number"
    ) {
      const partnerLatLng: L.LatLngExpression = [partnerLocation.latitude, partnerLocation.longitude]
      const icon = createTruckIcon(isStale)

      if (partnerMarkerRef.current) {
        partnerMarkerRef.current.setLatLng(partnerLatLng)
        partnerMarkerRef.current.setIcon(icon)
      } else {
        const marker = L.marker(partnerLatLng, { icon }).addTo(map)
        marker.bindPopup(
          `<b>Hindustan Hardware Delivery Partner</b><br/>${isStale ? "Status: Signal delayed" : "Status: Active & moving"}`
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
          color: "#0b0b0b",
          weight: 5,
          opacity: 0.85,
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

    // 6. Fit Viewport to Route & Markers (only on initial point setting or route updates)
    if (hasPoints && bounds.isValid() && !initialBoundsSetRef.current) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 })
      initialBoundsSetRef.current = true
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
      {/* Pulse keyframe animation for truck live ring */}
      <style>
        {`
          @keyframes ping {
            75%, 100% {
              transform: scale(1.6);
              opacity: 0;
            }
          }
        `}
      </style>
    </div>
  )
}
