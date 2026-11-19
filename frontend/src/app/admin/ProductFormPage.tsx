import { Loader2 } from "lucide-react"
import React, { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router"
import { Button, PageHeader } from "../components"
import { adminApi } from "../features/commerceApi"
import { AdminImageManager } from "../features/components/AdminImageManager"
import { useAdminBrands } from "../features/hooks/useAdminBrands"
import { useAdminCategories } from "../features/hooks/useAdminCategories"
import { useProductImages } from "../features/hooks/useProductImages"
import { useStore } from "../store"
import { AdminField, FormCard } from "./AdminSharedComponents"

export function ProductFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { images: galleryImages, refresh: refreshGallery } = useProductImages(id)
  const { categories: backendCategories, loading: categoriesLoading } = useAdminCategories()
  const { brands: backendBrands, loading: brandsLoading } = useAdminBrands()
  const { notify } = useStore()

  const [loadingProduct, setLoadingProduct] = useState<boolean>(Boolean(id))
  const [submitting, setSubmitting] = useState<boolean>(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [initialStock, setInitialStock] = useState<number>(0)

  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    sku: "",
    brandId: "",
    categoryId: "",
    productType: "Pipes & Fittings",
    basePrice: 0,
    compareAtPrice: 0,
    unit: "piece",
    unitOfSale: "per piece",
    material: "PVC",
    diameter: "",
    length: "",
    pressureRating: "",
    technicalStandard: "",
    intendedApplication: "",
    comparisonGroupId: "",
    imageUrl: "",
    description: "",
    stock: 0,
    discountPercentage: 0,
    isActive: true,
    isFeatured: false,
  })

  // Load authoritative existing product if editing
  useEffect(() => {
    if (!id) return
    let isMounted = true
    setLoadingProduct(true)
    adminApi
      .getProduct(id)
      .then((prod: any) => {
        if (!isMounted) return
        setFormData({
          name: prod.name || "",
          slug: prod.slug || "",
          sku: prod.sku || "",
          brandId: prod.brand_id || prod.brandId || prod.brand?.id || "",
          categoryId: prod.category_id || prod.categoryId || prod.category?.id || "",
          productType: prod.productType || prod.specs?.product_type || "Pipes & Fittings",
          basePrice: prod.base_price ?? prod.price ?? 0,
          compareAtPrice: prod.compare_at_price ?? prod.mrp ?? 0,
          unit: prod.unit || "piece",
          unitOfSale: prod.unit_of_sale || prod.unitOfSale || "per piece",
          material: prod.material || prod.specs?.material || "",
          diameter: prod.diameter || prod.specs?.diameter || prod.size || "",
          length: prod.length || prod.specs?.length || "",
          pressureRating: prod.pressure_rating || prod.specs?.pressure_rating || "",
          technicalStandard: prod.technical_standard || prod.specs?.technical_standard || "",
          intendedApplication: prod.intended_application || prod.specs?.intended_application || "",
          comparisonGroupId: prod.comparison_group_id || prod.comparisonGroupId || "",
          imageUrl: prod.specs?.image_url || prod.image || "",
          description: prod.description || "",
          stock: prod.inventory?.quantity_available ?? prod.stock ?? 0,
          discountPercentage: prod.discount_percentage ?? (prod.specs?.discount_percentage ? Number(prod.specs.discount_percentage) : 0),
          isActive: prod.is_active !== false && prod.active !== false,
          isFeatured: prod.is_featured || prod.featured || false,
        })
        setInitialStock(prod.inventory?.quantity_available ?? prod.stock ?? 0)
      })
      .catch((err) => {
        if (!isMounted) return
        setFormError(err?.message || "Failed to load product details from server.")
      })
      .finally(() => {
        if (isMounted) setLoadingProduct(false)
      })
    return () => {
      isMounted = false
    }
  }, [id])

  // Set default category and brand once loaded if adding new product
  useEffect(() => {
    if (id) return
    if (!formData.categoryId && backendCategories.length > 0) {
      setFormData((prev) => ({ ...prev, categoryId: backendCategories[0].id }))
    }
    if (!formData.brandId && backendBrands.length > 0) {
      setFormData((prev) => ({ ...prev, brandId: backendBrands[0].id }))
    }
  }, [backendCategories, backendBrands, id, formData.categoryId, formData.brandId])

  const set = (key: string, value: any) => {
    setFormData((prev) => ({ ...prev, [key]: value }))
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setFormError(null)

    if (!formData.name.trim()) {
      setFormError("Product name is required.")
      return
    }
    if (!formData.categoryId) {
      setFormError("Please select a valid category.")
      return
    }
    if (formData.basePrice < 0) {
      setFormError("Base price cannot be negative.")
      return
    }

    const rawSlug = formData.slug.trim() || formData.name.trim()
    const generatedSlug = rawSlug
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")

    if (!generatedSlug) {
      setFormError("A valid slug could not be generated. Please enter letters or numbers.")
      return
    }

    setSubmitting(true)
    try {
      if (id) {
        // Update product attributes
        await adminApi.updateProduct(id, {
          name: formData.name.trim(),
          slug: generatedSlug,
          sku: formData.sku.trim() || null,
          description: formData.description,
          brandId: formData.brandId || null,
          categoryId: formData.categoryId,
          productType: formData.productType || null,
          basePrice: Number(formData.basePrice),
          compareAtPrice: formData.compareAtPrice ? Number(formData.compareAtPrice) : null,
          unit: formData.unit,
          unitOfSale: formData.unitOfSale,
          material: formData.material || null,
          diameter: formData.diameter || null,
          length: formData.length || null,
          pressureRating: formData.pressureRating || null,
          technicalStandard: formData.technicalStandard || null,
          intendedApplication: formData.intendedApplication || null,
          comparisonGroupId: formData.comparisonGroupId || null,
          imageUrl: formData.imageUrl || null,
          images: formData.imageUrl ? [formData.imageUrl] : [],
          specs: {
            Material: formData.material || "Standard",
            Diameter: formData.diameter || "Standard",
            Length: formData.length || "Standard",
            "Pressure rating": formData.pressureRating || "Standard",
            "Technical standard": formData.technicalStandard || "Standard",
            "Unit of sale": formData.unitOfSale,
            Application: formData.intendedApplication || "Plumbing & Construction",
          },
          discountPercentage: Number(formData.discountPercentage) || 0,
          isFeatured: formData.isFeatured,
          isActive: formData.isActive,
        })

        // If stock was adjusted, calculate delta and execute inventory adjustment
        const newStock = Number(formData.stock) || 0
        const delta = newStock - initialStock
        if (delta !== 0) {
          await adminApi.adjustInventory({
            productId: id,
            quantityChange: delta,
            movementType: delta > 0 ? "restock" : "adjustment",
            reason: `Direct stock update via Product Edit form (${initialStock} -> ${newStock})`,
          })
        }

        notify("Product and inventory updated successfully in database")
      } else {
        // Create product
        await adminApi.createProduct({
          name: formData.name.trim(),
          slug: generatedSlug,
          sku: formData.sku.trim() || null,
          description: formData.description,
          brandId: formData.brandId || null,
          categoryId: formData.categoryId,
          productType: formData.productType || null,
          basePrice: Number(formData.basePrice),
          compareAtPrice: formData.compareAtPrice ? Number(formData.compareAtPrice) : null,
          unit: formData.unit,
          unitOfSale: formData.unitOfSale,
          material: formData.material || null,
          diameter: formData.diameter || null,
          length: formData.length || null,
          pressureRating: formData.pressureRating || null,
          technicalStandard: formData.technicalStandard || null,
          intendedApplication: formData.intendedApplication || null,
          comparisonGroupId: formData.comparisonGroupId || null,
          imageUrl: formData.imageUrl || null,
          images: formData.imageUrl ? [formData.imageUrl] : [],
          specs: {
            Material: formData.material || "Standard",
            Diameter: formData.diameter || "Standard",
            Length: formData.length || "Standard",
            "Pressure rating": formData.pressureRating || "Standard",
            "Technical standard": formData.technicalStandard || "Standard",
            "Unit of sale": formData.unitOfSale,
            Application: formData.intendedApplication || "Plumbing & Construction",
          },
          discountPercentage: Number(formData.discountPercentage) || 0,
          isFeatured: formData.isFeatured,
          isActive: formData.isActive,
          initialStock: Number(formData.stock) || 0,
        })
        notify("Product created successfully in database")
      }
      navigate("/admin/products")
    } catch (err: any) {
      setFormError(err?.message || "Failed to persist product record.")
    } finally {
      setSubmitting(false)
    }
  }

  if (loadingProduct || categoriesLoading || brandsLoading) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
        <p className="text-sm font-medium text-slate-500">Loading product configuration...</p>
      </div>
    )
  }

  return (
    <>
      <PageHeader
        title={id ? "Edit product" : "Add new product"}
        description="Persisted catalog records, pricing, inventory initialization, and technical attributes."
      />

      {formError && (
        <div className="mb-6 rounded-lg bg-red-50 p-4 border border-red-200 text-sm text-red-700">
          {formError}
        </div>
      )}

      <form onSubmit={submit} className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <FormCard title="Basic information">
            <div className="grid gap-4 sm:grid-cols-2">
              <AdminField
                label="Product name"
                required
                value={formData.name}
                onChange={(value) => set("name", value)}
              />
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="field-label block text-xs font-bold uppercase tracking-wider text-slate-600">
                    Item Code (SKU)
                  </label>
                  <button
                    type="button"
                    onClick={() => set("sku", "")}
                    className="text-[11px] font-semibold text-amber-700 hover:text-amber-800 transition"
                  >
                    Set as Null / Clear
                  </button>
                </div>
                <input
                  type="text"
                  className="field w-full font-mono text-xs sm:text-sm"
                  value={formData.sku}
                  onChange={(e) => set("sku", e.target.value)}
                  placeholder="e.g. HH-ASTR-1002 (or leave blank for null)"
                />
                <p className="text-[11px] text-slate-400">
                  Unique product identifier. Leave empty or click &quot;Set as Null&quot; if this item has no item code.
                </p>
              </div>
              <label className="field-label block text-xs font-bold uppercase tracking-wider text-slate-600">
                Brand
                <select
                  className="field mt-2 w-full"
                  value={formData.brandId}
                  onChange={(event) => set("brandId", event.target.value)}
                >
                  <option value="">Unassigned (Generic)</option>
                  {backendBrands.map((brand) => (
                    <option key={brand.id} value={brand.id}>
                      {brand.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label block text-xs font-bold uppercase tracking-wider text-slate-600">
                Item Type
                <select
                  className="field mt-2 w-full"
                  required
                  value={formData.categoryId}
                  onChange={(event) => set("categoryId", event.target.value)}
                >
                  <option value="" disabled>Select Item Type</option>
                  {backendCategories.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="sm:col-span-2">
                <label className="field-label block text-xs font-bold uppercase tracking-wider text-slate-600">
                  Description
                  <textarea
                    required
                    rows={4}
                    className="field mt-2 w-full resize-none"
                    value={formData.description}
                    onChange={(event) => set("description", event.target.value)}
                  />
                </label>
              </div>
            </div>
          </FormCard>

          <FormCard title="Pricing & unit">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <AdminField
                label="Base / Selling price (₹)"
                required
                type="number"
                value={String(formData.basePrice)}
                onChange={(value) => set("basePrice", Number(value))}
              />
              <AdminField
                label="MRP / Compare price (₹)"
                type="number"
                value={String(formData.compareAtPrice || "")}
                onChange={(value) => {
                  const mrp = value ? Number(value) : 0
                  const disc = Number(formData.discountPercentage) || 0
                  if (disc > 0 && mrp > 0) {
                    const calculated = Math.round(mrp * (1 - disc / 100) * 100) / 100
                    setFormData((prev) => ({ ...prev, compareAtPrice: mrp, basePrice: calculated }))
                  } else {
                    set("compareAtPrice", mrp)
                  }
                }}
              />
              <AdminField
                label="Discount % (Product specific)"
                type="number"
                value={String(formData.discountPercentage || "")}
                onChange={(value) => {
                  const disc = value ? Number(value) : 0
                  const mrp = Number(formData.compareAtPrice) > 0 ? Number(formData.compareAtPrice) : Number(formData.basePrice)
                  if (disc > 0 && mrp > 0) {
                    const calculated = Math.round(mrp * (1 - disc / 100) * 100) / 100
                    setFormData((prev) => ({
                      ...prev,
                      discountPercentage: disc,
                      compareAtPrice: mrp,
                      basePrice: calculated,
                    }))
                  } else if (disc === 0 && Number(formData.compareAtPrice) > 0) {
                    setFormData((prev) => ({
                      ...prev,
                      discountPercentage: 0,
                      basePrice: Number(prev.compareAtPrice),
                    }))
                  } else {
                    set("discountPercentage", disc)
                  }
                }}
              />
              <AdminField
                label="Unit of sale"
                required
                value={formData.unitOfSale}
                onChange={(value) => set("unitOfSale", value)}
              />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              If left at 0, the product will automatically inherit the discount percentage configured for its brand (if any).
            </p>
          </FormCard>

          <FormCard title="Specifications & Comparison Attributes">
            <div className="grid gap-4 sm:grid-cols-3">
              <AdminField
                label="Product type"
                value={formData.productType}
                onChange={(value) => set("productType", value)}
              />
              <AdminField
                label="Diameter / size"
                value={formData.diameter}
                onChange={(value) => set("diameter", value)}
              />
              <AdminField
                label="Length"
                value={formData.length}
                onChange={(value) => set("length", value)}
              />
              <AdminField
                label="Primary Image URL"
                value={formData.imageUrl}
                onChange={(value) => set("imageUrl", value)}
              />
            </div>
            <p className="text-xs leading-5 text-slate-500">
              Technical attributes are used for product specification comparisons and alternate recommendations.
            </p>
          </FormCard>

          {/* Supabase Storage Product Image Management */}
          {id && (
            <AdminImageManager
              productId={id}
              images={galleryImages}
              onImagesUpdated={refreshGallery}
            />
          )}
        </div>

        <aside className="space-y-6">
          <FormCard title="Inventory">
            <AdminField
              label="Stock quantity"
              required
              type="number"
              value={String(formData.stock)}
              onChange={(value) => set("stock", Number(value))}
            />
            {id ? (
              <p className="text-xs text-slate-500 leading-normal">
                Modifying stock quantity will automatically synchronize inventory and record an audit adjustment in the database.
              </p>
            ) : (
              <p className="text-xs text-slate-500 leading-normal">
                Initial stock quantity to allocate for this new product record.
              </p>
            )}
          </FormCard>

          <FormCard title="Visibility">
            <label className="toggle-row flex items-center justify-between py-2">
              <span>
                <b className="block text-sm text-slate-800">Active product</b>
                <small className="text-xs text-slate-500">Visible to customers in storefront</small>
              </span>
              <input
                type="checkbox"
                checked={formData.isActive}
                onChange={(event) => set("isActive", event.target.checked)}
              />
            </label>
            <label className="toggle-row flex items-center justify-between py-2 border-t border-border mt-2 pt-2">
              <span>
                <b className="block text-sm text-slate-800">Featured / bestseller</b>
                <small className="text-xs text-slate-500">Highlight on homepage catalogue</small>
              </span>
              <input
                type="checkbox"
                checked={formData.isFeatured}
                onChange={(event) => set("isFeatured", event.target.checked)}
              />
            </label>
          </FormCard>

          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              disabled={submitting}
              onClick={() => navigate("/admin/products")}
            >
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={submitting}>
              {submitting ? "Saving..." : id ? "Update Product" : "Create Product"}
            </Button>
          </div>
        </aside>
      </form>
    </>
  )
}
