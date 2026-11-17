declare const google: any

let googleMapsScriptPromise: Promise<void> | null = null

/**
 * Loads Google Maps JavaScript SDK dynamically without requiring an API key.
 * If VITE_GOOGLE_MAPS_API_KEY is defined, it will attach it; otherwise it loads without a key.
 */
export function loadGoogleMapsSDK(): Promise<void> {
  if (typeof google !== "undefined" && google.maps) {
    return Promise.resolve()
  }
  if (googleMapsScriptPromise) {
    return googleMapsScriptPromise
  }

  googleMapsScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById("google-maps-js-sdk")
    if (existing) {
      if (typeof google !== "undefined" && google.maps) {
        resolve()
      } else {
        existing.addEventListener("load", () => resolve())
        existing.addEventListener("error", (e) => reject(e))
      }
      return
    }

    const script = document.createElement("script")
    script.id = "google-maps-js-sdk"
    const apiKey =
      (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) ||
      "AIzaSyCnvKMMG0Ae6J34R9KESHIJCQmD6KYETPo"
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=marker`
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = (err) => {
      googleMapsScriptPromise = null
      reject(err)
    }
    document.head.appendChild(script)
  })

  return googleMapsScriptPromise
}
