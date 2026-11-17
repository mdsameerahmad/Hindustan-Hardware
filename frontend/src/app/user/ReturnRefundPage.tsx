import { AlertTriangle, ArrowRight, CheckCircle2, Clock, HelpCircle, PackageX, RotateCcw, ShieldCheck, Truck } from "lucide-react"
import { Link } from "react-router"
import { Badge } from "../components"

export function ReturnRefundPage() {
  return (
    <div className="min-h-screen bg-[#FBF8F1] py-12 text-[#111111]">
      <div className="container-wide max-w-4xl">
        {/* Breadcrumb */}
        <div className="mb-6 flex items-center gap-2 text-xs font-medium text-slate-500">
          <Link to="/" className="hover:text-[#D4AF37] transition">Home</Link>
          <span>/</span>
          <span className="text-slate-900 font-semibold">Return & Refund Policy</span>
        </div>

        {/* Header Banner */}
        <div className="rounded-2xl border border-[#EADCB8] bg-[#0B0B0B] p-8 text-white shadow-sm sm:p-10 mb-8">
          <Badge tone="warning">Customer Guarantee & Protection</Badge>
          <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl text-white">
            Return & Refund Policy
          </h1>
          <p className="mt-3 text-sm text-[#CCCCCC] leading-relaxed max-w-2xl">
            We strive to ensure that our customers have a smooth and satisfactory shopping experience. If you are not completely satisfied with your purchase, you may request a return in accordance with the terms and conditions outlined below.
          </p>
        </div>

        {/* Content Card */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-6 sm:p-10 shadow-xs space-y-10 text-slate-800 text-sm leading-relaxed">
          
          {/* Section 1 */}
          <section className="space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-50 text-amber-700 font-black text-xs border border-amber-200">
                1
              </span>
              <h2 className="text-lg font-black text-slate-900">90-Day Return Policy</h2>
            </div>
            <p className="text-slate-600">
              We offer a <strong className="text-slate-900">90-day return window</strong> from the date of delivery. Customers can request a return within 90 days of receiving their order, provided the product meets our return eligibility requirements.
            </p>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 pt-1">
              To be eligible for a return:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-600 marker:text-[#D4AF37]">
              <li>The product must be unused and in its original condition.</li>
              <li>The product must be clean, undamaged, and free from signs of installation or usage.</li>
              <li>The product should be returned with its original packaging, accessories, and accompanying components, wherever applicable.</li>
              <li>The product must not have been modified, altered, or damaged after delivery.</li>
            </ul>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600 font-medium">
              Products that do not meet these conditions may not qualify for a return.
            </div>
          </section>

          <hr className="border-slate-100" />

          {/* Section 2 */}
          <section className="space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-50 text-amber-700 font-black text-xs border border-amber-200">
                2
              </span>
              <h2 className="text-lg font-black text-slate-900">Product Condition Requirements</h2>
            </div>
            <p className="text-slate-600">
              All returned products must be in a clean, unused, and resalable condition.
            </p>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 pt-1">
              We reserve the right to reject a return request if the product:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-600 marker:text-[#D4AF37]">
              <li>Shows signs of usage, installation, or physical damage.</li>
              <li>Is dirty, stained, broken, or otherwise damaged.</li>
              <li>Has been altered, modified, or improperly handled.</li>
              <li>Is missing essential components or accessories supplied with the original order.</li>
            </ul>
            <p className="text-xs font-semibold text-slate-500 italic">
              Customers are advised to inspect products carefully upon delivery and ensure they meet their requirements before installation or use.
            </p>
          </section>

          <hr className="border-slate-100" />

          {/* Section 3 */}
          <section className="space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-50 text-amber-700 font-black text-xs border border-amber-200">
                3
              </span>
              <h2 className="text-lg font-black text-slate-900">Non-Returnable Products – Cut Pipes</h2>
            </div>
            <div className="rounded-xl border border-red-200 bg-red-50/80 p-4 text-xs leading-relaxed text-red-950 space-y-2">
              <p className="font-bold text-red-900 text-sm flex items-center gap-2">
                <AlertTriangle size={16} className="text-red-700 shrink-0" />
                Cut pipes and customized pipe sections are strictly non-returnable and non-refundable.
              </p>
              <p>
                Once a pipe has been cut, trimmed, or customized according to the customer's requested measurements, it cannot be returned or exchanged.
              </p>
              <p>
                This policy applies because cut pipes are specially prepared according to individual customer requirements and cannot generally be resold in their original form.
              </p>
            </div>
            <p className="text-xs font-semibold text-slate-600">
              Customers are therefore requested to verify the required pipe dimensions, specifications, quantity, and measurements carefully before placing an order.
            </p>
          </section>

          <hr className="border-slate-100" />

          {/* Section 4 */}
          <section className="space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-50 text-amber-700 font-black text-xs border border-amber-200">
                4
              </span>
              <h2 className="text-lg font-black text-slate-900">Return Request Process</h2>
            </div>
            <p className="text-slate-600">To initiate a return:</p>
            <ol className="list-decimal pl-5 space-y-2 text-slate-600 marker:font-bold marker:text-slate-900">
              <li>Contact our customer support team within 90 days of receiving your order.</li>
              <li>Provide your order number and the reason for requesting a return.</li>
              <li>Share clear photographs or videos of the product, if requested.</li>
              <li>Our team will review the request and confirm whether the product qualifies for a return.</li>
              <li>Once approved, you will receive further instructions regarding the return process.</li>
            </ol>
            <div className="rounded-xl border border-amber-100 bg-amber-50/70 p-3.5 text-xs font-semibold text-amber-900">
              Please do not dispatch any product before receiving return approval and instructions from our team.
            </div>
          </section>

          <hr className="border-slate-100" />

          {/* Section 5 */}
          <section className="space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-50 text-amber-700 font-black text-xs border border-amber-200">
                5
              </span>
              <h2 className="text-lg font-black text-slate-900">Refund Processing</h2>
            </div>
            <p className="text-slate-600">
              Once the returned product is received and inspected, we will notify you about the approval or rejection of your refund.
            </p>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 pt-1">
              If your return is approved:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-600 marker:text-[#D4AF37]">
              <li>The refund will be processed through the applicable payment method or another mutually agreed method.</li>
              <li>The processing time may vary depending on the payment provider or banking institution.</li>
              <li>Any applicable deductions, including return shipping charges, will be communicated before processing the refund.</li>
            </ul>
          </section>

          <hr className="border-slate-100" />

          {/* Section 6 */}
          <section className="space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-50 text-amber-700 font-black text-xs border border-amber-200">
                6
              </span>
              <h2 className="text-lg font-black text-slate-900">Damaged or Incorrect Products</h2>
            </div>
            <p className="text-slate-600">
              If you receive a damaged, defective, or incorrect product, please contact our customer support team as soon as possible after delivery.
            </p>
            <p className="text-slate-600">
              Provide your order details along with clear photographs or videos showing the issue. Our team will review the complaint and assist with an appropriate resolution, subject to verification.
            </p>
          </section>

          <hr className="border-slate-100" />

          {/* Section 7 */}
          <section className="space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-50 text-amber-700 font-black text-xs border border-amber-200">
                7
              </span>
              <h2 className="text-lg font-black text-slate-900">Important Notes</h2>
            </div>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-600 marker:text-[#D4AF37]">
              <li>A return request must be submitted within 90 days of delivery.</li>
              <li>All returned products are subject to quality inspection.</li>
              <li>Cut, trimmed, or customized pipes cannot be returned or refunded.</li>
              <li>Products must be returned in a clean, unused, and undamaged condition.</li>
              <li>Approval of a return request is subject to compliance with this policy.</li>
            </ul>
          </section>

          <hr className="border-slate-100" />

          {/* Section 8 */}
          <section className="space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-50 text-amber-700 font-black text-xs border border-amber-200">
                8
              </span>
              <h2 className="text-lg font-black text-slate-900">Contact Us</h2>
            </div>
            <p className="text-slate-600">
              For return-related queries, return requests, or assistance regarding refunds, please contact our customer support team through the contact details provided on our website.
            </p>
            <div className="mt-4 flex flex-wrap gap-4 pt-2">
              <Link
                to="/contact"
                className="inline-flex items-center gap-2 rounded-lg bg-[#D4AF37] px-4 py-2 text-xs font-bold text-black hover:bg-[#b89124] transition"
              >
                Contact Support <ArrowRight size={14} />
              </Link>
            </div>
          </section>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500 font-medium">
            We appreciate your trust in us and thank you for shopping with us.
          </div>
        </div>
      </div>
    </div>
  )
}
