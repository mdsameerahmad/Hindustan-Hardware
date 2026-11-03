import React, { useState } from 'react'
import { DEFAULT_PRODUCT_IMAGE, isUnsplashProductImage } from '../../utils/productImages'

export const FALLBACK_PRODUCT_IMAGE = DEFAULT_PRODUCT_IMAGE

interface ProductImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src?: string | null
  alt: string
  className?: string
  fallbackSrc?: string
}

export const ProductImage: React.FC<ProductImageProps> = ({
  src,
  alt,
  className = '',
  fallbackSrc = FALLBACK_PRODUCT_IMAGE,
  ...props
}) => {
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const preferredSource = src?.trim() && !isUnsplashProductImage(src)
    ? src.trim()
    : fallbackSrc
  // Tie the failure state to a specific URL so a newly uploaded/replaced image
  // gets a fresh load attempt instead of inheriting the previous image's error.
  const imageSrc = failedSource === preferredSource ? fallbackSrc : preferredSource

  return (
    <img
      src={imageSrc}
      alt={alt}
      loading="lazy"
      onError={() => setFailedSource(preferredSource)}
      className={className}
      {...props}
    />
  )
}
