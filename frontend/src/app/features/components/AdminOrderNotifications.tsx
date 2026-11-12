import { Bell } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router"
import { trackingSocketService, type NewOrderNotificationPayload } from "../trackingSocketService"

export function AdminOrderNotifications() {
  const [notifications, setNotifications] = useState<NewOrderNotificationPayload[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [open, setOpen] = useState(false)
  const [soundNeedsInteraction, setSoundNeedsInteraction] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const navigate = useNavigate()

  const playSound = useCallback(async () => {
    try {
      const audio = audioRef.current
      if (!audio) return
      audio.currentTime = 0
      await audio.play()
      setSoundNeedsInteraction(false)
    } catch {
      setSoundNeedsInteraction(true)
    }
  }, [])

  useEffect(() => {
    audioRef.current = new Audio("/notificationaudio.mp3")
    const unsubscribe = trackingSocketService.subscribeToNewOrders((order) => {
      setNotifications((current) => [order, ...current.filter((item) => item.orderId !== order.orderId)].slice(0, 20))
      setUnreadCount((count) => count + 1)
      window.dispatchEvent(new CustomEvent("admin:new-order"))
      void playSound()
    })

    return () => {
      unsubscribe()
      audioRef.current = null
    }
  }, [playSound])

  const openOrder = (orderId: string) => {
    setOpen(false)
    navigate(`/admin/orders/${orderId}`)
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((isOpen) => !isOpen)
          setUnreadCount(0)
        }}
        aria-label={`Order notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
        aria-expanded={open}
        className="relative grid h-10 w-10 place-items-center rounded-lg border border-slate-200 text-slate-600 transition hover:border-[#D4AF37] hover:bg-amber-50 hover:text-slate-900"
      >
        <Bell size={19} />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed left-2 right-2 top-16 z-50 flex max-h-[calc(100dvh-5rem)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80 sm:max-w-[calc(100vw-2rem)]">
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <h3 className="min-w-0 break-words text-sm font-bold text-slate-900">New order notifications</h3>
            <span className="shrink-0 text-xs text-slate-500">{notifications.length}</span>
          </div>
          {soundNeedsInteraction && (
            <button
              type="button"
              onClick={async () => {
                await playSound()
                if (!audioRef.current?.paused) setSoundEnabled(true)
              }}
              className="w-full whitespace-normal break-words border-b border-amber-100 bg-amber-50 px-4 py-2 text-left text-xs font-semibold text-amber-800 hover:bg-amber-100"
            >
              Enable order notification sound
            </button>
          )}
          {!soundNeedsInteraction && !soundEnabled && (
            <button
              type="button"
              onClick={async () => {
                await playSound()
                if (!audioRef.current?.paused) setSoundEnabled(true)
              }}
              className="w-full whitespace-normal break-words border-b border-slate-100 px-4 py-2 text-left text-xs font-semibold text-brand hover:bg-slate-50"
            >
              Enable order notification sound
            </button>
          )}
          {notifications.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-slate-500">No new orders during this session.</p>
          ) : (
            <ul className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto">
              {notifications.map((order) => (
                <li key={order.orderId}>
                  <button
                    type="button"
                    onClick={() => openOrder(order.orderId)}
                    className="w-full px-4 py-3 text-left transition hover:bg-slate-50"
                  >
                    <span className="block break-all text-sm font-bold text-slate-900">{order.orderNumber}</span>
                    <span className="mt-1 block break-words text-xs text-slate-500">
                      New order · {new Date(order.createdAt).toLocaleString()}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              navigate("/admin/orders")
            }}
            className="w-full shrink-0 whitespace-normal break-words border-t border-slate-100 px-4 py-3 text-left text-xs font-bold text-brand hover:bg-slate-50"
          >
            View all orders →
          </button>
        </div>
      )}
    </div>
  )
}
