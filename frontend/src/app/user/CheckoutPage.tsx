import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Banknote,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Lock,
  QrCode,
  ShieldCheck,
  Smartphone,
} from "lucide-react"
import { useState } from "react"
import { Link, useNavigate } from "react-router"
import { useAuth } from "../authContext"
import { Button, EmptyState, PageHeader, formatPrice } from "../components"
import { AddressManager } from "../features/components/AddressManager"
import { useAddresses } from "../features/hooks/useAddresses"
import { useCheckout } from "../features/hooks/useCheckout"
import { useStore } from "../store"

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
}) {
  return (
    <label className="field-label">
      {label}
      <input
        type={type}
        className="field mt-2"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

export function CheckoutPage() {
  const { cart, products, cartTotal, notify, refreshBackendCart } = useStore()
  const { isAuthenticated, loading: authLoading } = useAuth()
  const navigate = useNavigate()

  const {
    addresses,
    loading: loadingAddresses,
    createAddress,
    setDefaultAddress,
    deleteAddress,
  } = useAddresses(isAuthenticated)

  const {
    step,
    setStep,
    selectedAddressId,
    setSelectedAddressId,
    manualAddress,
    updateManualAddress,
    isAddressValid,
    customerNotes,
    setCustomerNotes,
    validating,
    submitting,
    validationResult,
    validationError,
    submissionError,
    validateCartAndInventory,
    submitOrder,
  } = useCheckout()

  const [paymentChoice, setPaymentChoice] = useState<"cod" | "upi">("cod")
  const [copiedUpi, setCopiedUpi] = useState(false)
  const [copiedPhone, setCopiedPhone] = useState(false)

  const UPI_ID = "eazypay.2fw1ea1efmkfv8f@icici"
  const UPI_PHONE = "8935926021"
  const PAYEE_NAME = "Hindustan Hardware"

  // Auto-select default address if user has saved addresses
  useState(() => {
    if (addresses.length > 0 && !selectedAddressId) {
      const def = addresses.find((a) => a.is_default) || addresses[0]
      if (def) {
        setSelectedAddressId(def.id)
      }
    }
  })

  // Redirect unauthenticated guests to login with return path
  if (!authLoading && !isAuthenticated) {
    return (
      <div className="container-narrow py-12">
        <div className="rounded-2xl border border-border bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-blue-50 text-brand">
            <Lock size={32} />
          </div>
          <h2 className="text-2xl font-black">Login required for checkout</h2>
          <p className="mt-2 text-slate-600">
            Please log in or create an account to select a delivery address and place your order.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link to="/login?from=/checkout">
              <Button>Log In to Continue</Button>
            </Link>
            <Link to="/register?from=/checkout">
              <Button variant="outline">Create Account</Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (!cart.length) {
    return (
      <div className="container-narrow py-12">
        <EmptyState
          title="No items to checkout"
          text="Add products to your cart before starting checkout."
          action={
            <Link to="/products">
              <Button>Browse products</Button>
            </Link>
          }
        />
      </div>
    )
  }

  // Selected address snapshot summary for review
  const selectedSavedObj = addresses.find((a) => a.id === selectedAddressId)

  const handleContinueToReview = async () => {
    const selectedSnapshot = selectedSavedObj ? {
      recipientName: selectedSavedObj.recipient_name,
      phone: selectedSavedObj.phone,
      addressLine1: selectedSavedObj.address_line1,
      addressLine2: selectedSavedObj.address_line2,
      landmark: selectedSavedObj.landmark,
      city: selectedSavedObj.city,
      state: selectedSavedObj.state,
      postalCode: selectedSavedObj.postal_code,
      country: selectedSavedObj.country,
      addressType: selectedSavedObj.address_type,
      latitude: selectedSavedObj.latitude,
      longitude: selectedSavedObj.longitude,
      formattedAddress: selectedSavedObj.formatted_address,
      geocodingProvider: selectedSavedObj.geocoding_provider,
    } : null

    await validateCartAndInventory(selectedSnapshot)
    // Always advance to Step 2 so the customer can review their items, see live prices and specific stock status
    setStep(2)
  }

  const handlePlaceCodOrder = async () => {
    const selectedSnapshot = selectedSavedObj ? {
      recipientName: selectedSavedObj.recipient_name,
      phone: selectedSavedObj.phone,
      addressLine1: selectedSavedObj.address_line1,
      addressLine2: selectedSavedObj.address_line2,
      landmark: selectedSavedObj.landmark,
      city: selectedSavedObj.city,
      state: selectedSavedObj.state,
      postalCode: selectedSavedObj.postal_code,
      country: selectedSavedObj.country,
      addressType: selectedSavedObj.address_type,
      latitude: selectedSavedObj.latitude,
      longitude: selectedSavedObj.longitude,
      formattedAddress: selectedSavedObj.formatted_address,
      geocodingProvider: selectedSavedObj.geocoding_provider,
    } : null

    const order = await submitOrder(selectedSnapshot)
    if (order) {
      notify(paymentChoice === "upi" ? "Order placed successfully! Complete your UPI payment." : "Order placed successfully via Cash on Delivery")
      // Clear or refresh the authenticated cart from backend (which backend wiped)
      await refreshBackendCart()
      navigate(`/order-success/${order.id}`, {
        state: { order, chosenPaymentMethod: paymentChoice },
      })
    }
  }

  const copyToClipboard = (text: string, type: "upi" | "phone") => {
    try {
      navigator.clipboard.writeText(text)
      if (type === "upi") {
        setCopiedUpi(true)
        setTimeout(() => setCopiedUpi(false), 2000)
      } else {
        setCopiedPhone(true)
        setTimeout(() => setCopiedPhone(false), 2000)
      }
    } catch {
      // ignore clipboard error
    }
  }

  const payableAmount = validationResult?.totalAmount ?? cartTotal
  const upiIntentUri = `upi://pay?pa=${UPI_ID}&pn=${encodeURIComponent(PAYEE_NAME)}&am=${payableAmount.toFixed(2)}&cu=INR&tn=${encodeURIComponent("Hindustan Hardware Order")}`
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(upiIntentUri)}`
  const displayAddress = selectedSavedObj
    ? {
        name: selectedSavedObj.recipient_name,
        phone: selectedSavedObj.phone,
        street: selectedSavedObj.address_line1 + (selectedSavedObj.address_line2 ? `, ${selectedSavedObj.address_line2}` : ""),
        city: selectedSavedObj.city,
        state: selectedSavedObj.state,
        pin: selectedSavedObj.postal_code,
      }
    : {
        name: manualAddress.recipientName,
        phone: manualAddress.phone,
        street: manualAddress.addressLine1 + (manualAddress.addressLine2 ? `, ${manualAddress.addressLine2}` : ""),
        city: manualAddress.city,
        state: manualAddress.state,
        pin: manualAddress.postalCode,
      }

  return (
    <div className="container-wide py-8">
      <PageHeader
        title="Secure Checkout"
        description="Verify your delivery details, live stock availability, and place your order via Cash on Delivery."
      />

      <div className="mb-6 sm:mb-8 grid grid-cols-4 overflow-hidden rounded-xl border border-border bg-white text-center">
        {["Delivery", "Review", "Payment", "Confirm"].map((label, index) => (
          <div
            key={label}
            className={`checkout-step py-2.5 px-1 sm:py-3.5 sm:px-2 ${step >= index + 1 ? "active" : ""}`}
          >
            <span className="h-6 w-6 sm:h-7 sm:w-7 text-xs">{step > index + 1 ? <Check size={13} /> : index + 1}</span>
            <b className="text-[11px] sm:text-xs truncate">{label}</b>
          </div>
        ))}
      </div>

      <div className="grid gap-7 lg:grid-cols-[1fr_360px]">
        <section className="rounded-xl border border-border bg-white p-5 sm:p-7">
          {/* STEP 1: Delivery Address Selection */}
          {step === 1 && (
            <>
              <h2 className="text-xl font-black">Delivery address</h2>
              <p className="mt-1 text-sm text-slate-500">
                Choose a saved address or use "Locate on Map & Select" to pin your exact delivery location.
              </p>
              <div className="mt-6 space-y-6">
                <AddressManager
                  addresses={addresses}
                  loading={loadingAddresses}
                  selectedAddressId={selectedAddressId}
                  onSelectAddress={(addr) => setSelectedAddressId(addr.id)}
                  onCreateAddress={async (payload) => {
                    const created = await createAddress(payload)
                    if (created?.id) setSelectedAddressId(created.id)
                    return created
                  }}
                  onSetDefaultAddress={setDefaultAddress}
                  onDeleteAddress={deleteAddress}
                  allowQuickForm={false}
                />



                {validationError && (
                  <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                    <AlertCircle className="h-5 w-5 shrink-0 text-red-600 mt-0.5" />
                    <div>
                      <p className="font-bold">Validation Error</p>
                      <p className="mt-0.5">{validationError}</p>
                    </div>
                  </div>
                )}

                <div className="pt-2">
                  <Button
                    disabled={!isAddressValid || validating}
                    onClick={handleContinueToReview}
                    className="flex items-center gap-2"
                  >
                    {validating ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Validating inventory...
                      </>
                    ) : (
                      <>
                        Continue to review <ArrowRight size={16} />
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </>
          )}

          {/* STEP 2: Review Cart & Server Validation */}
          {step === 2 && (
            <>
              <h2 className="text-xl font-black">Review order & server inventory</h2>
              <p className="mt-1 text-sm text-slate-500">
                Authoritative prices and live stock confirmed by Hindustan Hardware server.
              </p>

              {validationResult?.priceDiscrepancies && validationResult.priceDiscrepancies.length > 0 && (
                <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
                  <div>
                    <p className="font-bold">Price Update Notice</p>
                    <p className="mt-0.5">
                      Some prices have updated to current catalog rates:
                    </p>
                    <ul className="mt-1 list-disc list-inside text-xs space-y-1">
                      {validationResult.priceDiscrepancies.map((p) => (
                        <li key={p.productId}>
                          {p.productName}: {formatPrice(p.oldPrice)} &rarr; {formatPrice(p.currentPrice)}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {validationResult?.deliveryAvailable === false && (
                <div className="mt-4 flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
                    <div>
                      <p className="font-bold">Delivery unavailable</p>
                      <p className="mt-0.5">
                        {validationResult.deliveryMessage || "Delivery is not available in your location. Contact the shop for assistance."}
                      </p>
                    </div>
                  </div>
                  <a
                    href={`https://wa.me/918935926021?text=${encodeURIComponent(`Hello, delivery is unavailable for PIN code ${validationResult.deliveryPincode || displayAddress.pin}. Can you help?`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex shrink-0 items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-700"
                  >
                    Contact us on WhatsApp
                  </a>
                </div>
              )}

              <div className="mt-6 divide-y divide-border">
                {validationResult?.items?.map((item) => (
                  <div key={item.productId} className="flex gap-4 py-4 first:pt-0">
                    <div className="flex-1">
                      <b className="text-ink">{item.productName}</b>
                      <p className="text-sm text-slate-500">
                        Qty: {item.quantity} · Rate: {formatPrice(item.unitPrice)}
                      </p>
                      {!item.inStock && (
                        <p className="mt-1 text-xs font-bold text-red-600">
                          Insufficient stock: only {item.stockAvailable} available
                        </p>
                      )}
                    </div>
                    <b className="text-ink">{formatPrice(item.lineTotal)}</b>
                  </div>
                )) || (
                  <div className="py-4 text-slate-500">Validating items...</div>
                )}
              </div>

              <div className="mt-4 rounded-lg bg-slate-50 p-4 text-sm border border-slate-200">
                <b className="text-ink">Delivery destination:</b>
                <p className="mt-1 text-slate-600">
                  {displayAddress.name} ({displayAddress.phone}) — {displayAddress.street}, {displayAddress.city},{" "}
                  {displayAddress.state} {displayAddress.pin}
                </p>
              </div>

              <div className="mt-4">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Order / Delivery Notes (optional):
                </label>
                <textarea
                  className="w-full rounded-xl border border-border p-3 text-sm focus:border-brand focus:outline-none"
                  rows={2}
                  maxLength={500}
                  placeholder="e.g. Call before delivery, drop at gate..."
                  value={customerNotes}
                  onChange={(e) => setCustomerNotes(e.target.value)}
                />
              </div>

              {validationError && (
                <div className="mt-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                  <AlertCircle className="h-5 w-5 shrink-0 text-red-600 mt-0.5" />
                  <div>
                    <p className="font-bold">Stock or Validation Alert</p>
                    <p className="mt-0.5">{validationError}</p>
                  </div>
                </div>
              )}

              <div className="mt-7 flex gap-3">
                <Button variant="outline" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button
                  disabled={validationResult?.canCheckout === false}
                  onClick={() => setStep(3)}
                >
                  Proceed to Payment
                </Button>
              </div>
            </>
          )}

          {/* STEP 3: Payment Method (Cash on Delivery or Instant UPI Online) */}
          {step === 3 && (
            <>
              <h2 className="text-xl font-black">Payment method</h2>
              <p className="mt-2 text-sm text-slate-500">
                Choose your preferred payment method. You can pay securely online via UPI or choose Cash on Delivery at your doorstep.
              </p>

              <div className="mt-6 space-y-3.5">
                {/* Instant UPI Online Option */}
                <div
                  onClick={() => setPaymentChoice("upi")}
                  className={`cursor-pointer rounded-2xl border-2 p-4 sm:p-5 transition-all ${
                    paymentChoice === "upi"
                      ? "border-[#D4AF37] bg-amber-50/40 shadow-sm"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-start gap-3.5">
                    <input
                      type="radio"
                      name="paymentChoice"
                      checked={paymentChoice === "upi"}
                      onChange={() => setPaymentChoice("upi")}
                      className="mt-1 text-[#D4AF37] focus:ring-[#D4AF37]"
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <Smartphone className="h-5 w-5 text-amber-600 shrink-0" />
                          <b className="text-ink text-base">Pay Online via UPI (PhonePe / GPay / Paytm)</b>
                        </div>
                        <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 uppercase tracking-wide">
                          Instant App Open
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                        Tap on mobile to open PhonePe, Google Pay, or Paytm directly with the amount pre-filled, or scan QR code.
                      </p>

                      {/* Expanded UPI Details when selected */}
                      {paymentChoice === "upi" && (
                        <div className="mt-4 pt-4 border-t border-amber-200/60 space-y-3.5">
                          {/* Direct Mobile UPI Intent Button (Opens phone's installed UPI apps) */}
                          <div className="block sm:hidden">
                            <a
                              href={upiIntentUri}
                              className="flex items-center justify-center gap-2 w-full rounded-xl bg-[#0B0B0B] hover:bg-black text-[#D4AF37] font-bold text-sm py-3 px-4 shadow-sm transition active:scale-[0.99]"
                            >
                              <Smartphone size={18} />
                              <span>Pay {formatPrice(payableAmount)} via Installed UPI App</span>
                              <ExternalLink size={14} className="opacity-70" />
                            </a>
                            <p className="text-[11px] text-slate-500 text-center mt-1.5">
                              Tapping opens PhonePe, Google Pay, Paytm, or BHIM directly
                            </p>
                          </div>

                          {/* Desktop QR Code & App details */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                            <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                                Payee UPI ID
                              </span>
                              <div className="flex items-center justify-between gap-2">
                                <code className="text-xs font-mono font-bold text-slate-800 select-all break-all">
                                  {UPI_ID}
                                </code>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    copyToClipboard(UPI_ID, "upi")
                                  }}
                                  className="shrink-0 p-1.5 text-slate-500 hover:text-amber-700 hover:bg-amber-50 rounded-md transition"
                                  title="Copy UPI ID"
                                >
                                  {copiedUpi ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                                </button>
                              </div>
                            </div>

                            <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                                Online Pay Phone Number
                              </span>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-bold text-slate-800">
                                  +91 {UPI_PHONE}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    copyToClipboard(UPI_PHONE, "phone")
                                  }}
                                  className="shrink-0 p-1.5 text-slate-500 hover:text-amber-700 hover:bg-amber-50 rounded-md transition"
                                  title="Copy Phone Number"
                                >
                                  {copiedPhone ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Dynamic QR Code display */}
                          <div className="flex flex-col sm:flex-row items-center gap-4 rounded-xl border border-amber-200/80 bg-white p-3.5">
                            <div className="p-1.5 bg-white border border-slate-200 rounded-lg shadow-2xs shrink-0">
                              <img
                                src={qrCodeUrl}
                                alt="UPI Payment QR Code"
                                className="h-28 w-28 sm:h-24 sm:w-24 object-contain"
                              />
                            </div>
                            <div className="text-xs text-slate-600 space-y-1 text-center sm:text-left">
                              <p className="font-bold text-slate-900 flex items-center justify-center sm:justify-start gap-1.5">
                                <QrCode size={14} className="text-amber-700" />
                                Scan with any UPI app
                              </p>
                              <p className="text-[11px] text-slate-500">
                                Open Google Pay, PhonePe, Paytm, or BHIM on your device and scan this QR code to complete the payment of <b>{formatPrice(payableAmount)}</b>.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Cash on Delivery Option */}
                <div
                  onClick={() => setPaymentChoice("cod")}
                  className={`cursor-pointer rounded-2xl border-2 p-4 sm:p-5 transition-all ${
                    paymentChoice === "cod"
                      ? "border-brand bg-blue-50/40 shadow-sm"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-start gap-3.5">
                    <input
                      type="radio"
                      name="paymentChoice"
                      checked={paymentChoice === "cod"}
                      onChange={() => setPaymentChoice("cod")}
                      className="mt-1 text-brand focus:ring-brand"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Banknote className="h-5 w-5 text-brand shrink-0" />
                        <b className="text-ink text-base">Cash on Delivery (COD)</b>
                      </div>
                      <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                        Pay cash upon delivery. Inspect pipes, fittings, and sanitary ware at your doorstep before payment.
                      </p>
                      <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                        <ShieldCheck size={16} />
                        Zero advance fees · Genuine goods guarantee
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {submissionError && (
                <div className="mt-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                  <AlertCircle className="h-5 w-5 shrink-0 text-red-600 mt-0.5" />
                  <div>
                    <p className="font-bold">Order Placement Failed</p>
                    <p className="mt-0.5">{submissionError}</p>
                  </div>
                </div>
              )}

              <div className="mt-7 flex gap-3">
                <Button variant="outline" disabled={submitting} onClick={() => setStep(2)}>
                  Back
                </Button>
                <Button
                  disabled={submitting}
                  onClick={handlePlaceCodOrder}
                  className="flex items-center gap-2"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Placing Order Safely...
                    </>
                  ) : paymentChoice === "upi" ? (
                    <>
                      Confirm & Place Order (UPI Online)
                      <ArrowRight size={16} />
                    </>
                  ) : (
                    <>
                      Confirm Cash on Delivery Order
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </section>

        {/* ORDER SUMMARY SIDEBAR */}
        <aside className="h-fit rounded-xl bg-ink p-6 text-white shadow-md">
          <h2 className="text-lg font-black">Authoritative Price</h2>
          <div className="mt-5 space-y-3 text-sm text-slate-300">
            <div className="summary-line">
              <span>Items count</span>
              <b className="text-white">
                {validationResult?.itemCount || cart.reduce((s, i) => s + i.quantity, 0)} items
              </b>
            </div>
            <div className="summary-line">
              <span>Items subtotal</span>
              <b className="text-white">
                {formatPrice(validationResult?.subtotal ?? cartTotal)}
              </b>
            </div>
            <div className="summary-line">
              <span>Delivery fee</span>
              <span className="text-emerald-400 font-semibold">Free Store Delivery</span>
            </div>
            <div className="summary-line">
              <span>Payment mode</span>
              <span className="text-white font-medium">
                {paymentChoice === "upi" ? "Online via UPI" : "Cash on Delivery"}
              </span>
            </div>
          </div>

          <div className="mt-5 flex justify-between border-t border-white/15 pt-5 text-xl font-black">
            <span>Total Payable</span>
            <span>{formatPrice(validationResult?.totalAmount ?? cartTotal)}</span>
          </div>

          <div className="mt-5 rounded-lg bg-white/10 p-3 text-xs leading-relaxed text-slate-300">
            {paymentChoice === "upi" ? (
              <>
                <p className="font-bold text-white mb-1">Online UPI Payment:</p>
                Open PhonePe / Google Pay / Paytm on your phone to complete payment directly to <b>{UPI_ID}</b>.
              </>
            ) : (
              <>
                <p className="font-bold text-white mb-1">COD Payment Notice:</p>
                Payment status remains <b>Pending</b> until our store driver inspects the products with you and receives cash.
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
