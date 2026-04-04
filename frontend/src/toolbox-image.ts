import QRCode from 'qrcode'

export function mountImageTool(id: string, container: HTMLElement) {
  switch (id) {
    case 'resize':      mountResize(container);      break
    case 'crop':        mountCrop(container);         break
    case 'transparent': mountTransparent(container);  break
    case 'qr':          mountQR(container);           break
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function dropZoneHTML(accept: string, labelText: string): string {
  return `
    <label class="toolbox-drop-zone">
      <input type="file" accept="${accept}" class="toolbox-file-input" style="display:none">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="17 8 12 3 7 8"/>
        <line x1="12" y1="3" x2="12" y2="15"/>
      </svg>
      <span>${labelText}</span>
    </label>
  `
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}

function downloadCanvas(canvas: HTMLCanvasElement, filename: string) {
  canvas.toBlob(blob => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }, 'image/png')
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Resize ──────────────────────────────────────────────────────────────────

function mountResize(container: HTMLElement) {
  container.innerHTML = `
    ${dropZoneHTML('image/*', 'Drop image or click to upload')}
    <div id="tb-resize-preview" class="toolbox-preview" style="display:none">
      <img id="tb-resize-img" style="max-width:100%;border-radius:6px;">
    </div>
    <div class="toolbox-form" id="tb-resize-form" style="display:none">
      <div class="toolbox-row">
        <div class="toolbox-field">
          <label>Width (px)</label>
          <input type="number" id="tb-resize-w" min="1" max="8000">
        </div>
        <div class="toolbox-field">
          <label>Height (px)</label>
          <input type="number" id="tb-resize-h" min="1" max="8000">
        </div>
      </div>
      <label class="toolbox-check">
        <input type="checkbox" id="tb-resize-lock" checked>
        <span>Lock aspect ratio</span>
      </label>
      <button class="toolbox-btn" id="tb-resize-btn">Resize & Download</button>
    </div>
  `

  let img: HTMLImageElement | null = null
  let origW = 0, origH = 0

  const input   = container.querySelector<HTMLInputElement>('.toolbox-file-input')!
  const wInput  = container.querySelector<HTMLInputElement>('#tb-resize-w')!
  const hInput  = container.querySelector<HTMLInputElement>('#tb-resize-h')!
  const lock    = container.querySelector<HTMLInputElement>('#tb-resize-lock')!
  const preview = container.querySelector<HTMLElement>('#tb-resize-preview')!
  const form    = container.querySelector<HTMLElement>('#tb-resize-form')!
  const imgEl   = container.querySelector<HTMLImageElement>('#tb-resize-img')!
  const btn     = container.querySelector<HTMLButtonElement>('#tb-resize-btn')!

  input.addEventListener('change', async () => {
    const file = input.files?.[0]
    if (!file) return
    img = await loadImageFromFile(file)
    origW = img.naturalWidth
    origH = img.naturalHeight
    imgEl.src = img.src
    wInput.value = String(origW)
    hInput.value = String(origH)
    preview.style.display = 'block'
    form.style.display = 'flex'
  })

  wInput.addEventListener('input', () => {
    if (!lock.checked) return
    const w = parseInt(wInput.value)
    if (w && origW) hInput.value = String(Math.round(w * origH / origW))
  })

  hInput.addEventListener('input', () => {
    if (!lock.checked) return
    const h = parseInt(hInput.value)
    if (h && origH) wInput.value = String(Math.round(h * origW / origH))
  })

  btn.addEventListener('click', () => {
    if (!img) return
    const w = parseInt(wInput.value)
    const h = parseInt(hInput.value)
    if (!w || !h) return
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
    downloadCanvas(canvas, `resized_${w}x${h}.png`)
  })
}

// ─── Crop ────────────────────────────────────────────────────────────────────

function mountCrop(container: HTMLElement) {
  container.innerHTML = `
    ${dropZoneHTML('image/*', 'Drop image or click to upload')}
    <div id="tb-crop-wrap" style="display:none">
      <p class="toolbox-hint">Drag on the image to select crop area</p>
      <div style="position:relative;display:inline-block;max-width:100%">
        <canvas id="tb-crop-canvas" style="max-width:100%;cursor:crosshair;border-radius:6px;display:block;"></canvas>
        <canvas id="tb-crop-overlay" style="position:absolute;top:0;left:0;max-width:100%;pointer-events:none;border-radius:6px;"></canvas>
      </div>
      <div class="toolbox-row" style="margin-top:10px">
        <div class="toolbox-field"><label>X</label><input type="number" id="tb-crop-x" min="0" value="0"></div>
        <div class="toolbox-field"><label>Y</label><input type="number" id="tb-crop-y" min="0" value="0"></div>
        <div class="toolbox-field"><label>W</label><input type="number" id="tb-crop-w" min="1" value="0"></div>
        <div class="toolbox-field"><label>H</label><input type="number" id="tb-crop-h" min="1" value="0"></div>
      </div>
      <button class="toolbox-btn" id="tb-crop-btn">Crop & Download</button>
    </div>
  `

  const input   = container.querySelector<HTMLInputElement>('.toolbox-file-input')!
  const wrap    = container.querySelector<HTMLElement>('#tb-crop-wrap')!
  const canvas  = container.querySelector<HTMLCanvasElement>('#tb-crop-canvas')!
  const overlay = container.querySelector<HTMLCanvasElement>('#tb-crop-overlay')!
  const xIn     = container.querySelector<HTMLInputElement>('#tb-crop-x')!
  const yIn     = container.querySelector<HTMLInputElement>('#tb-crop-y')!
  const wIn     = container.querySelector<HTMLInputElement>('#tb-crop-w')!
  const hIn     = container.querySelector<HTMLInputElement>('#tb-crop-h')!
  const btn     = container.querySelector<HTMLButtonElement>('#tb-crop-btn')!

  let img: HTMLImageElement | null = null
  let scaleX = 1, scaleY = 1
  let dragging = false
  let startX = 0, startY = 0
  let cropX = 0, cropY = 0, cropW = 0, cropH = 0

  input.addEventListener('change', async () => {
    const file = input.files?.[0]
    if (!file) return
    img = await loadImageFromFile(file)

    const maxW = container.offsetWidth - 16 || 292
    const scale = Math.min(1, maxW / img.naturalWidth)
    canvas.width  = Math.round(img.naturalWidth  * scale)
    canvas.height = Math.round(img.naturalHeight * scale)
    overlay.width  = canvas.width
    overlay.height = canvas.height
    overlay.style.width  = canvas.style.width  = canvas.width  + 'px'
    overlay.style.height = canvas.style.height = canvas.height + 'px'

    scaleX = img.naturalWidth  / canvas.width
    scaleY = img.naturalHeight / canvas.height

    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
    wrap.style.display = 'block'

    cropX = 0; cropY = 0; cropW = img.naturalWidth; cropH = img.naturalHeight
    syncInputs()
  })

  function getCanvasPos(e: MouseEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect()
    return {
      x: Math.round((e.clientX - rect.left) * (canvas.width  / rect.width)),
      y: Math.round((e.clientY - rect.top)  * (canvas.height / rect.height)),
    }
  }

  canvas.addEventListener('mousedown', e => {
    const p = getCanvasPos(e)
    startX = p.x; startY = p.y
    dragging = true
  })

  canvas.addEventListener('mousemove', e => {
    if (!dragging) return
    const p = getCanvasPos(e)
    const x = Math.min(startX, p.x)
    const y = Math.min(startY, p.y)
    const w = Math.abs(p.x - startX)
    const h = Math.abs(p.y - startY)
    drawOverlay(x, y, w, h)
    cropX = Math.round(x * scaleX)
    cropY = Math.round(y * scaleY)
    cropW = Math.round(w * scaleX)
    cropH = Math.round(h * scaleY)
    syncInputs()
  })

  canvas.addEventListener('mouseup', () => { dragging = false })

  function drawOverlay(x: number, y: number, w: number, h: number) {
    const ctx = overlay.getContext('2d')!
    ctx.clearRect(0, 0, overlay.width, overlay.height)
    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    ctx.fillRect(0, 0, overlay.width, overlay.height)
    ctx.clearRect(x, y, w, h)
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.lineWidth = 1.5
    ctx.strokeRect(x, y, w, h)
  }

  function syncInputs() {
    xIn.value = String(cropX); yIn.value = String(cropY)
    wIn.value = String(cropW); hIn.value = String(cropH)
  }

  // Manual input sync
  ;[xIn, yIn, wIn, hIn].forEach(inp => {
    inp.addEventListener('input', () => {
      cropX = parseInt(xIn.value) || 0
      cropY = parseInt(yIn.value) || 0
      cropW = parseInt(wIn.value) || 1
      cropH = parseInt(hIn.value) || 1
      drawOverlay(cropX / scaleX, cropY / scaleY, cropW / scaleX, cropH / scaleY)
    })
  })

  btn.addEventListener('click', () => {
    if (!img || !cropW || !cropH) return
    const out = document.createElement('canvas')
    out.width = cropW; out.height = cropH
    out.getContext('2d')!.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH)
    downloadCanvas(out, `cropped.png`)
  })
}

// ─── Transparent PNG ─────────────────────────────────────────────────────────

function mountTransparent(container: HTMLElement) {
  container.innerHTML = `
    ${dropZoneHTML('image/*', 'Drop image or click to upload')}
    <div id="tb-transp-wrap" style="display:none">
      <p class="toolbox-hint">Click on the background color to remove it</p>
      <canvas id="tb-transp-canvas" style="max-width:100%;cursor:crosshair;border-radius:6px;display:block;"></canvas>
      <div class="toolbox-form" style="margin-top:10px">
        <div class="toolbox-row">
          <div class="toolbox-field" style="flex:1">
            <label>Selected color</label>
            <div id="tb-transp-swatch" style="height:32px;border-radius:6px;background:#fff;border:1px solid var(--color-border-medium)"></div>
          </div>
          <div class="toolbox-field" style="flex:1">
            <label>Tolerance (0–80)</label>
            <input type="range" id="tb-transp-tol" min="0" max="80" value="20" style="width:100%">
          </div>
        </div>
        <button class="toolbox-btn" id="tb-transp-btn" disabled>Remove & Download</button>
      </div>
    </div>
  `

  const input   = container.querySelector<HTMLInputElement>('.toolbox-file-input')!
  const wrap    = container.querySelector<HTMLElement>('#tb-transp-wrap')!
  const canvas  = container.querySelector<HTMLCanvasElement>('#tb-transp-canvas')!
  const swatch  = container.querySelector<HTMLElement>('#tb-transp-swatch')!
  const tolSlider = container.querySelector<HTMLInputElement>('#tb-transp-tol')!
  const btn     = container.querySelector<HTMLButtonElement>('#tb-transp-btn')!

  let img: HTMLImageElement | null = null
  let pickedR = 255, pickedG = 255, pickedB = 255
  let colorPicked = false

  input.addEventListener('change', async () => {
    const file = input.files?.[0]
    if (!file) return
    img = await loadImageFromFile(file)
    const maxW = container.offsetWidth - 16 || 292
    const scale = Math.min(1, maxW / img.naturalWidth)
    canvas.width  = Math.round(img.naturalWidth  * scale)
    canvas.height = Math.round(img.naturalHeight * scale)
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
    wrap.style.display = 'block'
    colorPicked = false
    btn.disabled = true
  })

  canvas.addEventListener('click', e => {
    const rect = canvas.getBoundingClientRect()
    const x = Math.round((e.clientX - rect.left) * canvas.width  / rect.width)
    const y = Math.round((e.clientY - rect.top)  * canvas.height / rect.height)
    const px = canvas.getContext('2d')!.getImageData(x, y, 1, 1).data
    pickedR = px[0]; pickedG = px[1]; pickedB = px[2]
    swatch.style.background = `rgb(${pickedR},${pickedG},${pickedB})`
    colorPicked = true
    btn.disabled = false
  })

  btn.addEventListener('click', () => {
    if (!img || !colorPicked) return
    const tol = parseInt(tolSlider.value)
    const out = document.createElement('canvas')
    out.width = img.naturalWidth; out.height = img.naturalHeight
    const ctx = out.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    const data = ctx.getImageData(0, 0, out.width, out.height)
    const d = data.data
    for (let i = 0; i < d.length; i += 4) {
      const dist = Math.sqrt(
        (d[i] - pickedR) ** 2 +
        (d[i+1] - pickedG) ** 2 +
        (d[i+2] - pickedB) ** 2
      )
      if (dist <= tol) d[i+3] = 0
    }
    ctx.putImageData(data, 0, 0)
    downloadCanvas(out, 'transparent.png')
  })
}

// ─── QR Code ─────────────────────────────────────────────────────────────────

function mountQR(container: HTMLElement) {
  container.innerHTML = `
    <div class="toolbox-form">
      <div class="toolbox-field">
        <label>Text or URL</label>
        <input type="text" id="tb-qr-input" placeholder="https://example.com" autocomplete="off">
      </div>
      <div class="toolbox-row">
        <div class="toolbox-field" style="flex:1">
          <label>Size (px)</label>
          <select id="tb-qr-size">
            <option value="128">128</option>
            <option value="256" selected>256</option>
            <option value="512">512</option>
          </select>
        </div>
        <div class="toolbox-field" style="flex:1">
          <label>Error correction</label>
          <select id="tb-qr-ec">
            <option value="L">L (7%)</option>
            <option value="M" selected>M (15%)</option>
            <option value="Q">Q (25%)</option>
            <option value="H">H (30%)</option>
          </select>
        </div>
      </div>
      <button class="toolbox-btn" id="tb-qr-btn">Generate QR Code</button>
    </div>
    <div id="tb-qr-out" style="display:none;flex-direction:column;align-items:center;gap:10px;padding-top:4px">
      <canvas id="tb-qr-canvas" style="border-radius:8px;max-width:100%"></canvas>
      <button class="toolbox-btn-secondary" id="tb-qr-dl">Download PNG</button>
    </div>
  `

  const input  = container.querySelector<HTMLInputElement>('#tb-qr-input')!
  const sizeEl = container.querySelector<HTMLSelectElement>('#tb-qr-size')!
  const ecEl   = container.querySelector<HTMLSelectElement>('#tb-qr-ec')!
  const genBtn = container.querySelector<HTMLButtonElement>('#tb-qr-btn')!
  const canvas = container.querySelector<HTMLCanvasElement>('#tb-qr-canvas')!
  const dlBtn  = container.querySelector<HTMLButtonElement>('#tb-qr-dl')!
  const out    = container.querySelector<HTMLElement>('#tb-qr-out')!

  genBtn.addEventListener('click', async () => {
    const text = input.value.trim()
    if (!text) { input.focus(); return }
    const size = parseInt(sizeEl.value)
    await QRCode.toCanvas(canvas, text, {
      width: size,
      errorCorrectionLevel: ecEl.value as 'L' | 'M' | 'Q' | 'H',
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    })
    out.style.display = 'flex'
  })

  input.addEventListener('keydown', e => { if (e.key === 'Enter') genBtn.click() })

  dlBtn.addEventListener('click', () => {
    const text = input.value.trim() || 'qrcode'
    downloadCanvas(canvas, `qr_${text.slice(0, 20).replace(/[^a-z0-9]/gi, '_')}.png`)
  })
}
