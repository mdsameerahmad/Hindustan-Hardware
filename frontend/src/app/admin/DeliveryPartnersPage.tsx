import {
  AlertCircle,
  Bike,
  Building2,
  Camera,
  CheckCircle2,
  Edit2,
  Eye,
  EyeOff,
  Mail,
  MapPin,
  Navigation,
  Phone,
  Plus,
  RefreshCcw,
  Search,
  ShieldCheck,
  Trash2,
  Truck,
  User,
  X
} from "lucide-react"
import React, { useEffect, useMemo, useState } from "react"
import { Button } from "../components"
import { adminApi } from "../features/commerceApi"
import { convertImageToWebP } from "../utils/imageConverter"

export interface DeliveryPartnerItem {
  id: string
  fullName: string
  phone: string
  email?: string
  role: string
  avatarUrl?: string | null
  createdAt: string
  updatedAt: string
  activeAssignment?: {
    id: string
    orderId: string
    status: string
    assignedAt: string
  } | null
  sourceCoordinates: {
    name: string
    address: string
    latitude: number
    longitude: number
  }
  currentLocation: {
    latitude: number
    longitude: number
    accuracy?: number | null
    isOriginStore?: boolean
    deviceTimestamp?: string
  }
}

export function DeliveryPartnersPage() {
  const [partners, setPartners] = useState<DeliveryPartnerItem[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState<string>("")
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  // Modal State
  const [showModal, setShowModal] = useState<boolean>(false)
  const [editingPartner, setEditingPartner] = useState<DeliveryPartnerItem | null>(null)
  const [formName, setFormName] = useState<string>("")
  const [formPhone, setFormPhone] = useState<string>("")
  const [formEmail, setFormEmail] = useState<string>("")
  const [formAvatarUrl, setFormAvatarUrl] = useState<string>("")
  const [formPassword, setFormPassword] = useState<string>("")
  const [showPassword, setShowPassword] = useState<boolean>(false)
  const [submitting, setSubmitting] = useState<boolean>(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Delete State
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Default Shop Coordinates
  const defaultShopCoords = {
    name: "Hindustan Hardware Central Store",
    address: "PG Road, Jehanabad, Bihar 804408",
    latitude: 25.215474989473233,
    longitude: 84.9867635966286,
  }

  const fetchPartners = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await adminApi.listDeliveryPartners({ search: search.trim() || undefined })
      if (Array.isArray(data) && data.length > 0) {
        setPartners(data)
      } else {
        // Fallback check to listCustomers with delivery_partner role
        const custRes: any = await adminApi.listCustomers({ role: "delivery_partner" as any, limit: 50 })
        const custItems = custRes?.items || []
        if (custItems.length > 0) {
          const mapped = custItems.map((c: any) => ({
            id: c.id,
            fullName: c.fullName || "Delivery Partner",
            phone: c.phone || "+91 8935926021",
            email: c.email || undefined,
            role: c.role || "delivery_partner",
            avatarUrl: c.avatarUrl || null,
            createdAt: c.createdAt || new Date().toISOString(),
            updatedAt: c.updatedAt || new Date().toISOString(),
            activeAssignment: null,
            sourceCoordinates: defaultShopCoords,
            currentLocation: {
              latitude: defaultShopCoords.latitude,
              longitude: defaultShopCoords.longitude,
              isOriginStore: true,
            },
          }))
          setPartners(mapped)
        } else {
          setPartners(Array.isArray(data) ? data : [])
        }
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load delivery partners.")
      setPartners([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPartners()
  }, [])

  const handleOpenAdd = () => {
    setEditingPartner(null)
    setFormName("")
    setFormPhone("")
    setFormEmail("")
    setFormAvatarUrl("")
    setFormPassword("Partner@123456")
    setShowPassword(false)
    setFormError(null)
    setShowModal(true)
  }

  const handleOpenEdit = (partner: DeliveryPartnerItem) => {
    setEditingPartner(partner)
    setFormName(partner.fullName)
    setFormPhone(partner.phone)
    setFormEmail(partner.email || "")
    setFormAvatarUrl(partner.avatarUrl || "")
    setFormPassword("")
    setFormError(null)
    setShowModal(true)
  }

  const [convertingImage, setConvertingImage] = useState<boolean>(false)

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith("image/")) {
      setFormError("Please select a valid image file (PNG, JPG, JPEG, WEBP).")
      return
    }

    try {
      setConvertingImage(true)
      // Automatically convert any format (PNG, JPEG, JPG, etc.) into modern optimized WebP
      const webpFile = await convertImageToWebP(file, 0.85)
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === "string") {
          setFormAvatarUrl(reader.result)
        }
      }
      reader.readAsDataURL(webpFile)
    } catch {
      setFormError("Failed to convert image to WebP format. Please try another image.")
    } finally {
      setConvertingImage(false)
      // reset file input value so same file can be re-selected if desired
      e.target.value = ""
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    if (!formName.trim() || !formPhone.trim() || (!editingPartner && !formEmail.trim())) {
      setFormError("Partner Full Name, Mobile Number, and Email Address are required.")
      return
    }

    setSubmitting(true)
    try {
      if (editingPartner) {
        await adminApi.updateDeliveryPartner(editingPartner.id, {
          fullName: formName.trim(),
          phone: formPhone.trim(),
          avatarUrl: formAvatarUrl.trim() || null,
        })
        setActionSuccess(`Delivery Partner "${formName.trim()}" updated successfully.`)
      } else {
        await adminApi.createDeliveryPartner({
          fullName: formName.trim(),
          phone: formPhone.trim(),
          email: formEmail.trim(),
          avatarUrl: formAvatarUrl.trim() || null,
          password: formPassword.trim() || undefined,
        })
        setActionSuccess(
          `Delivery Partner "${formName.trim()}" created successfully with photo & initial Shop Coordinates!`
        )
      }
      setShowModal(false)
      fetchPartners()
    } catch (err: any) {
      setFormError(err?.message || "Failed to save delivery partner.")
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (partner: DeliveryPartnerItem) => {
    if (
      !window.confirm(
        `Are you sure you want to remove delivery partner "${partner.fullName}"? Their role will be demoted.`
      )
    ) {
      return
    }
    setDeletingId(partner.id)
    try {
      await adminApi.deleteDeliveryPartner(partner.id)
      setActionSuccess(`Delivery partner "${partner.fullName}" removed successfully.`)
      fetchPartners()
    } catch (err: any) {
      alert(err?.message || "Failed to remove delivery partner.")
    } finally {
      setDeletingId(null)
    }
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return partners
    const q = search.toLowerCase()
    return partners.filter(
      (p) =>
        p.fullName.toLowerCase().includes(q) ||
        p.phone.toLowerCase().includes(q) ||
        (p.email && p.email.toLowerCase().includes(q))
    )
  }, [partners, search])

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header section with brand theme */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#0B0B0B] text-[#D4AF37] border border-[#D4AF37]/30 shadow-md">
              <Bike size={22} />
            </span>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                Delivery Partner Management
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                Add, manage and track delivery partners. Initial coordinates are anchored to Hindustan Hardware shop location.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={fetchPartners}
            className="flex items-center gap-1.5 text-xs py-2 px-3"
            title="Refresh list"
          >
            <RefreshCcw size={14} className={loading ? "animate-spin" : ""} />
            <span>Refresh</span>
          </Button>

          <Button
            variant="primary"
            onClick={handleOpenAdd}
            className="flex items-center gap-1.5 text-xs py-2 px-4 shadow-md"
          >
            <Plus size={16} />
            <span>Add Delivery Partner</span>
          </Button>
        </div>
      </div>

      {/* Authoritative Shop Coordinates Highlight Banner */}
      <div className="rounded-xl border border-[#D4AF37]/40 bg-gradient-to-r from-[#0B0B0B] via-[#1A1A1A] to-[#0B0B0B] text-white p-4 sm:p-5 shadow-lg relative overflow-hidden">
        <div className="absolute -right-6 -bottom-6 w-32 h-32 rounded-full bg-[#D4AF37]/10 blur-xl pointer-events-none" />
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-[#D4AF37]/20 border border-[#D4AF37] text-[#D4AF37] shrink-0">
              <Building2 size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-bold tracking-widest text-[#D4AF37] bg-white/10 px-2 py-0.5 rounded">
                  Store Origin GPS Fixed
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  {defaultShopCoords.latitude.toFixed(6)}, {defaultShopCoords.longitude.toFixed(6)}
                </span>
              </div>
              <h3 className="text-sm sm:text-base font-bold text-white mt-1">
                {defaultShopCoords.name}
              </h3>
              <p className="text-xs text-slate-300">
                {defaultShopCoords.address}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-semibold text-[#D4AF37] bg-white/5 border border-[#D4AF37]/30 rounded-lg px-3 py-2 shrink-0">
            <ShieldCheck size={16} />
            <span>All new & reset partners start from this exact GPS coordinate</span>
          </div>
        </div>
      </div>

      {/* Success Notification */}
      {actionSuccess && (
        <div className="flex items-center justify-between rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-emerald-800 text-sm font-semibold shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="text-emerald-600" />
            <span>{actionSuccess}</span>
          </div>
          <button
            onClick={() => setActionSuccess(null)}
            className="text-emerald-600 hover:text-emerald-900"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Error Notification */}
      {error && (
        <div className="flex items-center justify-between rounded-xl bg-rose-50 border border-rose-200 p-4 text-rose-800 text-sm font-semibold shadow-xs">
          <div className="flex items-center gap-2">
            <AlertCircle size={18} className="text-rose-600" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-rose-600 hover:text-rose-900"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Search Bar */}
      <div className="flex items-center gap-3 bg-white p-3 rounded-xl border border-border shadow-xs">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Search delivery partners by name, mobile number, or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 text-sm rounded-lg border border-slate-200 focus:outline-hidden focus:border-[#D4AF37] transition"
          />
        </div>
        <span className="text-xs font-bold text-slate-500 whitespace-nowrap px-2">
          {filtered.length} {filtered.length === 1 ? "Partner" : "Partners"}
        </span>
      </div>

      {/* Partners List / Table */}
      {loading ? (
        <div className="flex h-56 flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-white shadow-xs">
          <RefreshCcw className="h-8 w-8 animate-spin text-[#D4AF37]" />
          <p className="text-sm font-medium text-slate-500">Loading delivery partners...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-border bg-white p-12 text-center shadow-xs space-y-3">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-amber-50 text-amber-600 border border-amber-200">
            <Bike size={24} />
          </span>
          <h3 className="text-base font-bold text-slate-800">No delivery partners found</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {search
              ? "No partner matches your search query. Try searching by another keyword."
              : "No delivery partners have been registered yet. Click 'Add Delivery Partner' to create the first rider."}
          </p>
          <Button variant="primary" onClick={handleOpenAdd} className="mt-2 text-xs">
            <Plus size={14} className="mr-1" /> Add Delivery Partner
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((partner) => {
            const hasActive = Boolean(partner.activeAssignment)
            const coords = partner.currentLocation || partner.sourceCoordinates

            return (
              <div
                key={partner.id}
                className="rounded-2xl border border-border bg-white p-5 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between"
              >
                <div>
                  {/* Top Header Card */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {partner.avatarUrl ? (
                        <img
                          src={partner.avatarUrl}
                          alt={partner.fullName}
                          className="h-13 w-13 rounded-2xl object-cover border-2 border-[#D4AF37] shadow-md shadow-[#D4AF37]/20 shrink-0 bg-slate-900"
                        />
                      ) : (
                        <div className="grid h-13 w-13 place-items-center rounded-2xl bg-gradient-to-br from-[#0B0B0B] to-[#252525] text-[#D4AF37] border-2 border-[#D4AF37] shadow-sm shrink-0">
                          <Bike size={24} />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-[#D4AF37] bg-slate-900 px-1.5 py-0.5 rounded">
                            Delivery Partner
                          </span>
                          {hasActive ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-600 animate-ping" />
                              On Delivery
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                              Available
                            </span>
                          )}
                        </div>
                        <h3 className="text-base font-black text-slate-900 leading-tight mt-1 truncate">
                          {partner.fullName}
                        </h3>
                      </div>
                    </div>
                  </div>

                  {/* Contact Info (Mobile Number) */}
                  <div className="mt-4 space-y-2 border-t border-slate-100 pt-3 text-xs">
                    <div className="flex items-center gap-2 text-slate-700">
                      <Phone size={14} className="text-[#D4AF37] shrink-0" />
                      <span className="font-bold font-mono">{partner.phone}</span>
                    </div>
                  </div>

                  {/* Location & GPS Info anchored to Shop */}
                  <div className="mt-4 rounded-xl bg-slate-50 p-3 border border-slate-200/80 text-xs space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600">
                      <span className="flex items-center gap-1 text-[#D4AF37]">
                        <MapPin size={13} />
                        <b>Shop Source Coordinates:</b>
                      </span>
                      <span className="font-mono text-[10px] text-slate-500">
                        {coords.latitude?.toFixed(5)}, {coords.longitude?.toFixed(5)}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-snug">
                      {partner.sourceCoordinates?.name || "Hindustan Hardware"} — {partner.sourceCoordinates?.address || "PG Road, Jehanabad"}
                    </p>
                    {hasActive && partner.activeAssignment && (
                      <div className="pt-1.5 border-t border-slate-200 flex items-center justify-between text-[11px] font-medium text-amber-800">
                        <span className="flex items-center gap-1">
                          <Truck size={12} /> Assigned Order:
                        </span>
                        <span className="font-mono font-bold">
                          #{String(partner.activeAssignment.orderId || "").slice(0, 8)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Actions */}
                <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <div className="text-[10px] text-slate-400">
                    ID: {String(partner.id || "").slice(0, 8)}...
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleOpenEdit(partner)}
                      className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition"
                      title="Edit partner name or mobile number"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(partner)}
                      disabled={deletingId === partner.id}
                      className="p-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 transition disabled:opacity-50"
                      title="Remove partner"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-border overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border bg-[#0B0B0B] text-white px-6 py-4">
              <div className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#D4AF37]/20 border border-[#D4AF37] text-[#D4AF37]">
                  <Bike size={18} />
                </span>
                <div>
                  <h3 className="font-serif text-base font-bold text-white">
                    {editingPartner ? "Edit Delivery Partner" : "Add Delivery Partner"}
                  </h3>
                  <p className="text-[10px] text-[#D4AF37] uppercase tracking-wider font-semibold">
                    Hindustan Hardware Partner Registry
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {formError && (
                <div className="rounded-lg bg-rose-50 p-3 text-xs font-semibold text-rose-800 border border-rose-200 flex items-center gap-2">
                  <AlertCircle size={15} className="shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Exact Source Coordinates Guarantee Notice */}
              <div className="rounded-xl border border-[#D4AF37]/30 bg-amber-50/60 p-3.5 text-xs text-amber-950 space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-amber-900">
                  <Navigation size={14} className="text-[#D4AF37]" />
                  <span>Authoritative Shop Origin Ingestion:</span>
                </div>
                <p className="text-[11px] text-amber-900/80 leading-relaxed">
                  Upon saving, this partner's tracking coordinates will be initialized to the exact shop coordinates:
                  <b className="block font-mono text-[10px] mt-0.5 text-black">
                    Lat: 25.215475, Lon: 84.986764 (PG Road Central Store)
                  </b>
                </p>
              </div>

              {/* Name field */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Partner Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Kumar"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:outline-hidden focus:border-[#D4AF37] transition"
                />
              </div>

              {/* Mobile Number field */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Mobile Number <span className="text-rose-500">*</span>
                </label>
                <input
                  type="tel"
                  required
                  placeholder="e.g. +91 8935926021"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:outline-hidden focus:border-[#D4AF37] transition font-mono"
                />
              </div>

              {!editingPartner && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Email Address <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="e.g. ramesh@example.com"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:outline-hidden focus:border-[#D4AF37] transition"
                  />
                </div>
              )}

              {/* Photo Upload & Preview Field */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Delivery Partner Photo
                </label>
                <div className="flex items-center gap-4 p-3 rounded-xl border border-dashed border-slate-300 bg-slate-50">
                  {formAvatarUrl ? (
                    <img
                      src={formAvatarUrl}
                      alt="Partner Preview"
                      className="h-16 w-16 rounded-2xl object-cover border-2 border-[#D4AF37] shadow-md shrink-0 bg-slate-900"
                    />
                  ) : (
                    <div className="grid h-16 w-16 place-items-center rounded-2xl border-2 border-dashed border-slate-300 bg-white text-slate-400 shrink-0">
                      <User size={28} />
                    </div>
                  )}

                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0B0B0B] text-[#D4AF37] text-xs font-bold cursor-pointer hover:bg-black transition shadow-xs">
                        <Camera size={14} />
                        <span>{convertingImage ? "Converting to WebP..." : "Upload Photo"}</span>
                        <input
                          type="file"
                          accept="image/*"
                          disabled={convertingImage}
                          onChange={handleImageFileChange}
                          className="hidden"
                        />
                      </label>
                      {formAvatarUrl && (
                        <button
                          type="button"
                          onClick={() => setFormAvatarUrl("")}
                          className="text-[11px] text-rose-600 font-semibold hover:underline"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400">
                      Auto-converts any image format (PNG, JPG, JPEG, BMP) into optimized WebP.
                    </p>
                  </div>
                </div>

                <input
                  type="text"
                  placeholder="Or paste photo image URL (https://...)"
                  value={formAvatarUrl}
                  onChange={(e) => setFormAvatarUrl(e.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 focus:outline-hidden focus:border-[#D4AF37] font-mono"
                />
              </div>

              {/* Initial App Password (Create Only) */}
              {!editingPartner && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Initial App Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="Default: Partner@123456"
                      value={formPassword}
                      onChange={(e) => setFormPassword(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3.5 py-2 pr-10 text-sm focus:outline-hidden focus:border-[#D4AF37] transition font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((visible) => !visible)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 hover:text-slate-800"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Partner uses this email address and password to sign in to the Partner Portal.
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowModal(false)}
                  disabled={submitting}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={submitting}
                  className="text-xs py-2 px-5 shadow-sm"
                >
                  {submitting
                    ? "Saving Partner..."
                    : editingPartner
                    ? "Update Delivery Partner"
                    : "Add Delivery Partner"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
