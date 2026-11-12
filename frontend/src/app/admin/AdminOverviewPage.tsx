import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Boxes,
  CheckCircle2,
  ClipboardList,
  IndianRupee,
  Loader2,
  Package,
  RefreshCcw,
} from "lucide-react"
import { Link } from "react-router"
import {
  Badge,
  Button,
  PageHeader,
  statusTone,
} from "../components"
import { formatAdminPrice as formatPrice } from "./formatAdminPrice"
import { AdminPaymentQrCard } from "./AdminPaymentQrCard"
import { useAdminDashboard } from "../features/hooks/useAdminDashboard"
import { useEffect } from "react"

export function AdminOverviewPage() {
  const { stats, loading, error, refetch } = useAdminDashboard()

  useEffect(() => {
    const handleNewOrder = () => void refetch()
    window.addEventListener("admin:new-order", handleNewOrder)
    return () => window.removeEventListener("admin:new-order", handleNewOrder)
  }, [refetch])

  if (loading) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
        <p className="text-sm font-medium text-slate-500">Loading live operations metrics...</p>
      </div>
    )
  }

  if (error || !stats) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-red-500" />
        <h3 className="mt-2 text-base font-bold text-red-900">Failed to load operations metrics</h3>
        <p className="mt-1 text-sm text-red-700">{error || "Backend service unreachable"}</p>
        <Button onClick={refetch} variant="outline" className="mt-4">
          <RefreshCcw size={16} /> Retry
        </Button>
      </div>
    )
  }

  const overviewCards = [
    {
      label: "Total Orders",
      value: stats.orders.total,
      Icon: ClipboardList,
      subtitle: `${stats.orders.pendingFulfillment} pending fulfillment`,
      positive: true,
      href: "/admin/orders",
    },
    {
      label: "Total Order Value",
      value: formatPrice(stats.financials.totalOrderValue),
      Icon: IndianRupee,
      subtitle: "Persisted orders",
      positive: true,
    },
    {
      label: "Total Amount Collected",
      value: formatPrice(stats.financials.totalAmountCollected),
      Icon: CheckCircle2,
      subtitle: "Payments received",
      positive: true,
      href: "/admin/orders?paymentStatus=paid",
    },
    {
      label: "Total Remaining Due",
      value: formatPrice(stats.financials.totalAmountDue),
      Icon: IndianRupee,
      subtitle: "Across active orders",
      positive: true,
      href: "/admin/orders?paymentStatus=pending",
    },
    {
      label: "Catalog Products",
      value: stats.products.total,
      Icon: Package,
      subtitle: `${stats.products.active} active in store`,
      positive: true,
    },
    {
      label: "Low Stock Items",
      value: stats.products.lowStock,
      Icon: AlertTriangle,
      subtitle: "< 10 units available",
      positive: stats.products.lowStock === 0,
      href: "/admin/inventory?filter=low-stock",
    },
    {
      label: "Categories & Brands",
      value: `${stats.catalogue.categories} / ${stats.catalogue.brands}`,
      Icon: Boxes,
      subtitle: "Active taxonomy",
      positive: true,
    },
  ]

  const totalStatusCount = Object.values(stats.orders.byStatus).reduce((a, b) => a + b, 0) || 1
  const deliveredPercent = Math.round(((stats.orders.byStatus.delivered || 0) / totalStatusCount) * 100)
  const inProgressPercent = Math.round(
    (((stats.orders.byStatus.pending || 0) +
      (stats.orders.byStatus.confirmed || 0) +
      (stats.orders.byStatus.processing || 0) +
      (stats.orders.byStatus.shipped || 0)) /
      totalStatusCount) *
      100,
  )
  const cancelledPercent = Math.round(((stats.orders.byStatus.cancelled || 0) / totalStatusCount) * 100)

  return (
    <>
      <PageHeader
        title="Operations overview"
        description="Database-synchronized snapshot of store commerce, inventory, and order fulfillment."
        action={
          <div className="flex items-center gap-2">
            <Badge tone="success">Live Database</Badge>
            <Button variant="ghost" onClick={refetch} title="Refresh metrics">
              <RefreshCcw size={15} />
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
        {overviewCards.map(({ label, value, Icon, subtitle, positive, href }) => {
          const content = (
            <>
              <div className="flex items-start justify-between gap-2">
                <span className="grid h-10 w-10 sm:h-11 sm:w-11 place-items-center rounded-lg bg-blue-50 text-brand shrink-0">
                  <Icon size={20} />
                </span>
                <span
                  className={`flex items-center gap-1 text-[11px] sm:text-xs font-bold truncate ${
                    positive ? "text-emerald-700" : "text-amber-700"
                  }`}
                >
                  {positive ? <ArrowUpRight size={14} className="shrink-0" /> : <ArrowDownRight size={14} className="shrink-0" />}
                  <span className="truncate">{subtitle}</span>
                </span>
              </div>
              <b className="mt-4 sm:mt-5 block text-2xl sm:text-3xl font-black text-slate-900 truncate">{value}</b>
              <span className="text-xs sm:text-sm font-medium text-slate-500 block truncate">{label}</span>
            </>
          )
          const className = "rounded-xl border border-border bg-white p-4 sm:p-5 shadow-xs min-w-0"

          return href ? (
            <Link
              key={label}
              to={href}
              className={`${className} transition hover:border-brand/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand`}
            >
              {content}
            </Link>
          ) : (
            <div key={label} className={className}>
              {content}
            </div>
          )
        })}
      </div>

      <AdminPaymentQrCard />

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_0.6fr]">
        <div className="rounded-xl border border-border bg-white p-4 sm:p-6 shadow-xs min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-900">Order Fulfillment & Cash Collection</h2>
              <p className="text-xs text-slate-500">Live operational status breakdown</p>
            </div>
            <div className="self-start sm:self-auto">
              <Badge tone="blue">Synchronized</Badge>
            </div>
          </div>
          <div className="mt-5 sm:mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg bg-slate-50 p-3 sm:p-4 border border-border min-w-0">
              <span className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase block truncate">Pending Fulfillment</span>
              <p className="text-xl sm:text-2xl font-black text-slate-900 mt-1">{stats.orders.pendingFulfillment}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 sm:p-4 border border-border min-w-0">
              <span className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase block truncate">Awaiting Collection</span>
              <p className="text-xl sm:text-2xl font-black text-amber-700 mt-1">{stats.orders.awaitingCodCollection}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 sm:p-4 border border-border min-w-0">
              <span className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase block truncate">Delivered Orders</span>
              <p className="text-xl sm:text-2xl font-black text-emerald-700 mt-1">{stats.orders.byStatus.delivered || 0}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 sm:p-4 border border-border min-w-0">
              <span className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase block truncate">Cancelled Orders</span>
              <p className="text-xl sm:text-2xl font-black text-rose-700 mt-1">{stats.orders.byStatus.cancelled || 0}</p>
            </div>
          </div>

          <div className="mt-5 sm:mt-6 border-t border-border pt-4">
            <h3 className="text-xs sm:text-sm font-bold text-slate-800">Status Distribution</h3>
            <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                style={{ width: `${deliveredPercent}%` }}
                className="bg-emerald-600 transition-all"
                title={`Delivered: ${deliveredPercent}%`}
              />
              <div
                style={{ width: `${inProgressPercent}%` }}
                className="bg-brand transition-all"
                title={`In Progress: ${inProgressPercent}%`}
              />
              <div
                style={{ width: `${cancelledPercent}%` }}
                className="bg-rose-500 transition-all"
                title={`Cancelled: ${cancelledPercent}%`}
              />
            </div>
            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] sm:text-xs text-slate-500 font-medium">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-600 shrink-0" /> Delivered ({deliveredPercent}%)</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-brand shrink-0" /> In Progress ({inProgressPercent}%)</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-500 shrink-0" /> Cancelled ({cancelledPercent}%)</span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-white p-4 sm:p-6 shadow-xs min-w-0">
          <h2 className="text-base sm:text-lg font-black text-slate-900">Detailed Counts by Status</h2>
          <div className="mt-5 sm:mt-6 space-y-3">
            {Object.entries(stats.orders.byStatus).map(([statusKey, count]) => (
              <div key={statusKey} className="flex items-center justify-between border-b border-border/50 pb-2 text-xs sm:text-sm">
                <span className="capitalize font-semibold text-slate-700">{statusKey}</span>
                <Badge tone={statusKey === "delivered" ? "success" : statusKey === "cancelled" ? "danger" : "blue"}>
                  {count}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_0.6fr]">
        <div className="rounded-xl border border-border bg-white shadow-xs overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border p-4 sm:p-5">
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-900">Recent orders</h2>
              <p className="text-xs text-slate-500">Latest orders recorded in database</p>
            </div>
            <Link className="text-xs sm:text-sm font-bold text-brand hover:underline self-start sm:self-auto" to="/admin/orders">
              View all orders &rarr;
            </Link>
          </div>

          {/* Desktop & Tablet Table View */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="data-table w-full">
              <thead>
                <tr>
                  <th>Order Number</th>
                  <th>Date</th>
                  <th>Total</th>
                  <th>Payment</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentOrders.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-sm text-slate-400">
                      No customer orders recorded yet.
                    </td>
                  </tr>
                ) : (
                  stats.recentOrders.map((order) => (
                    <tr key={order.id}>
                      <td>
                        <Link to={`/admin/orders/${order.id}`} className="font-bold text-brand hover:underline">
                          {order.orderNumber}
                        </Link>
                      </td>
                      <td>{new Date(order.createdAt).toLocaleDateString()}</td>
                      <td>{formatPrice(order.totalPayable ?? order.totalAmount)}</td>
                      <td>
                        <Badge tone={order.paymentStatus === "paid" ? "success" : order.paymentStatus === "partially_paid" ? "blue" : "warning"}>
                          {order.paymentStatus.replace(/_/g, " ")}
                        </Badge>
                      </td>
                      <td>
                        <Badge tone={statusTone(order.status as any)}>
                          {order.status}
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="block sm:hidden divide-y divide-border">
            {stats.recentOrders.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                No customer orders recorded yet.
              </div>
            ) : (
              stats.recentOrders.map((order) => (
                <div key={order.id} className="p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <Link to={`/admin/orders/${order.id}`} className="text-xs font-bold text-brand hover:underline">
                      {order.orderNumber}
                    </Link>
                    <span className="text-xs font-black text-slate-900">
                      {formatPrice(order.totalPayable ?? order.totalAmount)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>{new Date(order.createdAt).toLocaleDateString()}</span>
                    <div className="flex items-center gap-1.5">
                      <Badge tone={order.paymentStatus === "paid" ? "success" : order.paymentStatus === "partially_paid" ? "blue" : "warning"}>
                        {order.paymentStatus.replace(/_/g, " ")}
                      </Badge>
                      <Badge tone={statusTone(order.status as any)}>
                        {order.status}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-white p-4 sm:p-5 shadow-xs">
          <h2 className="text-base sm:text-lg font-black text-slate-900">Customer & Catalogue Summary</h2>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-3">
            <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3 sm:p-3.5 border border-slate-100">
              <span className="text-xs sm:text-sm font-semibold text-slate-600">Registered Customers</span>
              <b className="text-base sm:text-lg text-slate-900">{stats.customers.total}</b>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3 sm:p-3.5 border border-slate-100">
              <span className="text-xs sm:text-sm font-semibold text-slate-600">Categories</span>
              <b className="text-base sm:text-lg text-slate-900">{stats.catalogue.categories}</b>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3 sm:p-3.5 border border-slate-100">
              <span className="text-xs sm:text-sm font-semibold text-slate-600">Brands</span>
              <b className="text-base sm:text-lg text-slate-900">{stats.catalogue.brands}</b>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-amber-50 p-3 sm:p-3.5 border border-amber-200">
              <span className="text-xs sm:text-sm font-semibold text-amber-900">Low Stock Alert Count</span>
              <b className="text-base sm:text-lg text-amber-900">{stats.products.lowStock}</b>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
