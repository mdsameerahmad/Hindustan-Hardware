import {
  ArrowLeft,
  CheckCircle2,
  Check,
  Copy,
  Layers3,
  Loader2,
  MapPin,
  Minus,
  Package,
  PhoneCall,
  Plus,
  Search,
  Share2,
  ShieldCheck,
  ShoppingBag,
  Trash2,
} from "lucide-react"

import { type FormEvent, useEffect, useMemo, useState } from "react"

import { Link } from "react-router"

import {
  catalogueApi,
  type BackendProduct,
  type BackendProductVariant,
} from "../api/catalogueApi"

import { ApiError } from "../api/client"

import { Button, PageHeader } from "../components"
import { formatAdminPrice as formatPrice } from "./formatAdminPrice"
import { AddressPickerModal } from "../features/components/AddressPickerModal"
import type { CreateAddressPayload } from "../features/commerceTypes"

import { buildTrackingUrl, type PhoneOrderPayload } from "../features/sharedTrackingApi"

import { sharedTrackingApi } from "../features/sharedTrackingApi"

interface RecipientForm {
  recipientName: string

  phone: string
}

interface SelectedItem {
  product: BackendProduct

  variant: BackendProductVariant | null

  quantity: number
}

const initialRecipient: RecipientForm = {
  recipientName: "",

  phone: "",
}

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message

  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again."
}

