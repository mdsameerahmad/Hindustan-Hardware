import { ShieldCheck } from "lucide-react"

interface DeliveryOtpCardProps {
  otp?: string | null
}

export function DeliveryOtpCard({ otp }: DeliveryOtpCardProps) {
  if (!otp) return null

  return (
    <section className="rounded-xl border border-amber-300 bg-amber-50 p-5" aria-label="Delivery verification code">
      <div className="flex items-center gap-2 text-amber-950">
        <ShieldCheck size={19} />
        <h2 className="font-black">Your delivery OTP</h2>
      </div>
      <p className="mt-2 text-sm text-amber-900">
        Share this code with the delivery partner only when your order is handed to you.
      </p>
      <p className="mt-3 font-mono text-3xl font-black tracking-[0.35em] text-amber-950" aria-live="polite">
        {otp}
      </p>
    </section>
  )
}
