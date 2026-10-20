import React, { useState } from 'react'
import { Upload, Trash2, CheckCircle2, Image as ImageIcon, AlertCircle } from 'lucide-react'
import { Button } from '../../components'
import { productImagesApi } from '../api'
import { ProductImage } from './ProductImage'
import type { BackendProductImage } from '../types'

interface AdminImageManagerProps {
  productId: string
  images: BackendProductImage[]
  onImagesUpdated: () => void
}

export const AdminImageManager: React.FC<AdminImageManagerProps> = ({
  productId,
  images,
  onImagesUpdated,
}) => {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [altText, setAltText] = useState('')
  const [isPrimary, setIsPrimary] = useState(false)

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Client-side file type and size validation
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      setError('Only JPG, PNG, and WebP images are supported.')
      return
    }

    const maxSize = 5 * 1024 * 1024 // 5MB
    if (file.size > maxSize) {
      setError('Image file must not exceed 5MB.')
      return
    }

    setUploading(true)
    setError(null)
    setSuccess(null)

    try {
      await productImagesApi.uploadProductImage(productId, file, {
        altText: altText.trim() || undefined,
        isPrimary,
        displayOrder: images.length,
      })
      setSuccess('Image successfully uploaded and added to the gallery.')
      setAltText('')
      setIsPrimary(false)
      onImagesUpdated()
    } catch (err: any) {
      setError(err?.message || 'Failed to upload product image.')
    } finally {
      setUploading(false)
      // Reset input
      event.target.value = ''
    }
  }

  const handleSetPrimary = async (imageId: string) => {
    setError(null)
    try {
      await productImagesApi.setPrimaryImage(productId, imageId)
      onImagesUpdated()
    } catch (err: any) {
      setError(err?.message || 'Failed to update primary image.')
    }
  }

  const handleDelete = async (imageId: string) => {
    if (!window.confirm('Are you sure you want to delete this image?')) return
    setError(null)
    try {
      await productImagesApi.deleteProductImage(productId, imageId)
      onImagesUpdated()
    } catch (err: any) {
      setError(err?.message || 'Failed to delete image.')
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div>
          <h3 className="text-base font-extrabold text-ink">Product Image Gallery</h3>
          <p className="text-xs text-slate-500">
            Upload genuine product photos to Supabase Storage. Set primary image and ordering.
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
          {images.length} Image{images.length === 1 ? '' : 's'}
        </span>
      </div>

      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-700">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {success && (
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-700">
          <CheckCircle2 size={16} />
          {success}
        </div>
      )}

      {/* Existing Gallery Grid */}
      <div className="mt-6">
        {images.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
            <ImageIcon className="mx-auto text-slate-400" size={32} />
            <p className="mt-2 text-xs font-semibold text-slate-500">
              No gallery images have been uploaded yet. Upload an image below to set the product cover.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {images.map((img) => (
              <div
                key={img.id}
                className={`relative overflow-hidden rounded-xl border p-2 transition ${
                  img.is_primary ? 'border-[#D4AF37] ring-2 ring-[#D4AF37]/20 bg-amber-50/10' : 'border-border bg-white'
                }`}
              >
                <div className="aspect-square overflow-hidden rounded-lg bg-slate-50">
                  <ProductImage
                    src={img.public_url}
                    alt={img.alt_text || 'Product image'}
                    className="h-full w-full object-contain"
                  />
                </div>
                <div className="mt-2 flex items-center justify-between">
                  {img.is_primary ? (
                    <span className="text-[10px] font-bold text-[#D4AF37] uppercase">Primary</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleSetPrimary(img.id)}
                      className="text-[10px] font-semibold text-slate-500 hover:text-ink hover:underline"
                    >
                      Make Primary
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete(img.id)}
                    className="text-slate-400 hover:text-red-500 transition"
                    title="Delete image"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Upload Box */}
      <div className="mt-6 border-t border-border pt-6">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Upload New Image
        </h4>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <input
            type="text"
            placeholder="Alt text (e.g. 2-inch pipe side profile)"
            value={altText}
            onChange={(e) => setAltText(e.target.value)}
            className="field text-xs"
          />
          <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={isPrimary}
              onChange={(e) => setIsPrimary(e.target.checked)}
              className="accent-[#D4AF37]"
            />
            Set as primary image
          </label>
        </div>

        <div className="mt-3">
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[#D4AF37] bg-amber-50/20 px-4 py-4 text-xs font-bold text-ink hover:bg-amber-50/40 transition">
            <Upload size={16} className="text-[#D4AF37]" />
            <span>{uploading ? 'Uploading to Supabase Storage...' : 'Choose JPG, PNG, or WebP image to upload'}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileUpload}
              disabled={uploading}
              className="hidden"
            />
          </label>
          <p className="mt-1 text-[11px] text-slate-400">
            Max file size: 5MB. Uploaded images are served directly from the public <code>product-images</code> Supabase bucket.
          </p>
        </div>
      </div>
    </div>
  )
}
