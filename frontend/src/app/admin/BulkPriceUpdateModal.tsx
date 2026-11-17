import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
  X,
} from "lucide-react"
import { useRef, useState } from "react"
import { catalogueApi } from "../api/catalogueApi"
import { Button } from "../components"
import { formatAdminPrice as formatPrice } from "./formatAdminPrice"

interface BulkPriceUpdateModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export function BulkPriceUpdateModal({ isOpen, onClose, onSuccess }: BulkPriceUpdateModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{
    totalProcessed: number
    updatedCount: number
    failedCount: number
    errors: { itemCode: string; reason: string }[]
    details: {
      itemCode: string
      name: string
      oldMrp: number | null
      newMrp: number
      oldDiscount: number
      newDiscount: number
      oldPrice: number
      newPrice: number
    }[]
  } | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!isOpen) return null

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null)
    setResult(null)
    const selected = e.target.files?.[0]
    if (!selected) return

    const name = selected.name.toLowerCase()
    if (!name.endsWith(".xlsx") && !name.endsWith(".xls") && !name.endsWith(".csv")) {
      setError("Please select a valid Excel (.xlsx, .xls) or CSV file.")
      return
    }

    setFile(selected)
  }

  const handleUpload = async () => {
    if (!file) {
      setError("Please select an Excel or CSV file first.")
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await catalogueApi.bulkUpdatePrices(file)
      setResult(res)
      if (res.updatedCount > 0) {
        onSuccess()
      }
    } catch (err: any) {
      setError(err?.message || "Failed to process bulk price update.")
    } finally {
      setLoading(false)
    }
  }

  const downloadSampleCsv = () => {
    const csvContent =
      "ItemCode,MRP,Discount %\n" +
      "HH-BIRL-C4192692FE,100,12.25\n" +
      "HH-BIRL-1C367860B3,150,13.33\n" +
      "SAMPLE-ITEM-001,500,20\n"

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.setAttribute("download", "sample_price_update_template.csv")
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="modal-backdrop">
      <div className="modal !max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between border-b border-border pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-50 text-amber-700">
                <FileSpreadsheet size={20} />
              </span>
              <div>
                <h2 className="text-lg font-black text-slate-900">Bulk Update Prices via Excel</h2>
                <p className="text-xs text-slate-500">
                  Upload an Excel or CSV sheet to update MRP & Discount % by Item Code.
                </p>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Instructions & Template */}
        <div className="mt-4 rounded-xl border border-amber-200/80 bg-amber-50/60 p-3.5 text-xs text-amber-950 space-y-2">
          <div className="flex items-center justify-between">
            <b className="font-bold">Required Excel / CSV Columns:</b>
            <button
              type="button"
              onClick={downloadSampleCsv}
              className="inline-flex items-center gap-1.5 font-bold text-amber-800 hover:underline hover:text-amber-900 text-xs"
            >
              <Download size={13} />
              Download Sample CSV
            </button>
          </div>
          <p className="text-slate-700 leading-relaxed">
            Your spreadsheet should contain 3 columns: <code className="bg-white px-1.5 py-0.5 rounded border border-amber-200 font-bold">ItemCode</code> (or SKU), <code className="bg-white px-1.5 py-0.5 rounded border border-amber-200 font-bold">MRP</code>, and <code className="bg-white px-1.5 py-0.5 rounded border border-amber-200 font-bold">Discount %</code>.
          </p>
          <p className="text-slate-600 text-[11px]">
            The system will match each Item Code, save the new MRP & Discount %, and automatically calculate the final Selling Price.
          </p>
        </div>

        {/* File Dropzone */}
        <div className="mt-4">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".xlsx, .xls, .csv"
            className="hidden"
          />

          <div
            onClick={() => fileInputRef.current?.click()}
            className="cursor-pointer rounded-2xl border-2 border-dashed border-slate-300 hover:border-amber-400 bg-slate-50/50 hover:bg-amber-50/30 p-6 text-center transition flex flex-col items-center justify-center gap-2"
          >
            <div className="grid h-12 w-12 place-items-center rounded-full bg-white shadow-xs border border-slate-200 text-amber-600">
              <Upload size={22} />
            </div>
            {file ? (
              <div>
                <p className="text-sm font-bold text-slate-900">{file.name}</p>
                <p className="text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB — Click to change file</p>
              </div>
            ) : (
              <div>
                <p className="text-sm font-bold text-slate-800">
                  Click to select Excel (.xlsx, .xls) or CSV
                </p>
                <p className="text-xs text-slate-400">Up to 10MB per batch upload</p>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Results Overview */}
        {result && (
          <div className="mt-5 space-y-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Rows</span>
                <b className="mt-1 block text-lg font-black text-slate-800">{result.totalProcessed}</b>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Updated</span>
                <b className="mt-1 block text-lg font-black text-emerald-800">{result.updatedCount}</b>
              </div>
              <div className="rounded-xl border border-red-200 bg-red-50 p-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-red-600">Errors</span>
                <b className="mt-1 block text-lg font-black text-red-800">{result.failedCount}</b>
              </div>
            </div>

            {/* Success details */}
            {result.details && result.details.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white overflow-hidden text-xs">
                <div className="bg-slate-50 px-3 py-2 font-bold text-slate-700 border-b border-slate-200">
                  Updated Items Summary ({result.details.length})
                </div>
                <div className="max-h-48 overflow-y-auto divide-y divide-slate-100">
                  {result.details.map((d, i) => (
                    <div key={i} className="p-2.5 flex items-center justify-between">
                      <div>
                        <b className="text-slate-900 block">{d.name}</b>
                        <span className="text-slate-500 font-mono text-[11px]">{d.itemCode}</span>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-emerald-700">
                          {formatPrice(d.newPrice)}
                          <span className="text-[10px] text-slate-400 font-normal ml-1">
                            ({d.newDiscount}% off MRP {formatPrice(d.newMrp)})
                          </span>
                        </div>
                        {d.oldPrice !== d.newPrice && (
                          <div className="text-[10px] text-slate-400">
                            Old price: {formatPrice(d.oldPrice)}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Error items */}
            {result.errors && result.errors.length > 0 && (
              <div className="rounded-xl border border-red-200 bg-red-50/50 p-3 text-xs text-red-800 space-y-1 max-h-36 overflow-y-auto">
                <b className="block font-bold">Unmatched / Error Rows:</b>
                {result.errors.map((err, i) => (
                  <div key={i} className="flex items-center justify-between py-0.5">
                    <span className="font-mono">{err.itemCode}</span>
                    <span className="text-red-600">{err.reason}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mt-6 flex items-center justify-end gap-3 border-t border-border pt-4">
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            {result ? "Close" : "Cancel"}
          </Button>
          {!result && (
            <Button
              variant="primary"
              onClick={handleUpload}
              disabled={loading || !file}
              className="min-w-32 justify-center"
            >
              {loading ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <Upload size={15} />
                  Update Database
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
