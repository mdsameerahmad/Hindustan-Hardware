import { FileText, RotateCcw, ShieldCheck, Truck, HelpCircle, CheckCircle2, AlertTriangle, ArrowRight } from "lucide-react"
import { Link } from "react-router"
import { Badge } from "../components"

export function TermsPage() {
  return (
    <div className="min-h-screen bg-[#FBF8F1] py-12 text-[#111111]">
      <div className="container-wide max-w-4xl">
        {/* Breadcrumb */}
        <div className="mb-6 flex items-center gap-2 text-xs font-medium text-slate-500">
          <Link to="/" className="hover:text-[#D4AF37] transition">Home</Link>
          <span>/</span>
          <span className="text-slate-900 font-semibold">Terms & Conditions</span>
        </div>

        {/* Header Banner */}
        <div className="rounded-2xl border border-[#EADCB8] bg-[#0B0B0B] p-8 text-white shadow-sm sm:p-10 mb-8">
          <Badge tone="warning">Hindustan Hardware Legal & Store Policy</Badge>
          <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl text-white">
            Terms & Conditions
          </h1>
          <p className="mt-3 text-sm text-[#CCCCCC] leading-relaxed max-w-2xl">
            Welcome to our website. By accessing our website, placing an order, or purchasing products from us, you agree to the following Terms & Conditions. Please read them carefully before making a purchase.
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
              <h2 className="text-lg font-black text-slate-900">GST Invoice Policy</h2>
            </div>
            <p className="text-slate-600">
              GST invoices will be provided only for products and transactions that are eligible for GST invoicing under applicable GST regulations.
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-600 marker:text-[#D4AF37]">
              <li>A GST invoice will not necessarily be available for every product.</li>
              <li>GST invoices will be issued only for eligible products and transactions.</li>
              <li>For certain products that are not covered under GST invoicing, customers may need to increase the order quantity, wherever applicable, to qualify for a GST invoice.</li>
              <li>GST applicability, invoice eligibility, and tax amounts will be determined according to applicable government regulations.</li>
            </ul>
            <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50/60 p-3.5 text-xs font-semibold text-amber-900">
              Customers are advised to confirm GST invoice availability with our support team before placing an order.
            </div>
          </section>

          <hr className="border-slate-100" />

          {/* Section 2 */}
          <section className="space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-50 text-amber-700 font-black text-xs border border-amber-200">
                2
              </span>
              <h2 className="text-lg font-black text-slate-900">Full Payment Policy</h2>
            </div>
            <p className="text-slate-600">
              We follow a full-payment policy for order confirmation and processing.
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-600 marker:text-[#D4AF37]">
              <li>Customers are required to complete the full payment for their order.</li>
              <li>Orders will be processed and prepared for dispatch only after successful payment confirmation.</li>
              <li>Partial payments or pending balances may not be accepted unless specifically approved by our team.</li>
              <li>Once payment is successfully completed, customers will receive the applicable order confirmation.</li>
            </ul>
          </section>

          <hr className="border-slate-100" />

          {/* Section 3 */}
          <section className="space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-50 text-amber-700 font-black text-xs border border-amber-200">
                3
              </span>
              <h2 className="text-lg font-black text-slate-900">Product Damage Guarantee</h2>
            </div>
            <p className="text-slate-600">
              We take care to ensure that products are properly packed and delivered in good condition.
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-600 marker:text-[#D4AF37]">
              <li>If a product arrives damaged, defective, or broken, customers should report the issue to our customer support team as soon as possible.</li>
              <li>Customers may be required to provide photographs or videos of the damaged product and its packaging as proof.</li>
              <li>After verification, we will assess the issue and provide an appropriate resolution in accordance with our applicable policies and consumer protection laws.</li>
              <li>Damage claims may be subject to inspection and verification.</li>
            </ul>
            <p className="text-xs font-semibold text-slate-500 italic">
              Our objective is to ensure that customers receive products in satisfactory condition.
            </p>
          </section>

          <hr className="border-slate-100" />

          {/* Section 4 */}
          <section className="space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-50 text-amber-700 font-black text-xs border border-amber-200">
                4
              </span>
              <h2 className="text-lg font-black text-slate-900">Product Specifications and Verification</h2>
            </div>
            <p className="text-slate-600">
              Customers are requested to carefully review the product description, specifications, dimensions, brand, model, and other details before confirming delivery.
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-600 marker:text-[#D4AF37]">
              <li>The product supplied should correspond to the specifications and details mentioned in the order.</li>
              <li>Customers should inspect the product upon delivery and verify that it matches the ordered product details.</li>
              <li>If any mismatch, missing item, or visible defect is identified, customers should immediately inform the delivery personnel or customer support team.</li>
              <li>Customers should not confirm successful delivery until they have checked the product details.</li>
            </ul>
          </section>

          <hr className="border-slate-100" />

          {/* Section 5 */}
          <section className="space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-50 text-amber-700 font-black text-xs border border-amber-200">
                5
              </span>
              <h2 className="text-lg font-black text-slate-900">OTP-Based Delivery Confirmation</h2>
            </div>
            <p className="text-slate-600">
              For secure and verified order delivery, an OTP-based delivery confirmation process may be used.
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-600 marker:text-[#D4AF37]">
              <li>An OTP will be shared with the customer for delivery verification.</li>
              <li>Customers should first check that the delivered product matches their order details.</li>
              <li>The OTP should be shared with the delivery personnel only after verifying the product and confirming that the order is correct.</li>
              <li>Sharing the OTP confirms that the customer has acknowledged receipt of the order.</li>
              <li>Customers are advised not to share the OTP before inspecting the delivered product.</li>
            </ul>
            <div className="rounded-xl border border-red-100 bg-red-50/70 p-4 text-xs leading-relaxed text-red-900">
              <b className="font-bold">Important:</b> Please verify the product before sharing the delivery OTP. This helps prevent incorrect or incomplete deliveries from being marked as successfully delivered.
            </div>
          </section>

          <hr className="border-slate-100" />

          {/* Section 6 */}
          <section className="space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-50 text-amber-700 font-black text-xs border border-amber-200">
                6
              </span>
              <h2 className="text-lg font-black text-slate-900">Customer Responsibilities</h2>
            </div>
            <p className="text-slate-600">Customers are responsible for:</p>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-600 marker:text-[#D4AF37]">
              <li>Providing accurate contact information and delivery addresses.</li>
              <li>Reviewing product specifications and quantities before ordering.</li>
              <li>Completing the required payment before order processing.</li>
              <li>Checking the delivered products before providing the delivery OTP.</li>
              <li>Contacting customer support promptly in case of damaged, defective, or incorrect products.</li>
            </ul>
          </section>

          <hr className="border-slate-100" />

          {/* Section 7 */}
          <section className="space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-50 text-amber-700 font-black text-xs border border-amber-200">
                7
              </span>
              <h2 className="text-lg font-black text-slate-900">Policy Updates</h2>
            </div>
            <p className="text-slate-600">
              We reserve the right to update or modify these Terms & Conditions when necessary. Any changes will be published on this website. Customers are encouraged to review this page periodically.
            </p>
          </section>

          <hr className="border-slate-100" />

          {/* Section 8 */}
          <section className="space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-50 text-amber-700 font-black text-xs border border-amber-200">
                8
              </span>
              <h2 className="text-lg font-black text-slate-900">Contact Information</h2>
            </div>
            <p className="text-slate-600">
              For questions, clarifications, GST invoice requests, payment-related queries, or delivery complaints, please contact our customer support team through the contact information available on our website.
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
            By placing an order on our website, you acknowledge that you have read and understood these Terms & Conditions.
          </div>
        </div>
      </div>
    </div>
  )
}
