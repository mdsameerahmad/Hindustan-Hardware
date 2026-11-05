
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
  const imageSrc = failedSource === preferredSource ? fallbackSrc : preferredSource

  const isMissing =
    !src?.trim() ||
    src === FALLBACK_PRODUCT_IMAGE ||
    src === '/placeholder.webp' ||
    failedSource === imageSrc

  if (isMissing) {
    return (
      <div
        className={`relative flex items-center justify-center bg-slate-50/80 backdrop-blur-xl border border-slate-200/50 overflow-hidden ${className}`}
        style={{ minHeight: '60px' }}
      >
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

  return (
    <img
      src={imageSrc}
      alt={alt}
      loading="lazy"
      onError={() => setFailedSource(imageSrc)}
      className={className}
      {...props}
    />
  )
}
