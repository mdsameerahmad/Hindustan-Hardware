import {
  ArrowRight,
  BadgeIndianRupee,
  CircleHelp,
  Clock3,
  MapPin,
  Minus,
  Package,
  Phone,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  Truck,
  Zap,
} from "lucide-react"
import React, { type ReactNode } from "react"
import { formatPrice, statusTone } from "./utils/formatters"
export { formatPrice, statusTone }

// Re-export user and admin layout/components so existing imports remain backward-compatible
export { ProductCard } from "./user/ProductCard"
export { Footer, SearchBox, StorefrontLayout, UserNavAction } from "./user/StorefrontLayout"
export { AdminHeaderUser, AdminLayout } from "./admin/AdminLayout"

export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger"
}) {
  const styles = {
    primary: "btn-gold-gradient font-bold",
    secondary: "btn-cart-gradient font-bold",
    outline:
      "border border-[#D4AF37] bg-transparent text-[#D4AF37] hover:bg-[#D4AF37] hover:text-[#0B0B0B]",
    ghost: "text-[#555555] hover:bg-[#EEEEEE]",
    danger: "bg-red-50 text-red-700 hover:bg-red-100",
  }
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode
  tone?: "neutral" | "success" | "warning" | "blue" | "danger"
}) {
  const tones = {
    neutral: "bg-[#EFEFEF] text-[#555555]",
    success: "bg-emerald-50 text-emerald-800",
    warning: "bg-[#FFF9E6] text-[#B89124] border border-[#F3E5AB]",
    blue: "bg-[#1C1C1C] text-[#D4AF37]",
    danger: "bg-red-50 text-red-700",
  }
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${tones[tone]}`}
    >
      {children}
    </span>
  )
}

export function SectionHeading({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string
  title: string
  action?: ReactNode
}) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        {eyebrow && (
          <p className="mb-1 text-xs font-extrabold uppercase tracking-[0.16em] text-accent-dark">
            {eyebrow}
          </p>
        )}
        <h2 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
          {title}
        </h2>
      </div>
      {action}
    </div>
  )
}

export function Quantity({
  value,
  onChange,
}: {
  value: number
  onChange: (value: number) => void
}) {
  return (
    <div className="inline-flex items-center rounded-lg border border-border bg-white">
      <button
        aria-label="Decrease quantity"
        onClick={() => onChange(Math.max(1, value - 1))}
        className="p-2 text-slate-500 hover:text-brand"
      >
        <Minus size={15} />
      </button>
      <span className="min-w-8 text-center text-sm font-bold">{value}</span>
      <button
        aria-label="Increase quantity"
        onClick={() => onChange(value + 1)}
        className="p-2 text-slate-500 hover:text-brand"
      >
        <Plus size={15} />
      </button>
    </div>
  )
}

export function PageHeader({
  title,
  description,
  action,
  breadcrumbs,
}: {
  title: string
  description?: string
  action?: ReactNode
  breadcrumbs?: string
}) {
  return (
    <div className="mb-6 sm:mb-7 flex flex-col justify-between gap-3 sm:gap-4 sm:flex-row sm:items-end">
      <div className="min-w-0 flex-1">
        {breadcrumbs && (
          <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-400 truncate">
            {breadcrumbs}
          </p>
        )}
        <h1 className="text-xl sm:text-2xl md:text-3xl font-black tracking-tight text-ink break-words">{title}</h1>
        {description && (
          <p className="mt-1.5 sm:mt-2 max-w-2xl text-xs sm:text-sm leading-5 sm:leading-6 text-slate-500 break-words">
            {description}
          </p>
        )}
      </div>
      {action && <div className="shrink-0 self-start sm:self-auto">{action}</div>}
    </div>
  )
}

export function EmptyState({
  icon = <Package />,
  title,
  text,
  action,
}: {
  icon?: ReactNode
  title: string
  text: string
  action?: ReactNode
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
      <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-slate-100 text-slate-500">
        {icon}
      </span>
      <h3 className="text-lg font-bold">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{text}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export const iconMap = {
  Clock3,
  Truck,
  CircleHelp,
  Zap,
  BadgeIndianRupee,
  SlidersHorizontal,
  ArrowRight,
  Phone,
  MapPin,
  Search,
  Trash2,
}
