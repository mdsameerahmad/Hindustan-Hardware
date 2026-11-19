import { AlertCircle, CheckCircle2, Loader2, Percent, Tag, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { catalogueApi } from "../api/catalogueApi"
import { Button } from "../components"
import { useAdminBrands } from "../features/hooks/useAdminBrands"
import { useAdminCategories } from "../features/hooks/useAdminCategories"

interface BulkDiscountModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (data: {
    categoryName: string
    brandName: string
    discount: number
    updatedCount: number
  }) => void
  initialCategoryId?: string
  initialBrandId?: string
  initialDiscount?: number
}

export function BulkDiscountModal({
  isOpen,
  onClose,
  onSuccess,
  initialCategoryId,
  initialBrandId,
  initialDiscount,
}: BulkDiscountModalProps) {
  const { categories } = useAdminCategories()
  const { brands } = useAdminBrands()

  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategoryId || "")
  const [selectedBrand, setSelectedBrand] = useState<string>(initialBrandId || "")
  const [discountPercent, setDiscountPercent] = useState<string>(
    initialDiscount !== undefined && initialDiscount !== null ? String(initialDiscount) : ""
  )
  const [loading, setLoading] = useState<boolean>(false)
  const [progress, setProgress] = useState<number>(0)
  const [error, setError] = useState<string | null>(null)
  const progressTimerRef = useRef<any>(null)

  // Sync state if initial props change when opened
  useEffect(() => {
    if (isOpen) {
      if (initialCategoryId !== undefined) setSelectedCategory(initialCategoryId)
      if (initialBrandId !== undefined) setSelectedBrand(initialBrandId)
      if (initialDiscount !== undefined && initialDiscount !== null)
        setDiscountPercent(String(initialDiscount))
      setError(null)
      setProgress(0)
      setLoading(false)
    } else {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current)
    }
    return () => {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current)
    }
  }, [isOpen, initialCategoryId, initialBrandId, initialDiscount])

  if (!isOpen) return null

  const handleApply = async () => {
    setError(null)

    if (!selectedCategory && !selectedBrand) {
      setError("Please select at least an Item Type or a Brand.")
      return
    }

    const discountVal = Number(discountPercent)
    if (isNaN(discountVal) || discountVal < 0 || discountVal > 100) {
      setError("Please enter a valid discount percentage between 0 and 100.")
      return
    }

    setLoading(true)
    setProgress(5)

    // Simulate animated progress from 5% to 85% while waiting for server response
    if (progressTimerRef.current) clearInterval(progressTimerRef.current)
    progressTimerRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 85) {
          return prev
        }
        const step = Math.floor(Math.random() * 8) + 5
        return Math.min(85, prev + step)
      })
    }, 200)

    try {
      const res = await catalogueApi.bulkUpdateDiscountByCriteria({
        categoryId: selectedCategory || null,
        brandId: selectedBrand || null,
        discountPercentage: discountVal,
      })

      // When API finishes, jump swiftly to 100%
      if (progressTimerRef.current) clearInterval(progressTimerRef.current)
      setProgress(100)

      const catName = categories.find((c) => c.id === selectedCategory)?.name || "All Items"
      const brName = brands.find((b) => b.id === selectedBrand)?.name || "All Brands"

      // Wait 500ms at 100% so user sees completion, then close and notify
      setTimeout(() => {
        setLoading(false)
        onClose()
        onSuccess({
          categoryName: catName,
          brandName: brName,
          discount: discountVal,
          updatedCount: res.updatedCount,
        })
      }, 500)
    } catch (err: any) {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current)
      setProgress(0)
      setLoading(false)
      setError(err?.message || "Failed to update bulk discount.")
    }
  }

  const selectedCatObj = categories.find((c) => c.id === selectedCategory)
  const selectedBrandObj = brands.find((b) => b.id === selectedBrand)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
              <Percent size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Bulk Discount by Brand & Item</h3>
              <p className="text-xs text-slate-500">
                Apply discount % to all matching products instantly
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="flex items-start gap-2.5 rounded-xl bg-rose-50 border border-rose-200 p-3.5 text-rose-700 text-xs">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Progress Bar Animation when Loading */}
          {loading && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-amber-950">
                <span className="flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin text-amber-600" />
                  Updating product discounts in bulk...
                </span>
                <span className="font-mono text-amber-800">{progress}%</span>
              </div>
              <div className="w-full bg-amber-200/70 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-amber-600 h-2.5 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-[11px] text-amber-700">
                {progress < 100
                  ? "Recalculating prices and updating catalog records..."
                  : "Finalizing updates..."}
              </p>
            </div>
          )}

          {/* Item Type Dropdown */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Item Type (Category)
            </label>
            <select
              value={selectedCategory}
              disabled={loading}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent disabled:bg-slate-50"
            >
              <option value="">-- All Item Types (Any) --</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-400 mt-1">
              Select specific item type (e.g. CPVC Pipes & Fittings, SWR Drainage, etc.)
            </p>
          </div>

          {/* Brand Dropdown */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Brand</label>
            <select
              value={selectedBrand}
              disabled={loading}
              onChange={(e) => setSelectedBrand(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent disabled:bg-slate-50"
            >
              <option value="">-- All Brands (Any) --</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-400 mt-1">
              Select specific brand (e.g. Ashirvad, Birla, Astral, Prince, etc.)
            </p>
          </div>

          {/* Discount Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Discount Percentage (%)
            </label>
            <div className="relative">
              <input
                type="number"
                min="0"
                max="100"
                step="0.5"
                placeholder="e.g. 35"
                disabled={loading}
                value={discountPercent}
                onChange={(e) => setDiscountPercent(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent pl-8 disabled:bg-slate-50"
              />
              <span className="absolute left-3 top-2.5 text-xs text-slate-400">%</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Set to 0 to remove discount. This calculates selling price: MRP - (MRP × Discount%).
            </p>
          </div>

          {/* Summary Preview Box */}
          <div className="rounded-xl bg-amber-50/60 border border-amber-200/60 p-3.5 text-xs text-amber-900 flex items-start gap-2.5">
            <Tag size={16} className="text-amber-700 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Target Selection:</p>
              <p className="text-amber-800 mt-0.5">
                {selectedBrandObj ? selectedBrandObj.name : "All Brands"} +{" "}
                {selectedCatObj ? selectedCatObj.name : "All Items"}
                {discountPercent !== "" && (
                  <span className="font-bold text-amber-950">
                    {" "}
                    → will receive {discountPercent}% discount
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={handleApply}
            disabled={loading || (!selectedCategory && !selectedBrand) || discountPercent === ""}
            className="bg-amber-600 hover:bg-amber-700 text-white font-semibold"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin mr-1.5" />
                Updating ({progress}%)...
              </>
            ) : (
              "Apply Bulk Discount"
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
