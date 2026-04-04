import { PDFDocument, degrees } from 'pdf-lib'
import * as pdfjsLib from 'pdfjs-dist'

// Load the worker from CDN to avoid build complexity
pdfjsLib.GlobalWorkerOptions.workerSrc =
  `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.mjs`

export function mountPdfTool(id: string, container: HTMLElement) {
  switch (id) {
    case 'merge':  mountMergePdf(container);  break
    case 'split':  mountSplitPdf(container);  break
    case 'rotate': mountRotatePdf(container); break
    case 'topng':  mountPdfToPng(container);  break
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pdfDropZoneHTML(id: string, label: string, multiple = false): string {
  return `
    <label class="toolbox-drop-zone">
      <input type="file" id="${id}" accept=".pdf,application/pdf" ${multiple ? 'multiple' : ''} style="display:none">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <path d="M12 18v-6M9 15l3 3 3-3"/>
      </svg>
      <span>${label}</span>
    </label>
  `
}

function downloadPdfBytes(bytes: Uint8Array, filename: string) {
  const blob = new Blob([(bytes as unknown as ArrayBuffer)], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function setStatus(container: HTMLElement, id: string, msg: string, type: 'info' | 'error' | 'success' = 'info') {
  const el = container.querySelector<HTMLElement>(`#${id}`)
  if (!el) return
  el.textContent = msg
  el.className = `toolbox-status toolbox-status-${type}`
  el.style.display = msg ? 'block' : 'none'
}

// ─── Merge PDF ───────────────────────────────────────────────────────────────

function mountMergePdf(container: HTMLElement) {
  container.innerHTML = `
    ${pdfDropZoneHTML('tb-merge-input', 'Drop PDFs or click to select', true)}
    <div id="tb-merge-list" class="toolbox-file-list" style="display:none"></div>
    <button class="toolbox-btn" id="tb-merge-btn" style="display:none">Merge & Download</button>
    <div id="tb-merge-status" class="toolbox-status" style="display:none"></div>
  `

  const input   = container.querySelector<HTMLInputElement>('#tb-merge-input')!
  const listEl  = container.querySelector<HTMLElement>('#tb-merge-list')!
  const btn     = container.querySelector<HTMLButtonElement>('#tb-merge-btn')!
  let files: File[] = []

  input.addEventListener('change', () => {
    files = Array.from(input.files || [])
    renderFileList()
  })

  function renderFileList() {
    if (!files.length) {
      listEl.style.display = 'none'
      btn.style.display = 'none'
      return
    }
    listEl.style.display = 'block'
    btn.style.display = 'flex'
    listEl.innerHTML = files.map((f, i) => `
      <div class="toolbox-file-item">
        <span class="toolbox-file-name">${f.name}</span>
        <button class="toolbox-file-remove" data-i="${i}">✕</button>
      </div>
    `).join('')
    listEl.querySelectorAll<HTMLButtonElement>('.toolbox-file-remove').forEach(b => {
      b.addEventListener('click', () => {
        files.splice(parseInt(b.dataset.i!), 1)
        renderFileList()
      })
    })
  }

  btn.addEventListener('click', async () => {
    if (files.length < 2) {
      setStatus(container, 'tb-merge-status', 'Please select at least 2 PDF files.', 'error')
      return
    }
    btn.disabled = true
    btn.textContent = 'Merging…'
    setStatus(container, 'tb-merge-status', '', 'info')
    try {
      const merged = await PDFDocument.create()
      for (const file of files) {
        const bytes = await file.arrayBuffer()
        const doc = await PDFDocument.load(bytes)
        const pages = await merged.copyPages(doc, doc.getPageIndices())
        pages.forEach(p => merged.addPage(p))
      }
      const out = await merged.save()
      downloadPdfBytes(out, 'merged.pdf')
      setStatus(container, 'tb-merge-status', `Merged ${files.length} files successfully.`, 'success')
    } catch (e) {
      setStatus(container, 'tb-merge-status', 'Failed to merge PDFs. Are all files valid?', 'error')
    }
    btn.disabled = false
    btn.textContent = 'Merge & Download'
  })
}

// ─── Split PDF ────────────────────────────────────────────────────────────────

function mountSplitPdf(container: HTMLElement) {
  container.innerHTML = `
    ${pdfDropZoneHTML('tb-split-input', 'Drop a PDF or click to select')}
    <div id="tb-split-form" class="toolbox-form" style="display:none">
      <div class="toolbox-field">
        <label id="tb-split-label">Page range (e.g. 1-3, 5, 7-9)</label>
        <input type="text" id="tb-split-range" placeholder="1-3, 5, 7-9">
      </div>
      <button class="toolbox-btn" id="tb-split-btn">Extract & Download</button>
      <div id="tb-split-status" class="toolbox-status" style="display:none"></div>
    </div>
  `

  const input  = container.querySelector<HTMLInputElement>('#tb-split-input')!
  const form   = container.querySelector<HTMLElement>('#tb-split-form')!
  const label  = container.querySelector<HTMLElement>('#tb-split-label')!
  const range  = container.querySelector<HTMLInputElement>('#tb-split-range')!
  const btn    = container.querySelector<HTMLButtonElement>('#tb-split-btn')!
  let file: File | null = null
  let totalPages = 0

  input.addEventListener('change', async () => {
    file = input.files?.[0] || null
    if (!file) return
    try {
      const bytes = await file.arrayBuffer()
      const doc = await PDFDocument.load(bytes)
      totalPages = doc.getPageCount()
      label.textContent = `Page range (1–${totalPages}, e.g. 1-3, 5)`
      form.style.display = 'flex'
    } catch {
      setStatus(container, 'tb-split-status', 'Could not read PDF.', 'error')
    }
  })

  btn.addEventListener('click', async () => {
    if (!file) return
    const pages = parsePageRange(range.value, totalPages)
    if (!pages.length) {
      setStatus(container, 'tb-split-status', 'Invalid page range.', 'error')
      return
    }
    btn.disabled = true
    btn.textContent = 'Extracting…'
    try {
      const bytes = await file.arrayBuffer()
      const src = await PDFDocument.load(bytes)
      const out = await PDFDocument.create()
      const copied = await out.copyPages(src, pages.map(p => p - 1))
      copied.forEach(p => out.addPage(p))
      const outBytes = await out.save()
      downloadPdfBytes(outBytes, `pages_${range.value.replace(/\s/g,'')}.pdf`)
      setStatus(container, 'tb-split-status', `Extracted ${pages.length} page(s).`, 'success')
    } catch {
      setStatus(container, 'tb-split-status', 'Failed to extract pages.', 'error')
    }
    btn.disabled = false
    btn.textContent = 'Extract & Download'
  })
}

function parsePageRange(input: string, total: number): number[] {
  const pages = new Set<number>()
  const parts = input.split(',')
  for (const part of parts) {
    const trimmed = part.trim()
    if (/^\d+-\d+$/.test(trimmed)) {
      const [a, b] = trimmed.split('-').map(Number)
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) {
        if (i >= 1 && i <= total) pages.add(i)
      }
    } else if (/^\d+$/.test(trimmed)) {
      const n = Number(trimmed)
      if (n >= 1 && n <= total) pages.add(n)
    }
  }
  return Array.from(pages).sort((a, b) => a - b)
}

// ─── Rotate PDF ───────────────────────────────────────────────────────────────

function mountRotatePdf(container: HTMLElement) {
  container.innerHTML = `
    ${pdfDropZoneHTML('tb-rotate-input', 'Drop a PDF or click to select')}
    <div id="tb-rotate-form" class="toolbox-form" style="display:none">
      <div class="toolbox-row">
        <div class="toolbox-field" style="flex:1">
          <label>Rotation</label>
          <select id="tb-rotate-deg">
            <option value="90">90° clockwise</option>
            <option value="180">180°</option>
            <option value="270">270° clockwise</option>
          </select>
        </div>
        <div class="toolbox-field" style="flex:1">
          <label>Pages</label>
          <select id="tb-rotate-pages">
            <option value="all">All pages</option>
            <option value="custom">Custom range</option>
          </select>
        </div>
      </div>
      <div id="tb-rotate-range-wrap" style="display:none">
        <div class="toolbox-field">
          <label id="tb-rotate-range-label">Page range</label>
          <input type="text" id="tb-rotate-range" placeholder="1-3, 5">
        </div>
      </div>
      <button class="toolbox-btn" id="tb-rotate-btn">Rotate & Download</button>
      <div id="tb-rotate-status" class="toolbox-status" style="display:none"></div>
    </div>
  `

  const input      = container.querySelector<HTMLInputElement>('#tb-rotate-input')!
  const form       = container.querySelector<HTMLElement>('#tb-rotate-form')!
  const degSel     = container.querySelector<HTMLSelectElement>('#tb-rotate-deg')!
  const pagesSel   = container.querySelector<HTMLSelectElement>('#tb-rotate-pages')!
  const rangeWrap  = container.querySelector<HTMLElement>('#tb-rotate-range-wrap')!
  const rangeLabel = container.querySelector<HTMLElement>('#tb-rotate-range-label')!
  const rangeInput = container.querySelector<HTMLInputElement>('#tb-rotate-range')!
  const btn        = container.querySelector<HTMLButtonElement>('#tb-rotate-btn')!
  let file: File | null = null
  let totalPages = 0

  input.addEventListener('change', async () => {
    file = input.files?.[0] || null
    if (!file) return
    try {
      const bytes = await file.arrayBuffer()
      const doc = await PDFDocument.load(bytes)
      totalPages = doc.getPageCount()
      rangeLabel.textContent = `Page range (1–${totalPages})`
      form.style.display = 'flex'
    } catch {
      setStatus(container, 'tb-rotate-status', 'Could not read PDF.', 'error')
    }
  })

  pagesSel.addEventListener('change', () => {
    rangeWrap.style.display = pagesSel.value === 'custom' ? 'block' : 'none'
  })

  btn.addEventListener('click', async () => {
    if (!file) return
    btn.disabled = true
    btn.textContent = 'Rotating…'
    try {
      const bytes = await file.arrayBuffer()
      const doc = await PDFDocument.load(bytes)
      const targetPages = pagesSel.value === 'all'
        ? doc.getPages()
        : parsePageRange(rangeInput.value, totalPages).map(i => doc.getPage(i - 1))
      const deg = parseInt(degSel.value) as 90 | 180 | 270
      targetPages.forEach(p => p.setRotation(degrees((p.getRotation().angle + deg) % 360)))
      const out = await doc.save()
      downloadPdfBytes(out, 'rotated.pdf')
      setStatus(container, 'tb-rotate-status', 'Rotated successfully.', 'success')
    } catch {
      setStatus(container, 'tb-rotate-status', 'Failed to rotate PDF.', 'error')
    }
    btn.disabled = false
    btn.textContent = 'Rotate & Download'
  })
}

// ─── PDF to PNG ───────────────────────────────────────────────────────────────

function mountPdfToPng(container: HTMLElement) {
  container.innerHTML = `
    ${pdfDropZoneHTML('tb-topng-input', 'Drop a PDF or click to select')}
    <div id="tb-topng-form" class="toolbox-form" style="display:none">
      <div class="toolbox-row">
        <div class="toolbox-field" style="flex:1">
          <label id="tb-topng-page-label">Page</label>
          <input type="number" id="tb-topng-page" min="1" value="1">
        </div>
        <div class="toolbox-field" style="flex:1">
          <label>Scale</label>
          <select id="tb-topng-scale">
            <option value="1">72 dpi (1×)</option>
            <option value="1.5" selected>108 dpi (1.5×)</option>
            <option value="2">144 dpi (2×)</option>
            <option value="3">216 dpi (3×)</option>
          </select>
        </div>
      </div>
      <button class="toolbox-btn" id="tb-topng-btn">Convert & Download</button>
      <div id="tb-topng-status" class="toolbox-status" style="display:none"></div>
      <canvas id="tb-topng-canvas" style="display:none;max-width:100%;margin-top:8px;border-radius:6px;border:1px solid var(--color-border-light)"></canvas>
    </div>
  `

  const input     = container.querySelector<HTMLInputElement>('#tb-topng-input')!
  const form      = container.querySelector<HTMLElement>('#tb-topng-form')!
  const pageLabel = container.querySelector<HTMLElement>('#tb-topng-page-label')!
  const pageInput = container.querySelector<HTMLInputElement>('#tb-topng-page')!
  const scaleSel  = container.querySelector<HTMLSelectElement>('#tb-topng-scale')!
  const btn       = container.querySelector<HTMLButtonElement>('#tb-topng-btn')!
  const preview   = container.querySelector<HTMLCanvasElement>('#tb-topng-canvas')!
  let pdfData: ArrayBuffer | null = null
  let totalPages = 0

  input.addEventListener('change', async () => {
    const file = input.files?.[0]
    if (!file) return
    try {
      pdfData = await file.arrayBuffer()
      const doc = await pdfjsLib.getDocument({ data: pdfData.slice(0) }).promise
      totalPages = doc.numPages
      pageLabel.textContent = `Page (1–${totalPages})`
      pageInput.max = String(totalPages)
      form.style.display = 'flex'
    } catch {
      setStatus(container, 'tb-topng-status', 'Could not read PDF.', 'error')
    }
  })

  btn.addEventListener('click', async () => {
    if (!pdfData) return
    const pageNum = parseInt(pageInput.value)
    if (pageNum < 1 || pageNum > totalPages) {
      setStatus(container, 'tb-topng-status', `Page must be between 1 and ${totalPages}.`, 'error')
      return
    }
    btn.disabled = true
    btn.textContent = 'Rendering…'
    setStatus(container, 'tb-topng-status', '', 'info')
    try {
      const scale = parseFloat(scaleSel.value)
      const doc = await pdfjsLib.getDocument({ data: pdfData.slice(0) }).promise
      const page = await doc.getPage(pageNum)
      const viewport = page.getViewport({ scale })
      preview.width  = viewport.width
      preview.height = viewport.height
      await page.render({ canvas: preview, viewport } as unknown as Parameters<typeof page.render>[0]).promise
      preview.style.display = 'block'

      preview.toBlob(blob => {
        if (!blob) return
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `page_${pageNum}.png`
        a.click()
        URL.revokeObjectURL(url)
      }, 'image/png')

      setStatus(container, 'tb-topng-status', `Page ${pageNum} converted.`, 'success')
    } catch {
      setStatus(container, 'tb-topng-status', 'Failed to render page.', 'error')
    }
    btn.disabled = false
    btn.textContent = 'Convert & Download'
  })
}