export function AdminPhoneOrderPage() {
  const [recipient, setRecipient] = useState(initialRecipient)

  const [search, setSearch] = useState("")

  const [selectedCategory, setSelectedCategory] = useState("All products")

  const [selectedBrand, setSelectedBrand] = useState("All brands")

  const [products, setProducts] = useState<BackendProduct[]>([])

  const [items, setItems] = useState<SelectedItem[]>([])

  const [variantSelections, setVariantSelections] =
    useState<Record<string, string>>({})

  const [destinationAddress, setDestinationAddress] =
    useState<CreateAddressPayload | null>(null)

  const [addressPickerOpen, setAddressPickerOpen] = useState(false)

  const [deliveryInstructions, setDeliveryInstructions] = useState("")

  const [customerNotes, setCustomerNotes] = useState("")

  const [loadingProducts, setLoadingProducts] = useState(false)

  const [submitting, setSubmitting] = useState(false)

  const [error, setError] = useState<string | null>(null)

  const [otpCopied, setOtpCopied] = useState(false)

  const [createdOrder, setCreatedOrder] = useState<{
    id: string

    orderNumber: string

    deliveryOtp: string

    trackingUrl?: string

    trackingPath?: string

    expiresAt?: string
  } | null>(null)

  useEffect(() => {
    let active = true

    const timer = window.setTimeout(
      async () => {
        setLoadingProducts(true)

        try {
          const result = await catalogueApi.listProducts({
            page: 1,

            limit: 100,

            search,

            availability: "all",
          })

          if (active)
            setProducts(result.items.filter((product) => product.is_active))
        } catch (loadError) {
          if (active) setError(getErrorMessage(loadError))
        } finally {
          if (active) setLoadingProducts(false)
        }
      },
      search.trim() ? 250 : 0,
    )

    return () => {
      active = false

      window.clearTimeout(timer)
    }
  }, [search])

  const addItem = (product: BackendProduct) => {
    const activeVariants =
      product.variants?.filter((variant) => variant.is_active) ?? []

    const selectedVariantId = variantSelections[product.id]

    if (activeVariants.length && !selectedVariantId) {
      setError(`Choose a variant for ${product.name} before adding it.`)

      return
    }

    const variant =
      activeVariants.find((option) => option.id === selectedVariantId) ?? null

    const itemKey = `${product.id}:${variant?.id ?? ""}`

    setItems((current) => {
      const existing = current.find(
        (item) => `${item.product.id}:${item.variant?.id ?? ""}` === itemKey,
      )

      if (existing) {
        return current.map((item) =>
          `${item.product.id}:${item.variant?.id ?? ""}` === itemKey
            ? { ...item, quantity: Math.min(item.quantity + 1, 999) }
            : item,
        )
      }

      return [...current, { product, variant, quantity: 1 }]
    })

    setError(null)
  }

  const changeQuantity = (itemKey: string, quantity: number) => {
    setItems((current) =>
      current.map((item) =>
        `${item.product.id}:${item.variant?.id ?? ""}` === itemKey
          ? { ...item, quantity: Math.max(1, Math.min(999, quantity)) }
          : item,
      ),
    )
  }

  const createOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    setError(null)

    if (items.length === 0) {
      setError("Add at least one product to the order.")

      return
    }
    if (!destinationAddress) {
      setError(
        "Select the exact delivery location on the map before placing the order.",
      )
      return
    }
    if (!recipient.recipientName.trim() || !recipient.phone.trim()) {
      setError("Enter the recipient name and phone number in the address form.")
      return
    }

    const combinedNotes = [
      deliveryInstructions.trim() && `Delivery instructions: ${deliveryInstructions.trim()}`,
      customerNotes.trim() && `Customer notes: ${customerNotes.trim()}`,
    ].filter(Boolean).join("\n")

    const payload: PhoneOrderPayload = {
      shippingAddress: {
        recipientName: recipient.recipientName.trim(),

        phone: recipient.phone.trim(),

        addressLine1: destinationAddress.addressLine1,

        addressLine2: destinationAddress.addressLine2,

        landmark: destinationAddress.landmark,

        city: destinationAddress.city,

        state: destinationAddress.state,

        postalCode: destinationAddress.postalCode,

        country: destinationAddress.country || "India",

        addressType: destinationAddress.addressType || "Home",

        latitude: destinationAddress.latitude,

        longitude: destinationAddress.longitude,

        formattedAddress: destinationAddress.formattedAddress,

        geocodingProvider: destinationAddress.geocodingProvider,
      },

      items: items.map(({ product, variant, quantity }) => ({
        productId: product.id,

        variantId: variant?.id ?? null,

        quantity,
      })),

      customerNotes: combinedNotes || undefined,
    }

    setSubmitting(true)

    try {
      const order = await sharedTrackingApi.createPhoneOrder(payload)

      setCreatedOrder({
        id: order.id,

        orderNumber: order.orderNumber,

        deliveryOtp: order.deliveryOtp,
      })

      try {
        const share = await sharedTrackingApi.createShare(order.id)
        try {
          const url = buildTrackingUrl(share.trackingPath)
          setCreatedOrder((current) =>
            current
              ? { ...current, trackingUrl: url, trackingPath: share.trackingPath, expiresAt: share.expiresAt }
              : current,
          )
        } catch (urlError) {
          setCreatedOrder((current) =>
            current
              ? { ...current, trackingPath: share.trackingPath, expiresAt: share.expiresAt }
              : current,
          )
          throw urlError
        }
      } catch (shareError) {
        setError(
          `Order ${order.orderNumber} was created, but the tracking link could not be prepared: ${getErrorMessage(shareError)}`,
        )
      }
    } catch (orderError) {
      setError(getErrorMessage(orderError))
    } finally {
      setSubmitting(false)
    }
  }

  const createMissingLink = async () => {
    if (!createdOrder) return

    setError(null)

    setSubmitting(true)

    try {
      const share = createdOrder.trackingPath
        ? { trackingPath: createdOrder.trackingPath, expiresAt: createdOrder.expiresAt }
        : await sharedTrackingApi.createShare(createdOrder.id)
      const url = buildTrackingUrl(share.trackingPath)

      setCreatedOrder((current) =>
        current
          ? { ...current, trackingUrl: url, trackingPath: share.trackingPath, expiresAt: share.expiresAt }
          : current,
      )
    } catch (shareError) {
      setError(getErrorMessage(shareError))
    } finally {
      setSubmitting(false)
    }
  }

  const copyLink = async () => {
    if (!createdOrder?.trackingUrl) return

    try {
      await navigator.clipboard.writeText(createdOrder.trackingUrl)
    } catch (clipboardError) {
      setError(`Could not copy the link: ${getErrorMessage(clipboardError)}`)
    }
  }

  const copyOtp = async () => {
    if (!createdOrder?.deliveryOtp) return
    try {
      await navigator.clipboard.writeText(createdOrder.deliveryOtp)
      setOtpCopied(true)
      window.setTimeout(() => setOtpCopied(false), 2000)
    } catch (clipboardError) {
      setError(`Could not copy the delivery OTP: ${getErrorMessage(clipboardError)}`)
    }
  }

  const resetForm = () => {
    setCreatedOrder(null)

    setRecipient(initialRecipient)

    setItems([])

    setVariantSelections({})

    setDestinationAddress(null)

    setDeliveryInstructions("")

    setCustomerNotes("")

    setSearch("")

    setError(null)
    setOtpCopied(false)
  }

  const totalQuantity = items.reduce((total, item) => total + item.quantity, 0)
  const estimatedSubtotal = items.reduce(
    (total, item) =>
      total + Number(item.variant?.price_override ?? item.product.base_price) * item.quantity,
    0,
  )
  const categories = useMemo(
    () => [...new Set(products.map((product) => product.category?.name).filter((name): name is string => Boolean(name)))],
    [products],
  )
  const brands = useMemo(
    () => [...new Set(products.map((product) => product.brand?.name).filter((name): name is string => Boolean(name)))],
    [products],
  )
  const visibleProducts = products.filter((product) => {
    const matchesCategory =
      selectedCategory === "All products" || product.category?.name === selectedCategory
    const matchesBrand =
      selectedBrand === "All brands" || product.brand?.name === selectedBrand
    return matchesCategory && matchesBrand
  })

  if (createdOrder) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader
          title="Phone order created"
          description="The order uses the existing COD fulfillment flow. Share the tracking link with the recipient."
          action={
            <Link to="/admin/orders">
              <Button variant="outline">
                <ArrowLeft size={16} /> Orders
              </Button>
            </Link>
          }
        />
        <section className="space-y-5 rounded-2xl border border-border bg-white p-5 shadow-sm sm:p-7">
          <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
            <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={22} />
            <div>
              <p className="text-sm font-black">
                Order {createdOrder.orderNumber} is ready.
              </p>
              <p className="mt-1 text-xs text-emerald-800">
                The COD order is in the existing fulfillment flow. The recipient can follow delivery using the private link below.
              </p>
            </div>
          </div>
          <div className="grid gap-4 rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-4 sm:grid-cols-[1fr_auto] sm:items-center sm:p-5">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700">
                <ShieldCheck size={21} />
              </span>
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-amber-900">
                  Delivery verification OTP
                </p>
                <p className="mt-1 font-mono text-3xl font-black tracking-[0.3em] text-slate-950">
                  {createdOrder.deliveryOtp}
                </p>
                <p className="mt-1 text-xs leading-5 text-amber-900">
                  Keep this code available for handoff. The recipient gives it to the delivery partner, who enters it to verify delivery. Do not include it in the public tracking link.
                </p>
              </div>
            </div>
            <Button type="button" variant="outline" className="border-amber-300 bg-white" onClick={copyOtp}>
              {otpCopied ? <CheckCircle2 size={15} /> : <Copy size={15} />}
              {otpCopied ? "OTP copied" : "Copy OTP"}
            </Button>
          </div>
          {error && (
            <p
              role="alert"
              className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
            >
              {error}
            </p>
          )}
          {createdOrder.trackingUrl ? (
            <div className="space-y-3 rounded-xl border border-sky-200 bg-sky-50/60 p-4">
              <div>
                <p className="text-sm font-black text-slate-900">Share live tracking</p>
                <p className="mt-1 text-xs text-slate-600">Send this private link to the recipient. No account is needed.</p>
              </div>
              <label
                className="block text-xs font-bold uppercase tracking-wide text-slate-600"
                htmlFor="tracking-link"
              >
                Shareable tracking link
              </label>
              <input
                id="tracking-link"
                className="field w-full"
                readOnly
                value={createdOrder.trackingUrl}
                onFocus={(event) => event.currentTarget.select()}
              />
              <div className="flex flex-wrap gap-2">
                <Button onClick={copyLink}>
                  <Copy size={16} /> Copy link
                </Button>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`Track your Hindustan Hardware order ${createdOrder.orderNumber}: ${createdOrder.trackingUrl}`)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Button variant="secondary">
                    <Share2 size={16} /> Share on WhatsApp
                  </Button>
                </a>
              </div>
            </div>
          ) : (
            <Button type="button" onClick={createMissingLink} disabled={submitting}>
              {submitting && <Loader2 className="animate-spin" size={16} />}
              Create tracking link
            </Button>
          )}
          <Button type="button" variant="outline" onClick={resetForm}>
            Create another phone order
          </Button>
        </section>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1600px] pb-5">
      <PageHeader
        title="Create Phone Order"
        description="Place a COD order for a guest recipient and create a private live-tracking link."
        action={
          <Link to="/admin/orders">
            <Button variant="outline">
              <ArrowLeft size={16} /> Orders
            </Button>
          </Link>
        }
      />
      {error && (
        <p
          role="alert"
          className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      <form
        onSubmit={createOrder}
        className="grid min-w-0 items-start gap-3 sm:gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(230px,0.9fr)]"
      >
        <section className="min-w-0 space-y-3 rounded-xl border border-border bg-white p-3 shadow-xs sm:p-5 lg:col-span-2">
          <div className="flex items-center gap-2">
            <h2 className="flex items-center gap-2 text-sm font-black text-slate-900">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-amber-100 text-amber-700">
                <PhoneCall size={16} />
              </span>
              Recipient &amp; Destination
            </h2>
            <p className="text-[11px] text-slate-500">Recipient details are entered with the delivery address.</p>
          </div>
          <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1.5fr)_auto] sm:items-center">
            {destinationAddress ? (
              <>
                <div className="min-w-0 rounded-lg bg-slate-50 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Recipient</p>
                  <p className="mt-1 break-words text-sm font-bold text-slate-900">{recipient.recipientName}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-600">
                    <PhoneCall size={12} /> {recipient.phone}
                  </p>
                </div>
                <div className="flex min-w-0 items-start gap-2 rounded-lg bg-slate-50 p-3">
                  <MapPin
                    className="mt-0.5 shrink-0 text-emerald-600"
                    size={16}
                  />
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Complete delivery address</p>
                    <p className="mt-1 break-words text-xs leading-5 text-slate-700">
                      {[
                        destinationAddress.addressLine1,
                        destinationAddress.addressLine2,
                        destinationAddress.landmark,
                        destinationAddress.city,
                        destinationAddress.state,
                        destinationAddress.postalCode,
                      ].filter(Boolean).join(", ")}
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="justify-center whitespace-nowrap text-xs"
                  onClick={() => setAddressPickerOpen(true)}
                >
                  <MapPin size={14} /> Edit delivery location
                </Button>
              </>
            ) : (
              <>
                <div className="text-xs text-slate-600 md:col-span-2">
                  <p className="font-bold text-slate-900">No recipient or destination selected</p>
                  <p className="mt-1">Add the recipient name, phone number, and exact delivery address together.</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="justify-center whitespace-nowrap border-amber-300 text-xs text-amber-800 hover:bg-amber-50"
                  onClick={() => setAddressPickerOpen(true)}
                >
                  <MapPin size={14} /> Add recipient &amp; address
                </Button>
              </>
            )}
          </div>
          <label className="block text-xs font-bold text-slate-700">
            Delivery instructions <span className="font-normal text-slate-400">(optional)</span>
            <textarea
              className="field mt-1.5 min-h-14 w-full resize-y text-xs font-normal normal-case"
              maxLength={200}
              placeholder="Call on arrival, gate details..."
              value={deliveryInstructions}
              onChange={(event) => setDeliveryInstructions(event.target.value)}
            />
            <span className="mt-1 block text-right text-[10px] font-normal text-slate-400">{deliveryInstructions.length} / 200</span>
          </label>
        </section>

        <section className="min-w-0 space-y-3 rounded-xl border border-border bg-white p-3 shadow-xs sm:space-y-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-slate-900">Build the order</h2>
              <p className="mt-1 text-xs text-slate-500">Choose variants, then add products to the order summary.</p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand/10 px-2.5 py-1 text-xs font-bold text-brand">
              <ShoppingBag size={14} /> {totalQuantity} item{totalQuantity === 1 ? "" : "s"}
            </span>
          </div>
          <label className="relative block">
            <span className="sr-only">Search products</span>
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={16}
            />
            <input
              className="field h-10 w-full !pl-9 text-xs"
              placeholder="Search products by name, Item Code or brand..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <div className="flex flex-wrap items-center gap-1.5">
            {["All products", ...categories].map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setSelectedCategory(category)}
                className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-bold transition ${
                  selectedCategory === category
                    ? "border-amber-400 bg-amber-100 text-amber-900"
                    : "border-slate-200 bg-white text-slate-600 hover:border-amber-300 hover:text-slate-900"
                }`}
              >
                {category === "All products" && <Layers3 size={12} className="mr-1 inline" />}
                {category}
              </button>
            ))}
            <label className="ml-auto">
              <span className="sr-only">Filter by brand</span>
              <select
                className="field h-8 max-w-32 py-1 text-[10px]"
                value={selectedBrand}
                onChange={(event) => setSelectedBrand(event.target.value)}
              >
                <option>All brands</option>
                {brands.map((brand) => <option key={brand}>{brand}</option>)}
              </select>
            </label>
          </div>
          <div className="max-h-[min(44vh,26rem)] min-h-40 space-y-2 overflow-y-auto rounded-xl border border-border bg-slate-50 p-2">
            {loadingProducts ? (
              <p className="flex items-center justify-center gap-2 p-8 text-sm text-slate-500">
                <Loader2 size={16} className="animate-spin" /> Loading
                products...
              </p>
            ) : visibleProducts.length ? (
              visibleProducts.map((product) => {
                const activeVariants = product.variants?.filter((variant) => variant.is_active) ?? []
                const selectedVariant = activeVariants.find((variant) => variant.id === variantSelections[product.id])
                const itemKey = `${product.id}:${selectedVariant?.id ?? ""}`
                const selectedItem = items.find((item) => `${item.product.id}:${item.variant?.id ?? ""}` === itemKey)
                const unitPrice = Number(selectedVariant?.price_override ?? product.base_price)
                return (
                <div
                  key={product.id}
                  className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white p-2.5 transition hover:border-amber-300 hover:shadow-sm"
                >
                  {product.image_url ? (
                    <img src={product.image_url} alt="" className="h-12 w-12 shrink-0 rounded-md border border-slate-100 bg-white object-contain p-1" />
                  ) : (
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-md border border-slate-100 bg-slate-50 text-slate-400">
                      <Package size={18} />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 text-xs font-bold leading-4 text-slate-900">{product.name}</p>
                    <p className="mt-0.5 text-[10px] text-slate-500">
                      {product.brand?.name ? `${product.brand.name} · ` : ""}{formatPrice(unitPrice)}{product.unit ? ` / ${product.unit}` : ""}
                      {typeof product.inventory?.quantity_available === "number" && (
                        <span className={`ml-1.5 font-bold ${product.inventory.quantity_available > 0 ? "text-emerald-700" : "text-red-600"}`}>
                          · {product.inventory.quantity_available > 0 ? `In stock (${product.inventory.quantity_available})` : "Out of stock"}
                        </span>
                      )}
                    </p>
                    {activeVariants.length > 0 && (
                      <select
                        aria-label={`Choose a variant for ${product.name}`}
                        className="field mt-1.5 h-7 w-full py-0.5 text-[10px]"
                        value={variantSelections[product.id] ?? ""}
                        onChange={(event) => setVariantSelections((current) => ({
                          ...current,
                          [product.id]: event.target.value,
                        }))}
                      >
                        <option value="">Select size / variant</option>
                        {activeVariants.map((variant) => (
                          <option key={variant.id} value={variant.id}>
                            {variant.name} · {formatPrice(variant.price_override ?? product.base_price)}
                          </option>
                        ))}
                      </select>
                    )}
                    {selectedItem && (
                      <p className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700">
                        <CheckCircle2 size={11} /> {selectedItem.quantity} in order
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant={selectedItem ? "secondary" : "outline"}
                    className="h-8 shrink-0 px-2.5 py-1 text-[10px]"
                    onClick={() => addItem(product)}
                    disabled={activeVariants.length > 0 && !variantSelections[product.id]}
                    aria-label={`Add ${product.name}`}
                  >
                    <Plus size={13} /> Add
                  </Button>
                </div>
              )})
            ) : (
              <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-slate-500">
                <Search size={20} />
                No products match these filters.
              </div>
            )}
          </div>
        </section>

        <section className="min-w-0 space-y-3 rounded-xl border border-border bg-white p-3 shadow-xs sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-black text-slate-900">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-amber-100 text-amber-700">
                <ShoppingBag size={16} />
              </span>
              Order Summary
            </h2>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">
              {items.length} {items.length === 1 ? "item" : "items"}
            </span>
          </div>
          <div className="max-h-[min(36vh,22rem)] min-h-24 space-y-2 overflow-y-auto pr-1">
            {items.length ? items.map(({ product, variant, quantity }) => {
              const itemKey = `${product.id}:${variant?.id ?? ""}`
              const unitPrice = Number(variant?.price_override ?? product.base_price)
              return (
                <div key={itemKey} className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 p-2">
                  {product.image_url ? (
                    <img src={product.image_url} alt="" className="h-11 w-11 shrink-0 rounded-md border border-slate-100 bg-white object-contain p-1" />
                  ) : (
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-white text-slate-400">
                      <Package size={18} />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-[11px] font-bold leading-4 text-slate-900">{product.name}</p>
                    <p className="truncate text-[10px] text-slate-500">
                      {variant ? `${variant.name} · ` : ""}{formatPrice(unitPrice)}
                    </p>
                    <div className="mt-1 flex items-center gap-1">
                      <button
                        type="button"
                        aria-label={`Decrease ${product.name} quantity`}
                        className="grid h-6 w-6 place-items-center rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                        onClick={() => quantity === 1
                          ? setItems((current) => current.filter((item) => `${item.product.id}:${item.variant?.id ?? ""}` !== itemKey))
                          : changeQuantity(itemKey, quantity - 1)}
                      >
                        <Minus size={11} />
                      </button>
                      <span className="min-w-6 text-center text-[10px] font-bold">{quantity}</span>
                      <button
                        type="button"
                        aria-label={`Increase ${product.name} quantity`}
                        className="grid h-6 w-6 place-items-center rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                        onClick={() => changeQuantity(itemKey, quantity + 1)}
                      >
                        <Plus size={11} />
                      </button>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-[11px] font-black text-slate-900">{formatPrice(unitPrice * quantity)}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${product.name}`}
                      className="rounded p-1 text-red-500 hover:bg-red-50"
                      onClick={() => setItems((current) => current.filter(
                        (item) => `${item.product.id}:${item.variant?.id ?? ""}` !== itemKey,
                      ))}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              )
            }) : (
              <div className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-[11px] text-slate-500">
                <ShoppingBag size={18} />
                Your selected products will appear here.
              </div>
            )}
          </div>
          <div className="space-y-2 border-t border-slate-200 pt-3">
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span>Subtotal ({totalQuantity} items)</span>
              <span className="font-bold text-slate-900">{formatPrice(estimatedSubtotal)}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-amber-100 px-3 py-2">
              <span className="text-xs font-black text-slate-900">Estimated total</span>
              <span className="text-sm font-black text-slate-900">{formatPrice(estimatedSubtotal)}</span>
            </div>
            <p className="text-[10px] leading-4 text-slate-500">
              Final amount and stock are confirmed by the server when you place the order.
            </p>
          </div>
          <label className="block text-[11px] font-bold text-slate-700">
            Customer notes <span className="font-normal text-slate-400">(optional)</span>
            <textarea
              className="field mt-1.5 min-h-16 w-full resize-y text-xs font-normal normal-case"
              maxLength={500}
              placeholder="Any special instructions for delivery..."
              value={customerNotes}
              onChange={(event) => setCustomerNotes(event.target.value)}
            />
            <span className="mt-1 block text-right text-[10px] font-normal text-slate-400">{customerNotes.length} / 200</span>
          </label>
        </section>

        <section className="z-10 min-w-0 space-y-3 rounded-xl border border-slate-200 bg-white p-3 shadow-lg lg:sticky lg:bottom-3 lg:col-span-2 sm:p-4">
          <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
            <p className="hidden items-start gap-2 text-[10px] leading-4 text-slate-500 lg:flex">
              <ShieldCheck size={15} className="mt-0.5 shrink-0 text-amber-600" />
              The server checks order totals and stock. The tracking link can be opened without signing in; the delivery OTP is shown after order creation.
            </p>
            <Button
              type="submit"
              disabled={submitting || items.length === 0}
              className="h-10 min-w-52 bg-amber-400 font-black text-slate-950 hover:bg-amber-300"
            >
              {submitting ? (
                <Loader2 size={17} className="animate-spin" />
              ) : (
                <Check size={17} />
              )}
              {submitting
                ? "Creating order..."
                : "Place COD Order & Create Link"}
            </Button>
          </div>
        </section>
      </form>
      {addressPickerOpen && (
        <AddressPickerModal
          isOpen
          onClose={() => setAddressPickerOpen(false)}
          initialCity={destinationAddress?.city || "Jehanabad"}
          initialRecipientName={recipient.recipientName}
          initialPhone={recipient.phone}
          onConfirmAddress={async (address) => {
            setDestinationAddress(address)
            setRecipient({
              recipientName: address.recipientName,
              phone: address.phone,
            })
            setAddressPickerOpen(false)
          }}
        />
      )}
    </div>
  )
}
