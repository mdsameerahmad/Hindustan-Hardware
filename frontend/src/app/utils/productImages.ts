export const DEFAULT_PRODUCT_IMAGE = '/product-placeholder.svg'

/** Unsplash is used for illustrative site photography, never as a product photo. */
export function isUnsplashProductImage(value: unknown): boolean {
  if (typeof value !== 'string') return false

  try {
    const hostname = new URL(value, 'https://hindustan-hardware.local').hostname.toLowerCase()
    return hostname === 'unsplash.com' || hostname.endsWith('.unsplash.com')
  } catch {
    return /(^|\/)unsplash\.com\//i.test(value)
  }
}

export function resolveProductImage(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_PRODUCT_IMAGE
  const imageUrl = value.trim()
  if (!imageUrl || isUnsplashProductImage(imageUrl)) return DEFAULT_PRODUCT_IMAGE
  return imageUrl
}
