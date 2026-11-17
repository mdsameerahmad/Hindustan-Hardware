import {
  AlertCircle,
  Building2,
  Edit3,
  Eye,
  Loader2,
  Package,
  Percent,
  Plus,
  RefreshCcw,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react"
import React, { useMemo, useState } from "react"
import {
  Badge,
  Button,
  PageHeader,
} from "../components"
import { useAdminBrands } from "../features/hooks/useAdminBrands"
import { AdminField, FormCard } from "./AdminSharedComponents"
import { convertImageToWebP } from "../utils/imageConverter"

export function BrandsAdminPage() {
  const {
    brands,
    loading,
    error,
    actionLoading,
    createBrand,
    updateBrand,
    deleteBrand,
    uploadBrandLogo,
    refetch,
  } = useAdminBrands()

  const emptyBrand = {
    id: "",
    name: "",
    slug: "",
    logoUrl: "",
    description: "",
    displayOrder: 1,
    isActive: true,
  }

  // Active view: "list" (matches AdminProductsPage table/cards) or "editor" (matches ProductFormPage layout)
  const [viewState, setViewState] = useState<"list" | "editor">("list")
  const [form, setForm] = useState(emptyBrand)
  const [formError, setFormError] = useState<string | null>(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all")
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 15

  // Filtered brands matching AdminProductsPage style
  const filteredBrands = useMemo(() => {
    return [...brands]
      .filter((b) => {
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim()
          const matchName = b.name.toLowerCase().includes(q)
          const matchSlug = b.slug.toLowerCase().includes(q)
          const matchDesc = (b.description || "").toLowerCase().includes(q)
          if (!matchName && !matchSlug && !matchDesc) return false
        }

        if (filterStatus === "active" && !b.isActive) return false
        if (filterStatus === "inactive" && b.isActive) return false

        return true
      })
      .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
  }, [brands, searchQuery, filterStatus])

  const totalPages = Math.max(1, Math.ceil(filteredBrands.length / pageSize))
  const safePage = Math.min(currentPage, totalPages)

  const paginatedBrands = useMemo(() => {
    const start = (safePage - 1) * pageSize
    return filteredBrands.slice(start, start + pageSize)
  }, [filteredBrands, safePage, pageSize])

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return
    setCurrentPage(newPage)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const openCreateModal = () => {
    setForm(emptyBrand)
    setFormError(null)
    setViewState("editor")
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const openEditModal = (brand: any) => {
    setForm({
      id: brand.id,
      name: brand.name,
      slug: brand.slug,
      logoUrl: brand.logoUrl || brand.logo_url || "",
      description: brand.description || "",
      displayOrder: brand.displayOrder ?? 1,
      isActive: brand.isActive !== false,
    })
    setFormError(null)
    setViewState("editor")
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingLogo(true)
    setFormError(null)
    try {
      const webpFile = await convertImageToWebP(file)

      if (form.id) {
        const updated = await uploadBrandLogo(form.id, webpFile)
        if (updated?.logoUrl) {
          setForm((prev) => ({ ...prev, logoUrl: updated.logoUrl! }))
        }
      } else {
        const reader = new FileReader()
        reader.onload = () => {
          setForm((prev) => ({ ...prev, logoUrl: reader.result as string }))
        }
        reader.readAsDataURL(webpFile)
      }
    } catch (err: any) {
      setFormError(err?.message || "Failed to convert and upload logo.")
    } finally {
      setUploadingLogo(false)
      e.target.value = ""
    }
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setFormError(null)

    if (!form.name.trim()) {
      setFormError("Brand name is required.")
      return
    }

    const rawSlug = form.slug.trim() || form.name.trim()
    const slug = rawSlug
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")

    if (!slug) {
      setFormError("A valid slug could not be generated. Please enter letters or numbers.")
      return
    }

    let normalizedLogo: string | undefined = form.logoUrl.trim()
    if (normalizedLogo) {
      if (!/^https?:\/\//i.test(normalizedLogo) && !normalizedLogo.startsWith("/")) {
        normalizedLogo = `https://${normalizedLogo}`
      }
    } else {
      normalizedLogo = undefined
    }

    try {
      if (form.id) {
        await updateBrand(form.id, {
          name: form.name.trim(),
          slug,
          logoUrl: normalizedLogo,
          description: form.description.trim() || undefined,
          displayOrder: Number(form.displayOrder) || 1,
          isActive: form.isActive,
        })
      } else {
        await createBrand({
          name: form.name.trim(),
          slug,
          logoUrl: normalizedLogo,
          description: form.description.trim() || undefined,
          displayOrder: Number(form.displayOrder) || 1,
          isActive: form.isActive,
        })
      }
      setViewState("list")
      setForm(emptyBrand)
    } catch (err: any) {
      setFormError(err?.message || "Failed to persist brand.")
    }
  }

  const handleToggleVisibility = async (brand: any) => {
    try {
      await updateBrand(brand.id, {
        isActive: !brand.isActive,
      })
    } catch (err: any) {
      alert(err?.message || "Failed to update brand visibility.")
    }
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    setDeleteError(null)
    try {
      await deleteBrand(pendingDelete.id)
      setPendingDelete(null)
    } catch (err: any) {
      setDeleteError(err?.message || "Failed to delete brand.")
    }
  }

  // --------------------------------------------------------------------------
  // RENDER 1: Dedicated Brand Edit / Create Page (matching ProductFormPage UX)
  // --------------------------------------------------------------------------
  if (viewState === "editor") {
    return (
      <>
        <PageHeader
          title={form.id ? `Edit Brand: ${form.name}` : "Add New Brand"}
          description="Configure manufacturer identity, catalog ordering, and logos."
        />

        {formError && (
          <div className="mb-6 rounded-lg bg-red-50 p-4 border border-red-200 text-sm text-red-700 flex items-center gap-2">
            <AlertCircle size={18} className="text-red-600 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        <form onSubmit={submit} className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 space-y-6">
            <FormCard title="Brand details">
              <div className="grid gap-4 sm:grid-cols-2">
                <AdminField
                  label="Brand Name"
                  required
                  value={form.name}
                  onChange={(value) => setForm({ ...form, name: value })}
                  placeholder="e.g. Ashirvad, Astral, Supreme"
                />
                <AdminField
                  label="Catalog Slug (URL identifier)"
                  value={form.slug}
                  onChange={(value) => setForm({ ...form, slug: value })}
                  placeholder="e.g. ashirvad"
                />
                <div className="sm:col-span-2">
                  <label className="field-label block text-xs font-bold uppercase tracking-wider text-slate-600">
                    Description / Brand Legacy
                    <textarea
                      rows={3}
                      className="field mt-2 w-full resize-none"
                      value={form.description}
                      onChange={(event) =>
                        setForm({ ...form, description: event.target.value })
                      }
                      placeholder="e.g. Authentic CPVC, PVC and fittings plumbing supplies portfolio..."
                    />
                  </label>
                </div>
              </div>
            </FormCard>

            <FormCard title="Brand Logo & Imagery">
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                  <div className="flex-1 w-full">
                    <AdminField
                      label="Logo image URL"
                      value={form.logoUrl}
                      onChange={(value) => setForm({ ...form, logoUrl: value })}
                      placeholder="https://... or upload from your device below"
                      inputClassName="truncate"
                      inputTitle={form.logoUrl}
                    />
                  </div>
                  <div className="sm:pt-5">
                    <label className="inline-flex items-center gap-2 cursor-pointer rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-800 font-bold text-xs px-4 py-2.5 border border-amber-300 transition-colors shrink-0">
                      <Upload size={15} />
                      <span>{uploadingLogo ? "Converting to WebP..." : "Upload & Convert to WebP"}</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/jpg"
                        disabled={uploadingLogo}
                        onChange={handleLogoUpload}
                        className="sr-only"
                      />
                    </label>
                  </div>
                </div>

                {form.logoUrl ? (
                  <div className="flex items-center gap-4 rounded-xl border border-border bg-slate-50 p-3.5">
                    <img
                      src={form.logoUrl}
                      alt="Brand Logo Preview"
                      className="h-14 w-14 rounded-lg object-contain bg-white border border-border p-1.5 shadow-2xs"
                    />
                    <div className="min-w-0 flex-1">
                      <b className="block text-xs font-bold text-slate-900">Logo preview</b>
                      <span className="block text-[11px] text-slate-500 mt-0.5 truncate">{form.logoUrl}</span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setForm({ ...form, logoUrl: "" })}
                      className="text-xs text-red-600 hover:bg-red-50"
                    >
                      Remove
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">
                    No logo uploaded yet. Upload a JPG or PNG, and it will be converted automatically to WebP format.
                  </p>
                )}
              </div>
            </FormCard>
          </div>

          <aside className="space-y-6">
            <FormCard title="Catalog Ordering">
              <AdminField
                label="Display Order (Catalog Sequence)"
                type="number"
                value={String(form.displayOrder)}
                onChange={(value) => setForm({ ...form, displayOrder: Number(value) || 0 })}
              />
              <p className="text-xs text-slate-500 leading-normal">
                Lower display order numbers appear first in customer filters and navigation strips.
              </p>
            </FormCard>

            <FormCard title="Visibility">
              <label className="toggle-row flex items-center justify-between py-2">
                <span>
                  <b className="block text-sm text-slate-800">Active Brand</b>
                  <small className="text-xs text-slate-500">Visible to customers in storefront filters</small>
                </span>
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
                />
              </label>
            </FormCard>

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                disabled={actionLoading}
                onClick={() => {
                  setViewState("list")
                  setForm(emptyBrand)
                }}
              >
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={actionLoading}>
                {actionLoading ? <Loader2 size={16} className="animate-spin" /> : null}
                {form.id ? "Update Brand" : "Create Brand"}
              </Button>
            </div>
          </aside>
        </form>
      </>
    )
  }

  // --------------------------------------------------------------------------
  // RENDER 2: Main Brand Catalog View (exact structure matching AdminProductsPage)
  // --------------------------------------------------------------------------
  return (
    <>
      <PageHeader
        title="Brand catalog"
        description="Authoritative database manufacturer records, active catalog status, and logos."
        action={
          <Button onClick={openCreateModal}>
            <Plus size={16} />
            Add Brand
          </Button>
        }
      />

      <div className="rounded-xl border border-border bg-white shadow-xs">
        {/* Top Control Bar matching AdminProductsPage */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border p-3.5 sm:p-4">
          <div className="relative w-full sm:max-w-md flex-1">
            <Search
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              size={18}
            />
            <input
              className="field !pl-10 w-full text-xs sm:text-sm"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search brands by name, slug or description..."
            />
          </div>

          <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto flex-wrap">
            <select
              className="field flex-1 sm:w-auto text-xs sm:text-sm"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
            >
              <option value="all">All Status</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>

            <Button variant="ghost" onClick={refetch} title="Refresh brands" className="p-2 shrink-0">
              <RefreshCcw size={15} />
            </Button>
          </div>
        </div>

        {error && (
          <div className="m-4 rounded-lg bg-red-50 p-4 border border-red-200 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex h-56 flex-col items-center justify-center gap-3">
            <Loader2 className="h-7 w-7 animate-spin text-brand" />
            <p className="text-sm font-medium text-slate-500">Loading catalog brands...</p>
          </div>
        ) : filteredBrands.length === 0 ? (
          <div className="py-16 text-center">
            <Package className="mx-auto h-10 w-10 text-slate-300" />
            <h3 className="mt-2 text-base font-bold text-slate-700">No brands found</h3>
            <p className="text-xs text-slate-500 mt-1">Try adjusting your search query or filter.</p>
          </div>
        ) : (
          <>
            {/* Desktop Table matching AdminProductsPage */}
            <div className="hidden md:block overflow-x-auto">
              <table className="data-table w-full">
                <thead>
                  <tr>
                    <th>Brand & Identity</th>
                    <th>Catalog Slug</th>
                    <th>Display Order</th>
                    <th>Storefront Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedBrands.map((brand) => {
                    return (
                      <tr key={brand.id}>
                        <td>
                          <div className="flex min-w-56 items-center gap-3">
                            {(brand.logoUrl || (brand as any).logo_url) ? (
                              <img
                                src={brand.logoUrl || (brand as any).logo_url}
                                alt={brand.name}
                                className="h-11 w-11 rounded-lg object-contain bg-slate-50 p-1 border border-border shadow-2xs shrink-0"
                                onError={(e) => {
                                  e.currentTarget.style.display = "none"
                                  const fallback = e.currentTarget.nextElementSibling as HTMLElement
                                  if (fallback) fallback.style.display = "grid"
                                }}
                              />
                            ) : null}
                            <div
                              className="h-11 w-11 place-items-center rounded-lg bg-gradient-to-br from-amber-50 to-amber-100 text-amber-900 font-black text-xs uppercase shrink-0 border border-amber-200/60"
                              style={{ display: (brand.logoUrl || (brand as any).logo_url) ? "none" : "grid" }}
                            >
                              {brand.name.slice(0, 2)}
                            </div>
                            <div className="min-w-0">
                              <b className="block font-semibold text-slate-900 truncate">{brand.name}</b>
                              {brand.description ? (
                                <small className="text-slate-500 truncate block max-w-xs">{brand.description}</small>
                              ) : (
                                <small className="text-slate-400 italic block">No description</small>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="font-mono text-xs text-slate-600">
                          /{brand.slug}
                        </td>
                        <td>
                          <span className="font-mono text-xs text-slate-700 font-semibold">
                            #{brand.displayOrder ?? 0}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleToggleVisibility(brand)}
                            className="cursor-pointer hover:opacity-85 transition"
                            title="Click to toggle visibility"
                          >
                            <Badge tone={brand.isActive ? "success" : "neutral"}>
                              {brand.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </button>
                        </td>
                        <td>
                          <div className="flex gap-1">
                            <button
                              className="table-action"
                              onClick={() => openEditModal(brand)}
                              title="Edit Brand"
                            >
                              <Edit3 size={16} />
                            </button>
                            <button
                              onClick={() => {
                                setDeleteError(null)
                                setPendingDelete({ id: brand.id, name: brand.name })
                              }}
                              className="table-action text-red-600 hover:bg-red-50"
                              title="Delete Brand"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List matching AdminProductsPage */}
            <div className="block md:hidden divide-y divide-border">
              {paginatedBrands.map((brand) => {
                return (
                  <div key={brand.id} className="p-3.5 space-y-3">
                    <div className="flex items-start gap-3">
                      {(brand.logoUrl || (brand as any).logo_url) ? (
                        <img
                          src={brand.logoUrl || (brand as any).logo_url}
                          alt={brand.name}
                          className="h-12 w-12 rounded-lg object-contain bg-slate-50 p-1 border border-border shrink-0"
                          onError={(e) => {
                            e.currentTarget.style.display = "none"
                            const fallback = e.currentTarget.nextElementSibling as HTMLElement
                            if (fallback) fallback.style.display = "grid"
                          }}
                        />
                      ) : null}
                      <div
                        className="h-12 w-12 place-items-center rounded-lg bg-gradient-to-br from-amber-50 to-amber-100 text-amber-900 font-black text-xs uppercase shrink-0 border border-amber-200/60"
                        style={{ display: (brand.logoUrl || (brand as any).logo_url) ? "none" : "grid" }}
                      >
                        {brand.name.slice(0, 2)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <b className="block text-xs font-bold text-slate-900 leading-snug">{brand.name}</b>
                        <span className="block font-mono text-[11px] text-slate-400 mt-0.5">/{brand.slug}</span>
                        <div className="mt-1.5 flex items-center gap-2">
                          <Badge tone={brand.isActive ? "success" : "neutral"}>
                            {brand.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-xs">
                      <span className="text-slate-500 font-mono text-[11px]">
                        Order #{brand.displayOrder ?? 0}
                      </span>
                      <div className="flex gap-2">
                        <button
                          className="table-action"
                          onClick={() => openEditModal(brand)}
                          title="Edit Brand"
                        >
                          <Edit3 size={15} />
                        </button>
                        <button
                          onClick={() => {
                            setDeleteError(null)
                            setPendingDelete({ id: brand.id, name: brand.name })
                          }}
                          className="table-action text-red-600 hover:bg-red-50"
                          title="Delete Brand"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* Footer Pagination Bar matching AdminOrdersPage */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-border px-4 py-3 sm:px-5 sm:py-4 text-xs text-slate-500">
          <div className="flex items-center gap-3">
            <span>
              Showing <b className="text-slate-800">{paginatedBrands.length}</b> of{" "}
              <b className="text-slate-800">{filteredBrands.length}</b> brands
              {filteredBrands.length !== brands.length ? ` (filtered from ${brands.length})` : ""}
            </span>
            {searchQuery || filterStatus !== "all" ? (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("")
                  setFilterStatus("all")
                  setCurrentPage(1)
                }}
                className="text-xs font-bold text-amber-700 hover:underline"
              >
                Reset filters
              </button>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={safePage <= 1 || loading}
              onClick={() => handlePageChange(safePage - 1)}
            >
              Previous
            </Button>
            <span className="font-semibold text-slate-700">
              Page {safePage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={safePage >= totalPages || loading}
              onClick={() => handlePageChange(safePage + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal matching AdminProductsPage style */}
      {pendingDelete && (
        <div className="modal-backdrop">
          <div className="modal">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-red-50 text-red-600">
              <Trash2 />
            </span>
            <h2 className="mt-4 text-xl font-black">Delete this brand?</h2>
            <p className="mt-2 text-sm text-slate-500">
              <strong className="text-slate-800">{pendingDelete.name}</strong> will be permanently deleted. Products will remain, but will no longer be linked to this brand.
            </p>
            {deleteError && (
              <div className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700 border border-red-200">
                {deleteError}
              </div>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="ghost"
                disabled={actionLoading}
                onClick={() => {
                  setPendingDelete(null)
                  setDeleteError(null)
                }}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                disabled={actionLoading}
                onClick={confirmDelete}
              >
                {actionLoading ? "Deleting..." : "Delete Brand"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
