import {
  Calendar,
  Loader2,
  Phone,
  RefreshCcw,
  Search,
  ShoppingBag,
  X,
} from "lucide-react"
import { useEffect, useState } from "react"
import { Link, useSearchParams } from "react-router"
import {
  Badge,
  Button,
  PageHeader,
  statusTone,
} from "../components"
import { useAdminOrders } from "../features/hooks/useAdminOrders"
import { formatAdminPrice as formatPrice } from "./formatAdminPrice"

function getRemainingDue(order: {
  amountDue?: number
  amountCollected?: number
  totalAmount: number
  totalPayable?: number
  paymentStatus: string
  status: string
}) {
  if (order.amountDue != null) return order.amountDue
  if (order.paymentStatus === "paid" || order.status === "cancelled") return 0
  return Math.max(0, (order.totalPayable ?? order.totalAmount) - (order.amountCollected ?? 0))
}

export function AdminOrdersPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialPaymentStatus = searchParams.get("paymentStatus") || ""
  const initialUserId = searchParams.get("userId") || ""
  const [selectedUserId, setSelectedUserId] = useState<string>(initialUserId)
  const [selectedStatus, setSelectedStatus] = useState<string>("")
  const [selectedPaymentStatus, setSelectedPaymentStatus] = useState<string>(
    ["pending", "paid", "failed", "cancelled"].includes(initialPaymentStatus)
      || initialPaymentStatus === "partially_paid"
      ? initialPaymentStatus
      : "",
  )
  const [selectedDate, setSelectedDate] = useState<string>("")
  const [searchTerm, setSearchTerm] = useState<string>("")

  const { orders, pagination, setQuery, loading, error, refetch } = useAdminOrders({
    page: 1,
    limit: 10,
    status: undefined,
    userId: initialUserId || undefined,
    sortBy: "created_at",
    sortOrder: "desc",
    paymentStatus: selectedPaymentStatus
      ? (selectedPaymentStatus as "pending" | "partially_paid" | "paid" | "failed" | "cancelled")
      : undefined,
  })

  useEffect(() => {
    const handleNewOrder = () => void refetch()
    window.addEventListener("admin:new-order", handleNewOrder)
    return () => window.removeEventListener("admin:new-order", handleNewOrder)
  }, [refetch])

  const handleStatusChange = (status: string) => {
    setSelectedStatus(status)
    setQuery((prev) => ({
      ...prev,
      page: 1,
      status: (status as any) || undefined,
    }))
  }

  const handlePaymentStatusChange = (paymentStatus: string) => {
    setSelectedPaymentStatus(paymentStatus)
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous)
      if (paymentStatus) next.set("paymentStatus", paymentStatus)
      else next.delete("paymentStatus")
      return next
    })
    setQuery((prev) => ({
      ...prev,
      page: 1,
      paymentStatus: (paymentStatus as "pending" | "partially_paid" | "paid" | "failed" | "cancelled") || undefined,
    }))
  }

  const handleDateChange = (dateStr: string) => {
    setSelectedDate(dateStr)
    if (!dateStr) {
      setQuery((prev) => ({
        ...prev,
        page: 1,
        startDate: undefined,
        endDate: undefined,
      }))
      return
    }

    const start = new Date(`${dateStr}T00:00:00.000Z`).toISOString()
    const end = new Date(`${dateStr}T23:59:59.999Z`).toISOString()

    setQuery((prev) => ({
      ...prev,
      page: 1,
      startDate: start,
      endDate: end,
    }))
  }

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > pagination.totalPages) return
    setQuery((prev) => ({ ...prev, page: newPage }))
  }

  const filteredOrders = orders.filter((order) => {
    if (!searchTerm.trim()) return true
    return (
      order.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.id.toLowerCase().includes(searchTerm.toLowerCase())
    )
  })

  return (
    <>
      <PageHeader
        title="Order management"
        description="Review orders, monitor fulfillment, and track collected payments and outstanding balances."
        action={
          <div className="flex items-center gap-2">
            <Link to="/admin/orders/new-phone">
              <Button><Phone size={15} /> Phone order</Button>
            </Link>
            <Button variant="ghost" onClick={refetch} title="Refresh orders">
              <RefreshCcw size={15} />
            </Button>
          </div>
        }
      />

      {selectedUserId && (
        <div className="mb-4 flex items-center justify-between rounded-lg bg-amber-50 px-4 py-2.5 border border-amber-200 text-xs text-amber-900">
          <span>
            Filtering orders for customer account <b>{selectedUserId}</b>
          </span>
          <button
            type="button"
            onClick={() => {
              setSelectedUserId("")
              setSearchParams((prev) => {
                const next = new URLSearchParams(prev)
                next.delete("userId")
                return next
              })
              setQuery((prev) => ({ ...prev, page: 1, userId: undefined }))
            }}
            className="font-bold underline hover:text-amber-950 ml-3"
          >
            Show All Orders
          </button>
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-lg bg-red-50 p-4 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-white shadow-xs">
        {/* Responsive Control Bar */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 border-b border-border p-3.5 sm:p-4">
          {/* Search box */}
          <div className="relative w-full xl:max-w-xs flex-1">
            <Search
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              size={17}
            />
            <input
              className="field !pl-10 w-full text-xs sm:text-sm"
              placeholder="Search by order # or ID"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Filters & Calendar Date Picker */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 w-full xl:w-auto">
            {/* Calendar Single-Day Date Selector */}
            <div className="relative flex items-center">
              <Calendar className="absolute left-3 text-slate-400 pointer-events-none" size={15} />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => handleDateChange(e.target.value)}
                className="field !pl-9 !pr-7 w-full text-xs text-slate-700"
                title="Filter by exact date"
              />
              {selectedDate && (
                <button
                  type="button"
                  onClick={() => handleDateChange("")}
                  className="absolute right-2 text-slate-400 hover:text-slate-600 p-0.5 rounded"
                  title="Clear date filter"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Fulfillment Status */}
            <select
              className="field w-full text-xs sm:text-sm"
              value={selectedStatus}
              onChange={(e) => handleStatusChange(e.target.value)}
              aria-label="Filter by fulfillment status"
            >
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
              <option value="processing">Processing</option>
              <option value="shipped">Shipped</option>
              <option value="delivered">Delivered</option>
              <option value="cancelled">Cancelled</option>
            </select>

            {/* Payment Status */}
            <select
              className="field w-full text-xs sm:text-sm"
              value={selectedPaymentStatus}
              onChange={(e) => handlePaymentStatusChange(e.target.value)}
              aria-label="Filter by payment status"
            >
              <option value="">All payments</option>
              <option value="pending">Payment pending</option>
              <option value="partially_paid">Partially paid</option>
              <option value="paid">Paid</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Payment cancelled</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="flex h-56 flex-col items-center justify-center gap-3">
            <Loader2 className="h-7 w-7 animate-spin text-brand" />
            <p className="text-sm font-medium text-slate-500">Querying store orders...</p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="py-16 text-center">
            <ShoppingBag className="mx-auto h-10 w-10 text-slate-300" />
            <h3 className="mt-2 text-base font-bold text-slate-700">No orders found</h3>
            <p className="text-xs text-slate-500 mt-1">
              {selectedDate
                ? `No orders match date "${selectedDate}".`
                : "No orders match the selected criteria."}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop & Tablet Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="data-table w-full">
                <thead>
                  <tr>
                    <th>Order Reference</th>
                    <th>Date</th>
                    <th>Total</th>
                    <th>Payment Method</th>
                    <th>Payment Status</th>
                    <th>Fulfillment Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((order) => (
                    <tr key={order.id}>
                      <td>
                        <div className="min-w-0">
                          <b className="block text-slate-900 truncate">{order.orderNumber}</b>
                          <small className="font-mono text-xs text-slate-400">
                            {order.id.slice(0, 8)}...
                          </small>
                        </div>
                      </td>
                      <td>{new Date(order.createdAt).toLocaleDateString()}</td>
                      <td>
                        <b className="text-slate-900">{formatPrice(order.totalPayable ?? order.totalAmount)}</b>
                      </td>
                      <td>
                        <span className="uppercase font-semibold text-xs text-slate-700">
                          {order.paymentMethod}
                        </span>
                      </td>
                      <td>
                        <div className="space-y-1">
                          <Badge tone={order.paymentStatus === "paid" ? "success" : order.paymentStatus === "cancelled" ? "danger" : order.paymentStatus === "partially_paid" ? "blue" : "warning"}>
                            {order.paymentStatus.replace(/_/g, " ")}
                          </Badge>
                          <small className="block font-semibold text-amber-700">
                            Due: {formatPrice(getRemainingDue(order))}
                          </small>
                        </div>
                      </td>
                      <td>
                        <Badge tone={statusTone(order.status as any)}>
                          {order.status}
                        </Badge>
                      </td>
                      <td>
                        <Link to={`/admin/orders/${order.id}`}>
                          <Button variant="outline" className="py-1.5 px-3 text-xs">
                            Manage
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List */}
            <div className="block md:hidden divide-y divide-border">
              {filteredOrders.map((order) => (
                <div key={order.id} className="p-3.5 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <b className="block text-xs sm:text-sm font-bold text-slate-900 truncate">{order.orderNumber}</b>
                      <small className="font-mono text-[10px] text-slate-400">
                        ID: {order.id.slice(0, 8)}...
                      </small>
                    </div>
                    <span className="text-xs sm:text-sm font-black text-slate-900 shrink-0">
                      {formatPrice(order.totalPayable ?? order.totalAmount)}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-1">
                    <span className="text-slate-500 text-[11px]">
                      {new Date(order.createdAt).toLocaleDateString()} · <span className="uppercase font-semibold text-slate-700">{order.paymentMethod}</span>
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Badge tone={order.paymentStatus === "paid" ? "success" : order.paymentStatus === "cancelled" ? "danger" : order.paymentStatus === "partially_paid" ? "blue" : "warning"}>
                        {order.paymentStatus.replace(/_/g, " ")}
                      </Badge>
                      <Badge tone={statusTone(order.status as any)}>
                        {order.status}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-right text-[11px] font-semibold text-amber-700">
                    Remaining / Due: {formatPrice(getRemainingDue(order))}
                  </p>

                  <div className="flex items-center justify-end pt-1 border-t border-slate-100">
                    <Link to={`/admin/orders/${order.id}`} className="w-full">
                      <Button variant="outline" className="w-full py-1.5 text-xs font-bold">
                        Manage Order &rarr;
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-border px-4 py-3 sm:px-5 sm:py-4 text-xs text-slate-500">
          <span>
            Showing {filteredOrders.length} of {pagination.total} orders
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
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
              disabled={!pagination.hasNextPage || loading}
              onClick={() => handlePageChange(pagination.page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
