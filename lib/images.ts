export interface ProcessedImage {
  blob: Blob
  thumb: Blob
  width: number
  height: number
}

const MAX_EDGE = 1800
const THUMB_EDGE = 360
/** Anything under this stays byte-identical, so small screenshots stay crisp. */
const SKIP_IF_SMALLER_THAN = 750_000

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      /* fall through to <img> decoding */
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('This image format could not be read by the browser.'))
    })
    return img
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }
}

function dimensions(source: ImageBitmap | HTMLImageElement) {
  if (source instanceof HTMLImageElement) return { w: source.naturalWidth, h: source.naturalHeight }
  return { w: source.width, h: source.height }
}

function drawScaled(source: ImageBitmap | HTMLImageElement, targetEdge: number) {
  const { w, h } = dimensions(source)
  const scale = Math.min(1, targetEdge / Math.max(w, h))
  const width = Math.max(1, Math.round(w * scale))
  const height = Math.max(1, Math.round(h * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is unavailable in this browser.')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(source as CanvasImageSource, 0, 0, width, height)
  return { canvas, width, height }
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Image encoding failed.'))),
      'image/jpeg',
      quality,
    )
  })
}

/** Downscale + re-encode a photo for upload. Handwriting stays legible at 1800px / q0.86. */
export async function processImage(file: File): Promise<ProcessedImage> {
  const source = await loadBitmap(file)
  const { w, h } = dimensions(source)
  if (!w || !h) throw new Error('This image appears to be empty.')

  const longEdge = Math.max(w, h)
  const needsResize = longEdge > MAX_EDGE
  const keepOriginal = !needsResize && file.size < SKIP_IF_SMALLER_THAN && file.type === 'image/jpeg'

  let blob: Blob
  if (keepOriginal) {
    blob = file
  } else {
    const { canvas } = drawScaled(source, MAX_EDGE)
    blob = await toBlob(canvas, 0.86)
  }

  const { canvas: thumbCanvas } = drawScaled(source, THUMB_EDGE)
  const thumb = await toBlob(thumbCanvas, 0.7)

  if (source instanceof ImageBitmap) source.close()

  return { blob, thumb, width: w, height: h }
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
