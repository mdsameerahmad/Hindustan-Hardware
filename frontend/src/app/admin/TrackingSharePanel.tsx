import { AlertCircle, Copy, Loader2, Plus, Share2, Trash2 } from "lucide-react"

import { useCallback, useEffect, useState } from "react"

import { Button } from "../components"

import {
  buildTrackingUrl,
  sharedTrackingApi,
  type CreatedTrackingShare,
  type TrackingShareLink,
} from "../features/sharedTrackingApi"

export function TrackingSharePanel({
  orderId,

  orderNumber,

  disabled = false,
}: {
  orderId: string

  orderNumber: string

  disabled?: boolean
}) {
  const [shares, setShares] = useState<TrackingShareLink[]>([])

  const [createdShare, setCreatedShare] = useState<CreatedTrackingShare | null>(
    null,
  )

  const [trackingUrl, setTrackingUrl] = useState<string | null>(null)

  const [expiresInHours, setExpiresInHours] = useState(168)

  const [loading, setLoading] = useState(true)

  const [saving, setSaving] = useState(false)

  const [error, setError] = useState<string | null>(null)

  const loadShares = useCallback(async () => {
    setLoading(true)

    try {
      setShares(await sharedTrackingApi.listShares(orderId))
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load tracking links.",
      )
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => {
    void loadShares()
  }, [loadShares])

  const createLink = async () => {
    setSaving(true)

    setError(null)

    try {
      const share = await sharedTrackingApi.createShare(orderId, expiresInHours)
      setCreatedShare(share)
      try {
        setTrackingUrl(buildTrackingUrl(share.trackingPath))
      } catch (urlError) {
        setTrackingUrl(null)
        setError(
          urlError instanceof Error
            ? urlError.message
            : "Could not prepare the public tracking URL.",
        )
      }

      await loadShares()
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Could not create a tracking link.",
      )
    } finally {
      setSaving(false)
    }
  }

  const revokeLink = async (share: TrackingShareLink) => {
    if (
      !window.confirm(
        "Revoke this tracking link? Anyone using it will lose access.",
      )
    )
      return

    setSaving(true)

    setError(null)

    try {
      await sharedTrackingApi.revokeShare(orderId, share.id)

      await loadShares()

      if (createdShare?.id === share.id) {
        setCreatedShare(null)
        setTrackingUrl(null)
      }
    } catch (revokeError) {
      setError(
        revokeError instanceof Error
          ? revokeError.message
          : "Could not revoke the tracking link.",
      )
    } finally {
      setSaving(false)
    }
  }

  const copyLink = async () => {
    if (!trackingUrl) return

    try {
      await navigator.clipboard.writeText(trackingUrl)
    } catch (copyError) {
      setError(
        copyError instanceof Error
          ? copyError.message
          : "Could not copy the tracking link.",
      )
    }
  }

  const retryTrackingUrl = () => {
    if (!createdShare) return
    try {
      setTrackingUrl(buildTrackingUrl(createdShare.trackingPath))
      setError(null)
    } catch (urlError) {
      setError(
        urlError instanceof Error
          ? urlError.message
          : "Could not prepare the public tracking URL.",
      )
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-border bg-white p-4 shadow-xs sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-black text-slate-900">
            Shareable live tracking
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Create a private link for the recipient. No account is needed to
            view it.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            aria-label="Tracking link expiry"
            className="field max-w-32 py-2 text-xs"
            value={expiresInHours}
            onChange={(event) => setExpiresInHours(Number(event.target.value))}
          >
            <option value={24}>24 hours</option>
            <option value={72}>3 days</option>
            <option value={168}>7 days</option>
            <option value={336}>14 days</option>
            <option value={720}>30 days</option>
          </select>
          <Button
            type="button"
            onClick={createLink}
            disabled={disabled || saving}
          >
            {saving ? (
              <Loader2 className="animate-spin" size={15} />
            ) : (
              <Plus size={15} />
            )}
            New link
          </Button>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700"
        >
          <AlertCircle size={15} />
          {error}
        </p>
      )}

      {trackingUrl && createdShare && (
        <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <label
            htmlFor="new-tracking-link"
            className="text-xs font-bold text-emerald-900"
          >
            New tracking link (shown only now)
          </label>
          <input
            id="new-tracking-link"
            className="field w-full bg-white text-xs"
            readOnly
            value={trackingUrl}
            onFocus={(event) => event.currentTarget.select()}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="px-3 py-1.5 text-xs"
              onClick={copyLink}
            >
              <Copy size={14} />
              Copy
            </Button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`Track your Hindustan Hardware order ${orderNumber}: ${trackingUrl}`)}`}
              target="_blank"
              rel="noreferrer"
            >
              <Button
                type="button"
                variant="secondary"
                className="px-3 py-1.5 text-xs"
              >
                <Share2 size={14} />
                WhatsApp
              </Button>
            </a>
          </div>
        </div>
      )}
      {createdShare && !trackingUrl && (
        <Button type="button" variant="outline" onClick={retryTrackingUrl}>
          Retry preparing tracking URL
        </Button>
      )}

      {loading ? (
        <p className="flex items-center gap-2 text-xs text-slate-500">
          <Loader2 size={14} className="animate-spin" />
          Loading links...
        </p>
      ) : shares.length ? (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {shares.map((share) => {
            const expired = new Date(share.expiresAt).getTime() <= Date.now()

            const state = share.revokedAt
              ? "Revoked"
              : expired
                ? "Expired"
                : "Active"

            return (
              <li
                key={share.id}
                className="flex flex-wrap items-center justify-between gap-3 p-3"
              >
                <div>
                  <p
                    className={`text-xs font-bold ${
                      state === "Active" ? "text-emerald-700" : "text-slate-500"
                    }`}
                  >
                    {state} link
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Created {new Date(share.createdAt).toLocaleString()} ·
                    expires {new Date(share.expiresAt).toLocaleString()}
                  </p>
                </div>
                {state === "Active" && (
                  <Button
                    type="button"
                    variant="danger"
                    className="px-3 py-1.5 text-xs"
                    onClick={() => void revokeLink(share)}
                    disabled={saving}
                  >
                    <Trash2 size={14} /> Revoke
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-xs text-slate-500">
          No tracking links have been created for this order.
        </p>
      )}
      {disabled && (
        <p className="text-xs text-red-600">
          Tracking links cannot be created for a cancelled order.
        </p>
      )}
    </section>
  )
}
