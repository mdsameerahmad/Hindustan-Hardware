import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Banknote,
  Check,
  Loader2,
  Lock,
  ShieldCheck,
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

  const handleContinueToReview = async () => {
    await validateCartAndInventory()
    // Always advance to Step 2 so the customer can review their items, see live prices and specific stock status
    setStep(2)
  }

  const handlePlaceCodOrder = async () => {
    const order = await submitOrder()
    if (order) {
      notify("Order placed successfully via Cash on Delivery")
      // Clear or refresh the authenticated cart from backend (which backend wiped)
      await refreshBackendCart()
      navigate(`/order-success/${order.id}`, {
        state: { order },
      })
    }
  }

  // Selected address snapshot summary for review
  const selectedSavedObj = addresses.find((a) => a.id === selectedAddressId)
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

      <div className="mb-8 grid grid-cols-4 rounded-xl border border-border bg-white text-center">
        {["Delivery", "Review", "Payment", "Confirmation"].map((label, index) => (
          <div
            key={label}
            className={`checkout-step ${step >= index + 1 ? "active" : ""}`}
          >
            <span>{step > index + 1 ? <Check size={15} /> : index + 1}</span>
            <b>{label}</b>
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
                Choose a saved address from your address book or enter a new delivery address below.
              </p>

              <div className="mt-6 space-y-6">
                {addresses.length > 0 && (
                  <AddressManager
                    addresses={addresses}
                    loading={loadingAddresses}
                    selectedAddressId={selectedAddressId}
                    onSelectAddress={(addr) => setSelectedAddressId(addr.id)}
                    onCreateAddress={createAddress}
                    onSetDefaultAddress={setDefaultAddress}
                    onDeleteAddress={deleteAddress}
                  />
                )}

                {/* If no saved addresses or user prefers manual input */}
                {addresses.length === 0 && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label="Full name"
                      value={manualAddress.recipientName}
                      onChange={(val) => updateManualAddress("recipientName", val)}
                    />
                    <Field
                      label="Phone number (10 digits)"
                      value={manualAddress.phone}
                      onChange={(val) => updateManualAddress("phone", val.replace(/\D/g, "").slice(0, 10))}
                    />
                    <Field
                      label="PIN code (6 digits)"
                      value={manualAddress.postalCode}
                      onChange={(val) => updateManualAddress("postalCode", val.replace(/\D/g, "").slice(0, 6))}
                    />
                    <Field
                      label="City"
                      value={manualAddress.city}
                      onChange={(val) => updateManualAddress("city", val)}
                    />
                    <div className="sm:col-span-2">
                      <Field
                        label="House / Street address"
                        value={manualAddress.addressLine1}
                        onChange={(val) => updateManualAddress("addressLine1", val)}
                      />
                    </div>
                    <Field
                      label="Landmark (optional)"
                      value={manualAddress.landmark || ""}
                      onChange={(val) => updateManualAddress("landmark", val)}
                    />
                    <Field
                      label="State"
                      value={manualAddress.state}
                      onChange={(val) => updateManualAddress("state", val)}
                    />
                  </div>
                )}

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

          {/* STEP 3: Payment Method (Cash on Delivery ONLY) */}
          {step === 3 && (
            <>
              <h2 className="text-xl font-black">Payment method</h2>
              <p className="mt-2 text-sm text-slate-500">
                Hindustan Hardware strictly operates on verified Cash on Delivery (COD). Pay in cash upon physical receipt of goods at your delivery address.
              </p>

              <div className="mt-6 space-y-3">
                <label className="flex cursor-pointer items-start gap-4 rounded-xl border-2 border-brand bg-blue-50/50 p-4 shadow-sm">
                  <input
                    type="radio"
                    name="paymentMethod"
                    checked={true}
                    readOnly
                    className="mt-1 text-brand"
                  />
                  <Banknote className="h-6 w-6 text-brand shrink-0 mt-0.5" />
                  <div>
                    <b className="block text-ink text-base">Cash on Delivery (COD)</b>
                    <p className="mt-0.5 text-xs text-slate-600 leading-relaxed">
                      Pay cash upon delivery. Inspect pipes, fittings, and sanitary ware at your doorstep before payment.
                    </p>
                    <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                      <ShieldCheck size={16} />
                      Zero advance fees · Genuine goods guarantee
                    </div>
                  </div>
                </label>
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
              <span className="text-white font-medium">Cash on Delivery</span>
            </div>
          </div>

          <div className="mt-5 flex justify-between border-t border-white/15 pt-5 text-xl font-black">
            <span>Total Payable</span>
            <span>{formatPrice(validationResult?.totalAmount ?? cartTotal)}</span>
          </div>

          <div className="mt-5 rounded-lg bg-white/10 p-3 text-xs leading-relaxed text-slate-300">
            <p className="font-bold text-white mb-1">COD Payment Notice:</p>
            Payment status remains <b>Pending</b> until our store driver inspects the products with you and receives cash.
          </div>
        </aside>
      </div>
    </div>
  )
}
