import React from 'react'
import { Link } from 'react-router'
import { Trash2, ShoppingCart } from 'lucide-react'
import { Button, Badge, formatPrice } from '../../components'
import { ProductImage } from './ProductImage'
import type { ProductComparisonResponse } from '../types'

interface ComparisonTableProps {
  comparison: ProductComparisonResponse
  onRemove: (id: string) => void
  onAddToCart: (id: string) => void
}

export const ComparisonTable: React.FC<ComparisonTableProps> = ({
  comparison,
  onRemove,
  onAddToCart,
}) => {
  const { products, attributeDifferences } = comparison

  if (!products.length) return null

  const lowestPrice = Math.min(...products.map((p) => p.basePrice))

  const specRows: [string, (p: (typeof products)[0]) => string][] = [
    ['Category', (p) => p.category?.name || 'Hardware'],
    ['Product Type', (p) => p.specs?.product_type || p.specs?.subcategory || 'Standard'],
    ['Material', (p) => p.material || p.specs?.material || 'Not specified'],
    ['Diameter / Size', (p) => p.diameter || p.specs?.diameter || 'Not specified'],
    ['Length', (p) => p.length || p.specs?.length || 'Standard length'],
    ['Pressure Rating', (p) => p.pressureRating || p.specs?.pressure_rating || 'Not specified'],
    ['Technical Standard', (p) => p.technicalStandard || p.specs?.technical_standard || 'ISI / Standard'],
    ['Intended Application', (p) => p.intendedApplication || p.specs?.intended_application || 'General Plumbing'],
    ['Unit of Sale', (p) => p.unitOfSale || p.unit || 'Piece'],
  ]

  return (
    <div className="comparison-wrap overflow-x-auto rounded-2xl border border-border bg-white shadow-sm">
      <table className="comparison-table w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-border bg-[#F9F9F9]">
            <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500 w-44">
              Feature / Product
            </th>
            {products.map((p) => (
              <th key={p.id} className="p-4 align-top min-w-[220px]">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-bold uppercase text-[#D4AF37]">
                    {p.brand?.name || 'Hindustan Hardware'}
                  </span>
                  <button
                    onClick={() => onRemove(p.id)}
                    className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-500 transition"
                    title={`Remove ${p.name}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="my-3 aspect-square max-h-32 overflow-hidden rounded-xl border border-border bg-white p-2">
                  <ProductImage
                    src={p.primaryImage}
                    alt={p.name}
                    className="h-full w-full object-contain"
                  />
                </div>
                <Link
                  to={`/product/${p.id}`}
                  className="line-clamp-2 text-sm font-extrabold text-ink hover:text-[#B89124] transition"
                >
                  {p.name}
                </Link>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-lg font-black text-ink">
                    {formatPrice(p.basePrice)}
                  </span>
                  {p.compareAtPrice && (
                    <span className="text-xs text-slate-400 line-through">
                      {formatPrice(p.compareAtPrice)}
                    </span>
                  )}
                </div>
                {p.basePrice === lowestPrice && products.length > 1 && (
                  <div className="mt-1">
                    <Badge tone="success">Lowest price in comparison</Badge>
                  </div>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {specRows.map(([label, getter]) => {
            const values = products.map(getter)
            const isDifferent = new Set(values).size > 1
            return (
              <tr key={label} className="border-b border-border hover:bg-slate-50/50">
                <th className="p-4 text-xs font-bold text-slate-600 bg-[#FAFAFA]">
                  {label}
                </th>
                {values.map((val, idx) => (
                  <td
                    key={`${label}-${products[idx].id}`}
                    className={`p-4 text-sm ${isDifferent ? 'font-semibold text-slate-900 bg-amber-50/20' : 'text-slate-600'}`}
                  >
                    {val}
                  </td>
                ))}
              </tr>
            )
          })}
          {/* Stock Availability */}
          <tr className="border-b border-border">
            <th className="p-4 text-xs font-bold text-slate-600 bg-[#FAFAFA]">
              Stock Availability
            </th>
            {products.map((p) => (
              <td key={`stock-${p.id}`} className="p-4 text-xs font-bold">
                {p.stockAvailable > 10 ? (
                  <span className="text-emerald-700">In stock ({p.stockAvailable} units)</span>
                ) : p.stockAvailable > 0 ? (
                  <span className="text-amber-700">Only {p.stockAvailable} units left</span>
                ) : (
                  <span className="text-slate-500">Awaiting stock verification</span>
                )}
              </td>
            ))}
          </tr>
          {/* Actions */}
          <tr className="bg-slate-50/60">
            <th className="p-4 text-xs font-bold text-slate-600">Purchase</th>
            {products.map((p) => (
              <td key={`action-${p.id}`} className="p-4">
                <Button
                  onClick={() => onAddToCart(p.id)}
                  className="w-full text-xs"
                >
                  <ShoppingCart size={15} /> Add to Cart
                </Button>
                <Link
                  to={`/product/${p.id}`}
                  className="mt-2 block text-center text-xs font-bold text-[#D4AF37] hover:underline"
                >
                  View Details
                </Link>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  )
}
