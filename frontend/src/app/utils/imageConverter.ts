/**
 * Utility to convert any image File (JPEG, PNG, JPG, BMP, etc.) into WebP format
 * using HTML5 Canvas before uploading.
 * Preserves quality and transparency, while drastically reducing payload size.
 */
export async function convertImageToWebP(
  file: File,
  quality = 0.85
): Promise<File> {
  // If already WebP, verify file name extension and return
  if (file.type === "image/webp" && file.name.toLowerCase().endsWith(".webp")) {
    return file
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error("Failed to read image file"))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error("Failed to load image for WebP conversion"))
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas")
          canvas.width = img.naturalWidth || img.width
          canvas.height = img.naturalHeight || img.height

          const ctx = canvas.getContext("2d")
          if (!ctx) {
            // Fallback if canvas context fails
            return resolve(file)
          }

          // Draw original image on canvas
          ctx.drawImage(img, 0, 0)

          canvas.toBlob(
            (blob) => {
              if (!blob) {
                // If browser canvas cannot convert, fallback cleanly to original file
                return resolve(file)
              }

              // Replace old extension with .webp
              const baseName = file.name.replace(/\.[^/.]+$/, "")
              const webpFileName = `${baseName}.webp`

              const convertedFile = new File([blob], webpFileName, {
                type: "image/webp",
                lastModified: Date.now(),
              })

              resolve(convertedFile)
            },
            "image/webp",
            quality
          )
        } catch (err) {
          reject(err)
        }
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}
