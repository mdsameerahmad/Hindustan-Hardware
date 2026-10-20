import { useState, useEffect } from 'react'
import { productImagesApi } from '../api'
import type { BackendProductImage } from '../types'

export function useProductImages(productId: string | undefined, defaultImageUrl?: string) {
  const [images, setImages] = useState<BackendProductImage[]>([])
  const [selectedImage, setSelectedImage] = useState<string>(defaultImageUrl || '')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true
    if (!productId) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    productImagesApi
      .getProductImages(productId)
      .then((data) => {
        if (!isMounted) return
        setImages(data || [])
        if (data && data.length > 0) {
          const primary = data.find((img) => img.is_primary) || data[0]
          setSelectedImage(primary.public_url || defaultImageUrl || '')
        } else if (defaultImageUrl) {
          setSelectedImage(defaultImageUrl)
        }
      })
      .catch((err) => {
        if (!isMounted) return
        setError(err.message || 'Failed to load gallery images')
        if (defaultImageUrl) setSelectedImage(defaultImageUrl)
      })
      .finally(() => {
        if (isMounted) setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [productId, defaultImageUrl])

  return {
    images,
    selectedImage,
    setSelectedImage,
    loading,
    error,
    refresh: () => {
      if (productId) {
        setLoading(true)
        productImagesApi.getProductImages(productId).then((data) => {
          setImages(data || [])
          setLoading(false)
        }).catch(() => setLoading(false))
      }
    },
  }
}
