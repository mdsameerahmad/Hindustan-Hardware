import { Check, GitCompareArrows, ShoppingCart, SlidersHorizontal } from 'lucide-react'
import React, { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Button, formatPrice } from '../../components'
import type { Product } from '../../data'
import type { ProductAlternativeItem } from '../types'
import { ProductImage } from './ProductImage'

interface AlternativeProductsProps {
  alternatives: ProductAlternativeItem[]
  currentProduct?: Product | null
  loading?: boolean
  onAddToCart: (id: string) => void
  onToggleCompare?: (id: string) => void
  isCompared?: (id: string) => boolean
}

// Helper to extract key dimensions / keywords from product title or specs
function extractProductSignatures(p: { name: string; specs?: Record<string, any>; diameter?: string; size?: string; productType?: string; material?: string }) {
  const text = `${p.name} ${p.diameter || ''} ${p.size || ''} ${p.material || ''} ${p.productType || ''}`.toLowerCase()
  
  // Extract dimension patterns: e.g. 1.25", 1-1/4", 1/2", 0.5", 25mm, 32mm, 18"x16"x8"
  const sizeMatches = text.match(/(\d+(?:\.\d+)?(?:\/\d+)?(?:["']|\s*(?:inch|mm|cm|mtr|meter|in))?)/g) || []
  
  // Extract key functional type keywords
  const typeKeywords = [
    'valve', 'ball valve', 'angle cock', 'bib cock', 'pillar cock', 'concealed', 'sink',
    'pipe', 'elbow', 'tee', 'socket', 'union', 'coupling', 'nipple', 'flange', 'trap',
    'shower', 'faucet', 'tap', 'mixer', 'basin', 'closet', 'cistern', 'seat cover'
  ].filter((kw) => text.includes(kw))

  return {
    rawText: text,
    sizes: Array.from(new Set(sizeMatches.map((s) => s.trim()))),
    keywords: typeKeywords,
  }
}

export const AlternativeProducts: React.FC<AlternativeProductsProps> = ({
  alternatives,
  currentProduct,
  loading = false,
  onAddToCart,
  onToggleCompare,
  isCompared,
}) => {
  const [selectedBrandFilter, setSelectedBrandFilter] = useState<string>('all')

  // Extract signatures of the current product to filter equivalent products of different brands
  const currentSig = useMemo(() => {
    if (!currentProduct) return null
    return extractProductSignatures(currentProduct)
  }, [currentProduct])

  // Filter and rank alternatives
  const processedAlternatives = useMemo(() => {
    if (!alternatives.length) return []

    // 1. Filter out items from the exact same brand as current product (user wants cross-brand alternatives)
    const currentBrandId = currentProduct?.brandId
    const currentBrandName = currentProduct?.brandName?.toLowerCase() || currentProduct?.brand?.toLowerCase()
    
    let list = alternatives.filter((alt) => {
      if (currentBrandId && alt.product.brand?.id === currentBrandId) return false
      if (currentBrandName && alt.product.brand?.name?.toLowerCase() === currentBrandName) return false
      return true
    })

    // 2. Score candidates based on equivalence to current product
    if (currentSig) {
      list = list.map((item) => {
        const itemSig = extractProductSignatures({
          name: item.product.name,
          diameter: item.product.diameter || undefined,
          material: item.product.material || undefined,
          specs: item.product.specs,
        })

        let score = 0
        // Match functional keywords (e.g. "ball valve", "valve", "pipe")
        for (const kw of currentSig.keywords) {
          if (itemSig.rawText.includes(kw)) score += 5
        }
        // Match dimensional size (e.g. 1.25", 1/2", 25mm)
        for (const sz of currentSig.sizes) {
          if (sz.length > 1 && itemSig.rawText.includes(sz)) score += 6
        }
        // Match specification fields
        if (currentProduct?.material && item.product.material && 
            currentProduct.material.toLowerCase() === item.product.material.toLowerCase()) {
          score += 4
        }
        if (currentProduct?.diameter && item.product.diameter && 
            currentProduct.diameter.toLowerCase() === item.product.diameter.toLowerCase()) {
          score += 6
        }

        return { ...item, _matchScore: score }
      }).sort((a: any, b: any) => (b._matchScore ?? 0) - (a._matchScore ?? 0))
    }

    return list
  }, [alternatives, currentProduct, currentSig])

  // Get distinct brands present in the filtered alternatives
  const distinctBrands = useMemo(() => {
    const map = new Map<string, string>()
    processedAlternatives.forEach((alt) => {
      if (alt.product.brand?.id && alt.product.brand?.name) {
        map.set(alt.product.brand.id, alt.product.brand.name)
      }
    })
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
  }, [processedAlternatives])

  // Final filtered list based on active brand pill
  const displayedAlternatives = useMemo(() => {
    if (selectedBrandFilter === 'all') return processedAlternatives
    return processedAlternatives.filter((alt) => alt.product.brand?.id === selectedBrandFilter)
  }, [processedAlternatives, selectedBrandFilter])
  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-64 rounded-2xl bg-slate-100 animate-pulse border border-border" />
        ))}
      </div>
    )
  }

  if (!processedAlternatives.length) {
    return (
      <div className="rounded-2xl border border-border bg-white p-6 text-center">
        <p className="text-sm text-slate-500">
          No cross-brand alternatives found matching this specification.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Brand filter selector when multiple alternative brands are available */}
      {distinctBrands.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-border/70">
          <span className="text-xs font-bold text-slate-500 flex items-center gap-1.5 mr-1">
            <SlidersHorizontal size={13} className="text-[#D4AF37]" /> Filter Brand:
          </span>
          <button
            onClick={() => setSelectedBrandFilter('all')}
            className={`rounded-full px-3 py-1 text-xs font-bold transition ${
              selectedBrandFilter === 'all'
                ? 'bg-black text-[#D4AF37] shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All Brands ({processedAlternatives.length})
          </button>
          {distinctBrands.map((b) => {
            const count = processedAlternatives.filter((a) => a.product.brand?.id === b.id).length
            return (
              <button
                key={b.id}
                onClick={() => setSelectedBrandFilter(b.id)}
                className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                  selectedBrandFilter === b.id
                    ? 'bg-black text-[#D4AF37] shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {b.name} ({count})
              </button>
            )
          })}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {displayedAlternatives.map(({ product, matchingAttributes, priceDifference }) => {
          const hasPriceSavings = priceDifference < 0
          const savingsAmount = Math.abs(priceDifference)

        return (
          <div
            key={product.id}
            className="group flex flex-col justify-between rounded-2xl border border-border bg-white p-5 transition hover:shadow-lg hover:border-[#D4AF37]/40"
          >
            <div>
              <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-[#F8F8F8] border border-border/60 p-2">
                <ProductImage
                  src={product.primaryImage}
                  alt={product.name}
                  className="h-full w-full object-contain"
                />
                {hasPriceSavings && (
                  <span className="absolute left-3 top-3 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white shadow">
                    Save {formatPrice(savingsAmount)}
                  </span>
                )}
              </div>

              <div className="mt-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#D4AF37]">
                  {product.brand?.name || 'Alternative Manufacturer'}
                </p>
                <Link
                  to={`/product/${product.id}`}
                  className="mt-1 line-clamp-2 text-sm font-bold text-ink hover:text-[#B89124] transition"
                >
                  {product.name}
                </Link>
                <p className="mt-1 text-xs text-slate-500">
                  {product.material || 'Standard'} · {product.diameter || 'Standard size'}
                </p>
              </div>

              {/* Matching Features Pill */}
              {matchingAttributes.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {matchingAttributes.slice(0, 3).map((attr) => (
                    <span
                      key={attr}
                      className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 capitalize"
                    >
                      <Check size={11} className="text-emerald-600" />
                      {attr}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-5 pt-3 border-t border-border">
              <div className="flex items-baseline justify-between">
                <div>
                  <span className="text-lg font-black text-ink">
                    {formatPrice(product.basePrice)}
                  </span>
                  <span className="ml-1 text-xs text-slate-500">
                    / {product.unitOfSale}
                  </span>
                </div>
                <span className="text-[11px] font-semibold text-slate-500">
                  {product.stockAvailable > 0 ? (
                    <span className="text-emerald-700">In stock</span>
                  ) : (
                    'Verification pending'
                  )}
                </span>
              </div>

              <div className="mt-3 flex gap-2">
                <Button
                  onClick={() => onAddToCart(product.id)}
                  className="flex-1 text-xs py-2"
                >
                  <ShoppingCart size={14} /> Add to Cart
                </Button>
                {onToggleCompare && (
                  <Button
                    variant="outline"
                    onClick={() => onToggleCompare(product.id)}
                    className="px-2.5"
                    title="Add to comparison"
                  >
                    <GitCompareArrows
                      size={15}
                      className={isCompared?.(product.id) ? 'text-[#D4AF37]' : ''}
                    />
                  </Button>
                )}
              </div>
            </div>
          </div>
        )
      })}
      </div>
    </div>
  )
}
