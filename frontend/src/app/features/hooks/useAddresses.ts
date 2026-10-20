import { useState, useEffect, useCallback } from "react"
import { addressApi } from "../commerceApi"
import type { CustomerAddress, CreateAddressPayload, UpdateAddressPayload } from "../commerceTypes"

export function useAddresses(isAuthenticated: boolean) {
  const [addresses, setAddresses] = useState<CustomerAddress[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  const fetchAddresses = useCallback(async () => {
    if (!isAuthenticated) {
      setAddresses([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const data = await addressApi.getAddresses()
      setAddresses(Array.isArray(data) ? data : [])
    } catch (err: any) {
      setError(err?.message || "Failed to load saved addresses.")
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated])

  useEffect(() => {
    fetchAddresses()
  }, [fetchAddresses])

  const createAddress = async (payload: CreateAddressPayload): Promise<CustomerAddress> => {
    const created = await addressApi.createAddress(payload)
    await fetchAddresses()
    return created
  }

  const updateAddress = async (
    addressId: string,
    payload: UpdateAddressPayload,
  ): Promise<CustomerAddress> => {
    const updated = await addressApi.updateAddress(addressId, payload)
    await fetchAddresses()
    return updated
  }

  const setDefaultAddress = async (addressId: string): Promise<CustomerAddress> => {
    const updated = await addressApi.setDefaultAddress(addressId)
    await fetchAddresses()
    return updated
  }

  const deleteAddress = async (addressId: string): Promise<void> => {
    await addressApi.deleteAddress(addressId)
    await fetchAddresses()
  }

  return {
    addresses,
    loading,
    error,
    refresh: fetchAddresses,
    createAddress,
    updateAddress,
    setDefaultAddress,
    deleteAddress,
  }
}
