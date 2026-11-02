import React, { useEffect, useState } from "react"

export function AppSplashScreen() {
  const [visible, setVisible] = useState(true)
  const [fadeOut, setFadeOut] = useState(false)

  useEffect(() => {
    // Show splash for 1.2s then fade out gracefully
    const timer = setTimeout(() => {
      setFadeOut(true)
      const removeTimer = setTimeout(() => {
        setVisible(false)
      }, 500)
      return () => clearTimeout(removeTimer)
    }, 1200)

    return () => clearTimeout(timer)
  }, [])

  if (!visible) return null

  return (
    <div
      id="app-splash-screen"
      className={`fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-[#0B0B0B] text-white transition-opacity duration-500 pointer-events-auto ${
        fadeOut ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
      aria-label="Loading Hindustan Hardware"
      role="dialog"
      aria-modal="true"
    >
      {/* Ambient gold glow */}
      <div className="absolute h-72 w-72 rounded-full bg-[#D4AF37]/15 blur-3xl pointer-events-none animate-pulse" />

      {/* Main Logo Card */}
      <div className="relative flex flex-col items-center text-center px-6">
        <div className="relative">
          <div className="absolute -inset-1.5 rounded-full bg-gradient-to-tr from-[#D4AF37] via-[#F3E5AB] to-[#AA841E] opacity-75 blur-sm animate-spin [animation-duration:8s]" />
          <img
            src="/logo.webp"
            alt="Hindustan Hardware"
            className="relative h-28 w-28 sm:h-36 sm:w-36 rounded-full object-cover border-2 border-[#D4AF37] shadow-2xl shadow-black/80"
          />
        </div>

        <h1 className="mt-6 font-serif text-2xl sm:text-3xl font-black tracking-wider text-white">
          HINDUSTAN HARDWARE
        </h1>
        <p className="mt-1.5 text-xs sm:text-sm font-semibold tracking-[0.25em] text-[#D4AF37] uppercase">
          Sanitary & Hardware · Est. 1993
        </p>

        {/* Minimalist loading indicator */}
        <div className="mt-8 flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[#D4AF37] animate-bounce [animation-delay:0ms]" />
          <span className="h-2 w-2 rounded-full bg-[#D4AF37] animate-bounce [animation-delay:150ms]" />
          <span className="h-2 w-2 rounded-full bg-[#D4AF37] animate-bounce [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  )
}
