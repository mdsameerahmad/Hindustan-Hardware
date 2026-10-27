import type { OrderStatus } from "../data"

export function formatPrice(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value)
}

export function statusTone(status: OrderStatus | string): "success" | "danger" | "warning" | "blue" {
  const s = String(status || "").toLowerCase()
  if (s === "delivered" || s === "order delivered") return "success"
  if (s === "cancelled" || s === "order cancelled") return "danger"
  if (s === "out for delivery" || s === "at destination") return "warning"
  return "blue"
}

