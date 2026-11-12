import {
  Building2,
  Check,
  Loader2,
  Mail,
  MapPin,
  Phone,
  RefreshCcw,
  Search,
  Trash2,
  X
} from "lucide-react"
import { useEffect, useState } from "react"
import { Link } from "react-router"
import { bulkInquiryApi, type BulkInquiry } from "../api/bulkInquiryApi"
import {
  Badge,
  Button,
  PageHeader,
  statusTone,
} from "../components"
import { formatAdminPrice as formatPrice } from "./formatAdminPrice"
import { useAdminCustomers } from "../features/hooks/useAdminCustomers"
import { useAdminOrders } from "../features/hooks/useAdminOrders"

export type GenericKind = "customers" | "deliveries" | "inquiries"

function toWhatsAppNumber(phone: string) {
  const digits = phone.replace(/\D/g, "").replace(/^0+/, "")
  return digits.startsWith("91") ? digits : `91${digits}`
}

export function GenericAdminPage({ kind }: { kind: GenericKind }) {
  if (kind === "customers") return <Customers />
  if (kind === "deliveries") return <Deliveries />
  return <Inquiries />
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
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={18} />
            <input
              className="field !pl-10 w-full"
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
      else if (currentStatus === "shipped") {
        setActionMsg("The assigned delivery partner must verify the customer OTP to complete this order.")
        return
      }

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
        description="Fulfillment assignment and dispatch; delivery partners complete handover after customer OTP verification."
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
            else if (statusKey === "shipped") buttonLabel = "Awaiting OTP verification"

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
                    Payment: <b className="capitalize text-slate-700">{order.paymentStatus.replace(/_/g, " ")}</b> via Cash on Delivery
                  </span>
                </div>

                <div className="mt-4 flex gap-2">
                  <Button
                    variant="outline"
                    disabled={updatingId === order.id || statusKey === "shipped"}
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
  const [inquiries, setInquiries] = useState<BulkInquiry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionId, setActionId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const loadInquiries = async () => {
    setLoading(true)
    setError(null)
    try {
      setInquiries(await bulkInquiryApi.list())
    } catch (err: any) {
      setError(err?.message || "Failed to load bulk inquiries.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadInquiries()
  }, [])

  useEffect(() => {
    if (!expandedId) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpandedId(null)
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [expandedId])

  const handleMarkRead = async (id: string) => {
    setActionId(id)
    setError(null)
    try {
      const updated = await bulkInquiryApi.markRead(id)
      setInquiries((current) => current.map((inquiry) => inquiry.id === id ? updated : inquiry))
    } catch (err: any) {
      setError(err?.message || "Failed to mark inquiry as read.")
    } finally {
      setActionId(null)
    }
  }

  const handleDelete = async (inquiry: BulkInquiry) => {
    if (!window.confirm(`Permanently delete the inquiry from ${inquiry.full_name}? This cannot be undone.`)) return
    setActionId(inquiry.id)
    setError(null)
    try {
      await bulkInquiryApi.delete(inquiry.id)
      setInquiries((current) => current.filter((item) => item.id !== inquiry.id))
      setExpandedId((current) => current === inquiry.id ? null : current)
    } catch (err: any) {
      setError(err?.message || "Failed to delete inquiry.")
    } finally {
      setActionId(null)
    }
  }

  return (
    <>
      <PageHeader
        title="Bulk inquiries"
        description="Customer bulk-order requests submitted from the storefront, newest first."
        action={<Button variant="ghost" onClick={() => void loadInquiries()} title="Refresh inquiries"><RefreshCcw size={15} /></Button>}
      />
      {error && <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      {loading ? (
        <div className="flex h-48 flex-col items-center justify-center gap-3 rounded-xl border border-border bg-white"><Loader2 className="h-7 w-7 animate-spin text-brand" /><p className="text-sm text-slate-500">Loading customer inquiries...</p></div>
      ) : error ? (
        <div className="rounded-xl border border-border bg-white p-10 text-center shadow-xs sm:p-12"><Building2 className="mx-auto h-12 w-12 text-amber-500" /><h3 className="mt-3 text-base font-bold text-slate-800">Unable to load enquiries</h3><p className="mx-auto mt-1 max-w-md text-sm text-slate-500">Resolve the database issue above, then refresh to view inquiry history.</p><Button variant="outline" className="mt-4" onClick={() => void loadInquiries()}>Try again</Button></div>
      ) : inquiries.length === 0 ? (
        <div className="rounded-xl border border-border bg-white p-10 text-center shadow-xs sm:p-12"><Building2 className="mx-auto h-12 w-12 text-slate-300" /><h3 className="mt-3 text-base font-bold text-slate-800">No Enquiry yet</h3><p className="mx-auto mt-1 max-w-md text-sm text-slate-500">New requests from the Bulk Orders form will appear here after customers submit them.</p></div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {inquiries.map((inquiry) => {
            const description = inquiry.requirements?.trim() || inquiry.product_details
            return (
              <article key={inquiry.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-[#D4AF37]/60 hover:shadow-md">
                <button
                  type="button"
                  onClick={() => setExpandedId(inquiry.id)}
                  className="w-full p-5 text-left transition hover:bg-[#fffdf7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#D4AF37] sm:p-6"
                >
                  <div className="flex items-start gap-4">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#fff4cf] to-[#f7df92] font-black uppercase text-[#85600a]">
                      {inquiry.full_name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 className="truncate text-base font-black text-[#111111] sm:text-lg">{inquiry.full_name}</h2>
                        <Badge tone={inquiry.status === "new" ? "warning" : "blue"}>{inquiry.status === "read" ? "Read" : inquiry.status}</Badge>
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-600">{description}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-medium text-slate-500">
                        <span className="inline-flex items-center gap-1.5"><Phone size={12} />{inquiry.phone}</span>
                        <span>Received {new Date(inquiry.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <span className="mt-1 shrink-0 rounded-lg bg-[#fff4cf] px-3 py-1.5 text-[11px] font-bold text-[#85600a]">View details</span>
                  </div>
                </button>
              </article>
            )
          })}
        </div>
      )}

      {expandedId && inquiries.find((inquiry) => inquiry.id === expandedId) && (() => {
        const inquiry = inquiries.find((item) => item.id === expandedId)!
        return (
          <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) setExpandedId(null) }}>
            <section role="dialog" aria-modal="true" aria-labelledby="inquiry-dialog-title" className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-[#fbfaf7] shadow-2xl sm:rounded-3xl">
              <header className="relative shrink-0 bg-gradient-to-r from-[#0b0b0b] via-[#17140c] to-[#30240b] px-5 py-6 text-white sm:px-8 sm:py-7">
                <div className="absolute -right-10 -top-14 h-40 w-40 rounded-full border-[18px] border-[#D4AF37]/10" />
                <div className="relative flex items-start gap-4 pr-8">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-[#D4AF37]/40 bg-[#D4AF37]/15 text-sm font-black uppercase text-[#f3cf63]">
                    {inquiry.full_name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#e2bd4b]">Bulk order inquiry</p>
                    <h2 id="inquiry-dialog-title" className="mt-1 truncate text-xl font-black sm:text-2xl">{inquiry.full_name}</h2>
                    <p className="mt-1 text-xs text-white/65">Submitted {new Date(inquiry.created_at).toLocaleString()}</p>
                  </div>
                  <Badge tone={inquiry.status === "new" ? "warning" : "blue"}>{inquiry.status === "read" ? "Read" : inquiry.status}</Badge>
                </div>
                <button type="button" aria-label="Close inquiry details" onClick={() => setExpandedId(null)} className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-white/10 text-white transition hover:bg-white/20 sm:right-6 sm:top-6"><X size={18} /></button>
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-8">
                <div className="mb-5 rounded-2xl border border-[#e9d8a8] bg-[#fff8e4] p-4 sm:p-5">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#9b7412]">Products / sizes requested</p>
                  <p className="mt-2 whitespace-pre-wrap text-base font-bold leading-7 text-[#19170f]">{inquiry.product_details}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="rounded-full border border-[#e6d39c] bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">Quantity: {inquiry.quantity}</span>
                    <span className="rounded-full border border-[#e6d39c] bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">{inquiry.status === "read" ? "Reviewed" : "Needs review"}</span>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4"><span className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-wide text-slate-500"><Phone size={14} className="text-[#a47b10]" />Phone</span><a href={`tel:${inquiry.phone}`} className="mt-2 block break-all text-sm font-bold text-slate-900 hover:text-[#9b7412]">{inquiry.phone}</a></div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4"><span className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-wide text-slate-500"><Mail size={14} className="text-[#a47b10]" />Email</span><span className="mt-2 block break-all text-sm font-semibold text-slate-800">{inquiry.email || "Not provided"}</span></div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:col-span-2"><span className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-wide text-slate-500"><MapPin size={14} className="text-[#a47b10]" />Delivery location</span><p className="mt-2 text-sm font-semibold leading-6 text-slate-800">{inquiry.delivery_location}</p></div>
                  {inquiry.requirements && <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:col-span-2"><span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Project notes &amp; additional requirements</span><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">{inquiry.requirements}</p></div>}
                </div>
              </div>

              <footer className="flex shrink-0 flex-wrap gap-2 border-t border-slate-200 bg-white px-5 py-4 sm:px-8">
                <a href={`https://wa.me/${toWhatsAppNumber(inquiry.phone)}?text=${encodeURIComponent(`Hello ${inquiry.full_name}, we received your bulk inquiry for ${inquiry.product_details}.`)}`} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-700">Contact on WhatsApp</a>
                {inquiry.status === "new" && <Button variant="outline" size="sm" disabled={actionId === inquiry.id} onClick={() => void handleMarkRead(inquiry.id)}><Check size={15} /> Mark as read</Button>}
                <Button variant="ghost" size="sm" disabled={actionId === inquiry.id} onClick={() => void handleDelete(inquiry)} className="text-red-600 hover:bg-red-50 hover:text-red-700"><Trash2 size={15} /> Delete</Button>
              </footer>
            </section>
          </div>
        )
      })()}
    </>
  )
}

