/**
 * Screenshots from phones are often 3–8 MB. Groq accepts at most 4 MB of
 * base64, so resize to a readable 1400px JPEG before sending. The original
 * file never leaves the browser.
 */
export async function imageFileToDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choose a PNG, JPG, or WebP screenshot.')
  if (file.size > 12 * 1024 * 1024) throw new Error('That image is larger than 12 MB. Try a smaller screenshot.')

  const source = await readAsDataUrl(file)
  const image = await loadImage(source)
  const max = 1400
  const scale = Math.min(1, max / Math.max(image.width, image.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.width * scale))
  canvas.height = Math.max(1, Math.round(image.height * scale))
  const context = canvas.getContext('2d')
  if (!context) return source
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.82)
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not read that image.'))
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not open that image.'))
    image.src = src
  })
}
