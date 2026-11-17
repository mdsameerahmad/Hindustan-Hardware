import {
  AlertCircle,
  Briefcase,
  Building,
  Check,
  ChevronRight,
  Crosshair,
  Home,
  Loader2,
  MapPin,
  Navigation,
  ShieldCheck,
} from "lucide-react"
import * as React from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import { Badge, Button } from "../../components"
import { loadGoogleMapsSDK } from "../../utils/googleMapsLoader"
import type { CreateAddressPayload } from "../commerceTypes"
import { locationApi } from "../locationApi"

declare const google: any

export interface AddressPickerModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirmAddress: (addressPayload: CreateAddressPayload) => Promise<void>
  initialCity?: string
  initialRecipientName?: string
  initialPhone?: string
}

export function AddressPickerModal({
  isOpen,
  onClose,
  onConfirmAddress,
  initialCity = "Jehanabad",
  initialRecipientName = "",
  initialPhone = "",
}: AddressPickerModalProps) {
  // Mode: 1 = Pin on Map directly, 2 = Complete Details
  // (Step 1 immediately shows the Google Map with "Use Current GPS Location" button)
  const [step, setStep] = useState<1 | 2>(1)
  const [selectedCity] = useState<string>(initialCity)

  // Map state
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapInstanceRef = useRef<any>(null)
  const markerRef = useRef<any>(null)
  const shopMarkerRef = useRef<any>(null)
  const circleRef = useRef<any>(null)
  const reverseGeocodeRequestIdRef = useRef(0)

  const [pinCoords, setPinCoords] = useState<{ latitude: number; longitude: number }>({
    latitude: 25.215475,
    longitude: 84.986764,
  })
  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false)
  const [serviceability, setServiceability] = useState<{
    isServiceable: boolean
    message: string
  }>({
    isServiceable: true,
    message: "Delivery available in selected area.",
  })

  // Geolocation detection state
  const [gpsLoading, setGpsLoading] = useState(false)
  const [gpsError, setGpsError] = useState<string | null>(null)

  // Form details
  const [addressForm, setAddressForm] = useState<CreateAddressPayload>({
    recipientName: initialRecipientName,
    phone: initialPhone,
    addressLine1: "",
    addressLine2: "",
    landmark: "",
    city: selectedCity,
    state: "Bihar",
    postalCode: "804408",
    addressType: "Home",
    isDefault: true,
    latitude: 25.215475,
    longitude: 84.986764,
    formattedAddress: "",
    geocodingProvider: "Photon-OSM",
  })
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Store Config
  const SHOP = {
    name: "Hindustan Hardware",
    lat: 25.215474989473233,
    lng: 84.9867635966286,
  }
  const RADIUS_M = 50000

  // Reverse geocode when pin moves (via free OSM / backend check)
  const runReverseGeocode = useCallback(async (lat: number, lon: number) => {
    const requestId = ++reverseGeocodeRequestIdRef.current
    setIsReverseGeocoding(true)
    try {
      const [revResult, serviceResult] = await Promise.allSettled([
        locationApi.reverseGeocode(lat, lon),
        locationApi.checkServiceability({ lat, lon, city: selectedCity }),
      ])

      if (requestId !== reverseGeocodeRequestIdRef.current) return

      if (serviceResult.status === "fulfilled") {
        setServiceability({
          isServiceable: serviceResult.value.isServiceable,
          message: serviceResult.value.message,
        })
      }

      if (revResult.status === "fulfilled" && revResult.value) {
        const r = revResult.value
        setAddressForm((prev) => ({
          ...prev,
          latitude: lat,
          longitude: lon,
          formattedAddress: r.formattedAddress,
          addressLine1: prev.addressLine1.trim()
            ? prev.addressLine1
            : [r.houseNumber, r.street].filter(Boolean).join(" ") || r.locality || r.formattedAddress,
          addressLine2: prev.addressLine2 || r.locality || "",
          city: r.city || selectedCity,
          state: r.state || "Bihar",
          postalCode: r.postalCode || prev.postalCode,
          geocodingProvider: "Photon-OSM",
        }))
      } else {
        setAddressForm((prev) => ({
          ...prev,
          latitude: lat,
          longitude: lon,
          formattedAddress: `Custom Location (${lat.toFixed(5)}, ${lon.toFixed(5)})`,
        }))
      }
    } finally {
      if (requestId === reverseGeocodeRequestIdRef.current) setIsReverseGeocoding(false)
    }
  }, [selectedCity])

  // Initialize Google Maps visual display
  useEffect(() => {
    if (step !== 1 || !isOpen) return

    let isSubscribed = true

    loadGoogleMapsSDK()
      .then(() => {
        if (!isSubscribed) return
        const container = mapContainerRef.current
        if (!container || typeof google === "undefined" || !google.maps) return

        let map = mapInstanceRef.current
        if (!map) {
          map = new google.maps.Map(container, {
            center: { lat: pinCoords.latitude, lng: pinCoords.longitude },
            zoom: 16,
            mapId: "DEMO_MAP_ID",
            zoomControl: true,
            streetViewControl: false,
            mapTypeControl: false,
            fullscreenControl: false,
          })

          // Shop marker & InfoWindow
          const shopMarker = new google.maps.Marker({
            position: { lat: SHOP.lat, lng: SHOP.lng },
            map,
            title: SHOP.name,
          })
          const shopInfoWindow = new google.maps.InfoWindow({
            content: "<b>Hindustan Hardware Store</b><br/><span style='font-size:11px;color:#64748b;'>PG Road, Jehanabad</span>",
          })
          shopMarker.addListener("click", () => {
            shopInfoWindow.open(map, shopMarker)
          })
          shopMarkerRef.current = shopMarker

          // 50 km delivery circle
          const circle = new google.maps.Circle({
            map,
            center: { lat: SHOP.lat, lng: SHOP.lng },
            radius: RADIUS_M,
            strokeColor: "#1976d2",
            strokeWeight: 2,
            fillColor: "#1976d2",
            fillOpacity: 0.05,
            editable: false,
            clickable: false,
          })
          circleRef.current = circle

          // Delivery Pin Marker (draggable)
          const marker = new google.maps.Marker({
            position: { lat: pinCoords.latitude, lng: pinCoords.longitude },
            map,
            draggable: true,
            title: "Deliver Here (Drag to adjust)",
          })

          marker.addListener("dragend", (e: any) => {
            const lat = e.latLng.lat()
            const lng = e.latLng.lng()
            setPinCoords({ latitude: lat, longitude: lng })
            runReverseGeocode(lat, lng)
          })

          map.addListener("click", (e: any) => {
            const lat = e.latLng.lat()
            const lng = e.latLng.lng()
            marker.setPosition({ lat, lng })
            setPinCoords({ latitude: lat, longitude: lng })
            runReverseGeocode(lat, lng)
          })

          mapInstanceRef.current = map
          markerRef.current = marker

          // Initial reverse geocode
          runReverseGeocode(pinCoords.latitude, pinCoords.longitude)
        } else {
          map.setCenter({ lat: pinCoords.latitude, lng: pinCoords.longitude })
          markerRef.current?.setPosition({ lat: pinCoords.latitude, lng: pinCoords.longitude })
          google.maps.event.trigger(map, "resize")
        }
      })
      .catch((err) => {
        console.warn("Google Maps script load error:", err)
      })

    return () => {
      isSubscribed = false
    }
  }, [step, isOpen, pinCoords.latitude, pinCoords.longitude, runReverseGeocode])

  // Clear map instance and listeners when leaving step 1 or closing
  useEffect(() => {
    if ((!isOpen || step !== 1) && mapInstanceRef.current) {
      if (typeof google !== "undefined" && google.maps?.event) {
        if (mapInstanceRef.current) google.maps.event.clearInstanceListeners(mapInstanceRef.current)
        if (markerRef.current) google.maps.event.clearInstanceListeners(markerRef.current)
        if (shopMarkerRef.current) google.maps.event.clearInstanceListeners(shopMarkerRef.current)
      }
      if (circleRef.current) {
        circleRef.current.setMap(null)
        circleRef.current = null
      }
      if (shopMarkerRef.current) {
        shopMarkerRef.current.setMap(null)
        shopMarkerRef.current = null
      }
      if (markerRef.current) {
        markerRef.current.setMap(null)
        markerRef.current = null
      }
      mapInstanceRef.current = null
    }
  }, [isOpen, step])

  // Handle Current Location Detection (Hardware GPS)
  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setGpsError("Geolocation is not supported by your browser.")
      return
    }

    setGpsLoading(true)
    setGpsError(null)

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords
        setPinCoords({ latitude, longitude })
        setGpsLoading(false)

        if (mapInstanceRef.current && markerRef.current) {
          const pos = { lat: latitude, lng: longitude }
          mapInstanceRef.current.setCenter(pos)
          mapInstanceRef.current.setZoom(17)
          markerRef.current.setPosition(pos)
          runReverseGeocode(latitude, longitude)
        }
      },
      (err) => {
        setGpsLoading(false)
        if (err.code === err.PERMISSION_DENIED) {
          setGpsError("Location permission denied. Please allow location access or tap on the map directly.")
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setGpsError("Location position is currently unavailable.")
        } else if (err.code === err.TIMEOUT) {
          setGpsError("Location request timed out. Please retry.")
        } else {
          setGpsError("Unable to acquire location.")
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
  }

  // Save final confirmed address
  const handleFinalSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (!addressForm.recipientName.trim()) {
      setFormError("Recipient name is required.")
      return
    }
    if (!/^[0-9+\-\s()]{7,20}$/.test(addressForm.phone.trim())) {
      setFormError("Please provide a valid 10-digit phone number.")
      return
    }
    if (!addressForm.addressLine1.trim()) {
      setFormError("Flat, House number or Street is required.")
      return
    }
    if (!/^[0-9]{6}$/.test(addressForm.postalCode.trim())) {
      setFormError("PIN Code must be a 6-digit Indian postal code.")
      return
    }

    setSubmitting(true)
    try {
      await onConfirmAddress({
        ...addressForm,
        latitude: pinCoords.latitude,
        longitude: pinCoords.longitude,
      })
      onClose()
    } catch (err: any) {
      setFormError(err?.message || "Failed to save confirmed address.")
    } finally {
      setSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-t-3xl sm:rounded-2xl border border-slate-700 bg-slate-950 text-white shadow-2xl flex flex-col h-[92vh] sm:h-auto sm:max-h-[90vh]">
        {/* Top Header Bar */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 px-4 py-3 sm:px-6 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30 shrink-0">
              <MapPin size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-xs sm:text-base font-black tracking-wide text-white truncate">
                {step === 1 && "Confirm Delivery Pin on Map"}
                {step === 2 && "Complete Address & Receiver Details"}
              </h3>
              <p className="text-[10px] sm:text-[11px] font-medium text-slate-400 truncate">
                {step === 1 && "Step 1 of 2: Use GPS location or drag the pin to your exact building"}
                {step === 2 && "Step 2 of 2: Add flat/building details and recipient contact"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition shrink-0 ml-2"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-5 scrollbar-thin">
          {/* STEP 1: Direct Google Map with GPS & Pin Adjustment */}
          {step === 1 && (
            <div className="space-y-4">
              {/* Use My Current Location Action */}
              <button
                type="button"
                onClick={handleUseCurrentLocation}
                disabled={gpsLoading}
                className="w-full flex items-center justify-between p-3.5 rounded-xl border border-amber-500/40 bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent hover:border-amber-400 text-left transition group shadow-md"
              >
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-500 text-black font-black group-hover:scale-105 transition shrink-0">
                    {gpsLoading ? <Loader2 size={18} className="animate-spin" /> : <Navigation size={18} />}
                  </span>
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5">
                      Use Current GPS Location
                      <span className="text-[10px] text-amber-400 font-semibold px-1.5 py-0.5 rounded bg-amber-400/10 border border-amber-400/30">
                        100% Free · Accurate
                      </span>
                    </h4>
                    <p className="text-[11px] text-slate-400">
                      Instantly centers pin on your exact doorstep via device GPS
                    </p>
                  </div>
                </div>
                <ChevronRight size={16} className="text-amber-400 shrink-0" />
              </button>

              {gpsError && (
                <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
                  <AlertCircle size={15} className="shrink-0 text-red-400" />
                  <span>{gpsError}</span>
                </div>
              )}

              {/* Google Map Box */}
              <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-slate-900 h-72 sm:h-80 shadow-inner">
                <div ref={mapContainerRef} className="w-full h-full z-0" />

                {/* Recenter Button on Map */}
                <button
                  type="button"
                  onClick={handleUseCurrentLocation}
                  disabled={gpsLoading}
                  className="absolute bottom-3 right-3 z-10 p-2.5 rounded-xl bg-slate-900/95 hover:bg-slate-800 border border-slate-700 text-amber-400 shadow-lg transition"
                  title="Detect GPS location"
                >
                  {gpsLoading ? <Loader2 size={16} className="animate-spin" /> : <Crosshair size={16} />}
                </button>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-[11px] font-semibold text-slate-300 flex items-center justify-between gap-2">
                <span>📍 Tap the map or drag the pin to your exact gate / building.</span>
                {isReverseGeocoding && (
                  <span className="flex shrink-0 items-center gap-1 text-amber-400" role="status">
                    <Loader2 size={11} className="animate-spin" /> Resolving...
                  </span>
                )}
              </div>

              {/* Resolved Address Preview Box */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-3.5 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0">
                    <MapPin size={16} className="text-amber-400 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 block">
                        Selected Delivery Coordinates
                      </span>
                      <p className="text-xs font-semibold text-white truncate">
                        {addressForm.formattedAddress || `${pinCoords.latitude.toFixed(5)}, ${pinCoords.longitude.toFixed(5)}`}
                      </p>
                      <span className="text-[10px] text-slate-400">
                        Lat: {pinCoords.latitude.toFixed(6)} | Lon: {pinCoords.longitude.toFixed(6)}
                      </span>
                    </div>
                  </div>
                  <Badge tone={serviceability.isServiceable ? "success" : "amber"}>
                    {serviceability.isServiceable ? "Deliverable" : "Outside Primary Zone"}
                  </Badge>
                </div>

                <p className="text-[11px] text-slate-400 border-t border-slate-800/80 pt-2">
                  {serviceability.message}
                </p>
              </div>

              {/* Proceed to Address Details Button */}
              <div className="pt-1">
                <Button
                  className="w-full text-xs font-black bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black border border-amber-400 shadow-lg shadow-amber-500/20 py-3"
                  onClick={() => setStep(2)}
                >
                  Confirm Pin & Proceed to Address Details <ChevronRight size={14} className="ml-1" />
                </Button>
              </div>
            </div>
          )}

          {/* STEP 2: Complete Address & Contact Details */}
          {step === 2 && (
            <form onSubmit={handleFinalSubmit} className="space-y-4">
              {formError && (
                <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
                  <AlertCircle size={15} className="shrink-0 text-red-400" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Confirmed Pin Summary Banner */}
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <ShieldCheck size={16} className="text-amber-400 shrink-0" />
                  <span className="text-slate-200 truncate">
                    GPS Coordinates locked at <b>{pinCoords.latitude.toFixed(4)}, {pinCoords.longitude.toFixed(4)}</b>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-amber-400 font-bold hover:underline shrink-0 text-[11px]"
                >
                  Adjust Pin
                </button>
              </div>

              {/* Address Label Type (Home / Work / Site) */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Save Address As
                </label>
                <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                  {[
                    { id: "Home", label: "Home", icon: Home },
                    { id: "Work", label: "Work", icon: Briefcase },
                    { id: "Site", label: "Site", icon: Building },
                  ].map((type) => {
                    const isSelected = addressForm.addressType === type.id
                    const IconComponent = type.icon
                    return (
                      <button
                        key={type.id}
                        type="button"
                        onClick={() => setAddressForm({ ...addressForm, addressType: type.id })}
                        className={`py-2 px-2 sm:p-2.5 rounded-xl border text-[11px] sm:text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                          isSelected
                            ? "bg-amber-500 text-black border-amber-400 shadow-md shadow-amber-500/20"
                            : "bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700"
                        }`}
                      >
                        <IconComponent size={14} className="shrink-0" />
                        <span className="truncate">{type.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Recipient Contact */}
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">
                    Receiver Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={addressForm.recipientName}
                    onChange={(e) => setAddressForm({ ...addressForm, recipientName: e.target.value })}
                    placeholder="e.g. Ramesh Kumar"
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">
                    Receiver Phone Number *
                  </label>
                  <input
                    type="tel"
                    required
                    value={addressForm.phone}
                    onChange={(e) => setAddressForm({ ...addressForm, phone: e.target.value })}
                    placeholder="10-digit mobile number"
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
                  />
                </div>
              </div>

              {/* Address Line 1 */}
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">
                  Flat, House / Plot No., Building / Floor *
                </label>
                <input
                  type="text"
                  required
                  value={addressForm.addressLine1}
                  onChange={(e) => setAddressForm({ ...addressForm, addressLine1: e.target.value })}
                  placeholder="e.g. Flat 302, Green Valley Apartments"
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
                />
              </div>

              {/* Address Line 2 & Landmark */}
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">
                    Street, Area or Colony (Optional)
                  </label>
                  <input
                    type="text"
                    value={addressForm.addressLine2 || ""}
                    onChange={(e) => setAddressForm({ ...addressForm, addressLine2: e.target.value })}
                    placeholder="e.g. Near Eidgah, PG Road"
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">
                    Nearby Landmark (Optional)
                  </label>
                  <input
                    type="text"
                    value={addressForm.landmark || ""}
                    onChange={(e) => setAddressForm({ ...addressForm, landmark: e.target.value })}
                    placeholder="e.g. Opposite State Bank of India"
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
                  />
                </div>
              </div>

              {/* City, State & PIN */}
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">City *</label>
                  <input
                    type="text"
                    required
                    value={addressForm.city}
                    onChange={(e) => setAddressForm({ ...addressForm, city: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-xs text-white focus:border-amber-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">State *</label>
                  <input
                    type="text"
                    required
                    value={addressForm.state}
                    onChange={(e) => setAddressForm({ ...addressForm, state: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-xs text-white focus:border-amber-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">PIN Code *</label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={addressForm.postalCode}
                    onChange={(e) =>
                      setAddressForm({
                        ...addressForm,
                        postalCode: e.target.value.replace(/\D/g, "").slice(0, 6),
                      })
                    }
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-xs text-white focus:border-amber-400 focus:outline-none"
                  />
                </div>
              </div>

              {/* Default checkbox */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="modalIsDefault"
                  checked={addressForm.isDefault}
                  onChange={(e) => setAddressForm({ ...addressForm, isDefault: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-amber-500"
                />
                <label htmlFor="modalIsDefault" className="text-xs text-slate-300">
                  Save as default delivery address for future orders
                </label>
              </div>

              {/* Form Buttons */}
              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2.5 pt-4 pb-6 sm:pb-2 border-t border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep(1)}
                  disabled={submitting}
                  className="w-full sm:w-auto text-xs border-slate-800 text-slate-300 py-2.5"
                >
                  Back to Map
                </Button>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="w-full sm:w-auto text-xs font-black bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black border border-amber-400 shadow-lg shadow-amber-500/20 py-2.5"
                >
                  {submitting ? (
                    <>
                      <Loader2 size={13} className="animate-spin mr-1.5" /> Saving Address...
                    </>
                  ) : (
                    <>
                      <Check size={14} className="mr-1" /> Save Address &amp; Select
                    </>
                  )}
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
