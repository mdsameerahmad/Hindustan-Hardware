import {
  Edit3,
  Eye,
  Loader2,
  Package,
  Plus,
  RefreshCcw,
  Search,
  Trash2,
} from "lucide-react"
import { useState } from "react"
import { Link } from "react-router"
import {
  Badge,
  Button,
  PageHeader,
  formatPrice,
} from "../components"
import { type Product } from "../data"
import { useAdminCategories } from "../features/hooks/useAdminCategories"
import { useAdminProducts } from "../features/hooks/useAdminProducts"
import { ProductImage } from "../features/components/ProductImage"

export function AdminProductsPage() {
  const { categories: backendCategories } = useAdminCategories()
  const [searchQuery, setSearchQuery] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("")
  const [pendingDelete, setPendingDelete] = useState<Product | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const {
    products,
    pagination,
    loading,
    error,
    actionLoading,
    setFilters,
    deleteProduct,
    refetch,
  } = useAdminProducts({
    page: 1,
    limit: 15,
  })

  // Debounce search input or submit on Enter/typing
  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    setFilters((prev) => ({
      ...prev,
      page: 1,
      search: value.trim() || undefined,
    }))
  }

  const handleCategoryChange = (slug: string) => {
    setCategoryFilter(slug)
    setFilters((prev) => ({
      ...prev,
      page: 1,
      category: slug || undefined,
    }))
  }

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > pagination.totalPages) return
    setFilters((prev) => ({ ...prev, page: newPage }))
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    setDeleteError(null)
    try {
      await deleteProduct(pendingDelete.id)
      setPendingDelete(null)
    } catch (err: any) {
      setDeleteError(err?.message || "Failed to delete product from database.")
    }
  }

  return (
    <>
      <PageHeader
        title="Product catalog"
        description="Authoritative database product records, search, pagination, and inventory status."
        action={
          <Link to="/admin/products/new">
            <Button>
              <Plus size={16} />
              Add Product
            </Button>
          </Link>
        }
      />

      <div className="rounded-xl border border-border bg-white shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border p-3.5 sm:p-4">
          <div className="relative w-full sm:max-w-md flex-1">
            <Search
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              size={18}
            />
            <input
              className="field !pl-10 w-full text-xs sm:text-sm"
              value={searchQuery}
              onChange={(event) => handleSearchChange(event.target.value)}
              placeholder="Search products by name or description..."
            />
          </div>

          <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
            <select
              className="field flex-1 sm:w-auto text-xs sm:text-sm"
              value={categoryFilter}
              onChange={(e) => handleCategoryChange(e.target.value)}
            >
              <option value="">All categories</option>
              {backendCategories.map((item) => (
                <option key={item.id} value={item.slug}>
                  {item.name}
                </option>
              ))}
            </select>

            <Button variant="ghost" onClick={refetch} title="Refresh products" className="p-2 shrink-0">
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
            <p className="text-sm font-medium text-slate-500">Querying product catalog...</p>
          </div>
        ) : products.length === 0 ? (
          <div className="py-16 text-center">
            <Package className="mx-auto h-10 w-10 text-slate-300" />
            <h3 className="mt-2 text-base font-bold text-slate-700">No products found</h3>
            <p className="text-xs text-slate-500 mt-1">Try adjusting your search or category filter.</p>
          </div>
        ) : (
          <>
            {/* Desktop & Tablet Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="data-table w-full">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>SKU</th>
                    <th>Category</th>
                    <th>Price</th>
                    <th>Stock</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => (
                    <tr key={product.id}>
                      <td>
                        <div className="flex min-w-56 items-center gap-3">
                          <ProductImage
                            src={product.image}
                            alt=""
                            className="h-11 w-11 rounded-lg object-contain bg-slate-100 p-1 shrink-0"
                          />
                          <div className="min-w-0">
                            <b className="block font-semibold text-slate-900 truncate">{product.name}</b>
                            <small className="text-slate-500 truncate block">
                              {typeof product.brand === "string"
                                ? product.brand
                                : (product.brand as any)?.name || product.brandName || "Generic"}
                            </small>
                          </div>
                        </div>
                      </td>
                      <td className="font-mono text-xs">{product.id ? `HH-${product.id.slice(0, 8).toUpperCase()}` : "—"}</td>
                      <td>
                        {typeof product.category === "string"
                          ? product.category
                          : (product.category as any)?.name || "Unassigned"}
                      </td>
                      <td>
                        <b className="text-slate-900">{formatPrice(product.price)}</b>
                      </td>
                      <td>
                        <span
                          className={
                            product.stock < 10 ? "font-bold text-amber-700" : "text-slate-700"
                          }
                        >
                          {product.stock ?? 0}
                        </span>
                      </td>
                      <td>
                        <Badge
                          tone={product.active === false ? "neutral" : "success"}
                        >
                          {product.active === false ? "Inactive" : "Active"}
                        </Badge>
                      </td>
                      <td>
                        <div className="flex gap-1">
                          <Link to={`/product/${product.slug || product.id}`}>
                            <button className="table-action" title="View Customer Storefront Page">
                              <Eye size={16} />
                            </button>
                          </Link>
                          <Link to={`/admin/products/${product.id}/edit`}>
                            <button className="table-action" title="Edit Product">
                              <Edit3 size={16} />
                            </button>
                          </Link>
                          <button
                            onClick={() => {
                              setDeleteError(null)
                              setPendingDelete(product)
                            }}
                            className="table-action text-red-600 hover:bg-red-50"
                            title="Delete Product"
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
            <div className="block md:hidden divide-y divide-border">
              {products.map((product) => (
                <div key={product.id} className="p-3.5 space-y-3">
                  <div className="flex items-start gap-3">
                    <ProductImage
                      src={product.image}
                      alt=""
                      className="h-12 w-12 rounded-lg object-contain bg-slate-100 p-1 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <b className="block text-xs font-bold text-slate-900 leading-snug">{product.name}</b>
                      <span className="block text-[11px] text-slate-500 mt-0.5">
                        {typeof product.brand === "string"
                          ? product.brand
                          : (product.brand as any)?.name || product.brandName || "Generic"} · {typeof product.category === "string" ? product.category : (product.category as any)?.name || "Unassigned"}
                      </span>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="text-xs font-black text-slate-900">{formatPrice(product.price)}</span>
                        <Badge tone={product.active === false ? "neutral" : "success"}>
                          {product.active === false ? "Inactive" : "Active"}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-xs">
                    <span className={product.stock < 10 ? "font-bold text-amber-700" : "text-slate-600"}>
                      Stock: {product.stock ?? 0}
                    </span>
                    <div className="flex gap-2">
                      <Link to={`/product/${product.slug || product.id}`}>
                        <button className="table-action" title="View Storefront Page">
                          <Eye size={15} />
                        </button>
                      </Link>
                      <Link to={`/admin/products/${product.id}/edit`}>
                        <button className="table-action" title="Edit Product">
                          <Edit3 size={15} />
                        </button>
                      </Link>
                      <button
                        onClick={() => {
                          setDeleteError(null)
                          setPendingDelete(product)
                        }}
                        className="table-action text-red-600 hover:bg-red-50"
                        title="Delete Product"
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

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-border px-4 py-3 sm:px-5 sm:py-4 text-xs text-slate-500">
          <span>
            Showing {products.length} of {pagination.total} products
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!pagination.hasPrevPage || loading}
              onClick={() => handlePageChange(pagination.page - 1)}
            >
              Previous
            </Button>
            <span className="font-semibold text-slate-700">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={!pagination.hasNextPage || loading}
              onClick={() => handlePageChange(pagination.page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      {pendingDelete && (
        <div className="modal-backdrop">
          <div className="modal">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-red-50 text-red-600">
              <Trash2 />
            </span>
            <h2 className="mt-4 text-xl font-black">Delete this product?</h2>
            <p className="mt-2 text-sm text-slate-500">
              <strong className="text-slate-800">{pendingDelete.name}</strong> will be permanently deleted from the database. This action cannot be undone if no orders reference it.
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
                {actionLoading ? "Deleting..." : "Delete Product"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
