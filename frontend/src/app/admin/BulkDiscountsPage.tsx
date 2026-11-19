import {
  AlertCircle,
  ArrowUpDown,
  CheckCircle2,
  Edit,
  Layers,
  Loader2,
  Percent,
  Plus,
  RefreshCw,
  Search,
  Tag,
  X,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { catalogueApi } from "../api/catalogueApi"
import { Badge, Button, PageHeader } from "../components"
import { BulkDiscountModal } from "./BulkDiscountModal"

interface DiscountPair {
  categoryId: string
  categoryName: string
  brandId: string
  brandName: string
  productCount: number
  averageDiscount: number
  minDiscount: number
  maxDiscount: number
  commonDiscount: number
}

interface CategorySummary {
  id: string
  name: string
  productCount: number
  averageDiscount: number
}

export function BulkDiscountsPage() {
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [pairs, setPairs] = useState<DiscountPair[]>([])
  const [categories, setCategories] = useState<CategorySummary[]>([])

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState<string>("")
  const [categoryFilter, setCategoryFilter] = useState<string>("")
  const [brandFilter, setBrandFilter] = useState<string>("")
  const [discountFilter, setDiscountFilter] = useState<string>("all") // all, discounted, zero

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false)
  const [selectedForEdit, setSelectedForEdit] = useState<{
    categoryId?: string
    brandId?: string
    discount?: number
  } | null>(null)

  // Notification state
  const [notification, setNotification] = useState<{
    categoryName: string
    brandName: string
    discount: number
    updatedCount: number
  } | null>(null)

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await catalogueApi.getDiscountsSummary()
      setPairs(data.pairs || [])
      setCategories(data.categories || [])
    } catch (err: any) {
      setError(err?.message || "Failed to load bulk discounts data.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  // Filter pairs
  const filteredPairs = useMemo(() => {
    return pairs.filter((item) => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchesName =
          item.categoryName.toLowerCase().includes(q) || item.brandName.toLowerCase().includes(q)
        if (!matchesName) return false
      }

      // Category filter
      if (categoryFilter && item.categoryId !== categoryFilter) {
        return false
      }

      // Brand filter
      if (brandFilter && item.brandId !== brandFilter) {
        return false
      }

      // Discount filter
      if (discountFilter === "discounted" && item.commonDiscount <= 0) {
        return false
      }
      if (discountFilter === "zero" && item.commonDiscount > 0) {
        return false
      }

      return true
    })
  }, [pairs, searchQuery, categoryFilter, brandFilter, discountFilter])

  // Unique brands list for filter dropdown
  const uniqueBrands = useMemo(() => {
    const map = new Map<string, string>()
    pairs.forEach((p) => map.set(p.brandId, p.brandName))
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name)
    )
  }, [pairs])

  const openNewBulkModal = () => {
    setSelectedForEdit(null)
    setIsModalOpen(true)
  }

  const openEditPairModal = (pair: DiscountPair) => {
    setSelectedForEdit({
      categoryId: pair.categoryId,
      brandId: pair.brandId,
      discount: pair.commonDiscount,
    })
    setIsModalOpen(true)
  }

  const handleModalSuccess = (data: {
    categoryName: string
    brandName: string
    discount: number
    updatedCount: number
  }) => {
    setNotification(data)
    fetchData()
  }

  return (
    <>
      <PageHeader
        title="Bulk Discounts"
        description="Monitor and manage bulk discount percentages across Item Types (Categories) and Brands."
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={fetchData}
              disabled={loading}
              className="border-slate-300 text-slate-800 bg-white hover:bg-slate-50"
            >
              <RefreshCw size={15} className={loading ? "animate-spin mr-1.5" : "mr-1.5"} />
              Refresh
            </Button>
            <Button
              onClick={openNewBulkModal}
              className="bg-amber-600 hover:bg-amber-700 text-white font-semibold"
            >
              <Percent size={16} className="mr-1.5" />
              Apply Bulk Discount
            </Button>
          </div>
        }
      />

      {/* Success Notification Alert */}
      {notification && (
        <div className="mb-6 flex items-start justify-between gap-3 rounded-xl border border-emerald-300 bg-emerald-50/90 p-4 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-xs">
              <CheckCircle2 size={18} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-emerald-900">
                Bulk Discount Successfully Applied!
              </h4>
              <p className="text-xs text-emerald-800 mt-0.5">
                Brand: <strong className="font-semibold text-emerald-950">{notification.brandName}</strong>{" "}
                | Item Type:{" "}
                <strong className="font-semibold text-emerald-950">{notification.categoryName}</strong>{" "}
                | Discount:{" "}
                <strong className="font-semibold text-emerald-950">{notification.discount}% OFF</strong>{" "}
                ({notification.updatedCount} products updated)
              </p>
            </div>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="rounded-lg p-1 text-emerald-700 hover:bg-emerald-100/70 transition"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="rounded-xl border border-slate-200 bg-white p-4.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Item Types
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <Layers size={16} />
            </span>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">{categories.length}</p>
          <p className="text-xs text-slate-500 mt-1">Standardized item categories</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Item + Brand Combinations
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Tag size={16} />
            </span>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">{pairs.length}</p>
          <p className="text-xs text-slate-500 mt-1">Active catalog segments</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Discounted Segments
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <Percent size={16} />
            </span>
          </div>
          <p className="text-2xl font-bold text-emerald-700 mt-2">
            {pairs.filter((p) => p.commonDiscount > 0).length}
          </p>
          <p className="text-xs text-slate-500 mt-1">Pairs with active % discount</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Zero Discount Segments
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <ArrowUpDown size={16} />
            </span>
          </div>
          <p className="text-2xl font-bold text-slate-700 mt-2">
            {pairs.filter((p) => p.commonDiscount <= 0).length}
          </p>
          <p className="text-xs text-slate-500 mt-1">Selling directly at MRP (0% off)</p>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        {/* Filter bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 p-4 bg-slate-50/50">
          <div className="relative w-full sm:max-w-xs">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <input
              type="text"
              placeholder="Search item type or brand..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Filter by Item Type */}
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="text-xs rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="">All Item Types</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            {/* Filter by Brand */}
            <select
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value)}
              className="text-xs rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="">All Brands</option>
              {uniqueBrands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>

            {/* Filter by Discount Status */}
            <select
              value={discountFilter}
              onChange={(e) => setDiscountFilter(e.target.value)}
              className="text-xs rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="all">All Discounts</option>
              <option value="discounted">Discounted Only (&gt; 0%)</option>
              <option value="zero">Zero Discount Only (0%)</option>
            </select>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="p-4 bg-rose-50 text-rose-700 text-xs flex items-center gap-2 border-b border-rose-200">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-600 font-semibold uppercase tracking-wider">
                <th className="py-3 px-4">Item Type (Category)</th>
                <th className="py-3 px-4">Brand</th>
                <th className="py-3 px-4 text-center">Total Products</th>
                <th className="py-3 px-4 text-center">Current Discount %</th>
                <th className="py-3 px-4 text-center">Discount Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    <Loader2 size={24} className="animate-spin mx-auto text-amber-600 mb-2" />
                    <span>Loading bulk discounts...</span>
                  </td>
                </tr>
              ) : filteredPairs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    <Tag size={32} className="mx-auto text-slate-300 mb-2" />
                    <p className="font-semibold text-slate-700">No matching segments found</p>
                    <p className="text-slate-400 text-[11px] mt-0.5">
                      Try clearing filters or search query
                    </p>
                  </td>
                </tr>
              ) : (
                filteredPairs.map((pair) => {
                  const hasDiscount = pair.commonDiscount > 0
                  return (
                    <tr
                      key={`${pair.categoryId}-${pair.brandId}`}
                      className="hover:bg-slate-50/80 transition"
                    >
                      {/* Item Type */}
                      <td className="py-3 px-4 font-medium text-slate-900">
                        <div className="flex items-center gap-2">
                          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-50 text-amber-700 text-[10px] font-bold">
                            {pair.categoryName.charAt(0)}
                          </span>
                          <span>{pair.categoryName}</span>
                        </div>
                      </td>

                      {/* Brand */}
                      <td className="py-3 px-4 font-semibold text-slate-800">
                        <span className="inline-block px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px]">
                          {pair.brandName}
                        </span>
                      </td>

                      {/* Products Count */}
                      <td className="py-3 px-4 text-center text-slate-600">
                        {pair.productCount} items
                      </td>

                      {/* Discount Percentage */}
                      <td className="py-3 px-4 text-center">
                        {hasDiscount ? (
                          <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full text-xs border border-emerald-200">
                            {pair.commonDiscount}% OFF
                          </span>
                        ) : (
                          <span className="inline-flex items-center text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full text-[11px]">
                            0% (MRP)
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 text-center">
                        {hasDiscount ? (
                          <Badge tone="emerald" className="text-[10px]">
                            Active Discount
                          </Badge>
                        ) : (
                          <Badge tone="gray" className="text-[10px]">
                            Standard Price
                          </Badge>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditPairModal(pair)}
                          className="text-xs py-1 px-2.5 border-slate-300 text-slate-700 hover:border-amber-400 hover:text-amber-800 hover:bg-amber-50"
                        >
                          <Edit size={13} className="mr-1 text-slate-500" />
                          Update %
                        </Button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer info */}
        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 bg-slate-50 text-[11px] text-slate-500">
          <span>
            Showing <strong className="text-slate-700">{filteredPairs.length}</strong> segment(s)
          </span>
          <span>Tip: Click "Update %" to quickly change discount for any Item Type + Brand</span>
        </div>
      </div>

      {/* Bulk Discount Modal */}
      <BulkDiscountModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleModalSuccess}
        initialCategoryId={selectedForEdit?.categoryId}
        initialBrandId={selectedForEdit?.brandId}
        initialDiscount={selectedForEdit?.discount}
      />
    </>
  )
}
