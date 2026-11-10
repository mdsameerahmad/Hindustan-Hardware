import {
  AlertTriangle,
  Boxes,
  Gauge,
  Loader2,
  RefreshCcw,
} from "lucide-react"
import React, { useCallback, useEffect, useState } from "react"
import { Link, useSearchParams } from "react-router"
import {
  Badge,
  Button,
  PageHeader,
} from "../components"
import { catalogueApi } from "../api/catalogueApi"
import { type Product } from "../data"
import { ProductImage } from "../features/components/ProductImage"
import { useAdminInventory } from "../features/hooks/useAdminInventory"
import { useAdminProducts } from "../features/hooks/useAdminProducts"
import { useStore } from "../store"
import { transformBackendProduct } from "../utils/productTransform"

function MiniStat({
  label,
  value,
  icon,
}: {
  label: string
  value: string
  icon: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-white p-5 shadow-xs">
      <span className="text-brand">{icon}</span>
      <div>
        <b className="text-2xl">{value}</b>
        <small className="block text-slate-500">{label}</small>
      </div>
    </div>
  )
}

export function InventoryPage() {
  const { products, pagination: productPagination, setFilters: setProductFilters, loading: productsLoading, refetch: refetchProducts } = useAdminProducts({ page: 1, limit: 10 })
  const { movements, pagination: movPagination, loading: movLoading, error: movError, actionLoading, adjustStock, fetchPage: fetchMovPage } = useAdminInventory()
  const { notify } = useStore()
  const [searchParams] = useSearchParams()
  const showingLowStock = searchParams.get("filter") === "low-stock"
  const [lowStockProducts, setLowStockProducts] = useState<Product[]>([])
  const [lowStockPage, setLowStockPage] = useState(1)
  const [lowStockLoading, setLowStockLoading] = useState(false)
  const [lowStockError, setLowStockError] = useState<string | null>(null)

  const [adjustModalProduct, setAdjustModalProduct] = useState<Product | null>(null)
  const [adjustQty, setAdjustQty] = useState<number>(1)
  const [adjustType, setAdjustType] = useState<"adjustment" | "restock" | "correction" | "return">("restock")
  const [adjustReason, setAdjustReason] = useState<string>("")
  const [adjustError, setAdjustError] = useState<string | null>(null)

  const fetchAllLowStockProducts = useCallback(async () => {
    setLowStockLoading(true)
    setLowStockError(null)
    try {
      const firstPage = await catalogueApi.listProducts({ page: 1, limit: 100 })
      const pages = [firstPage]
      for (let page = 2; page <= firstPage.pagination.totalPages; page += 1) {
        pages.push(await catalogueApi.listProducts({ page, limit: 100 }))
      }

      setLowStockProducts(
        pages
          .flatMap((page) => page.items)
          .map(transformBackendProduct)
          .filter((product) => (product.stock ?? 0) > 0 && (product.stock ?? 0) < 10),
      )
      setLowStockPage(1)
    } catch (err: any) {
      setLowStockError(err?.message || "Failed to load low stock products.")
    } finally {
      setLowStockLoading(false)
    }
  }, [])

  useEffect(() => {
    if (showingLowStock) void fetchAllLowStockProducts()
  }, [showingLowStock, fetchAllLowStockProducts])

  const handleOpenAdjust = (product: Product, delta = 1) => {
    setAdjustModalProduct(product)
    setAdjustQty(delta)
    setAdjustType(delta > 0 ? "restock" : "adjustment")
    setAdjustReason(delta > 0 ? "Warehouse restock batch received" : "Damaged stock deduction")
    setAdjustError(null)
  }

  const handleConfirmAdjust = async () => {
    if (!adjustModalProduct) return
    if (!adjustReason.trim()) {
      setAdjustError("Reason is required (minimum 3 characters).")
      return
    }
    if (adjustQty === 0) {
      setAdjustError("Quantity change cannot be zero.")
      return
    }

    setAdjustError(null)
    try {
      await adjustStock({
        productId: adjustModalProduct.id,
        quantityChange: Number(adjustQty),
        movementType: adjustType,
        reason: adjustReason.trim(),
      })
      notify(`Inventory updated for ${adjustModalProduct.name}`)
      setAdjustModalProduct(null)
      refetchProducts()
      if (showingLowStock) void fetchAllLowStockProducts()
    } catch (err: any) {
      setAdjustError(err?.message || "Failed to adjust inventory.")
    }
  }

  const totalUnits = products.reduce((sum, p) => sum + (p.stock || 0), 0)
  const lowStockCount = products.filter((p) => (p.stock || 0) > 0 && (p.stock || 0) < 10).length
  const outOfStockCount = products.filter((p) => (p.stock || 0) <= 0).length
  const pageSize = 10
  const displayedProducts = showingLowStock
    ? lowStockProducts.slice((lowStockPage - 1) * pageSize, lowStockPage * pageSize)
    : products
  const productPageCount = showingLowStock
    ? Math.max(1, Math.ceil(lowStockProducts.length / pageSize))
    : productPagination.totalPages
  const currentProductPage = showingLowStock ? lowStockPage : productPagination.page
  const changeProductPage = (page: number) => {
    if (showingLowStock) setLowStockPage(page)
    else setProductFilters((current) => ({ ...current, page }))
  }

  return (
    <>
      <PageHeader
        title={showingLowStock ? "Low stock items" : "Inventory management"}
        description={showingLowStock
          ? "All active products with fewer than 10 units currently available."
          : "Persisted stock monitoring, authorized stock adjustments, and atomic inventory movement history."}
        action={
          <div className="flex items-center gap-2">
            {showingLowStock && (
              <Link to="/admin/inventory">
                <Button variant="outline">View all inventory</Button>
              </Link>
            )}
            <Button
              variant="ghost"
              onClick={() => {
                refetchProducts()
                fetchMovPage(1)
                if (showingLowStock) void fetchAllLowStockProducts()
              }}
              title="Refresh inventory"
            >
              <RefreshCcw size={15} />
            </Button>
          </div>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <MiniStat
          label="Total stock units"
          value={String(totalUnits)}
          icon={<Boxes />}
        />
        <MiniStat
          label="Low stock items"
          value={String(showingLowStock ? lowStockProducts.length : lowStockCount)}
          icon={<AlertTriangle />}
        />
        <MiniStat
          label="Out of stock items"
          value={String(outOfStockCount)}
          icon={<Gauge />}
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-white shadow-xs">
        <div className="border-b border-border p-4 sm:p-5">
          <h2 className="text-base sm:text-lg font-black text-slate-900">Current Stock by Product</h2>
          <p className="text-xs text-slate-500">Live authoritative inventory levels across catalog products</p>
        </div>

        {productsLoading || (showingLowStock && lowStockLoading) ? (
          <div className="flex h-48 flex-col items-center justify-center gap-3">
            <Loader2 className="h-7 w-7 animate-spin text-brand" />
            <p className="text-sm font-medium text-slate-500">
              {showingLowStock ? "Loading all low stock products..." : "Loading catalog inventory..."}
            </p>
          </div>
        ) : lowStockError && showingLowStock ? (
          <div className="p-8 text-center text-sm font-medium text-red-700">{lowStockError}</div>
        ) : (
          <>
            {/* Desktop & Tablet Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="data-table w-full">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>SKU</th>
                    <th>Current stock</th>
                    <th>Status</th>
                    <th>Stock adjustment</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedProducts.map((product) => {
                    const stockVal = product.stock ?? 0
                    return (
                      <tr key={product.id}>
                        <td>
                          <div className="flex items-center gap-3 min-w-0">
                            <ProductImage
                              src={product.image}
                              alt=""
                              className="h-10 w-10 rounded-lg object-contain bg-slate-100 p-1 shrink-0"
                            />
                            <div className="min-w-0">
                              <b className="block text-slate-900 truncate">{product.name}</b>
                              <small className="text-slate-500 truncate block">
                                {typeof product.brand === "string"
                                  ? product.brand
                                  : (product.brand as any)?.name || product.brandName || "Generic"}
                              </small>
                            </div>
                          </div>
                        </td>
                        <td className="font-mono text-xs">HH-{product.id.slice(0, 8).toUpperCase()}</td>
                        <td>
                          <b className="text-slate-900 text-base">{stockVal}</b>
                        </td>
                        <td>
                          <Badge
                            tone={
                              stockVal === 0
                                ? "danger"
                                : stockVal < 10
                                  ? "warning"
                                  : "success"
                            }
                          >
                            {stockVal === 0
                              ? "Out of stock"
                              : stockVal < 10
                                ? "Low stock"
                                : "In stock"}
                          </Badge>
                        </td>
                        <td>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenAdjust(product, -1)}
                              title="Deduct stock"
                              className="px-2 py-1 text-xs"
                            >
                              −1
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenAdjust(product, 10)}
                              title="Restock 10 units"
                              className="px-2 py-1 text-xs text-brand"
                            >
                              +10 Restock
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenAdjust(product, 1)}
                              title="Adjust quantity..."
                              className="px-2.5 py-1 text-xs"
                            >
                              Custom
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List */}
            <div className="block md:hidden divide-y divide-border">
              {displayedProducts.map((product) => {
                const stockVal = product.stock ?? 0
                return (
                  <div key={product.id} className="p-3.5 space-y-3">
                    <div className="flex items-start gap-3">
                      <ProductImage
                        src={product.image}
                        alt=""
                        className="h-11 w-11 rounded-lg object-contain bg-slate-100 p-1 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <b className="block text-xs font-bold text-slate-900 leading-snug">{product.name}</b>
                        <span className="block text-[11px] text-slate-500 mt-0.5">
                          {typeof product.brand === "string"
                            ? product.brand
                            : (product.brand as any)?.name || product.brandName || "Generic"} · <span className="font-mono">HH-{product.id.slice(0, 8).toUpperCase()}</span>
                        </span>
                        <div className="mt-1.5 flex items-center justify-between">
                          <span className="text-xs font-semibold text-slate-700">
                            Current Stock: <b className="text-slate-900 font-black text-sm">{stockVal}</b>
                          </span>
                          <Badge
                            tone={
                              stockVal === 0
                                ? "danger"
                                : stockVal < 10
                                  ? "warning"
                                  : "success"
                            }
                          >
                            {stockVal === 0
                              ? "Out of stock"
                              : stockVal < 10
                                ? "Low stock"
                                : "In stock"}
                          </Badge>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenAdjust(product, -1)}
                        title="Deduct stock"
                        className="px-2.5 py-1 text-xs"
                      >
                        −1
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenAdjust(product, 10)}
                        title="Restock 10 units"
                        className="px-2.5 py-1 text-xs text-brand font-bold"
                      >
                        +10 Restock
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenAdjust(product, 1)}
                        title="Adjust quantity..."
                        className="px-2.5 py-1 text-xs"
                      >
                        Custom
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
            {showingLowStock && displayedProducts.length === 0 && (
              <p className="p-8 text-center text-sm font-medium text-slate-500">
                No low stock products found.
              </p>
            )}
            {displayedProducts.length > 0 && productPageCount > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-border px-4 py-3 sm:px-5 text-xs text-slate-500">
                <span>
                  Page {currentProductPage} of {productPageCount}
                  {showingLowStock ? ` · ${lowStockProducts.length} low stock products` : ` · ${productPagination.total} products`}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentProductPage <= 1 || productsLoading || lowStockLoading}
                    onClick={() => changeProductPage(currentProductPage - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentProductPage >= productPageCount || productsLoading || lowStockLoading}
                    onClick={() => changeProductPage(currentProductPage + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <section className="mt-8 overflow-hidden rounded-xl border border-border bg-white shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border p-4 sm:p-5">
          <div>
            <h2 className="text-base sm:text-lg font-black text-slate-900">Inventory movement history</h2>
            <p className="text-xs text-slate-500">Authoritative audit trail of stock adjustments, orders, and restocks</p>
          </div>
          <Button variant="ghost" onClick={() => fetchMovPage(movPagination.page)} title="Refresh history" className="self-start sm:self-auto">
            <RefreshCcw size={15} />
          </Button>
        </div>

        {movError && (
          <div className="m-4 rounded-lg bg-red-50 p-4 border border-red-200 text-sm text-red-700">
            {movError}
          </div>
        )}

        {movLoading ? (
          <div className="flex h-48 flex-col items-center justify-center gap-3">
            <Loader2 className="h-7 w-7 animate-spin text-brand" />
            <p className="text-sm font-medium text-slate-500">Querying movement history...</p>
          </div>
        ) : movements.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">
            No inventory movement records found yet.
          </div>
        ) : (
          <>
            {/* Desktop & Tablet Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="data-table w-full">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Product</th>
                    <th>Movement Type</th>
                    <th>Quantity Delta</th>
                    <th>Resulting Stock</th>
                    <th>Reason / Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((mov) => (
                    <tr key={mov.id}>
                      <td className="text-xs text-slate-500">
                        {new Date(mov.createdAt).toLocaleString()}
                      </td>
                      <td>
                        <b className="text-slate-900">{mov.productName || "Product"}</b>
                      </td>
                      <td>
                        <Badge tone={mov.movementType.includes("cancellation") || mov.movementType === "restock" ? "success" : mov.movementType.includes("deduction") ? "warning" : "blue"}>
                          {mov.movementType}
                        </Badge>
                      </td>
                      <td>
                        <b className={mov.quantityChange > 0 ? "text-emerald-700" : "text-rose-700"}>
                          {mov.quantityChange > 0 ? `+${mov.quantityChange}` : mov.quantityChange}
                        </b>
                      </td>
                      <td>
                        <span className="font-semibold text-slate-700">{mov.quantityAfter}</span>
                      </td>
                      <td className="text-xs text-slate-600 max-w-xs truncate" title={mov.reason}>
                        {mov.reason}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List */}
            <div className="block md:hidden divide-y divide-border">
              {movements.map((mov) => (
                <div key={mov.id} className="p-3.5 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <b className="text-xs font-bold text-slate-900 leading-snug">{mov.productName || "Product"}</b>
                    <Badge tone={mov.movementType.includes("cancellation") || mov.movementType === "restock" ? "success" : mov.movementType.includes("deduction") ? "warning" : "blue"}>
                      {mov.movementType}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 text-[11px]">{new Date(mov.createdAt).toLocaleString()}</span>
                    <span className="font-bold">
                      Delta: <b className={mov.quantityChange > 0 ? "text-emerald-700" : "text-rose-700"}>{mov.quantityChange > 0 ? `+${mov.quantityChange}` : mov.quantityChange}</b> (Stock: {mov.quantityAfter})
                    </span>
                  </div>
                  {mov.reason && (
                    <p className="text-[11px] text-slate-500 bg-slate-50 p-2 rounded border border-slate-100">{mov.reason}</p>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-border px-4 py-3 sm:px-5 sm:py-3 text-xs text-slate-500">
          <span>Showing {movements.length} of {movPagination.total} movement records</span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!movPagination.hasPrevPage || movLoading}
              onClick={() => fetchMovPage(movPagination.page - 1)}
            >
              Previous
            </Button>
            <span className="font-semibold text-slate-700">Page {movPagination.page} of {movPagination.totalPages}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={!movPagination.hasNextPage || movLoading}
              onClick={() => fetchMovPage(movPagination.page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </section>

      {adjustModalProduct && (
        <div className="modal-backdrop">
          <div className="modal">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-blue-50 text-brand">
              <Boxes />
            </span>
            <h2 className="mt-4 text-xl font-black">Adjust Inventory</h2>
            <p className="mt-1 text-sm text-slate-500">
              Update store stock for <strong>{adjustModalProduct.name}</strong> (Current: {adjustModalProduct.stock ?? 0}).
            </p>

            {adjustError && (
              <div className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700 border border-red-200 text-left">
                {adjustError}
              </div>
            )}

            <div className="mt-4 space-y-3 text-left">
              <label className="field-label block">
                Quantity change (positive or negative)
                <input
                  type="number"
                  className="field mt-1.5"
                  value={adjustQty}
                  onChange={(e) => setAdjustQty(Number(e.target.value))}
                />
              </label>

              <label className="field-label block">
                Movement Type
                <select
                  className="field mt-1.5"
                  value={adjustType}
                  onChange={(e) => setAdjustType(e.target.value as any)}
                >
                  <option value="restock">Restock (Received stock)</option>
                  <option value="adjustment">Manual Adjustment</option>
                  <option value="correction">Inventory Audit Correction</option>
                  <option value="return">Customer Return</option>
                </select>
              </label>

              <label className="field-label block">
                Adjustment Reason (required)
                <textarea
                  className="field mt-1.5"
                  rows={3}
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="e.g. Periodic cycle count discrepancy / shipment receipt"
                />
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="ghost"
                disabled={actionLoading}
                onClick={() => setAdjustModalProduct(null)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={actionLoading}
                onClick={handleConfirmAdjust}
              >
                {actionLoading ? "Submitting..." : "Apply Adjustment"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
