import { useState, useCallback } from "react"
import { checkoutApi } from "../commerceApi"
import type {
  CheckoutValidationResult,
  OrderResponse,
  CheckoutAddressSnapshot,
} from "../commerceTypes"

export interface UseCheckoutState {
  step: number
  selectedAddressId: string
  manualAddress: CheckoutAddressSnapshot
  customerNotes: string
  validating: boolean
  submitting: boolean
  validationResult: CheckoutValidationResult | null
  validationError: string | null
  submissionError: string | null
  placedOrder: OrderResponse | null
  idempotencyKey: string
}

export function useCheckout() {
  const [step, setStep] = useState<number>(1)
  const [selectedAddressId, setSelectedAddressId] = useState<string>("")
  const [manualAddress, setManualAddress] = useState<CheckoutAddressSnapshot>({
    recipientName: "",
    phone: "",
    postalCode: "",
    addressLine1: "",
    landmark: "",
    city: "Jehanabad",
    state: "Bihar",
    country: "India",
    addressType: "Home",
  })
  const [customerNotes, setCustomerNotes] = useState<string>("")
  const [validating, setValidating] = useState<boolean>(false)
  const [submitting, setSubmitting] = useState<boolean>(false)
  const [validationResult, setValidationResult] = useState<CheckoutValidationResult | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [submissionError, setSubmissionError] = useState<string | null>(null)
  const [placedOrder, setPlacedOrder] = useState<OrderResponse | null>(null)

  // Generate a stable idempotency key for this checkout attempt
  const [idempotencyKey] = useState<string>(() => {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID()
    }
    return `hh-chk-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
  })

  const updateManualAddress = useCallback((field: keyof CheckoutAddressSnapshot, value: string) => {
    setManualAddress((prev) => ({ ...prev, [field]: value }))
  }, [])

  const isAddressValid = Boolean(
    selectedAddressId ||
      (manualAddress.recipientName.trim() &&
        manualAddress.phone.trim().length >= 10 &&
        manualAddress.postalCode.trim().length === 6 &&
        manualAddress.addressLine1.trim() &&
        manualAddress.city.trim() &&
        manualAddress.state.trim()),
  )

  /**
   * Run server-side validation against /api/v1/checkout/validate
   */
  const validateCartAndInventory = useCallback(async (): Promise<boolean> => {
    setValidating(true)
    setValidationError(null)

    try {
      const payload: {
        addressId?: string
        shippingAddress?: CheckoutAddressSnapshot
        paymentMethod: "cod"
      } = {
        paymentMethod: "cod",
      }

      if (selectedAddressId) {
        payload.addressId = selectedAddressId
      } else {
        payload.shippingAddress = manualAddress
      }

      const res = await checkoutApi.validateCheckout(payload)
      setValidationResult(res)

      if (!res.canCheckout) {
        const outOfStockItems = (res.items || []).filter((i: any) => !i.inStock)
        if (outOfStockItems.length > 0) {
          const names = outOfStockItems.map((i: any) => i.productName).join(", ")
          setValidationError(`Out of stock: ${names}. Available quantity: 0.`)
        } else {
          setValidationError("Some items in your cart exceed available stock or have changed in price.")
        }
        return false
      }
      return true
    } catch (err: any) {
      const msg = err?.message || "Failed to validate checkout cart with store server."
      setValidationError(msg)
      return false
    } finally {
      setValidating(false)
    }
  }, [selectedAddressId, manualAddress])

  /**
   * Submit Cash on Delivery Order against /api/v1/checkout
   */
  const submitOrder = useCallback(async (): Promise<OrderResponse | null> => {
    if (submitting) return null
    setSubmitting(true)
    setSubmissionError(null)

    try {
      const payload: {
        addressId?: string
        shippingAddress?: CheckoutAddressSnapshot
        paymentMethod: "cod"
        customerNotes?: string | null
        idempotencyKey: string
      } = {
        paymentMethod: "cod",
        customerNotes: customerNotes.trim() ? customerNotes.trim() : null,
        idempotencyKey,
      }

      if (selectedAddressId) {
        payload.addressId = selectedAddressId
      } else {
        payload.shippingAddress = manualAddress
      }

      const order = await checkoutApi.createOrder(payload)
      setPlacedOrder(order)
      return order
    } catch (err: any) {
      const msg = err?.message || "Failed to submit order. Please try again or verify your connection."
      setSubmissionError(msg)
      return null
    } finally {
      setSubmitting(false)
    }
  }, [submitting, selectedAddressId, manualAddress, customerNotes, idempotencyKey])

  return {
    step,
    setStep,
    selectedAddressId,
    setSelectedAddressId,
    manualAddress,
    setManualAddress,
    updateManualAddress,
    isAddressValid,
    customerNotes,
    setCustomerNotes,
    validating,
    submitting,
    validationResult,
    validationError,
    submissionError,
    placedOrder,
    idempotencyKey,
    validateCartAndInventory,
    submitOrder,
  }
}
