import { useMemo, useState } from "react"
import { Link, useNavigate, useParams } from "react-router"
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Boxes,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Download,
  Edit3,
  Eye,
  Gauge,
  IndianRupee,
  Package,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
  Truck,
  Users,
} from "lucide-react"
import {
  categories,
  orderStages,
  type Brand,
  type OrderStatus,
  type Product,
} from "../data"
import {
  Badge,
  Button,
  EmptyState,
  PageHeader,
  formatPrice,
  statusTone,
} from "../components"
import { useStore } from "../store"

export function AdminOverviewPage() {
  const { orders, products } = useStore()
  const revenue = orders
    .filter((order) => order.status !== "Cancelled")
    .reduce((sum, order) => sum + order.total, 0)
  const stats = [
    ["Total Orders", orders.length, ClipboardList, "+12% demo", true],
    ["Today's Orders", 4, ShoppingBag, "+2 demo", true],
    ["Revenue", formatPrice(revenue), IndianRupee, "Demo total", true],
    ["Catalog Products", products.length, Package, "Active demo", true],
    [
      "Low Stock",
      products.filter((p) => p.stock < 10).length,
      AlertTriangle,
      "Needs attention",
      false,
    ],
    [
      "Pending Deliveries",
      orders.filter((o) => !["Delivered", "Cancelled"].includes(o.status))
        .length,
      Truck,
      "In progress",
      true,
    ],
  ] as const
  return (
    <>
      <PageHeader
        title="Operations overview"
        description="A synchronized snapshot of demo commerce activity. Analytics are illustrative, not real business performance."
        action={<Badge tone="warning">Demo analytics</Badge>}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {stats.map(([label, value, Icon, change, positive]) => (
          <div
            key={label}
            className="rounded-xl border border-border bg-white p-5"
          >
            <div className="flex items-start justify-between">
              <span className="grid h-11 w-11 place-items-center rounded-lg bg-blue-50 text-brand">
                <Icon size={21} />
              </span>
              <span
                className={`flex items-center gap-1 text-xs font-bold ${
                  positive ? "text-emerald-700" : "text-amber-700"
                }`}
              >
                {positive ? (
                  <ArrowUpRight size={14} />
                ) : (
                  <ArrowDownRight size={14} />
                )}
                {change}
              </span>
            </div>
            <b className="mt-5 block text-3xl">{value}</b>
            <span className="text-sm text-slate-500">{label}</span>
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_0.6fr]">
        <div className="rounded-xl border border-border bg-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-black">Weekly sales</h2>
              <p className="text-xs text-slate-500">Illustrative order value</p>
            </div>
            <Badge tone="blue">Last 7 days</Badge>
          </div>
          <div className="mt-8 flex h-56 items-end gap-4 border-b border-border px-2">
            {[45, 68, 40, 82, 64, 96, 76].map((height, index) => (
              <div
                key={index}
                className="flex h-full flex-1 flex-col justify-end gap-2 text-center"
              >
                <div
                  className="rounded-t bg-brand transition hover:bg-accent"
                  style={{ height: `${height}%` }}
                />
                <small className="text-slate-400">
                  {["M", "T", "W", "T", "F", "S", "S"][index]}
                </small>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-white p-6">
          <h2 className="text-lg font-black">Order status</h2>
          <div className="mt-6 space-y-4">
            {["Delivered", "In progress", "Cancelled"].map((label, index) => (
              <div key={label}>
                <div className="flex justify-between text-sm">
                  <b>{label}</b>
                  <span>{[38, 52, 10][index]}%</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-slate-100">
                  <div
                    className={`h-2 rounded-full ${
                      index === 0
                        ? "bg-emerald-600"
                        : index === 1
                          ? "bg-brand"
                          : "bg-red-500"
                    }`}
                    style={{ width: `${[38, 52, 10][index]}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_0.6fr]">
        <div className="rounded-xl border border-border bg-white">
          <div className="flex items-center justify-between border-b border-border p-5">
            <h2 className="font-black">Recent orders</h2>
            <Link className="text-sm font-bold text-brand" to="/admin/orders">
              View all
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Date</th>
                  <th>Total</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.slice(0, 5).map((order) => (
                  <tr key={order.id}>
                    <td>
                      <b>{order.id}</b>
                    </td>
                    <td>{order.date}</td>
                    <td>{formatPrice(order.total)}</td>
                    <td>
                      <Badge tone={statusTone(order.status)}>
                        {order.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-white p-5">
          <h2 className="font-black">Low-stock alerts</h2>
          <div className="mt-4 space-y-4">
            {products
              .filter((p) => p.stock < 10)
              .slice(0, 5)
              .map((product) => (
                <div className="flex items-center gap-3" key={product.id}>
                  <img
                    src={product.image}
                    alt=""
                    className="h-10 w-10 rounded-lg object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <b className="block truncate text-sm">{product.name}</b>
                    <span className="text-xs text-amber-700">
                      {product.stock} units remaining
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </>
  )
}

export function AdminProductsPage() {
  const { products, deleteProduct } = useStore()
  const [query, setQuery] = useState("")
  const [pendingDelete, setPendingDelete] = useState<Product | null>(null)
  const shown = products.filter((product) =>
    `${product.name} ${product.brand} ${product.category} ${product.id}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  )
  return (
    <>
      <PageHeader
        title="Product catalog"
        description="Add, edit, search and manage demo product records."
        action={
          <Link to="/admin/products/new">
            <Button>
              <Plus size={16} />
              Add Product
            </Button>
          </Link>
        }
      />
      <div className="rounded-xl border border-border bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
          <div className="relative max-w-md flex-1">
            <Search
              className="absolute left-3 top-3 text-slate-400"
              size={18}
            />
            <input
              className="field pl-10"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search products, SKU or category"
            />
          </div>
          <select className="field w-auto">
            <option>All categories</option>
            {categories.map((item) => (
              <option key={item.slug}>{item.name}</option>
            ))}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
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
              {shown.map((product) => (
                <tr key={product.id}>
                  <td>
                    <div className="flex min-w-56 items-center gap-3">
                      <img
                        src={product.image}
                        alt=""
                        className="h-11 w-11 rounded-lg object-cover"
                      />
                      <div>
                        <b className="block">{product.name}</b>
                        <small className="text-slate-500">
                          {product.brand}
                        </small>
                      </div>
                    </div>
                  </td>
                  <td>HH-{product.id.toUpperCase()}</td>
                  <td>{product.category}</td>
                  <td>
                    <b>{formatPrice(product.price)}</b>
                  </td>
                  <td>
                    <span
                      className={
                        product.stock < 10 ? "font-bold text-amber-700" : ""
                      }
                    >
                      {product.stock}
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
                      <Link to={`/product/${product.id}`}>
                        <button className="table-action" title="View">
                          <Eye size={16} />
                        </button>
                      </Link>
                      <Link to={`/admin/products/${product.id}/edit`}>
                        <button className="table-action" title="Edit">
                          <Edit3 size={16} />
                        </button>
                      </Link>
                      <button
                        onClick={() => setPendingDelete(product)}
                        className="table-action text-red-600"
                        title="Delete"
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
        <div className="flex items-center justify-between border-t border-border px-5 py-4 text-xs text-slate-500">
          <span>Showing {shown.length} products</span>
          <span>Page 1 of 1</span>
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
              {pendingDelete.name} will be removed from the shared demo catalog.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setPendingDelete(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  deleteProduct(pendingDelete.id)
                  setPendingDelete(null)
                }}
              >
                Delete Product
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export function ProductFormPage() {
  const { id } = useParams()
  const { products, brands, saveProduct, notify } = useStore()
  const navigate = useNavigate()
  const existing = products.find((product) => product.id === id)
  const [form, setForm] = useState<Product>(
    existing ?? {
      id: `p${Date.now()}`,
      slug: "",
      name: "",
      brand: brands[0]?.name ?? "",
      brandId: brands[0]?.id ?? "",
      brandName: brands[0]?.name ?? "",
      category: categories[0].name,
      categoryId: categories[0].slug,
      productType: "PVC Pipes",
      price: 0,
      mrp: undefined,
      stock: 0,
      unit: "per piece",
      unitOfSale: "per piece",
      material: "PVC",
      size: "",
      diameter: "",
      length: "Not specified",
      pressureRating: "Not specified",
      technicalStandard: "Not specified",
      intendedApplication: "",
      comparisonGroupId: undefined,
      variantAttributes: {},
      image: categories[0].image,
      images: [categories[0].image],
      description: "",
      active: true,
      featured: false,
      specs: {},
    },
  )
  const set = <K extends keyof Product>(key: K, value: Product[K]) =>
    setForm((current) => ({ ...current, [key]: value }))
  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const selectedBrand = brands.find((brand) => brand.id === form.brandId)
    const groupedProduct = products.find(
      (product) =>
        product.id !== form.id &&
        form.comparisonGroupId &&
        product.comparisonGroupId === form.comparisonGroupId,
    )
    if (
      groupedProduct &&
      [
        "material",
        "diameter",
        "length",
        "pressureRating",
        "technicalStandard",
        "intendedApplication",
        "unitOfSale",
      ].some(
        (key) =>
          groupedProduct[(key as keyof Product)] !==
          form[(key as keyof Product)],
      )
    ) {
      notify(
        "Comparison group rejected: technical attributes or sale unit differ",
      )
      return
    }
    saveProduct({
      ...form,
      slug:
        form.slug ||
        `${selectedBrand?.slug ?? form.brandId}-${form.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      brand: selectedBrand?.name ?? form.brand,
      brandName: selectedBrand?.name ?? form.brandName,
      categoryId:
        categories.find((item) => item.name === form.category)?.slug ??
        form.categoryId,
      size: form.diameter,
      unit: form.unitOfSale,
      images: [form.image],
      variantAttributes: {
        Diameter: form.diameter,
        Length: form.length,
        Material: form.material,
      },
      specs: {
        Material: form.material,
        Diameter: form.diameter || "Not specified",
        Length: form.length || "Not specified",
        "Pressure rating": form.pressureRating || "Not specified",
        "Technical standard": form.technicalStandard || "Not specified",
        "Unit of sale": form.unitOfSale,
        Application: form.intendedApplication || "Not specified",
      },
    })
    navigate("/admin/products")
  }
  return (
    <>
      <PageHeader
        title={existing ? "Edit product" : "Add new product"}
        description="Manage core catalog information, pricing, inventory and technical details."
      />
      <form onSubmit={submit} className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <FormCard title="Basic information">
            <div className="grid gap-4 sm:grid-cols-2">
              <AdminField
                label="Product name"
                required
                value={form.name}
                onChange={(value) => set("name", value)}
              />
              <AdminField
                label="SKU"
                value={`HH-${form.id.toUpperCase()}`}
                disabled
              />
              <label className="field-label">
                Brand
                <select
                  className="field mt-2"
                  value={form.brandId}
                  onChange={(event) => set("brandId", event.target.value)}
                >
                  {brands.map((brand) => (
                    <option key={brand.id} value={brand.id}>
                      {brand.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                Category
                <select
                  className="field mt-2"
                  value={form.category}
                  onChange={(event) => set("category", event.target.value)}
                >
                  {categories.map((item) => (
                    <option key={item.slug}>{item.name}</option>
                  ))}
                </select>
              </label>
              <div className="sm:col-span-2">
                <label className="field-label">
                  Description
                  <textarea
                    required
                    rows={4}
                    className="field mt-2 resize-none"
                    value={form.description}
                    onChange={(event) => set("description", event.target.value)}
                  />
                </label>
              </div>
            </div>
          </FormCard>
          <FormCard title="Pricing & unit">
            <div className="grid gap-4 sm:grid-cols-3">
              <AdminField
                label="Base price (₹)"
                required
                type="number"
                value={String(form.price)}
                onChange={(value) => set("price", Number(value))}
              />
              <AdminField
                label="MRP (₹)"
                type="number"
                value={String(form.mrp ?? "")}
                onChange={(value) =>
                  set("mrp", value ? Number(value) : undefined)
                }
              />
              <AdminField
                label="Unit of sale"
                required
                value={form.unitOfSale}
                onChange={(value) => set("unitOfSale", value)}
              />
            </div>
          </FormCard>
          <FormCard title="Specifications">
            <div className="grid gap-4 sm:grid-cols-3">
              <AdminField
                label="Product type"
                value={form.productType}
                onChange={(value) => set("productType", value)}
              />
              <AdminField
                label="Material"
                value={form.material}
                onChange={(value) => set("material", value)}
              />
              <AdminField
                label="Diameter / size"
                value={form.diameter}
                onChange={(value) => set("diameter", value)}
              />
              <AdminField
                label="Length"
                value={form.length}
                onChange={(value) => set("length", value)}
              />
              <AdminField
                label="Pressure rating"
                value={form.pressureRating}
                onChange={(value) => set("pressureRating", value)}
              />
              <AdminField
                label="Technical standard"
                value={form.technicalStandard}
                onChange={(value) => set("technicalStandard", value)}
              />
              <AdminField
                label="Intended application"
                value={form.intendedApplication}
                onChange={(value) => set("intendedApplication", value)}
              />
              <AdminField
                label="Comparison group"
                value={form.comparisonGroupId ?? ""}
                onChange={(value) =>
                  set("comparisonGroupId", value || undefined)
                }
              />
              <AdminField
                label="Image URL"
                value={form.image}
                onChange={(value) => set("image", value)}
              />
            </div>
            <p className="text-xs leading-5 text-slate-500">
              Products are compared only when an administrator assigns the same
              group after validating material, diameter, length, pressure
              rating, technical standard, application and sale unit.
            </p>
          </FormCard>
        </div>
        <aside className="space-y-6">
          <FormCard title="Inventory">
            <AdminField
              label="Stock quantity"
              required
              type="number"
              value={String(form.stock)}
              onChange={(value) => set("stock", Number(value))}
            />
            <AdminField label="Low stock threshold" type="number" value="10" />
          </FormCard>
          <FormCard title="Visibility">
            <label className="toggle-row">
              <span>
                <b>Active product</b>
                <small>Visible to customers</small>
              </span>
              <input
                type="checkbox"
                checked={form.active}
                onChange={(event) => set("active", event.target.checked)}
              />
            </label>
            <label className="toggle-row">
              <span>
                <b>Featured / bestseller</b>
                <small>Highlight on homepage</small>
              </span>
              <input
                type="checkbox"
                checked={form.featured}
                onChange={(event) => set("featured", event.target.checked)}
              />
            </label>
          </FormCard>
          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => navigate("/admin/products")}
            >
              Cancel
            </Button>
            <Button type="submit" className="flex-1">
              Save Product
            </Button>
          </div>
        </aside>
      </form>
    </>
  )
}

function FormCard({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-border bg-white p-6">
      <h2 className="mb-5 text-lg font-black">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  )
}
function AdminField(props: {
  label: string
  value: string
  onChange?: (value: string) => void
  required?: boolean
  type?: string
  disabled?: boolean
}) {
  return (
    <label className="field-label">
      {props.label}
      <input
        {...props}
        onChange={(event) => props.onChange?.(event.target.value)}
        className="field mt-2 disabled:bg-slate-100"
      />
    </label>
  )
}

export function AdminOrdersPage() {
  const { orders } = useStore()
  return (
    <>
      <PageHeader
        title="Order management"
        description="Review customer orders and update their shared fulfillment state."
      />
      <div className="overflow-hidden rounded-xl border border-border bg-white">
        <div className="flex gap-3 border-b border-border p-4">
          <div className="relative max-w-sm flex-1">
            <Search
              className="absolute left-3 top-3 text-slate-400"
              size={18}
            />
            <input
              className="field pl-10"
              placeholder="Search order or customer"
            />
          </div>
          <select className="field w-auto">
            <option>All statuses</option>
            {orderStages.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Customer</th>
                <th>Date</th>
                <th>Total</th>
                <th>Payment</th>
                <th>Delivery status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td>
                    <b>{order.id}</b>
                  </td>
                  <td>Demo Customer</td>
                  <td>{order.date}</td>
                  <td>
                    <b>{formatPrice(order.total)}</b>
                  </td>
                  <td>
                    <span>{order.payment}</span>
                    <small className="block text-slate-500">
                      {order.paymentStatus}
                    </small>
                  </td>
                  <td>
                    <Badge tone={statusTone(order.status)}>
                      {order.status}
                    </Badge>
                  </td>
                  <td>
                    <Link to={`/admin/orders/${order.id}`}>
                      <Button variant="outline" className="py-2">
                        Manage
                      </Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

export function AdminOrderDetailPage() {
  const { id } = useParams()
  const { orders, products, updateOrderStatus } = useStore()
  const order = orders.find((item) => item.id === id)
  if (!order)
    return (
      <EmptyState
        title="Order not found"
        text="The requested demo order is unavailable."
      />
    )
  const actions: [string, OrderStatus][] = [
    ["Confirm order", "Order Confirmed"],
    ["Mark preparing", "Preparing Your Order"],
    ["Ready for dispatch", "Ready for Dispatch"],
    ["Out for delivery", "Out for Delivery"],
    ["Mark delivered", "Delivered"],
  ]
  return (
    <>
      <PageHeader
        breadcrumbs="Orders / Order detail"
        title={order.id}
        description={`Placed ${order.date}`}
        action={
          <Button variant="outline">
            <Download size={16} />
            Print invoice
          </Button>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <section className="rounded-xl border border-border bg-white p-6">
            <div className="flex justify-between">
              <h2 className="text-lg font-black">Ordered items</h2>
              <Badge tone={statusTone(order.status)}>{order.status}</Badge>
            </div>
            <div className="mt-4 divide-y divide-border">
              {order.items.map((item) => {
                const product = products.find((p) => p.id === item.productId)
                return product ? (
                  <div
                    className="flex items-center gap-4 py-4"
                    key={item.productId}
                  >
                    <img
                      src={product.image}
                      alt=""
                      className="h-14 w-14 rounded-lg object-cover"
                    />
                    <div className="flex-1">
                      <b>{product.name}</b>
                      <small className="block text-slate-500">
                        {product.size} · Qty {item.quantity}
                      </small>
                    </div>
                    <b>{formatPrice(item.price * item.quantity)}</b>
                  </div>
                ) : null
              })}
            </div>
            <div className="flex justify-between border-t border-border pt-4 text-lg font-black">
              <span>Total</span>
              <span>{formatPrice(order.total)}</span>
            </div>
          </section>
          <section className="rounded-xl border border-border bg-white p-6">
            <h2 className="text-lg font-black">Status timeline</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {orderStages.map((stage, index) => (
                <div
                  key={stage}
                  className={`rounded-lg border p-3 text-sm ${
                    index <= orderStages.indexOf(order.status)
                      ? "border-brand bg-blue-50 text-brand"
                      : "border-border text-slate-400"
                  }`}
                >
                  <b>{stage}</b>
                </div>
              ))}
            </div>
          </section>
        </div>
        <aside className="space-y-5">
          <section className="rounded-xl border border-border bg-white p-5">
            <h3 className="font-black">Customer & delivery</h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Demo Customer
              <br />
              +91 XXXXX XXXXX
              <br />
              {order.address}
            </p>
          </section>
          <section className="rounded-xl border border-border bg-white p-5">
            <h3 className="font-black">Update order</h3>
            <div className="mt-4 space-y-2">
              {actions.map(([label, status]) => (
                <Button
                  key={status}
                  disabled={order.status === "Cancelled"}
                  variant={order.status === status ? "primary" : "outline"}
                  className="w-full justify-start"
                  onClick={() => updateOrderStatus(order.id, status)}
                >
                  {order.status === status && <CheckCircle2 size={16} />}
                  {label}
                </Button>
              ))}
              <Button
                className="w-full"
                variant="danger"
                onClick={() => updateOrderStatus(order.id, "Cancelled")}
              >
                Cancel order
              </Button>
            </div>
            <label className="field-label mt-5 block">
              Admin notes
              <textarea
                className="field mt-2 resize-none"
                rows={3}
                placeholder="Internal demo note"
              />
            </label>
          </section>
        </aside>
      </div>
    </>
  )
}

export function InventoryPage() {
  const { products, adjustStock, notify } = useStore()
  return (
    <>
      <PageHeader
        title="Inventory management"
        description="Adjust demo stock and review low-stock or out-of-stock products."
      />
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <MiniStat
          label="Total units"
          value={String(products.reduce((sum, p) => sum + p.stock, 0))}
          icon={<Boxes />}
        />
        <MiniStat
          label="Low stock"
          value={String(
            products.filter((p) => p.stock > 0 && p.stock < 10).length,
          )}
          icon={<AlertTriangle />}
        />
        <MiniStat
          label="Out of stock"
          value={String(products.filter((p) => p.stock === 0).length)}
          icon={<Gauge />}
        />
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-white">
        <table className="data-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>SKU</th>
              <th>Current stock</th>
              <th>Threshold</th>
              <th>Status</th>
              <th>Adjustment</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id}>
                <td>
                  <div className="flex items-center gap-3">
                    <img
                      src={product.image}
                      alt=""
                      className="h-10 w-10 rounded-lg object-cover"
                    />
                    <b>{product.name}</b>
                  </div>
                </td>
                <td>HH-{product.id.toUpperCase()}</td>
                <td>
                  <b>{product.stock}</b>
                </td>
                <td>10</td>
                <td>
                  <Badge
                    tone={
                      product.stock === 0
                        ? "danger"
                        : product.stock < 10
                          ? "warning"
                          : "success"
                    }
                  >
                    {product.stock === 0
                      ? "Out of stock"
                      : product.stock < 10
                        ? "Low stock"
                        : "In stock"}
                  </Badge>
                </td>
                <td>
                  <div className="flex gap-2">
                    <button
                      onClick={() => adjustStock(product.id, product.stock - 1)}
                      className="table-action"
                    >
                      −
                    </button>
                    <button
                      onClick={() => {
                        adjustStock(product.id, product.stock + 1)
                        notify("Stock adjusted · reason: manual demo update")
                      }}
                      className="table-action"
                    >
                      +
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section className="mt-6 rounded-xl border border-border bg-white p-6">
        <h2 className="font-black">Recent inventory movements</h2>
        <p className="mt-2 text-sm text-slate-500">
          Manual adjustments and placed orders update the same stock records.
          Orders deduct inventory once at demo order creation.
        </p>
      </section>
    </>
  )
}
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
    <div className="flex items-center gap-4 rounded-xl border border-border bg-white p-5">
      <span className="text-brand">{icon}</span>
      <div>
        <b className="text-2xl">{value}</b>
        <small className="block text-slate-500">{label}</small>
      </div>
    </div>
  )
}

export function CategoriesPage() {
  const [items, setItems] = useState(
    categories.map((item, index) => ({
      ...item,
      visible: true,
      order: index + 1,
    })),
  )
  const [name, setName] = useState("")
  return (
    <>
      <PageHeader
        title="Category management"
        description="Create, edit visibility, reorder and safely remove demo categories."
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_330px]">
        <div className="rounded-xl border border-border bg-white">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Display order</th>
                  <th>Visibility</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.slug}>
                    <td>
                      <div className="flex items-center gap-3">
                        <img
                          src={item.image}
                          alt=""
                          className="h-11 w-11 rounded-lg object-cover"
                        />
                        <b>{item.name}</b>
                      </div>
                    </td>
                    <td>{item.order}</td>
                    <td>
                      <button
                        onClick={() =>
                          setItems((current) =>
                            current.map((entry) =>
                              entry.slug === item.slug
                                ? { ...entry, visible: !entry.visible }
                                : entry,
                            ),
                          )
                        }
                      >
                        <Badge tone={item.visible ? "success" : "neutral"}>
                          {item.visible ? "Visible" : "Hidden"}
                        </Badge>
                      </button>
                    </td>
                    <td>
                      <button
                        onClick={() =>
                          setItems((current) =>
                            current.filter((entry) => entry.slug !== item.slug),
                          )
                        }
                        className="table-action text-red-600"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <aside className="h-fit rounded-xl border border-border bg-white p-5">
          <h2 className="font-black">Add category</h2>
          <label className="field-label mt-5 block">
            Category name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="field mt-2"
            />
          </label>
          <label className="field-label mt-4 block">
            Description
            <textarea className="field mt-2" rows={3} />
          </label>
          <Button
            disabled={!name}
            onClick={() => {
              setItems((current) => [
                ...current,
                {
                  name,
                  slug: name.toLowerCase().replace(/\s+/g, "-"),
                  image: categories[0].image,
                  visible: true,
                  order: current.length + 1,
                },
              ])
              setName("")
            }}
            className="mt-5 w-full"
          >
            <Plus size={16} />
            Create Category
          </Button>
        </aside>
      </div>
    </>
  )
}

const brandCategoryOptions = [
  "CPVC Pipes",
  "PVC Pipes",
  "UPVC Pipes",
  "HDPE Pipes",
  "SWR and Drainage",
  "Pipe Fittings",
  "Water Supply Systems",
]

export function BrandsAdminPage() {
  const { brands, products, saveBrand, deleteBrand } = useStore()
  const emptyBrand: Brand = {
    id: "",
    name: "",
    slug: "",
    logo: "",
    description: "",
    supportedCategories: [],
    active: true,
    displayOrder: brands.length + 1,
  }
  const [form, setForm] = useState<Brand>(emptyBrand)
  const edit = (brand: Brand) => setForm(brand)
  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const slug =
      form.slug ||
      form.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
    saveBrand({ ...form, id: form.id || slug, slug })
    setForm({ ...emptyBrand, displayOrder: brands.length + 2 })
  }
  return (
    <>
      <PageHeader
        title="Brand management"
        description="Manage manufacturer identity, category associations, visibility and storefront order."
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="overflow-hidden rounded-xl border border-border bg-white">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Brand</th>
                  <th>Products</th>
                  <th>Display order</th>
                  <th>Visibility</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {[...brands]
                  .sort((a, b) => a.displayOrder - b.displayOrder)
                  .map((brand) => (
                    <tr key={brand.id}>
                      <td>
                        <b>{brand.name}</b>
                        <small className="block text-slate-500">
                          /{brand.slug}
                        </small>
                      </td>
                      <td>
                        {
                          products.filter(
                            (product) => product.brandId === brand.id,
                          ).length
                        }
                      </td>
                      <td>{brand.displayOrder}</td>
                      <td>
                        <button
                          onClick={() =>
                            saveBrand({ ...brand, active: !brand.active })
                          }
                        >
                          <Badge tone={brand.active ? "success" : "neutral"}>
                            {brand.active ? "Visible" : "Hidden"}
                          </Badge>
                        </button>
                      </td>
                      <td>
                        <div className="flex gap-1">
                          <button
                            className="table-action"
                            onClick={() => edit(brand)}
                          >
                            <Edit3 size={16} />
                          </button>
                          <button
                            className="table-action text-red-600"
                            onClick={() => deleteBrand(brand.id)}
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
        </div>
        <form
          onSubmit={submit}
          className="h-fit rounded-xl border border-border bg-white p-6"
        >
          <h2 className="text-lg font-black">
            {form.id ? "Edit brand" : "Add brand"}
          </h2>
          <div className="mt-5 space-y-4">
            <AdminField
              required
              label="Brand name"
              value={form.name}
              onChange={(value) => setForm({ ...form, name: value })}
            />
            <AdminField
              label="Slug"
              value={form.slug}
              onChange={(value) => setForm({ ...form, slug: value })}
            />
            <AdminField
              label="Approved logo URL (optional)"
              value={form.logo ?? ""}
              onChange={(value) => setForm({ ...form, logo: value })}
            />
            <label className="field-label">
              Short description
              <textarea
                required
                rows={3}
                className="field mt-2 resize-none"
                value={form.description}
                onChange={(event) =>
                  setForm({ ...form, description: event.target.value })
                }
              />
            </label>
            <AdminField
              label="Display order"
              type="number"
              value={String(form.displayOrder)}
              onChange={(value) =>
                setForm({ ...form, displayOrder: Number(value) })
              }
            />
            <fieldset>
              <legend className="field-label">Supported categories</legend>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {brandCategoryOptions.map((category) => (
                  <label key={category} className="filter-option">
                    <input
                      type="checkbox"
                      checked={form.supportedCategories.includes(category)}
                      onChange={() =>
                        setForm({
                          ...form,
                          supportedCategories:
                            form.supportedCategories.includes(category)
                              ? form.supportedCategories.filter(
                                  (item) => item !== category,
                                )
                              : [...form.supportedCategories, category],
                        })
                      }
                    />
                    {category}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
          <div className="mt-6 flex gap-2">
            <Button type="submit" className="flex-1">
              {form.id ? "Save Changes" : "Add Brand"}
            </Button>
            {form.id && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setForm(emptyBrand)}
              >
                Cancel
              </Button>
            )}
          </div>
        </form>
      </div>
    </>
  )
}

type GenericKind = "customers" | "deliveries" | "inquiries" | "settings"
export function GenericAdminPage({ kind }: { kind: GenericKind }) {
  if (kind === "customers") return <Customers />
  if (kind === "deliveries") return <Deliveries />
  if (kind === "inquiries") return <Inquiries />
  return <Settings />
}
function Customers() {
  const rows = [
    ["Ravi Kumar", "98XXXXXX21", "4", "₹12,450", "Active"],
    ["Neha Singh", "97XXXXXX84", "2", "₹7,180", "Active"],
    ["Amit Construction", "99XXXXXX16", "7", "₹34,820", "Active"],
  ]
  return (
    <>
      <PageHeader
        title="Customers"
        description="Demo customer records with contact, orders and purchase value."
      />
      <SimpleTable
        headers={["Customer", "Contact", "Orders", "Purchase value", "Status"]}
        rows={rows}
      />
    </>
  )
}
function Deliveries() {
  const { orders, updateOrderStatus } = useStore()
  const active = orders.filter(
    (o) => !["Delivered", "Cancelled"].includes(o.status),
  )
  return (
    <>
      <PageHeader
        title="Delivery management"
        description="Demo delivery assignment and ETA workspace. Real drivers and GPS are not connected."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {active.map((order) => (
          <div
            key={order.id}
            className="rounded-xl border border-border bg-white p-5"
          >
            <div className="flex justify-between">
              <div>
                <small className="text-slate-500">ORDER</small>
                <b className="block">{order.id}</b>
              </div>
              <Badge tone={statusTone(order.status)}>{order.status}</Badge>
            </div>
            <p className="mt-4 text-sm text-slate-600">{order.address}</p>
            <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm">
              <b>Delivery Partner:</b> Demo Partner
              <br />
              <span className="text-slate-500">
                ETA: Store-confirmed window
              </span>
            </div>
            <Button
              className="mt-4"
              variant="outline"
              onClick={() => updateOrderStatus(order.id, "Out for Delivery")}
            >
              Mark out for delivery
            </Button>
          </div>
        ))}
      </div>
    </>
  )
}
function Inquiries() {
  const rows = [
    [
      "Amit Construction",
      "99XXXXXX16",
      "UPVC pipes · 50 lengths",
      "Kako, Bihar",
      "New",
    ],
    [
      "Rajesh Plumbing",
      "98XXXXXX09",
      "Fittings · mixed quantity",
      "Jehanabad",
      "Responded",
    ],
    [
      "S. K. Projects",
      "97XXXXXX33",
      "1000L tanks · 8 units",
      "Ghosi",
      "Quoting",
    ],
  ]
  return (
    <>
      <PageHeader
        title="Bulk inquiries"
        description="Manage contractor requirements and demo response notes."
      />
      <SimpleTable
        headers={[
          "Customer",
          "Phone",
          "Requirements",
          "Delivery location",
          "Status",
        ]}
        rows={rows}
      />
      <section className="mt-6 rounded-xl border border-border bg-white p-6">
        <h2 className="font-black">Admin response notes</h2>
        <textarea
          className="field mt-4"
          rows={4}
          placeholder="Add configurable quotation notes..."
        />
        <Button className="mt-4">Save Response</Button>
      </section>
    </>
  )
}
function Settings() {
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
        onClick={() => notify("Demo store settings saved")}
      >
        Save Settings
      </Button>
    </>
  )
}
function SimpleTable({
  headers,
  rows,
}: {
  headers: string[]
  rows: string[][]
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-white">
      <table className="data-table">
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}>
                  {cellIndex === row.length - 1 ? (
                    <Badge tone="blue">{cell}</Badge>
                  ) : (
                    cell
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
