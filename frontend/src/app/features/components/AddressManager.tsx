import { Check, Loader2, MapPin, Navigation, Plus, Trash2, Map } from "lucide-react"
import React, { useState } from "react"
import { Badge, Button } from "../../components"
import type { CreateAddressPayload, CustomerAddress } from "../commerceTypes"
import { AddressPickerModal } from "./AddressPickerModal"

interface AddressManagerProps {
  addresses: CustomerAddress[]
  loading?: boolean
  selectedAddressId?: string
  onSelectAddress?: (address: CustomerAddress) => void
  onCreateAddress: (payload: CreateAddressPayload) => Promise<any>
  onSetDefaultAddress?: (addressId: string) => Promise<any>
  onDeleteAddress?: (addressId: string) => Promise<any>
  allowQuickForm?: boolean
}

export function AddressManager({
  addresses,
  loading = false,
  selectedAddressId,
  onSelectAddress,
  onCreateAddress,
  onSetDefaultAddress,
  onDeleteAddress,
  allowQuickForm = true,
}: AddressManagerProps) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [fetchingLocation, setFetchingLocation] = useState(false)
  const [locationSuccess, setLocationSuccess] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const [form, setForm] = useState<CreateAddressPayload>({
    recipientName: "",
    phone: "",
    addressLine1: "",
    addressLine2: "",
    landmark: "",
    city: "Jehanabad",
    state: "Bihar",
    postalCode: "804408",
    addressType: "Home",
    isDefault: false,
  })

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setFormError("Geolocation is not supported by your browser.")
      return
    }

    setFetchingLocation(true)
    setFormError(null)
    setLocationSuccess(null)

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords
        try {
          // Use OpenStreetMap Nominatim reverse geocoding to resolve address details
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1`,
            {
              headers: {
                Accept: "application/json",
              },
            }
          )

          if (!res.ok) {
            throw new Error("Unable to retrieve address from GPS coordinates.")
          }

          const data = await res.json()
          const addr = data.address || {}

          const detectedRoad = [
            addr.road || addr.suburb || addr.neighbourhood || addr.residential,
          ]
            .filter(Boolean)
            .join(", ")

          const detectedCity =
            addr.city || addr.town || addr.village || addr.county || "Jehanabad"
          const detectedState = addr.state || "Bihar"
          const detectedPostcode = addr.postcode ? addr.postcode.replace(/\D/g, "").slice(0, 6) : "804408"

          setForm((prev) => ({
            ...prev,
            addressLine1: detectedRoad || prev.addressLine1 || `GPS Location (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`,
            addressLine2: addr.neighbourhood || addr.suburb || prev.addressLine2,
            city: detectedCity,
            state: detectedState,
            postalCode: detectedPostcode.length === 6 ? detectedPostcode : prev.postalCode,
          }))

          setLocationSuccess("Location detected and address fields updated!")
          setTimeout(() => setLocationSuccess(null), 4000)
        } catch (err: any) {
          // Fallback if reverse geocoding is blocked or offline
          setForm((prev) => ({
            ...prev,
            addressLine1: `Near GPS (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`,
          }))
          setLocationSuccess("Coordinates captured from device location.")
          setTimeout(() => setLocationSuccess(null), 4000)
        } finally {
          setFetchingLocation(false)
        }
      },
      (error) => {
        setFetchingLocation(false)
        if (error.code === error.PERMISSION_DENIED) {
          setFormError("Location permission was denied. Please allow location access in your browser.")
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          setFormError("Location position is unavailable.")
        } else if (error.code === error.TIMEOUT) {
          setFormError("Location request timed out.")
        } else {
          setFormError("Failed to fetch location.")
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (!form.recipientName.trim()) {
      setFormError("Recipient name is required.")
      return
    }
    if (!/^[0-9+\-\s()]{7,20}$/.test(form.phone.trim())) {
      setFormError("Please provide a valid 10-digit phone number.")
      return
    }
    if (!form.addressLine1.trim()) {
      setFormError("Address line 1 is required.")
      return
    }
    if (!/^[0-9]{6}$/.test(form.postalCode.trim())) {
      setFormError("Postal code must be a 6-digit Indian PIN code.")
      return
    }

    setSubmitting(true)
    try {
      await onCreateAddress(form)
      setShowAddForm(false)
      setForm({
        recipientName: "",
        phone: "",
        addressLine1: "",
        addressLine2: "",
        landmark: "",
        city: "Jehanabad",
        state: "Bihar",
        postalCode: "804408",
        addressType: "Home",
        isDefault: false,
      })
    } catch (err: any) {
      setFormError(err?.message || "Failed to save address.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-bold text-ink">Saved Delivery Addresses</h3>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            className="text-xs bg-amber-500 hover:bg-amber-400 text-black font-black border border-amber-400 shadow-sm"
            onClick={() => setIsPickerOpen(true)}
          >
            <Map size={14} className="mr-1.5" /> Locate on Map & Select
          </Button>
        </div>
      </div>

      <AddressPickerModal
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        onConfirmAddress={async (payload) => {
          const created = await onCreateAddress(payload)
          if (onSelectAddress && created) {
            onSelectAddress(created)
          }
        }}
      />

      {allowQuickForm && showAddForm && (
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-brand/30 bg-blue-50/20 p-5 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-border pb-3">
            <h4 className="font-bold text-ink text-sm">Add New Address</h4>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleUseCurrentLocation}
                disabled={fetchingLocation}
                className="flex items-center gap-1.5 rounded-lg border border-[#D4AF37] bg-amber-50/50 px-2.5 py-1 text-xs font-bold text-amber-900 transition hover:bg-[#D4AF37] hover:text-black disabled:opacity-50"
                title="Detect device GPS location and auto-fill address"
              >
                {fetchingLocation ? (
                  <>
                    <Loader2 size={13} className="animate-spin text-amber-800" />
                    <span>Detecting Location...</span>
                  </>
                ) : (
                  <>
                    <Navigation size={13} className="text-[#D4AF37]" />
                    <span>Use Current Location</span>
                  </>
                )}
              </button>
              <button
                type="button"
                className="text-xs text-slate-500 hover:text-ink"
                onClick={() => setShowAddForm(false)}
              >
                Cancel
              </button>
            </div>
          </div>

          {locationSuccess && (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-2.5 text-xs font-semibold text-emerald-800 border border-emerald-200">
              <Check size={14} className="text-emerald-600" />
              {locationSuccess}
            </div>
          )}

          {formError && (
            <div className="rounded-lg bg-red-50 p-3 text-xs font-semibold text-red-700">
              {formError}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">
                Recipient Name *
              </label>
              <input
                type="text"
                className="field"
                placeholder="Full Name"
                value={form.recipientName}
                onChange={(e) => setForm({ ...form, recipientName: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">
                Phone Number *
              </label>
              <input
                type="tel"
                className="field"
                placeholder="10-digit mobile number"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">
              Flat / House / Street *
            </label>
            <input
              type="text"
              className="field"
              placeholder="House/Plot no., Street name"
              value={form.addressLine1}
              onChange={(e) => setForm({ ...form, addressLine1: e.target.value })}
              required
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">
                Area / Colony (Optional)
              </label>
              <input
                type="text"
                className="field"
                placeholder="Area or locality"
                value={form.addressLine2 || ""}
                onChange={(e) => setForm({ ...form, addressLine2: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">
                Landmark (Optional)
              </label>
              <input
                type="text"
                className="field"
                placeholder="Near temple, school, etc."
                value={form.landmark || ""}
                onChange={(e) => setForm({ ...form, landmark: e.target.value })}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">
                City / Town *
              </label>
              <input
                type="text"
                className="field"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">
                State *
              </label>
              <input
                type="text"
                className="field"
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">
                PIN Code *
              </label>
              <input
                type="text"
                maxLength={6}
                className="field"
                value={form.postalCode}
                onChange={(e) =>
                  setForm({ ...form, postalCode: e.target.value.replace(/\D/g, "").slice(0, 6) })
                }
                required
              />
            </div>
          </div>

          <div className="flex items-center gap-6 pt-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isDefault"
                checked={form.isDefault}
                onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
                className="rounded border-slate-300 text-brand focus:ring-brand"
              />
              <label htmlFor="isDefault" className="text-xs font-bold text-slate-700">
                Set as default delivery address
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowAddForm(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : "Save Address"}
            </Button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="h-28 animate-pulse rounded-xl bg-slate-100" />
          <div className="h-28 animate-pulse rounded-xl bg-slate-100" />
        </div>
      ) : addresses.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-slate-500">
          <MapPin className="mx-auto mb-2 text-slate-400" size={28} />
          <p className="text-sm font-semibold">No addresses saved yet.</p>
          <p className="text-xs text-slate-400 mt-1">
            Add your delivery address to speed up order checkout.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {addresses.map((addr) => {
            const isSelected = selectedAddressId === addr.id
            return (
              <div
                key={addr.id}
                onClick={() => onSelectAddress && onSelectAddress(addr)}
                className={`relative rounded-xl border p-4 transition cursor-pointer ${
                  isSelected
                    ? "border-brand bg-blue-50/40 ring-2 ring-brand/20 shadow-sm"
                    : "border-border bg-white hover:border-slate-300"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-ink text-sm">
                      {addr.recipient_name}
                    </span>
                    <Badge tone="blue">{addr.address_type || "Home"}</Badge>
                    {addr.is_default && (
                      <Badge tone="success">Default</Badge>
                    )}
                  </div>
                  {isSelected && (
                    <span className="grid h-5 w-5 place-items-center rounded-full bg-brand text-white">
                      <Check size={12} />
                    </span>
                  )}
                </div>

                <p className="mt-2 text-xs leading-5 text-slate-600">
                  {addr.address_line1}
                  {addr.address_line2 ? `, ${addr.address_line2}` : ""}
                  {addr.landmark ? `, Near ${addr.landmark}` : ""}
                  <br />
                  {addr.city}, {addr.state} - {addr.postal_code}
                </p>

                {addr.latitude != null && addr.longitude != null && (
                  <div className="mt-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md w-fit border border-emerald-200">
                    <MapPin size={11} className="text-emerald-600" />
                    <span>GPS Confirmed: {Number(addr.latitude).toFixed(4)}, {Number(addr.longitude).toFixed(4)}</span>
                  </div>
                )}

                <p className="mt-2 text-xs font-semibold text-slate-500">
                  Phone: {addr.phone}
                </p>

                <div className="mt-3 flex items-center justify-between border-t border-border pt-2 text-xs">
                  {!addr.is_default && onSetDefaultAddress && (
                    <button
                      type="button"
                      className="font-bold text-brand hover:underline"
                      onClick={(e) => {
                        e.stopPropagation()
                        onSetDefaultAddress(addr.id)
                      }}
                    >
                      Make default
                    </button>
                  )}
                  {addr.is_default && <span />}

                  {onDeleteAddress && (
                    <button
                      type="button"
                      className="font-bold text-red-600 hover:text-red-700 flex items-center gap-1"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (window.confirm("Are you sure you want to delete this address?")) {
                          onDeleteAddress(addr.id)
                        }
                      }}
                    >
                      <Trash2 size={13} /> Delete
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
