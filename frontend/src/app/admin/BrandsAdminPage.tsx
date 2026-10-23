import {
  Edit3,
  Loader2,
  Package,
  RefreshCcw,
  Trash2,
} from "lucide-react"
import React, { useState } from "react"
import {
  Badge,
  Button,
  PageHeader,
} from "../components"
import { useAdminBrands } from "../features/hooks/useAdminBrands"
import { AdminField } from "./AdminSharedComponents"

export function BrandsAdminPage() {
  const {
    brands,
    loading,
    error,
    actionLoading,
    createBrand,
    updateBrand,
    deleteBrand,
    refetch,
  } = useAdminBrands()

  const emptyBrand = {
    id: "",
    name: "",
    slug: "",
    logoUrl: "",
    description: "",
    discountPercentage: 0,
    displayOrder: 1,
    isActive: true,
  }

  const [form, setForm] = useState(emptyBrand)
  const [formError, setFormError] = useState<string | null>(null)

  const edit = (brand: any) => {
    setForm({
      id: brand.id,
      name: brand.name,
      slug: brand.slug,
      logoUrl: brand.logoUrl || "",
      description: brand.description || "",
      discountPercentage: brand.discountPercentage ?? brand.discount_percentage ?? 0,
      displayOrder: brand.displayOrder ?? 1,
      isActive: brand.isActive !== false,
    })
    setFormError(null)
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
      const discVal = Number(form.discountPercentage) || 0
      if (form.id) {
        await updateBrand(form.id, {
          name: form.name.trim(),
          slug,
          logoUrl: normalizedLogo,
          description: form.description.trim() || undefined,
          discountPercentage: discVal,
          displayOrder: Number(form.displayOrder) || 1,
          isActive: form.isActive,
        })
      } else {
        await createBrand({
          name: form.name.trim(),
          slug,
          logoUrl: normalizedLogo,
          description: form.description.trim() || undefined,
          discountPercentage: discVal,
          displayOrder: Number(form.displayOrder) || 1,
          isActive: form.isActive,
        })
      }
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

  const handleDelete = async (id: string, brandName: string) => {
    if (!confirm(`Are you sure you want to delete brand "${brandName}"? This cannot be undone if products reference it.`)) {
      return
    }
    try {
      await deleteBrand(id)
    } catch (err: any) {
      alert(err?.message || "Failed to delete brand.")
    }
  }

  return (
    <>
      <PageHeader
        title="Brand management"
        description="Persisted manufacturer identity, brand logos, active status, and catalog order."
        action={
          <Button variant="ghost" onClick={refetch} title="Refresh brands">
            <RefreshCcw size={15} />
          </Button>
        }
      />

      {error && (
        <div className="mb-6 rounded-lg bg-red-50 p-4 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] xl:grid-cols-[1fr_380px] gap-6 items-start">
        <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-white shadow-xs">
          {loading ? (
            <div className="flex h-56 flex-col items-center justify-center gap-3">
              <Loader2 className="h-7 w-7 animate-spin text-brand" />
              <p className="text-sm font-medium text-slate-500">Loading catalog brands...</p>
            </div>
          ) : brands.length === 0 ? (
            <div className="py-16 text-center">
              <Package className="mx-auto h-10 w-10 text-slate-300" />
              <h3 className="mt-2 text-base font-bold text-slate-700">No brands found</h3>
              <p className="text-xs text-slate-500 mt-1">Create your first brand using the panel on the right.</p>
            </div>
          ) : (
          <>
            {/* Desktop & Tablet Table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="data-table w-full">
                <thead>
                  <tr>
                    <th>Brand</th>
                    <th>Slug</th>
                    <th>Discount</th>
                    <th>Display order</th>
                    <th>Visibility</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {[...brands]
                    .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
                    .map((brand) => (
                      <tr key={brand.id}>
                        <td>
                          <div className="flex items-center gap-3">
                            {brand.logoUrl ? (
                              <img
                                src={brand.logoUrl}
                                alt=""
                                className="h-8 w-8 rounded object-contain bg-slate-50 p-1 border border-border shrink-0"
                              />
                            ) : (
                              <div className="grid h-8 w-8 place-items-center rounded bg-slate-100 text-xs font-bold text-slate-500 uppercase shrink-0">
                                {brand.name.slice(0, 2)}
                              </div>
                            )}
                            <div className="min-w-0">
                              <b className="block font-semibold text-slate-900 truncate">{brand.name}</b>
                              {brand.description && (
                                <small className="line-clamp-1 text-slate-500 max-w-xs">{brand.description}</small>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="font-mono text-xs text-slate-600">/{brand.slug}</td>
                        <td>
                          {((brand as any).discountPercentage ?? (brand as any).discount_percentage) ? (
                            <Badge tone="success">
                              {((brand as any).discountPercentage ?? (brand as any).discount_percentage)}% OFF
                            </Badge>
                          ) : (
                            <span className="text-xs text-slate-400">None</span>
                          )}
                        </td>
                        <td>{brand.displayOrder ?? 1}</td>
                        <td>
                          <button
                            disabled={actionLoading}
                            onClick={() => handleToggleVisibility(brand)}
                            className="cursor-pointer hover:opacity-80"
                          >
                            <Badge tone={brand.isActive ? "success" : "neutral"}>
                              {brand.isActive ? "Visible" : "Hidden"}
                            </Badge>
                          </button>
                        </td>
                        <td>
                          <div className="flex gap-1">
                            <button
                              className="table-action"
                              onClick={() => edit(brand)}
                              title="Edit Brand"
                            >
                              <Edit3 size={16} />
                            </button>
                            <button
                              className="table-action text-red-600 hover:bg-red-50"
                              onClick={() => handleDelete(brand.id, brand.name)}
                              title="Delete Brand"
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

            {/* Mobile Card List */}
            <div className="block sm:hidden divide-y divide-border">
              {[...brands]
                .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
                .map((brand) => (
                  <div key={brand.id} className="p-3.5 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {brand.logoUrl ? (
                          <img
                            src={brand.logoUrl}
                            alt=""
                            className="h-8 w-8 rounded object-contain bg-slate-50 p-1 border border-border shrink-0"
                          />
                        ) : (
                          <div className="grid h-8 w-8 place-items-center rounded bg-slate-100 text-xs font-bold text-slate-500 uppercase shrink-0">
                            {brand.name.slice(0, 2)}
                          </div>
                        )}
                        <div className="min-w-0">
                          <b className="block text-xs font-bold text-slate-900 truncate">{brand.name}</b>
                          <span className="block font-mono text-[10px] text-slate-400 truncate">/{brand.slug}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          disabled={actionLoading}
                          onClick={() => handleToggleVisibility(brand)}
                          className="cursor-pointer hover:opacity-80"
                        >
                          <Badge tone={brand.isActive ? "success" : "neutral"}>
                            {brand.isActive ? "Visible" : "Hidden"}
                          </Badge>
                        </button>
                        <button
                          className="table-action"
                          onClick={() => edit(brand)}
                          title="Edit Brand"
                        >
                          <Edit3 size={15} />
                        </button>
                        <button
                          className="table-action text-red-600 hover:bg-red-50"
                          onClick={() => handleDelete(brand.id, brand.name)}
                          title="Delete Brand"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                    {brand.description && (
                      <p className="text-[11px] text-slate-500 line-clamp-2">{brand.description}</p>
                    )}
                  </div>
                ))}
            </div>
          </>
        )}
      </div>

        <form
          onSubmit={submit}
          className="h-fit rounded-xl border border-border bg-white p-6 shadow-xs"
        >
          <h2 className="text-lg font-black text-slate-900">
            {form.id ? "Edit brand" : "Add brand"}
          </h2>
          <p className="text-xs text-slate-500 mt-1">Authoritative brand records stored in database.</p>

          {formError && (
            <div className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700 border border-red-200">
              {formError}
            </div>
          )}

          <div className="mt-5 space-y-4">
            <AdminField
              required
              label="Brand name"
              value={form.name}
              onChange={(value) => setForm({ ...form, name: value })}
            />
            <AdminField
              label="Slug (optional)"
              value={form.slug}
              onChange={(value) => setForm({ ...form, slug: value })}
            />
            <AdminField
              label="Discount % (Applied to all products of this brand)"
              type="number"
              value={String(form.discountPercentage)}
              onChange={(value) => setForm({ ...form, discountPercentage: Number(value) })}
            />
            <AdminField
              label="Approved logo URL (optional)"
              value={form.logoUrl}
              onChange={(value) => setForm({ ...form, logoUrl: value })}
            />
            <label className="field-label block text-xs font-bold uppercase tracking-wider text-slate-600">
              Short description
              <textarea
                rows={3}
                className="field mt-2 w-full resize-none"
                value={form.description}
                onChange={(event) =>
                  setForm({ ...form, description: event.target.value })
                }
                placeholder="Brand legacy and catalog portfolio..."
              />
            </label>
            <AdminField
              label="Display order"
              type="number"
              value={String(form.displayOrder)}
              onChange={(value) =>
                setForm({ ...form, displayOrder: Number(value) })
              }
            />
            <label className="toggle-row flex items-center justify-between py-2">
              <span>
                <b className="block text-sm text-slate-800">Active brand</b>
                <small className="text-xs text-slate-500">Visible in storefront catalog filters</small>
              </span>
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
              />
            </label>
          </div>
          <div className="mt-6 flex gap-2">
            <Button type="submit" className="flex-1" disabled={actionLoading}>
              {actionLoading ? <Loader2 size={16} className="animate-spin" /> : null}
              {form.id ? "Save Changes" : "Add Brand"}
            </Button>
            {form.id && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setForm(emptyBrand)}
              >
                Cancel
              </Button>
            )}
          </div>
        </form>
      </div>
    </>
  )
}
