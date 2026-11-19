import {
  AlertCircle,
  Boxes,
  Edit3,
  Loader2,
  Plus,
  RefreshCcw,
  Search,
  Trash2,
  Upload
} from "lucide-react"
import React, { useEffect, useMemo, useState } from "react"
import {
  Badge,
  Button,
  PageHeader,
} from "../components"
import { useAdminCategories } from "../features/hooks/useAdminCategories"
import { convertImageToWebP } from "../utils/imageConverter"
import { AdminField, FormCard } from "./AdminSharedComponents"

export function CategoriesPage() {
  const {
    categories: items,
    loading,
    error,
    actionLoading,
    createCategory,
    updateCategory,
    deleteCategory,
    uploadCategoryImage,
    refetch,
  } = useAdminCategories()

  const emptyCategory = {
    id: "",
    name: "",
    slug: "",
    description: "",
    imageUrl: "",
    parentId: "",
    sortOrder: 0,
    isActive: true,
    discountPercentage: 0,
  }

  // Active view: "list" (matches AdminProductsPage table/cards) or "editor" (matches ProductFormPage layout)
  const [viewState, setViewState] = useState<"list" | "editor">("list")
  const [form, setForm] = useState(emptyCategory)
  const [formError, setFormError] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [convertingImage, setConvertingImage] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all")
  const [filterDiscount, setFilterDiscount] = useState<"all" | "discounted" | "no-discount">("all")
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 15

  useEffect(() => {
    if (!imageFile) {
      setImagePreview(null)
      return
    }

    const previewUrl = URL.createObjectURL(imageFile)
    setImagePreview(previewUrl)
    return () => URL.revokeObjectURL(previewUrl)
  }, [imageFile])

  // Filtered categories matching AdminProductsPage style
  const filteredCategories = useMemo(() => {
    return [...items]
      .filter((cat) => {
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim()
          const matchName = cat.name.toLowerCase().includes(q)
          const matchSlug = cat.slug.toLowerCase().includes(q)
          const matchDesc = (cat.description || "").toLowerCase().includes(q)
          if (!matchName && !matchSlug && !matchDesc) return false
        }
        if (filterStatus === "active" && !cat.isActive) return false
        if (filterStatus === "inactive" && cat.isActive) return false

        const disc = Number((cat as any).discountPercentage ?? (cat as any).discount_percentage ?? 0)
        if (filterDiscount === "discounted" && disc <= 0) return false
        if (filterDiscount === "no-discount" && disc > 0) return false

        return true
      })
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  }, [items, searchQuery, filterStatus, filterDiscount])

  const totalPages = Math.max(1, Math.ceil(filteredCategories.length / pageSize))
  const safePage = Math.min(currentPage, totalPages)

  const paginatedCategories = useMemo(() => {
    const start = (safePage - 1) * pageSize
    return filteredCategories.slice(start, start + pageSize)
  }, [filteredCategories, safePage, pageSize])

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return
    setCurrentPage(newPage)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const openCreateModal = () => {
    setForm(emptyCategory)
    setImageFile(null)
    setFormError(null)
    setViewState("editor")
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const openEditModal = (cat: any) => {
    setForm({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      description: cat.description || "",
      imageUrl: cat.image_url || cat.imageUrl || "",
      parentId: cat.parentId || cat.parent_id || "",
      sortOrder: cat.sortOrder ?? cat.sort_order ?? 0,
      isActive: cat.isActive !== false,
      discountPercentage: Number(cat.discountPercentage ?? cat.discount_percentage ?? 0),
    })
    setImageFile(null)
    setFormError(null)
    setViewState("editor")
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const handleImageSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setFormError(null)
    if (file.type && !file.type.startsWith("image/")) {
      setFormError("Select a valid image file.")
      event.target.value = ""
      return
    }
    if (file.size > 20 * 1024 * 1024) {
      setFormError("Image file must not exceed 20MB.")
      event.target.value = ""
      return
    }

    setConvertingImage(true)
    try {
      const webpFile = await convertImageToWebP(file)
      if (webpFile.type !== "image/webp") {
        throw new Error("This image could not be converted to WebP. Try another image.")
      }
      setImageFile(webpFile)
    } catch (err: any) {
      setFormError(err?.message || "Failed to convert image to WebP.")
    } finally {
      setConvertingImage(false)
      event.target.value = ""
    }
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setFormError(null)

    if (!form.name.trim()) {
      setFormError("Category name is required.")
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

    const payload = {
      name: form.name.trim(),
      slug,
      description: form.description.trim() || undefined,
      parentId: form.parentId.trim() || null,
      sortOrder: Number(form.sortOrder) || 0,
      isActive: form.isActive,
      discountPercentage: Number(form.discountPercentage) || 0,
    }

    try {
      let categoryId = form.id
      if (categoryId) {
        await updateCategory(categoryId, payload)
      } else {
        const created = await createCategory(payload)
        categoryId = created?.id || ""
        if (categoryId) setForm((current) => ({ ...current, id: categoryId }))
      }
      if (imageFile) {
        if (!categoryId) {
          throw new Error("Category was saved, but its image could not be uploaded. Reopen it and try again.")
        }
        await uploadCategoryImage(categoryId, imageFile)
      }
      setViewState("list")
      setForm(emptyCategory)
      setImageFile(null)
    } catch (err: any) {
      setFormError(err?.message || "Failed to persist category.")
    }
  }

  const handleToggleVisibility = async (cat: any) => {
    try {
      await updateCategory(cat.id, {
        isActive: !cat.isActive,
      })
    } catch (err: any) {
      alert(err?.message || "Failed to update category visibility.")
    }
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    setDeleteError(null)
    try {
      await deleteCategory(pendingDelete.id)
      setPendingDelete(null)
    } catch (err: any) {
      setDeleteError(err?.message || "Failed to delete category from database.")
    }
  }

  // --------------------------------------------------------------------------
  // RENDER 1: Dedicated Category Edit / Create Page (matching ProductFormPage UX)
  // --------------------------------------------------------------------------
  if (viewState === "editor") {
    // Possible parent categories (cannot be self)
    const availableParents = items.filter((c) => c.id !== form.id)

    return (
      <>
        <PageHeader
          title={form.id ? `Edit Item: ${form.name}` : "Add New Item"}
          description="Configure item types, parent relationships, display sequencing, and active storefront visibility."
        />

        {formError && (
          <div className="mb-6 rounded-lg bg-red-50 p-4 border border-red-200 text-sm text-red-700 flex items-center gap-2">
            <AlertCircle size={18} className="text-red-600 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        <form onSubmit={submit} className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <div className="space-y-6">
            <FormCard title="Item details">
              <div className="grid gap-4 sm:grid-cols-2">
                <AdminField
                  label="Item Name"
                  required
                  value={form.name}
                  onChange={(value) => setForm({ ...form, name: value })}
                  placeholder="e.g. CPVC Pipes & Fittings"
                />
                <AdminField
                  label="Catalog Slug (URL identifier)"
                  value={form.slug}
                  onChange={(value) => setForm({ ...form, slug: value })}
                  placeholder="e.g. cpvc-pipes-fittings"
                />
                <div className="sm:col-span-2">
                  <label className="field-label block text-xs font-bold uppercase tracking-wider text-slate-600">
                    Parent Item (Optional)
                    <select
                      className="field mt-2 w-full"
                      value={form.parentId}
                      onChange={(e) => setForm({ ...form, parentId: e.target.value })}
                    >
                      <option value="">None (Top-level Root Item)</option>
                      {availableParents.map((parent) => (
                        <option key={parent.id} value={parent.id}>
                          {parent.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="mt-1.5 text-xs text-slate-400">
                    Assigning a parent item establishes an item hierarchy for navigation and filtering.
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <label className="field-label block text-xs font-bold uppercase tracking-wider text-slate-600">
                    Description & Catalog Scope
                    <textarea
                      rows={4}
                      className="field mt-2 w-full resize-none"
                      value={form.description}
                      onChange={(event) =>
                        setForm({ ...form, description: event.target.value })
                      }
                      placeholder="e.g. Professional-grade CPVC piping, elbows, tees, unions, and industrial hardware supplies..."
                    />
                  </label>
                </div>
              </div>
            </FormCard>

            <FormCard title="Bulk Category Discount Rate">
              <div className="space-y-4">
                <AdminField
                  label="Discount Percentage (%)"
                  type="number"
                  min="0"
                  max="90"
                  step="0.5"
                  value={String(form.discountPercentage ?? 0)}
                  onChange={(value) =>
                    setForm({ ...form, discountPercentage: Math.max(0, Math.min(90, Number(value) || 0)) })
                  }
                  placeholder="e.g. 15 for 15% off"
                />
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-slate-500 mr-1">Quick presets:</span>
                  {[0, 10, 15, 20, 25, 30, 40].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setForm({ ...form, discountPercentage: preset })}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-md border transition ${
                        Number(form.discountPercentage) === preset
                          ? "bg-amber-500 text-white border-amber-600 shadow-xs"
                          : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      {preset === 0 ? "0% (No discount)" : `${preset}%`}
                    </button>
                  ))}
                </div>
                <div className="rounded-lg bg-amber-50/70 border border-amber-200/80 p-3 text-xs text-amber-900 leading-relaxed">
                  <p className="font-semibold mb-0.5">Automated Selling Price Sync</p>
                  Applying a discount percentage here recalculates the selling price (Base Price) against MRP (Compare-at Price) across all products in this category upon saving. Products with an individual discount rate set in their own specifications will keep their custom override.
                </div>
              </div>
            </FormCard>
          </div>

          <aside className="space-y-6">
            <FormCard title="Category image">
              <div className="overflow-hidden rounded-xl border border-border bg-slate-50">
                {imagePreview || form.imageUrl ? (
                  <img
                    src={imagePreview || form.imageUrl}
                    alt={`${form.name || "Category"} preview`}
                    className="h-44 w-full object-contain p-3"
                  />
                ) : (
                  <div className="grid h-44 place-items-center text-xs font-semibold text-slate-400">
                    No category image selected
                  </div>
                )}
              </div>
              <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[#D4AF37] bg-amber-50/20 px-4 py-3 text-xs font-bold text-ink transition hover:bg-amber-50/40">
                <Upload size={16} className="text-[#D4AF37]" />
                <span>{convertingImage ? "Converting to WebP..." : imageFile || form.imageUrl ? "Choose another image" : "Choose category image"}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageSelect}
                  disabled={convertingImage || actionLoading}
                  className="hidden"
                />
              </label>
              <p className="mt-2 text-[11px] text-slate-400">
                Images are converted to WebP and compressed before upload. Maximum file size: 20MB.
              </p>
            </FormCard>

            <FormCard title="Catalog Ordering">
              <AdminField
                label="Sort Order (Catalog Priority)"
                type="number"
                value={String(form.sortOrder)}
                onChange={(value) => setForm({ ...form, sortOrder: Number(value) || 0 })}
              />
              <p className="text-xs text-slate-500 leading-normal">
                Lower sort order numbers appear first in customer navigation, header menus, and product filter lists.
              </p>
            </FormCard>

            <FormCard title="Visibility">
              <label className="toggle-row flex items-center justify-between py-2">
                <span>
                  <b className="block text-sm text-slate-800">Active Item</b>
                  <small className="text-xs text-slate-500">Visible to customers in storefront catalog</small>
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
                  setForm(emptyCategory)
                  setImageFile(null)
                }}
              >
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={actionLoading}>
                {actionLoading ? <Loader2 size={16} className="animate-spin" /> : null}
                {form.id ? "Update Item" : "Create Item"}
              </Button>
            </div>
          </aside>
        </form>
      </>
    )
  }

  // --------------------------------------------------------------------------
  // RENDER 2: Main Category Catalog View (exact structure matching AdminProductsPage)
  // --------------------------------------------------------------------------
  return (
    <>
      <PageHeader
        title="Items catalog"
        description="Authoritative database product items and item types, hierarchical classification, sorting, and storefront visibility."
        action={
          <Button onClick={openCreateModal}>
            <Plus size={16} />
            Add Item
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
              placeholder="Search items by name, slug or description..."
            />
          </div>

          <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
            <select
              className="field flex-1 sm:w-auto text-xs sm:text-sm"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
            >
              <option value="all">All Status</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>

            <select
              className="field flex-1 sm:w-auto text-xs sm:text-sm"
              value={filterDiscount}
              onChange={(e) => setFilterDiscount(e.target.value as any)}
            >
              <option value="all">All Discounts</option>
              <option value="discounted">Discounted Only</option>
              <option value="no-discount">No Discount</option>
            </select>

            <Button variant="ghost" onClick={refetch} title="Refresh categories" className="p-2 shrink-0">
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
            <p className="text-sm font-medium text-slate-500">Loading catalog items...</p>
          </div>
        ) : filteredCategories.length === 0 ? (
          <div className="py-16 text-center">
            <Boxes className="mx-auto h-10 w-10 text-slate-300" />
            <h3 className="mt-2 text-base font-bold text-slate-700">No items found</h3>
            <p className="text-xs text-slate-500 mt-1">Try adjusting your search query or status filter.</p>
          </div>
        ) : (
          <>
            {/* Desktop Table matching AdminProductsPage */}
            <div className="hidden md:block overflow-x-auto">
              <table className="data-table w-full">
                <thead>
                  <tr>
                    <th>Item & Scope</th>
                    <th>Catalog Slug</th>
                    <th>Bulk Discount %</th>
                    <th>Sort Order</th>
                    <th>Storefront Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedCategories.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="flex min-w-56 items-center gap-3">
                          {item.image_url || item.imageUrl ? (
                            <img
                              src={item.image_url || item.imageUrl || ""}
                              alt={item.name}
                              className="h-11 w-11 shrink-0 rounded-lg border border-border bg-white object-contain p-1"
                            />
                          ) : (
                            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-amber-200/60 bg-gradient-to-br from-amber-50 to-amber-100 text-xs font-black uppercase text-amber-900">
                              {item.name.slice(0, 2)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <b className="block font-semibold text-slate-900 truncate">{item.name}</b>
                            {item.description ? (
                              <small className="text-slate-500 truncate block max-w-xs">{item.description}</small>
                            ) : (
                              <small className="text-slate-400 italic block">No description</small>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="font-mono text-xs text-slate-600">
                        /{item.slug}
                      </td>
                      <td>
                        {Number((item as any).discountPercentage ?? (item as any).discount_percentage ?? 0) > 0 ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
                            {Number((item as any).discountPercentage ?? (item as any).discount_percentage)}% OFF
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400 font-medium">None (0%)</span>
                        )}
                      </td>
                      <td>
                        <span className="font-mono text-xs text-slate-700 font-semibold">
                          #{item.sortOrder ?? 0}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={() => handleToggleVisibility(item)}
                          className="cursor-pointer hover:opacity-85 transition"
                          title="Click to toggle visibility"
                        >
                          <Badge tone={item.isActive ? "success" : "neutral"}>
                            {item.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </button>
                      </td>
                      <td>
                        <div className="flex gap-1">
                          <button
                            className="table-action"
                            onClick={() => openEditModal(item)}
                            title="Edit Category"
                          >
                            <Edit3 size={16} />
                          </button>
                          <button
                            onClick={() => {
                              setDeleteError(null)
                              setPendingDelete({ id: item.id, name: item.name })
                            }}
                            className="table-action text-red-600 hover:bg-red-50"
                            title="Delete Category"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List matching AdminProductsPage */}
            <div className="block md:hidden divide-y divide-border">
              {paginatedCategories.map((item) => (
                <div key={item.id} className="p-3.5 space-y-3">
                  <div className="flex items-start gap-3">
                    {item.image_url || item.imageUrl ? (
                      <img
                        src={item.image_url || item.imageUrl || ""}
                        alt={item.name}
                        className="h-12 w-12 shrink-0 rounded-lg border border-border bg-white object-contain p-1"
                      />
                    ) : (
                      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg border border-amber-200/60 bg-gradient-to-br from-amber-50 to-amber-100 text-xs font-black uppercase text-amber-900">
                        {item.name.slice(0, 2)}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <b className="block text-xs font-bold text-slate-900 leading-snug">{item.name}</b>
                      <span className="block font-mono text-[11px] text-slate-400 mt-0.5">/{item.slug}</span>
                      <div className="mt-1.5 flex items-center gap-2">
                        <Badge tone={item.isActive ? "success" : "neutral"}>
                          {item.isActive ? "Active" : "Inactive"}
                        </Badge>
                        {Number((item as any).discountPercentage ?? (item as any).discount_percentage ?? 0) > 0 && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                            {Number((item as any).discountPercentage ?? (item as any).discount_percentage)}% OFF
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {item.description && (
                    <p className="text-[11px] text-slate-500 line-clamp-2">{item.description}</p>
                  )}

                  <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-xs">
                    <span className="text-slate-500 font-mono text-[11px]">
                      Sort #{item.sortOrder ?? 0}
                    </span>
                    <div className="flex gap-2">
                      <button
                        className="table-action"
                        onClick={() => openEditModal(item)}
                        title="Edit Category"
                      >
                        <Edit3 size={15} />
                      </button>
                      <button
                        onClick={() => {
                          setDeleteError(null)
                          setPendingDelete({ id: item.id, name: item.name })
                        }}
                        className="table-action text-red-600 hover:bg-red-50"
                        title="Delete Category"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Footer Pagination Bar matching AdminOrdersPage */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-border px-4 py-3 sm:px-5 sm:py-4 text-xs text-slate-500">
          <div className="flex items-center gap-3">
            <span>
              Showing <b className="text-slate-800">{paginatedCategories.length}</b> of{" "}
              <b className="text-slate-800">{filteredCategories.length}</b> categories
              {filteredCategories.length !== items.length ? ` (filtered from ${items.length})` : ""}
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
            <h2 className="mt-4 text-xl font-black">Delete this item?</h2>
            <p className="mt-2 text-sm text-slate-500">
              <strong className="text-slate-800">{pendingDelete.name}</strong> will be permanently deleted from the database. This action cannot be undone if products reference it.
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
                {actionLoading ? "Deleting..." : "Delete Item"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
