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
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react"
import * as React from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import { Badge, Button } from "../../components"
import type { CreateAddressPayload } from "../commerceTypes"
import localityIndex from "../jehanabadLocalities.json"
import { locationApi, type GeocodingSuggestion, type SupportedCity } from "../locationApi"

declare const google: any

let googleMapsScriptPromise: Promise<void> | null = null

function loadGoogleMapsScript(apiKey: string): Promise<void> {
  if (typeof google !== "undefined" && google.maps) {
    return Promise.resolve()
  }
  if (googleMapsScriptPromise) {
    return googleMapsScriptPromise
  }
  googleMapsScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById("google-maps-js-sdk")
    if (existing) {
      if (typeof google !== "undefined" && google.maps) {
        resolve()
      } else {
        existing.addEventListener("load", () => resolve())
        existing.addEventListener("error", (e) => reject(e))
      }
      return
    }
    const script = document.createElement("script")
    script.id = "google-maps-js-sdk"
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,marker`
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = (err) => {
      googleMapsScriptPromise = null
      reject(err)
    }
    document.head.appendChild(script)
  })
  return googleMapsScriptPromise
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
}

function findLocalitySuggestions(query: string): GeocodingSuggestion[] {
  const normalizedQuery = normalizeSearchText(query)
  if (!normalizedQuery) return []

  const matches = localityIndex.flatMap((record) =>
    record.areas.flatMap((area) => {
      const normalizedArea = normalizeSearchText(area)
      const normalizedPincode = record.pincode
      const areaMatches = normalizedArea.includes(normalizedQuery)
      const pincodeMatches = normalizedPincode.startsWith(normalizedQuery.replace(/\s/g, ""))
      if (!areaMatches && !pincodeMatches) return []

      const relevance = normalizedArea === normalizedQuery
        ? 3
        : normalizedArea.startsWith(normalizedQuery)
        ? 2
        : areaMatches
        ? 1
        : 0

      return [{
        suggestion: {
          id: `local-area:${record.pincode}:${normalizedArea}`,
          name: area,
          formattedAddress: `${area}, ${record.district}, Bihar ${record.pincode}`,
          locality: area,
          city: record.district,
          district: record.district,
          state: "Bihar",
          postalCode: record.pincode,
          country: "India",
          provider: "Photon-OSM" as const,
        },
        relevance,
      }]
    }),
  )

  return matches
    .sort((a, b) => b.relevance - a.relevance || a.suggestion.name.localeCompare(b.suggestion.name))
    .slice(0, 8)
    .map(({ suggestion }) => suggestion)
}

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
  // Mode: 1 = Search & City, 2 = Pin on Map, 3 = Complete Details
  const [step, setStep] = useState<1 | 2 | 3>(1)

  // Cities
  const [cities, setCities] = useState<SupportedCity[]>([
    { id: "jehanabad", name: "Jehanabad", state: "Bihar", isExpressAvailable: true },
    { id: "patna", name: "Patna", state: "Bihar", isExpressAvailable: false },
    { id: "gaya", name: "Gaya", state: "Bihar", isExpressAvailable: false },
  ])
  const [selectedCity, setSelectedCity] = useState<string>(initialCity)

  // Search state
  const [searchQuery, setSearchQuery] = useState("")
  const [suggestions, setSuggestions] = useState<GeocodingSuggestion[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isSelectingSuggestion, setIsSelectingSuggestion] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const searchRequestIdRef = useRef(0)
  const searchSessionTokenRef = useRef(crypto.randomUUID())

  // Map state
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapInstanceRef = useRef<any>(null)
  const markerRef = useRef<any>(null)
  const shopMarkerRef = useRef<any>(null)
  const circleRef = useRef<any>(null)
  const infoWindowRef = useRef<any>(null)
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

  // Load cities on mount
  useEffect(() => {
    locationApi
      .getCities()
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) setCities(data)
      })
      .catch(() => {})
  }, [])

  // Sync city selection to coordinates center
  useEffect(() => {
    if (selectedCity.toLowerCase() === "patna") {
      setPinCoords({ latitude: 25.594095, longitude: 85.137566 })
      setAddressForm((prev) => ({ ...prev, city: "Patna", postalCode: "800001" }))
    } else if (selectedCity.toLowerCase() === "gaya") {
      setPinCoords({ latitude: 24.791396, longitude: 85.000229 })
      setAddressForm((prev) => ({ ...prev, city: "Gaya", postalCode: "823001" }))
    } else {
      setPinCoords({ latitude: 25.215475, longitude: 84.986764 })
      setAddressForm((prev) => ({ ...prev, city: "Jehanabad", postalCode: "804408" }))
    }
  }, [selectedCity])

  // ==========================================
  // // Old Logic
  // Debounced address search using Google Places when configured, with Photon fallback.
  // useEffect(() => {
  //   const trimmed = searchQuery.trim()
  //   if (step !== 1 || trimmed.length < 2) {
  //     setSuggestions([])
  //     setIsSearching(false)
  //     setSearchError(null)
  //     searchRequestIdRef.current += 1
  //     return
  //   }
  //
  //   const localSuggestions = findLocalitySuggestions(trimmed)
  //   setSuggestions(localSuggestions)
  //   setIsSearching(true)
  //   setSearchError(null)
  //
  //   const timer = setTimeout(async () => {
  //     const requestId = ++searchRequestIdRef.current
  //     try {
  //       const results = await locationApi.searchAddresses(trimmed, selectedCity, 12, {
  //         lat: pinCoords.latitude,
  //         lon: pinCoords.longitude,
  //       }, searchSessionTokenRef.current)
  //       if (requestId !== searchRequestIdRef.current) return
  //       const mergedResults = [...localSuggestions, ...results]
  //       setSuggestions(mergedResults)
  //       if (mergedResults.length === 0) {
  //         setSearchError("No matching street, road or landmark found. You can place the pin directly on the map.")
  //       }
  //     } catch (err: any) {
  //       if (requestId === searchRequestIdRef.current && localSuggestions.length === 0) {
  //         setSearchError("Address search unavailable. You can locate your address manually on the map.")
  //       }
  //     } finally {
  //       if (requestId === searchRequestIdRef.current) setIsSearching(false)
  //     }
  //   }, 300)
  //
  //   return () => {
  //     clearTimeout(timer)
  //     searchRequestIdRef.current += 1
  //   }
  // }, [searchQuery, selectedCity, pinCoords.latitude, pinCoords.longitude, step])
  // ==========================================

  // ==========================================
  // Store Config & Range Calculations
  // ==========================================
  const GOOGLE_API_KEY =
    (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) ||
    "AIzaSyCnvKMMG0Ae6J34R9KESHIJCQmD6KYETPo"
  const SHOP = {
    name: "Hindustan Hardware",
    lat: 25.215474989473233,
    lng: 84.9867635966286,
  }
  const RADIUS_M = 50000
  const RADIUS_KM = 50

  // Distance between two coordinates in km
  function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371
    const toRad = (d: number) => (d * Math.PI) / 180
    const dLat = toRad(lat2 - lat1)
    const dLon = toRad(lon2 - lon1)
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
    return 2 * R * Math.asin(Math.sqrt(a))
  }

  // ?? New Logic of address searching
  // Uses Google Places API (New) for search and autocomplete restricted to 50 km circle around the shop
  // Map stays on OpenStreetMap / Leaflet

  // Autocomplete restricted to a 50 km circle around the shop, India only
  async function autocompleteGoogle(text: string) {
    const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_API_KEY,
      },
      body: JSON.stringify({
        input: text,
        includedRegionCodes: ["in"],
        locationRestriction: {
          circle: {
            center: { latitude: SHOP.lat, longitude: SHOP.lng },
            radius: RADIUS_M,
          },
        },
      }),
    })
    const data = await res.json()
    return (data.suggestions || [])
      .filter((s: any) => s.placePrediction)
      .map((s: any) => ({
        placeId: s.placePrediction.placeId,
        label: s.placePrediction.text.text,
      }))
  }

  // Get exact coordinates for a chosen place
  async function getGoogleLocation(placeId: string) {
    const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
      headers: {
        "X-Goog-Api-Key": GOOGLE_API_KEY,
        "X-Goog-FieldMask": "displayName,formattedAddress,location",
      },
    })
    const p = await res.json()
    return {
      label: p.formattedAddress || p.displayName?.text || "",
      lat: p.location?.latitude,
      lng: p.location?.longitude,
    }
  }

  // Live suggestions debounce effect using Google Places (50 km radius)
  useEffect(() => {
    const q = searchQuery.trim()
    if (step !== 1 || q.length < 2) {
      setSuggestions([])
      setIsSearching(false)
      setSearchError(null)
      return
    }

    setIsSearching(true)
    setSearchError(null)

    const timer = setTimeout(async () => {
      try {
        const places = await autocompleteGoogle(q)
        setIsSearching(false)

        if (!places || places.length === 0) {
          setSuggestions([])
          setSearchError("No results within 50 km of Hindustan Hardware.")
        } else {
          const mapped: GeocodingSuggestion[] = places.map((s: any, idx: number) => ({
            id: `google-${idx}-${s.placeId}`,
            placeId: s.placeId,
            name: s.label.split(",")[0] || s.label,
            formattedAddress: s.label,
            city: "Jehanabad",
            state: "Bihar",
            country: "India",
            provider: "Google-Places",
          }))
          setSuggestions(mapped)
        }
      } catch {
        setIsSearching(false)
        setSearchError("Search request failed. Please check connection.")
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [searchQuery, step])

  const showGooglePlace = async (s: { placeId?: string; label: string; lat?: number; lng?: number }) => {
    try {
      setIsSelectingSuggestion(true)
      let lat = s.lat
      let lng = s.lng
      let label = s.label

      if ((lat == null || lng == null) && s.placeId) {
        const loc = await getGoogleLocation(s.placeId)
        lat = loc.lat
        lng = loc.lng
        if (loc.label) label = loc.label
      }

      if (lat == null || lng == null) {
        setSearchError("Could not retrieve coordinates for the selected place.")
        return
      }

      const dist = distanceKm(SHOP.lat, SHOP.lng, lat, lng).toFixed(1)
      setPinCoords({ latitude: lat, longitude: lng })
      setAddressForm((prev) => ({
        ...prev,
        latitude: lat,
        longitude: lng,
        formattedAddress: label,
        addressLine1: prev.addressLine1.trim() ? prev.addressLine1 : label.split(",")[0] || label,
        city: selectedCity,
        geocodingProvider: "Google-Places",
      }))

      setStep(2)

      if (mapInstanceRef.current && markerRef.current) {
        const newPos = { lat, lng }
        mapInstanceRef.current.setCenter(newPos)
        mapInstanceRef.current.setZoom(16)
        markerRef.current.setPosition(newPos)

        if (!infoWindowRef.current && typeof google !== "undefined" && google.maps) {
          infoWindowRef.current = new google.maps.InfoWindow()
        }
        if (infoWindowRef.current) {
          infoWindowRef.current.setContent(
            `<b>${label}</b><br/><span style="color:#64748b;font-size:11px;">📍 ${dist} km from store</span>`
          )
          infoWindowRef.current.open(mapInstanceRef.current, markerRef.current)
        }
      }
      runReverseGeocode(lat, lng)
    } catch {
      setSearchError("Failed to fetch location details.")
    } finally {
      setIsSelectingSuggestion(false)
    }
  }

  const handleNominatimSearch = async () => {
    if (suggestions.length > 0) {
      showGooglePlace(suggestions[0])
    }
  }

  // Reverse geocode when pin moves
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

  // Initialize Google Maps in Step 2
  useEffect(() => {
    if (step !== 2 || !isOpen) return

    let isSubscribed = true

    loadGoogleMapsScript(GOOGLE_API_KEY)
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

          // Delivery Pin Marker
          const marker = new google.maps.Marker({
            position: { lat: pinCoords.latitude, lng: pinCoords.longitude },
            map,
            draggable: true,
            title: "Deliver Here",
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

  // Clear map instance and listeners when leaving step 2 or closing
  useEffect(() => {
    if ((!isOpen || step !== 2) && mapInstanceRef.current) {
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
      infoWindowRef.current = null
    }
  }, [isOpen, step])

  // Handle Current Location Detection
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

        // Advance to step 2 directly
        setStep(2)

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
          setGpsError("Location permission denied. Please search your colony/road or place pin on map.")
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setGpsError("Location position is currently unavailable.")
        } else if (err.code === err.TIMEOUT) {
          setGpsError("Location request timed out. Please retry.")
        } else {
          setGpsError("Unable to acquire location.")
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    )
  }

  // ==========================================
  // // Old Logic
  // Select an autocomplete suggestion
  // const handleSelectSuggestion = async (suggestion: GeocodingSuggestion) => {
  //   setIsSelectingSuggestion(true)
  //   setSearchError(null)
  //   try {
  //     let selected = suggestion
  //     if (suggestion.id.startsWith("local-area:")) {
  //       const localityQuery = [
  //         suggestion.name,
  //         suggestion.district,
  //         suggestion.postalCode,
  //         "Bihar",
  //       ].filter(Boolean).join(", ")
  //       const localityResults = await locationApi.searchAddresses(
  //         localityQuery,
  //         selectedCity,
  //         8,
  //         { lat: pinCoords.latitude, lon: pinCoords.longitude },
  //         searchSessionTokenRef.current,
  //       )
  //       const resolvedLocality = localityResults.find((result) =>
  //         result.latitude != null &&
  //         result.longitude != null &&
  //         result.postalCode === suggestion.postalCode,
  //       ) || localityResults.find((result) =>
  //         result.latitude != null && result.longitude != null,
  //       )
  //       if (!resolvedLocality) {
  //         throw new Error("Could not locate this area on the map. Try its PIN code or select a nearby search result.")
  //       }
  //       selected = resolvedLocality
  //     }
  //
  //     if (selected.provider === "Google-Places" && selected.placeId) {
  //       selected = await locationApi.getPlaceDetails(selected.placeId, searchSessionTokenRef.current)
  //     }
  //     const latitude = selected.latitude
  //     const longitude = selected.longitude
  //     if (latitude == null || longitude == null) {
  //       throw new Error("The selected map result does not include exact coordinates.")
  //     }
  //
  //     if (selected.provider === "Google-Places") {
  //       searchSessionTokenRef.current = crypto.randomUUID()
  //     }
  //
  //     setPinCoords({ latitude, longitude })
  //     setAddressForm((prev) => ({
  //       ...prev,
  //       latitude,
  //       longitude,
  //       city: selected.city || selectedCity,
  //       state: selected.state || "Bihar",
  //       postalCode: selected.postalCode || suggestion.postalCode || prev.postalCode,
  //       addressLine1: selected.street || selected.name,
  //       addressLine2: selected.locality || "",
  //       formattedAddress: selected.formattedAddress,
  //       geocodingProvider: selected.provider || "Photon-OSM",
  //     }))
  //     setStep(2)
  //   } catch (err: any) {
  //     setSearchError(err?.message || "Could not resolve the selected map result. Please try another result.")
  //   } finally {
  //     setIsSelectingSuggestion(false)
  //   }
  // }
  // ==========================================

  // ?? New Logic of address searching
  // Select an address directly using Google Places
  const handleSelectSuggestion = (suggestion: GeocodingSuggestion) => {
    showGooglePlace(suggestion)
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
                {step === 1 && "Select Delivery Location"}
                {step === 2 && "Confirm Exact Delivery Pin"}
                {step === 3 && "Complete Address & Receiver Details"}
              </h3>
              <p className="text-[10px] sm:text-[11px] font-medium text-slate-400 truncate">
                {step === 1 && "Step 1 of 3: Search locality or road in supported cities"}
                {step === 2 && "Step 2 of 3: Drag or tap pin for doorstep accuracy"}
                {step === 3 && "Step 3 of 3: Add flat/building details and recipient contact"}
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
          {/* STEP 1: Search & City Selection */}
          {step === 1 && (
            <div className="space-y-4">
              {/* City Filter Pills */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Select Serviceable City
                </label>
                <div className="flex flex-wrap gap-2">
                  {cities.map((city) => {
                    const isSelected = selectedCity.toLowerCase() === city.name.toLowerCase()
                    return (
                      <button
                        key={city.id}
                        type="button"
                        onClick={() => setSelectedCity(city.name)}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border ${
                          isSelected
                            ? "bg-amber-500 text-black border-amber-400 shadow-md shadow-amber-500/20"
                            : "bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700"
                        }`}
                      >
                        <span>{city.name}</span>
                        {city.isExpressAvailable && (
                          <span className="text-[9px] px-1 py-0.2 rounded bg-black/20 font-black">
                            STORE HQ
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Use My Current Location Action */}
              <button
                type="button"
                onClick={handleUseCurrentLocation}
                disabled={gpsLoading}
                className="w-full flex items-center justify-between p-3.5 rounded-xl border border-amber-500/40 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent hover:border-amber-400 text-left transition group"
              >
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-500 text-black font-black group-hover:scale-105 transition">
                    {gpsLoading ? <Loader2 size={18} className="animate-spin" /> : <Navigation size={18} />}
                  </span>
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5">
                      Use Current GPS Location
                      <span className="text-[10px] text-amber-400 font-semibold px-1.5 py-0.5 rounded bg-amber-400/10 border border-amber-400/30">
                        Recommended
                      </span>
                    </h4>
                    <p className="text-[11px] text-slate-400">
                      Instantly centers the pin on your device position
                    </p>
                  </div>
                </div>
                <ChevronRight size={16} className="text-amber-400" />
              </button>

              {gpsError && (
                <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
                  <AlertCircle size={15} className="shrink-0 text-red-400" />
                  <span>{gpsError}</span>
                </div>
              )}

              {/* Search Box */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Search Place, Colony, Street or Landmark (Press Enter to Pin on Map)
                </label>
                <div className="relative flex gap-2">
                  <div className="relative flex-1">
                    <Search
                      size={16}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault()
                          handleNominatimSearch()
                        }
                      }}
                      placeholder="Type a place or street, then press Enter (e.g. Station Road, Sadar Hospital...)"
                      className="w-full rounded-xl border border-slate-700 bg-slate-900/90 pl-10 pr-10 py-2.5 text-xs sm:text-sm text-white placeholder-slate-500 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 focus:outline-none"
                      autoFocus
                    />
                    {isSearching && (
                      <Loader2
                        size={15}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-amber-400"
                      />
                    )}
                  </div>
                  <Button
                    type="button"
                    onClick={() => handleNominatimSearch()}
                    disabled={isSearching || !searchQuery.trim()}
                    className="shrink-0 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs px-4"
                  >
                    {isSearching ? <Loader2 size={14} className="animate-spin" /> : "Search"}
                  </Button>
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  Search powered by Google Places API (New) restricted to 50 km delivery circle around Hindustan Hardware.
                </p>
              </div>

              {isSelectingSuggestion && (
                <div className="flex items-center gap-2 text-xs text-amber-300" role="status">
                  <Loader2 size={14} className="animate-spin" />
                  Getting the exact map location...
                </div>
              )}

              {/* Suggestions List - Google Maps Style */}
              {suggestions.length > 0 && (
                <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-2">
                  {suggestions.some((suggestion) => suggestion.provider === "Google-Places") && (
                    <div className="flex justify-end pb-2">
                      <img
                        src="https://maps.gstatic.com/mapfiles/api-3/images/powered-by-google-on-white3.png"
                        alt="Powered by Google"
                        className="h-4 rounded bg-white px-1"
                      />
                    </div>
                  )}
                  <div className="space-y-1.5 max-h-64 overflow-y-auto scrollbar-thin">
                    {suggestions.map((sug) => {
                    const lowerName = sug.name.toLowerCase()
                    const lowerAddr = sug.formattedAddress.toLowerCase()

                    const isStation =
                      lowerName.includes("station") ||
                      lowerAddr.includes("station") ||
                      lowerName.includes("junction")
                    const isBus =
                      lowerName.includes("bus stand") ||
                      lowerAddr.includes("bus stand") ||
                      lowerName.includes("bus stop")
                    const isBypass =
                      lowerName.includes("bypass") ||
                      lowerAddr.includes("bypass")
                    const isMandir =
                      lowerName.includes("mandir") ||
                      lowerAddr.includes("mandir") ||
                      lowerName.includes("temple")
                    const isMasjid =
                      lowerName.includes("masjid") ||
                      lowerAddr.includes("masjid") ||
                      lowerName.includes("mosque") ||
                      lowerName.includes("eidgah")
                    const isRoad =
                      lowerName.includes("road") ||
                      lowerName.includes("marg") ||
                      lowerName.includes("path") ||
                      lowerName.includes("chowk") ||
                      sug.street ||
                      lowerAddr.includes("road")

                    return (
                      <div
                        key={sug.id}
                        onClick={() => !isSelectingSuggestion && handleSelectSuggestion(sug)}
                        aria-disabled={isSelectingSuggestion}
                        className={`p-2.5 rounded-lg hover:bg-slate-800/90 transition flex items-start gap-2.5 text-xs group border border-transparent hover:border-slate-700 ${
                          isSelectingSuggestion ? "cursor-wait opacity-60" : "cursor-pointer"
                        }`}
                      >
                        <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0 mt-0.5 group-hover:bg-amber-500 group-hover:text-black transition">
                          {isStation ? (
                            <Building size={14} />
                          ) : isBus ? (
                            <Navigation size={14} />
                          ) : isMandir || isMasjid ? (
                            <Sparkles size={14} />
                          ) : (
                            <MapPin size={14} />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <strong className="text-white block font-bold truncate">{sug.name}</strong>
                            {isStation && (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-blue-500/10 text-blue-400 border border-blue-500/30">
                                Railway Station
                              </span>
                            )}
                            {isBus && (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                Bus Stand
                              </span>
                            )}
                            {isBypass && (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                                Bypass
                              </span>
                            )}
                            {isMandir && (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-orange-500/10 text-orange-400 border border-orange-500/30">
                                Mandir
                              </span>
                            )}
                            {isMasjid && (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                Masjid
                              </span>
                            )}
                            {isRoad && !isStation && !isBus && !isBypass && !isMandir && !isMasjid && (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                                Street / Road
                              </span>
                            )}
                          </div>
                          <span className="text-slate-400 block truncate text-[11px] mt-0.5">
                            {sug.formattedAddress}
                          </span>
                        </div>
                        <ChevronRight size={14} className="text-slate-500 shrink-0 self-center group-hover:text-amber-400 transition" />
                      </div>
                    )
                    })}
                  </div>
                </div>
              )}

              {searchError && (
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 text-xs">
                  {searchError}
                </div>
              )}

              {/* Manual Pin Option */}
              <div className="pt-2">
                <Button
                  variant="outline"
                  className="w-full text-xs font-bold py-2.5 border-slate-800 hover:border-amber-400 text-slate-300 hover:text-white"
                  onClick={() => setStep(2)}
                >
                  <Crosshair size={14} className="text-amber-400 mr-2" />
                  Place Pin Directly on Map
                </Button>
              </div>
            </div>
          )}

          {/* STEP 2: Interactive Leaflet Pin Confirmation */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-slate-900 h-72 sm:h-80 shadow-inner">
                <div ref={mapContainerRef} className="w-full h-full z-0" />

                {/* Recenter Button */}
                <button
                  type="button"
                  onClick={handleUseCurrentLocation}
                  disabled={gpsLoading}
                  className="absolute bottom-3 right-3 z-10 p-2 rounded-xl bg-slate-900/95 hover:bg-slate-800 border border-slate-700 text-amber-400 shadow-lg transition"
                  title="Detect GPS location"
                >
                  {gpsLoading ? <Loader2 size={16} className="animate-spin" /> : <Crosshair size={16} />}
                </button>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-[11px] font-semibold text-slate-300 flex items-center justify-between gap-2">
                <span>Tap the map or drag the pin to your exact gate / building.</span>
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
                        Pin Selected Coordinates
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

              {/* Actions */}
              <div className="flex gap-2.5 pt-1">
                <Button
                  variant="outline"
                  className="flex-1 text-xs border-slate-800 text-slate-300"
                  onClick={() => setStep(1)}
                >
                  <RotateCcw size={13} className="mr-1.5" /> Change Location
                </Button>
                <Button
                  className="flex-1 text-xs font-black bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black border border-amber-400 shadow-lg shadow-amber-500/20"
                  onClick={() => setStep(3)}
                >
                  Confirm Location & Proceed <ChevronRight size={14} className="ml-1" />
                </Button>
              </div>
            </div>
          )}

          {/* STEP 3: Complete Address & Contact Details */}
          {step === 3 && (
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
                  onClick={() => setStep(2)}
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
                  onClick={() => setStep(2)}
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
