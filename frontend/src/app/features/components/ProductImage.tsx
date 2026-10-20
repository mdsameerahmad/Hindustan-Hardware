import React, { useState } from 'react'

export const FALLBACK_PRODUCT_IMAGE =
  'https://images.unsplash.com/photo-1642797735471-3e90055c5ff9?auto=format&fit=crop&w=800&q=80'

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
  const [error, setError] = useState(false)
  const imageSrc = !error && src ? src : fallbackSrc

  return (
    <img
      src={imageSrc}
      alt={alt}
      loading="lazy"
      onError={() => setError(true)}
      className={className}
      {...props}
    />
  )
}
