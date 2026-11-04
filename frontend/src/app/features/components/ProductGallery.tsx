import React from 'react'
import { ProductImage } from './ProductImage'
import type { BackendProductImage } from '../types'

interface ProductGalleryProps {
  mainImage: string
  images: BackendProductImage[]
  productName: string
  onSelectImage: (url: string) => void
  loading?: boolean
}

export const ProductGallery: React.FC<ProductGalleryProps> = ({
  mainImage,
  images,
  productName,
  onSelectImage,
  loading = false,
}) => {
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="aspect-square w-full rounded-2xl bg-slate-100 animate-pulse border border-border" />
        <div className="flex gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 w-16 rounded-lg bg-slate-100 animate-pulse border border-border" />
          ))}
        </div>
      </div>
    )
  }

  // Combine primary image and additional gallery images
  const allThumbnails = images.length > 0
    ? images.map((img) => ({ 
        id: img.id, 
        url: img.public_url || img.storage_path || '', 
        alt: img.alt_text || productName 
      }))
    : [{ id: 'main', url: mainImage, alt: productName }]

  return (
    <div className="space-y-3">
      {/* Main Image Display: shows completely edge-to-edge with no side borders or padding */}
      <div className="relative aspect-square max-h-[400px] w-full overflow-hidden rounded-2xl bg-slate-100 shadow-xs mx-auto">
        <ProductImage
          src={mainImage}
          alt={productName}
          className="h-full w-full object-contain p-4 transition duration-300 hover:scale-105"
        />
      </div>

      {/* Thumbnails */}
      {allThumbnails.length > 1 && (
        <div className="flex items-center gap-3 overflow-x-auto pb-1 scrollbar-none">
          {allThumbnails.map((thumb) => {
            const isSelected = mainImage === thumb.url
            return (
              <button
                key={thumb.id}
                type="button"
                onClick={() => thumb.url && onSelectImage(thumb.url)}
                className={`relative h-18 w-18 shrink-0 overflow-hidden rounded-xl border-2 transition ${
                  isSelected
                    ? 'border-[#D4AF37] ring-2 ring-[#D4AF37]/30 shadow-md'
                    : 'border-border bg-white hover:border-slate-300'
                }`}
              >
                <ProductImage
                  src={thumb.url}
                  alt={thumb.alt}
                  className="h-full w-full object-contain p-1"
                />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
