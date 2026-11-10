import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Copy,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Truck,
} from "lucide-react"

import { useCallback, useEffect, useRef, useState } from "react"

import { useParams } from "react-router"

import { Button, PageHeader, formatPrice } from "../components"

import { LiveTrackingMap } from "../components/LiveTrackingMap"

import { ApiError } from "../api/client"

import {
  sharedTrackingApi,
  type SharedTrackingResponse,
} from "../features/sharedTrackingApi"

const REFRESH_INTERVAL_MS = 15_000

function formatTime(value?: string | null) {
  if (!value) return null

  const date = new Date(value)

  return Number.isNaN(date.getTime())
    ? null
    : new Intl.DateTimeFormat("en-IN", {
        hour: "2-digit",

        minute: "2-digit",

        day: "numeric",

        month: "short",
      }).format(date)
}

function formatDuration(seconds?: number | null) {
  if (seconds == null || seconds < 0) return null

  const minutes = Math.ceil(seconds / 60)

  if (minutes < 60) return `${minutes} min`

  const hours = Math.floor(minutes / 60)

  const remainingMinutes = minutes % 60

  return `${hours} hr${remainingMinutes ? ` ${remainingMinutes} min` : ""}`
}

export function SharedTrackingPage() {
  const { token } = useParams()

  const [tracking, setTracking] = useState<SharedTrackingResponse | null>(null)

  const [loading, setLoading] = useState(true)

  const [refreshing, setRefreshing] = useState(false)

  const [error, setError] = useState<string | null>(null)

  const [otpCopied, setOtpCopied] = useState(false)

  const requestInFlight = useRef(false)

  const refresh = useCallback(
    async (showSpinner = false) => {
      if (!token || requestInFlight.current) return

      requestInFlight.current = true

      if (showSpinner) setRefreshing(true)

      try {
        const result = await sharedTrackingApi.getPublicTracking(token)

        setTracking(result)

        setError(null)
      } catch (requestError) {
        if (
          requestError instanceof ApiError &&
          requestError.statusCode === 404
        ) {
          setTracking(null)
        }

        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load this tracking link.",
        )
      } finally {
        requestInFlight.current = false

        setLoading(false)

        setRefreshing(false)
      }
    },
    [token],
  )

  useEffect(() => {
    setTracking(null)

    setLoading(true)

    void refresh()

    const timer = window.setInterval(() => void refresh(), REFRESH_INTERVAL_MS)

    return () => window.clearInterval(timer)
  }, [refresh])

  const order = tracking?.orderTracking

  const assignment = order?.assignment

  const location = order?.latestLocation

  const eta = tracking?.eta?.eta

  const delivered =
    assignment?.status === "delivered" || order?.orderStatus === "delivered"

  const cancelled =
    assignment?.status === "cancelled" || order?.orderStatus === "cancelled"

  const expiresAt = formatTime(tracking?.expiresAt)

  const copyDeliveryOtp = async () => {
    if (!order?.deliveryOtp) return
    try {
      await navigator.clipboard.writeText(order.deliveryOtp)
      setOtpCopied(true)
      window.setTimeout(() => setOtpCopied(false), 2000)
    } catch (copyError) {
      setError(
        copyError instanceof Error
          ? `Could not copy the delivery OTP: ${copyError.message}`
          : "Could not copy the delivery OTP.",
      )
    }
  }

  return (
    <div className="container-wide py-5 sm:py-8">
      <PageHeader
        title="Track your delivery"
        description="Live order updates shared by Hindustan Hardware. This private link does not require an account."
        action={
          <Button
            variant="outline"
            onClick={() => void refresh(true)}
            disabled={loading || refreshing}
          >
            <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
            Refresh
          </Button>
        }
      />

      {loading ? (
        <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-slate-500">
          <RefreshCw className="animate-spin text-brand" size={30} />
          <p className="text-sm font-semibold">
            Loading secure tracking details...
          </p>
        </div>
      ) : !tracking ? (
        <div className="mx-auto my-10 max-w-xl rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <AlertTriangle className="mx-auto mb-2 text-red-600" size={30} />
          <h2 className="font-bold text-red-900">Tracking link unavailable</h2>
          <p className="mt-2 text-sm text-red-700">
            {error || "This link may have expired or been revoked."}
          </p>
          <p className="mt-2 text-xs text-red-700">
            Please contact the person who shared the link for a new one.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {error && (
            <p
              role="status"
              className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
            >
              Could not refresh the latest tracking update. Showing the last
              loaded status. {error}
            </p>
          )}
          <section className="grid gap-4 rounded-2xl border border-border bg-white p-4 shadow-sm sm:grid-cols-[1fr_auto] sm:items-center sm:p-5">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Order {order?.orderNumber}
              </p>
              <h2 className="mt-1 text-xl font-black capitalize text-slate-900">
                {delivered
                  ? "Delivered"
                  : cancelled
                    ? "Delivery cancelled"
                    : (
                        assignment?.status ||
                        order?.orderStatus ||
                        "Processing"
                      ).replace(/_/g, " ")}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {order?.trackingMessage}
              </p>
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-slate-500">
              {eta?.estimatedArrivalTimestamp && (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 font-semibold text-emerald-800">
                  <Clock3 size={15} />
                  ETA {formatTime(eta.estimatedArrivalTimestamp)}
                  {formatDuration(eta.estimatedDurationSeconds)
                    ? ` · ${formatDuration(eta.estimatedDurationSeconds)}`
                    : ""}
                </span>
              )}
              {expiresAt && (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-2">
                  Link expires {expiresAt}
                </span>
              )}
            </div>
          </section>

          {order?.deliveryOtp && !delivered && !cancelled && (
            <section className="flex flex-col gap-4 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700">
                  <ShieldCheck size={21} />
                </span>
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-amber-900">
                    Delivery verification OTP
                  </p>
                  <p className="mt-1 font-mono text-3xl font-black tracking-[0.3em] text-slate-950">
                    {order.deliveryOtp}
                  </p>
                  <p className="mt-1 max-w-2xl text-xs leading-5 text-amber-900">
                    Share this code with the delivery partner at handoff to verify delivery. Keep this private tracking link and code secure.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                className="shrink-0 border-amber-300 bg-white"
                onClick={() => void copyDeliveryOtp()}
              >
                {otpCopied ? <CheckCircle2 size={15} /> : <Copy size={15} />}
                {otpCopied ? "OTP copied" : "Copy OTP"}
              </Button>
            </section>
          )}

          <section className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900 px-4 py-3 text-white sm:px-5">
              <div className="flex items-center gap-2">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    delivered
                      ? "bg-emerald-400"
                      : order?.isLiveTrackingAvailable
                        ? "animate-pulse bg-emerald-400"
                        : location?.isStale
                          ? "bg-amber-400"
                          : "bg-slate-400"
                  }`}
                />
                <span className="text-xs font-extrabold uppercase tracking-wider">
                  {delivered
                    ? "Order delivered"
                    : order?.isLiveTrackingAvailable
                      ? "Live location"
                      : location?.isStale
                        ? "Location update delayed"
                        : "Waiting for delivery updates"}
                </span>
              </div>
              {location?.serverReceivedAt && (
                <span className="text-xs text-slate-300">
                  Updated {formatTime(location.serverReceivedAt)}
                </span>
              )}
            </div>
            <div className="h-[360px] sm:h-[500px]">
              <LiveTrackingMap
                storeLocation={order?.store}
                partnerLocation={
                  location
                    ? {
                        latitude: location.latitude,
                        longitude: location.longitude,
                      }
                    : null
                }
                destinationLocation={order?.destination}
                routeCoordinates={tracking.route?.geometry.coordinates ?? null}
                isStale={location?.isStale ?? false}
                zoom={13}
                height="100%"
                markerMode="truck"
                partnerHeading={location?.heading ?? null}
                autoFollow={Boolean(location)}
              />
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-start gap-3 rounded-xl border border-border bg-white p-4">
              <Truck size={18} className="mt-0.5 shrink-0 text-brand" />
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  Delivery partner
                </p>
                <p className="mt-1 text-sm font-bold text-slate-900">
                  {assignment?.deliveryPartner?.fullName || "Not assigned yet"}
                </p>
                {assignment && (
                  <p className="mt-1 text-xs font-semibold text-slate-700">
                    Delivery fee: {formatPrice(assignment.deliveryFee)}
                  </p>
                )}
                <p className="mt-1 text-xs text-slate-500">
                  {order?.trackingMessage}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-border bg-white p-4">
              <MapPin size={18} className="mt-0.5 shrink-0 text-brand" />
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  Delivery destination
                </p>
                <p className="mt-1 text-sm font-bold text-slate-900">
                  {order?.destination
                    ? `${order.destination.latitude.toFixed(5)}, ${order.destination.longitude.toFixed(5)}`
                    : "Destination coordinates are unavailable"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  For privacy, recipient contact details and order prices are
                  not shown on this link.
                </p>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
