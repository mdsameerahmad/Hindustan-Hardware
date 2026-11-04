<<<<<<< HEAD
import React, { useState } from 'react'
import { DEFAULT_PRODUCT_IMAGE, isUnsplashProductImage } from '../../utils/productImages'

export const FALLBACK_PRODUCT_IMAGE = DEFAULT_PRODUCT_IMAGE
=======
import React, { useEffect, useState } from 'react'

export const FALLBACK_PRODUCT_IMAGE = '/placeholder.webp'
>>>>>>> 513b49d (Done with Image Fixing)

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
<<<<<<< HEAD
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const preferredSource = src?.trim() && !isUnsplashProductImage(src)
    ? src.trim()
    : fallbackSrc
  // Tie the failure state to a specific URL so a newly uploaded/replaced image
  // gets a fresh load attempt instead of inheriting the previous image's error.
  const imageSrc = failedSource === preferredSource ? fallbackSrc : preferredSource
=======
  const [error, setError] = useState(false)

  useEffect(() => {
    setError(false)
  }, [src])
  
  // Check if we should show the "Image Uploaded Soon" glass effect
  // Show glass effect if src is missing, null, empty, or equals the placeholder
  const isMissing = error || !src || src === FALLBACK_PRODUCT_IMAGE || src === '/placeholder.webp'

  if (isMissing) {
    return (
      <div 
        className={`relative flex items-center justify-center bg-slate-50/80 backdrop-blur-xl border border-slate-200/50 overflow-hidden ${className}`}
        style={{ minHeight: '60px' }}
      >
        {/* Decorative glass elements */}
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-white/20 to-transparent pointer-events-none"></div>
        <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-slate-200/20 blur-3xl rounded-full animate-pulse"></div>
        
        <div className="relative z-10 px-2 text-center">
          <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.15em] text-slate-400/90 leading-tight">
            Image will be<br />Uploaded soon
          </p>
        </div>
      </div>
    )
  }
>>>>>>> 513b49d (Done with Image Fixing)

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailedSource(preferredSource)}
      className={className}
      {...props}
    />
  )
}
