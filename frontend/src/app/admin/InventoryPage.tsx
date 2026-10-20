import {
  AlertTriangle,
  Boxes,
  Gauge,
  Loader2,
  RefreshCcw,
} from "lucide-react"
import React, { useState } from "react"
import {
  Badge,
  Button,
  PageHeader,
} from "../components"
import { type Product } from "../data"
import { useAdminInventory } from "../features/hooks/useAdminInventory"
import { useAdminProducts } from "../features/hooks/useAdminProducts"
import { useStore } from "../store"

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
  const { products, loading: productsLoading, refetch: refetchProducts } = useAdminProducts({ page: 1, limit: 50 })
  const { movements, pagination: movPagination, loading: movLoading, error: movError, actionLoading, adjustStock, fetchPage: fetchMovPage } = useAdminInventory()
  const { notify } = useStore()

  const [adjustModalProduct, setAdjustModalProduct] = useState<Product | null>(null)
  const [adjustQty, setAdjustQty] = useState<number>(1)
  const [adjustType, setAdjustType] = useState<"adjustment" | "restock" | "correction" | "return">("restock")
  const [adjustReason, setAdjustReason] = useState<string>("")
  const [adjustError, setAdjustError] = useState<string | null>(null)

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
    } catch (err: any) {
      setAdjustError(err?.message || "Failed to adjust inventory.")
    }
  }

  const totalUnits = products.reduce((sum, p) => sum + (p.stock || 0), 0)
  const lowStockCount = products.filter((p) => (p.stock || 0) > 0 && (p.stock || 0) < 10).length
  const outOfStockCount = products.filter((p) => (p.stock || 0) <= 0).length

  return (
    <>
      <PageHeader
        title="Inventory management"
        description="Persisted stock monitoring, authorized stock adjustments, and atomic inventory movement history."
        action={
          <Button variant="ghost" onClick={() => { refetchProducts(); fetchMovPage(1); }} title="Refresh inventory">
            <RefreshCcw size={15} />
          </Button>
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
          value={String(lowStockCount)}
          icon={<AlertTriangle />}
        />
        <MiniStat
          label="Out of stock items"
          value={String(outOfStockCount)}
          icon={<Gauge />}
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-white shadow-xs">
        <div className="border-b border-border p-4">
          <h2 className="text-base font-black text-slate-900">Current Stock by Product</h2>
          <p className="text-xs text-slate-500">Live authoritative inventory levels across catalog products</p>
        </div>

        {productsLoading ? (
          <div className="flex h-48 flex-col items-center justify-center gap-3">
            <Loader2 className="h-7 w-7 animate-spin text-brand" />
            <p className="text-sm font-medium text-slate-500">Loading catalog inventory...</p>
          </div>
        ) : (
          <table className="data-table">
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
              {products.map((product) => {
                const stockVal = product.stock ?? 0
                return (
                  <tr key={product.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <img
                          src={product.image || "https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=300&q=80"}
                          alt=""
                          className="h-10 w-10 rounded-lg object-cover bg-slate-100"
                        />
                        <div>
                          <b className="block text-slate-900">{product.name}</b>
                          <small className="text-slate-500">
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
        )}
      </div>

      <section className="mt-8 rounded-xl border border-border bg-white shadow-xs">
        <div className="flex items-center justify-between border-b border-border p-5">
          <div>
            <h2 className="text-base font-black text-slate-900">Inventory movement history</h2>
            <p className="text-xs text-slate-500">Authoritative audit trail of stock adjustments, orders, and restocks</p>
          </div>
          <Button variant="ghost" onClick={() => fetchMovPage(movPagination.page)} title="Refresh history">
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
          <div className="overflow-x-auto">
            <table className="data-table">
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
        )}

        <div className="flex items-center justify-between border-t border-border px-5 py-3 text-xs text-slate-500">
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
