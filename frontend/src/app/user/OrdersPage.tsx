import { AlertCircle, Loader2, RefreshCcw } from "lucide-react"
import { Link, useNavigate } from "react-router"
import { useAuth } from "../authContext"
import { Badge, Button, EmptyState, PageHeader, formatPrice } from "../components"
import { useOrders } from "../features/hooks/useOrders"

export function OrdersPage() {
  const { isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const {
    orders,
    loading,
    error,
    statusFilter,
    setStatusFilter,
    refetch,
  } = useOrders(isAuthenticated)

  const formatOrderDate = (isoStr: string) => {
    try {
      return new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(new Date(isoStr))
    } catch {
      return isoStr
    }
  }

  const getStatusBadgeTone = (status: string) => {
    switch (status?.toLowerCase()) {
      case "delivered":
        return "success"
      case "cancelled":
        return "danger"
      case "shipped":
      case "processing":
      case "confirmed":
        return "blue"
      default:
        return "warning"
    }
  }

  return (
    <div className="container-wide py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <PageHeader
          title="My Orders"
          description="View your order history, review immutable invoices, and track live order progress."
        />
        <Button variant="outline" onClick={() => refetch()} className="flex items-center gap-2">
          <RefreshCcw size={15} /> Refresh Orders
        </Button>
      </div>

      <div className="mb-6 flex gap-2 overflow-x-auto">
        {["All Orders", "In Progress", "Delivered", "Cancelled"].map((item) => (
          <button
            key={item}
            onClick={() => setStatusFilter(item)}
            className={`tab-pill ${statusFilter === item ? "active" : ""}`}
          >
            {item}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-16 text-center text-slate-500">
          <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-brand" />
          <p className="font-semibold">Loading your orders...</p>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-red-800">
          <AlertCircle className="mx-auto mb-2 h-7 w-7 text-red-600" />
          <p className="font-bold">Unable to load orders</p>
          <p className="text-sm mt-1">{error}</p>
          <Button onClick={() => refetch()} className="mt-4">
            Retry
          </Button>
        </div>
      ) : orders.length === 0 ? (
        <div className="container-narrow py-12">
          <EmptyState
            title="No orders found"
            text={
              statusFilter === "All Orders"
                ? "You have not placed any orders yet. Browse our genuine hardware and plumbing catalogue."
                : `No orders currently match filter "${statusFilter}".`
            }
            action={
              <Link to="/products">
                <Button>Browse products</Button>
              </Link>
            }
          />
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <article
              key={order.id}
              className="overflow-hidden rounded-xl border border-border bg-white shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-slate-50 px-5 py-3 text-xs">
                <div className="flex flex-wrap gap-5">
                  <span>
                    <small className="block text-slate-500 font-semibold">ORDER</small>
                    <b className="font-mono text-ink">{order.orderNumber}</b>
                  </span>
                  <span>
                    <small className="block text-slate-500 font-semibold">PLACED</small>
                    <b>{formatOrderDate(order.createdAt)}</b>
                  </span>
                  <span>
                    <small className="block text-slate-500 font-semibold">TOTAL</small>
                    <b className="text-ink">{formatPrice(order.totalAmount)}</b>
                  </span>
                  <span>
                    <small className="block text-slate-500 font-semibold">PAYMENT</small>
                    <b className="capitalize text-slate-700">Cash on Delivery ({order.paymentStatus})</b>
                  </span>
                </div>
                <Badge tone={getStatusBadgeTone(order.status) as any}>
                  <span className="capitalize">{order.status}</span>
                </Badge>
              </div>

              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5">
                <div>
                  <h3 className="font-extrabold text-ink text-base">
                    Order Reference: {order.orderNumber}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {order.itemCount} line item(s) · Total quantity: {order.totalQuantity} unit(s)
                  </p>
                  <p className="mt-2 text-xs font-semibold text-slate-600">
                    {order.status === "delivered"
                      ? "Order successfully delivered to customer"
                      : order.status === "cancelled"
                        ? "This order was cancelled"
                        : "Your order is confirmed and being processed by the warehouse"}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                  <Button
                    onClick={() => navigate(`/my-orders/${order.id}`)}
                    variant="outline"
                  >
                    View Details
                  </Button>
                  {!["delivered", "cancelled"].includes(order.status) && (
                    <Link to={`/track-order/${order.id}`}>
                      <Button>Track Order</Button>
                    </Link>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
