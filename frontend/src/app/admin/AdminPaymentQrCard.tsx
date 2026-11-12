import { QrCode, Upload } from "lucide-react"
import { useEffect, useRef, useState, type ChangeEvent } from "react"
import { adminApi } from "../features/commerceApi"
import { Button } from "../components"

interface PaymentQrSetting {
  imageUrl: string | null
  updatedAt: string | null
}

export function AdminPaymentQrCard() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [setting, setSetting] = useState<PaymentQrSetting | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    adminApi.getDeliveryPaymentQr()
      .then((data) => {
        if (active) setSetting(data)
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "Unable to load the payment QR code.")
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const uploadQr = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setError(null)
    setSuccess(null)
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setError("Choose a PNG, JPEG, or WebP QR image.")
      event.target.value = ""
      return
    }
    if (file.size > 20 * 1024 * 1024) {
      setError("The QR image must be smaller than 20 MB.")
      event.target.value = ""
      return
    }

    setUploading(true)
    try {
      const updated = await adminApi.uploadDeliveryPaymentQr(file)
      setSetting(updated)
      setSuccess("Delivery payment QR uploaded. Delivery partners can now view it on assigned orders.")
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to upload the payment QR code.")
    } finally {
      setUploading(false)
      event.target.value = ""
    }
  }

  return (
    <section className="mt-6 rounded-xl border border-border bg-white p-4 shadow-xs sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-amber-50 text-brand">
            <QrCode size={20} />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-black text-slate-900">Delivery payment QR</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Upload the QR code delivery partners can show customers while handling an order.
            </p>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={uploadQr}
        />
        <Button
          variant={setting?.imageUrl ? "outline" : "primary"}
          disabled={loading || uploading}
          onClick={() => fileInputRef.current?.click()}
          className="w-full shrink-0 sm:w-auto"
        >
          <Upload size={15} />
          {loading ? "Loading..." : uploading ? "Uploading..." : setting?.imageUrl ? "Replace QR code" : "Upload QR code"}
        </Button>
      </div>

      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      {success && <p role="status" className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{success}</p>}

      {setting?.imageUrl && (
        <div className="mt-4 flex flex-col items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center">
          <img
            src={setting.imageUrl}
            alt="Uploaded delivery payment QR code"
            className="h-36 w-36 rounded-lg border border-slate-200 bg-white object-contain p-2"
          />
          <div className="text-center text-xs text-slate-500 sm:text-left">
            <p className="font-semibold text-slate-700">QR code available to delivery partners</p>
            {setting.updatedAt && <p className="mt-1">Last updated {new Date(setting.updatedAt).toLocaleString()}</p>}
          </div>
        </div>
      )}
    </section>
  )
}
