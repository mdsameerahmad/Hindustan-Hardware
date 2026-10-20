import type { OrderStatus } from "../data"

export function formatPrice(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value)
}

export function statusTone(status: OrderStatus): "success" | "danger" | "warning" | "blue" {
  return status === "Delivered"
    ? "success"
    : status === "Cancelled"
      ? "danger"
      : status === "Out for Delivery"
        ? "warning"
        : "blue"
}

