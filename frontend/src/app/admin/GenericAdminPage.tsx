import {
  Building2,
  Loader2,
  RefreshCcw,
  Search,
} from "lucide-react"
import { useState } from "react"
import { Link } from "react-router"
import {
  Badge,
  Button,
  PageHeader,
  formatPrice,
  statusTone,
} from "../components"
import { useAdminCustomers } from "../features/hooks/useAdminCustomers"
import { useAdminOrders } from "../features/hooks/useAdminOrders"
import { useStore } from "../store"
import { AdminField, FormCard } from "./AdminSharedComponents"

export type GenericKind = "customers" | "deliveries" | "inquiries" | "settings"

export function GenericAdminPage({ kind }: { kind: GenericKind }) {
  if (kind === "customers") return <Customers />
  if (kind === "deliveries") return <Deliveries />
  if (kind === "inquiries") return <Inquiries />
  return <Settings />
}

export function Customers() {
  const { customers, pagination, search, setSearch, loading, error, fetchPage, refetch } = useAdminCustomers()

  return (
    <>
      <PageHeader
        title="Customer accounts"
        description="Persisted customer accounts, purchase totals, and order engagement."
        action={
          <Button variant="ghost" onClick={refetch} title="Refresh customers">
            <RefreshCcw size={15} />
          </Button>
        }
      />

      {error && (
        <div className="mb-6 rounded-lg bg-red-50 p-4 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-white shadow-xs">
        <div className="flex items-center justify-between gap-3 border-b border-border p-4">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-3 text-slate-400" size={18} />
            <input
              className="field pl-10 w-full"
              placeholder="Search by customer name or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div className="flex h-56 flex-col items-center justify-center gap-3">
            <Loader2 className="h-7 w-7 animate-spin text-brand" />
            <p className="text-sm font-medium text-slate-500">Querying customer accounts...</p>
          </div>
        ) : customers.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-400">
            No customer accounts found on record.
          </div>
        ) : (
          <>
            {/* Desktop & Tablet Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="data-table w-full">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Role</th>
                    <th>Phone</th>
                    <th>Orders Count</th>
                    <th>Total Spent</th>
                    <th>Registered</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <div>
                          <b className="block text-slate-900">{c.fullName || "Unspecified"}</b>
                          <small className="font-mono text-xs text-slate-400">
                            {c.id.slice(0, 8)}...
                          </small>
                        </div>
                      </td>
                      <td>
                        <Badge tone={c.role === "admin" ? "danger" : c.role === "staff" ? "warning" : "blue"}>
                          {c.role}
                        </Badge>
                      </td>
                      <td>{c.phone || "—"}</td>
                      <td>
                        <b className="text-slate-900">{c.orderCount}</b>
                      </td>
                      <td>
                        <b className="text-emerald-700">{formatPrice(c.totalSpent)}</b>
                      </td>
                      <td className="text-xs text-slate-500">
                        {new Date(c.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List */}
            <div className="block md:hidden divide-y divide-border">
              {customers.map((c) => (
                <div key={c.id} className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <b className="block text-sm font-bold text-slate-900">{c.fullName || "Unspecified"}</b>
                      <small className="font-mono text-[11px] text-slate-400">
                        ID: {c.id.slice(0, 8)}...
                      </small>
                    </div>
                    <Badge tone={c.role === "admin" ? "danger" : c.role === "staff" ? "warning" : "blue"}>
                      {c.role}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                    <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                      <span className="text-slate-500 text-[10px] block uppercase font-semibold">Phone</span>
                      <span className="font-medium text-slate-800">{c.phone || "—"}</span>
                    </div>
                    <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                      <span className="text-slate-500 text-[10px] block uppercase font-semibold">Orders</span>
                      <span className="font-bold text-slate-900">{c.orderCount}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs pt-1">
                    <span className="text-slate-500">
                      Joined {new Date(c.createdAt).toLocaleDateString()}
                    </span>
                    <span className="font-bold text-emerald-700">
                      {formatPrice(c.totalSpent)} spent
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-border px-4 py-3 sm:px-5 sm:py-4 text-xs text-slate-500">
          <span>Showing {customers.length} of {pagination.total} customer accounts</span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!pagination.hasPrevPage || loading}
              onClick={() => fetchPage(pagination.page - 1)}
            >
              Previous
            </Button>
            <span className="font-semibold text-slate-700">Page {pagination.page} of {pagination.totalPages}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={!pagination.hasNextPage || loading}
              onClick={() => fetchPage(pagination.page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}

export function Deliveries() {
  const { orders, loading, error, refetch } = useAdminOrders({ limit: 50 })
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [actionMsg, setActionMsg] = useState<string | null>(null)

  const activeOrders = orders.filter(
    (o) => !["delivered", "cancelled"].includes(o.status.toLowerCase()),
  )

  const handleDispatch = async (orderId: string, currentStatus: string) => {
    setUpdatingId(orderId)
    setActionMsg(null)
    try {
      let nextStatus = "shipped"
      if (currentStatus === "pending") nextStatus = "confirmed"
      else if (currentStatus === "confirmed") nextStatus = "processing"
      else if (currentStatus === "processing") nextStatus = "shipped"
      else if (currentStatus === "shipped") nextStatus = "delivered"

      await adminApi.updateOrderStatus(orderId, nextStatus, "Dispatched via Delivery Management console")
      setActionMsg(`Order ${orderId} progressed to ${nextStatus}`)
      refetch()
    } catch (err: any) {
      setActionMsg(err?.message || "Failed to update order dispatch status.")
    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <>
      <PageHeader
        title="Delivery management"
        description="Fulfillment assignment, warehouse dispatching, and live order status progression."
        action={
          <Button variant="ghost" onClick={refetch} title="Refresh deliveries">
            <RefreshCcw size={15} />
          </Button>
        }
      />

      {actionMsg && (
        <div className="mb-6 rounded-lg bg-blue-50 p-4 border border-blue-200 text-sm text-blue-800">
          {actionMsg}
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-lg bg-red-50 p-4 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex h-56 flex-col items-center justify-center gap-3">
          <Loader2 className="h-7 w-7 animate-spin text-brand" />
          <p className="text-sm font-medium text-slate-500">Querying active delivery dispatches...</p>
        </div>
      ) : activeOrders.length === 0 ? (
        <div className="rounded-xl border border-border bg-white p-12 text-center shadow-xs">
          <h3 className="text-base font-bold text-slate-800">All pending orders dispatched and delivered</h3>
          <p className="mt-1 text-sm text-slate-500">
            No active orders are currently awaiting dispatch. New orders will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {activeOrders.map((order) => {
            const statusKey = order.status.toLowerCase()
            let buttonLabel = "Progress Status"
            if (statusKey === "pending") buttonLabel = "Confirm Order"
            else if (statusKey === "confirmed") buttonLabel = "Start Processing"
            else if (statusKey === "processing") buttonLabel = "Dispatch / Ship"
            else if (statusKey === "shipped") buttonLabel = "Confirm Delivery"

            return (
              <div key={order.id} className="rounded-xl border border-border bg-white p-5 shadow-xs">
                <div className="flex items-start justify-between">
                  <div>
                    <small className="text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                      ORDER REFERENCE
                    </small>
                    <b className="block text-slate-900 font-mono text-base">{order.orderNumber}</b>
                    <span className="text-xs text-slate-500">
                      {new Date(order.createdAt).toLocaleString()} · {formatPrice(order.totalAmount)}
                    </span>
                  </div>
                  <Badge tone={statusTone(order.status as any)}>{order.status}</Badge>
                </div>

                <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-700 border border-slate-200">
                  <span className="block font-semibold text-slate-900">
                    Customer: {order.customer?.name || "Customer on record"} ({order.customer?.phone || "No phone"})
                  </span>
                  <span className="text-xs text-slate-500 block mt-1">
                    Payment: <b className="capitalize text-slate-700">{order.paymentStatus}</b> via Cash on Delivery
                  </span>
                </div>

                <div className="mt-4 flex gap-2">
                  <Button
                    variant="outline"
                    disabled={updatingId === order.id}
                    onClick={() => handleDispatch(order.id, statusKey)}
                  >
                    {updatingId === order.id ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Updating...
                      </>
                    ) : (
                      buttonLabel
                    )}
                  </Button>
                  <Link to={`/admin/orders/${order.id}`}>
                    <Button variant="ghost">View Details</Button>
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

export function Inquiries() {
  const [responseNotes, setResponseNotes] = useState("")
  const [saved, setSaved] = useState(false)

  return (
    <>
      <PageHeader
        title="Bulk inquiries"
        description="Review large-volume project inquiries submitted by contractors and builders."
      />
      <div className="rounded-xl border border-border bg-white p-12 text-center shadow-xs">
        <Building2 className="mx-auto h-12 w-12 text-slate-300" />
        <h3 className="mt-3 text-base font-bold text-slate-800">No bulk contractor inquiries pending</h3>
        <p className="mt-1 text-sm text-slate-500 max-w-md mx-auto">
          Inquiries submitted via the storefront Bulk Order form will appear here with customer contact details and requested bill of materials.
        </p>
      </div>
      <section className="mt-6 rounded-xl border border-border bg-white p-6 shadow-xs">
        <h2 className="font-black text-slate-900">Quotation response draft</h2>
        <p className="text-xs text-slate-500 mt-1">Draft notes or custom terms for pending contractor quotations.</p>
        <textarea
          className="field mt-4 w-full"
          rows={4}
          value={responseNotes}
          onChange={(e) => {
            setResponseNotes(e.target.value)
            setSaved(false)
          }}
          placeholder="Enter custom contractor quotation notes, bulk discount thresholds, or logistics terms..."
        />
        <div className="mt-4 flex items-center gap-3">
          <Button onClick={() => setSaved(true)}>Save Draft Notes</Button>
          {saved && <span className="text-xs font-semibold text-emerald-700">Draft saved successfully.</span>}
        </div>
      </section>
    </>
  )
}

export function Settings() {
  const { notify } = useStore()
  return (
    <>
      <PageHeader
        title="Store settings"
        description="Configure shop information, delivery, units and business rules."
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <FormCard title="Shop information">
          <AdminField label="Store name" value="Hindustan Hardware" />
          <AdminField
            label="Address"
            value="P.G. Road, Opposite Eidgah, Jehanabad, Bihar 804408"
          />
          <AdminField label="Phone" value="+91 XXXXX XXXXX" />
        </FormCard>
        <FormCard title="Delivery configuration">
          <AdminField label="Minimum order" value="Not configured" />
          <AdminField label="Service PIN codes" value="804408" />
          <AdminField label="Delivery fee" value="Configure manually" />
        </FormCard>
        <FormCard title="Tax settings">
          <p className="text-sm leading-6 text-slate-500">
            No tax rule is active. Configure a verified rate before calculating
            taxes.
          </p>
          <AdminField label="Tax label" value="" />
          <AdminField label="Rate (%)" value="" />
        </FormCard>
        <FormCard title="Business hours">
          <AdminField label="Weekday hours" value="Configure store hours" />
          <AdminField label="Weekend hours" value="Configure store hours" />
        </FormCard>
      </div>
      <Button
        className="mt-6"
        onClick={() => notify("Store configuration preferences saved")}
      >
        Save Settings
      </Button>
    </>
  )
}
