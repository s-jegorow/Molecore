import { getFFmpeg, fetchFile } from './toolbox-ffmpeg'

export function mountVideoTool(id: string, container: HTMLElement) {
  switch (id) {
    case 'crop':     mountVideoCrop(container);     break
    case 'rotate':   mountVideoRotate(container);   break
    case 'compress': mountVideoCompress(container); break
    case 'convert':  mountVideoConvert(container);  break
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function videoDropZone(id: string): string {
  return `
    <label class="toolbox-drop-zone">
      <input type="file" id="${id}" accept="video/*" style="display:none">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <polygon points="23 7 16 12 23 17 23 7"/>
        <rect x="1" y="5" width="15" height="14" rx="2"/>
      </svg>
      <span>Drop video or click to upload</span>
    </label>
  `
}

function progressHTML(id: string): string {
  return `
    <div id="${id}" class="toolbox-progress" style="display:none">
      <div class="toolbox-progress-bar">
        <div class="toolbox-progress-fill" style="width:0%"></div>
      </div>
      <span class="toolbox-progress-label">Loading FFmpeg…</span>
    </div>
  `
}

function setStatus(container: HTMLElement, id: string, msg: string, type: 'info' | 'error' | 'success' = 'info') {
  const el = container.querySelector<HTMLElement>(`#${id}`)
  if (!el) return
  el.textContent = msg
  el.className = `toolbox-status toolbox-status-${type}`
  el.style.display = msg ? 'block' : 'none'
}

function showProgress(container: HTMLElement, id: string, pct: number, label?: string) {
  const wrap = container.querySelector<HTMLElement>(`#${id}`)
  if (!wrap) return
  wrap.style.display = 'block'
  const fill  = wrap.querySelector<HTMLElement>('.toolbox-progress-fill')!
  const lbl   = wrap.querySelector<HTMLElement>('.toolbox-progress-label')!
  fill.style.width = pct + '%'
  if (label) lbl.textContent = label
}

function hideProgress(container: HTMLElement, id: string) {
  const el = container.querySelector<HTMLElement>(`#${id}`)
  if (el) el.style.display = 'none'
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function getExt(file: File): string {
  return file.name.split('.').pop()?.toLowerCase() || 'mp4'
}

// ─── Crop Video ───────────────────────────────────────────────────────────────

function mountVideoCrop(container: HTMLElement) {
  container.innerHTML = `
    ${videoDropZone('tb-vcrop-input')}
    <div id="tb-vcrop-form" class="toolbox-form" style="display:none">
      <p class="toolbox-hint" id="tb-vcrop-dims"></p>
      <div class="toolbox-row">
        <div class="toolbox-field"><label>X offset</label><input type="number" id="tb-vcrop-x" value="0" min="0"></div>
        <div class="toolbox-field"><label>Y offset</label><input type="number" id="tb-vcrop-y" value="0" min="0"></div>
      </div>
      <div class="toolbox-row">
        <div class="toolbox-field"><label>Width</label><input type="number" id="tb-vcrop-w" min="2"></div>
        <div class="toolbox-field"><label>Height</label><input type="number" id="tb-vcrop-h" min="2"></div>
      </div>
      <button class="toolbox-btn" id="tb-vcrop-btn">Crop & Download</button>
      ${progressHTML('tb-vcrop-progress')}
      <div id="tb-vcrop-status" class="toolbox-status" style="display:none"></div>
    </div>
  `

  const input   = container.querySelector<HTMLInputElement>('#tb-vcrop-input')!
  const form    = container.querySelector<HTMLElement>('#tb-vcrop-form')!
  const dimsEl  = container.querySelector<HTMLElement>('#tb-vcrop-dims')!
  const xIn     = container.querySelector<HTMLInputElement>('#tb-vcrop-x')!
  const yIn     = container.querySelector<HTMLInputElement>('#tb-vcrop-y')!
  const wIn     = container.querySelector<HTMLInputElement>('#tb-vcrop-w')!
  const hIn     = container.querySelector<HTMLInputElement>('#tb-vcrop-h')!
  const btn     = container.querySelector<HTMLButtonElement>('#tb-vcrop-btn')!
  let file: File | null = null

  input.addEventListener('change', () => {
    file = input.files?.[0] || null
    if (!file) return
    const vid = document.createElement('video')
    vid.src = URL.createObjectURL(file)
    vid.onloadedmetadata = () => {
      dimsEl.textContent = `Original: ${vid.videoWidth} × ${vid.videoHeight}px`
      wIn.value = String(vid.videoWidth)
      hIn.value = String(vid.videoHeight)
      URL.revokeObjectURL(vid.src)
      form.style.display = 'flex'
    }
  })

  btn.addEventListener('click', async () => {
    if (!file) return
    const x = parseInt(xIn.value) || 0
    const y = parseInt(yIn.value) || 0
    const w = parseInt(wIn.value)
    const h = parseInt(hIn.value)
    if (!w || !h) return

    btn.disabled = true
    setStatus(container, 'tb-vcrop-status', '', 'info')
    try {
      const ffmpeg = await getFFmpeg(pct => {
        showProgress(container, 'tb-vcrop-progress', pct, `Processing… ${pct}%`)
      })
      showProgress(container, 'tb-vcrop-progress', 0, 'Loading FFmpeg…')
      const ext = getExt(file)
      const inName = `in.${ext}`
      const outName = `out.${ext}`
      await ffmpeg.writeFile(inName, await fetchFile(file))
      await ffmpeg.exec(['-i', inName, '-vf', `crop=${w}:${h}:${x}:${y}`, '-c:a', 'copy', outName])
      const data = await ffmpeg.readFile(outName) as Uint8Array
      downloadBlob(new Blob([(data as unknown as ArrayBuffer)], { type: file.type }), `cropped.${ext}`)
      hideProgress(container, 'tb-vcrop-progress')
      setStatus(container, 'tb-vcrop-status', 'Cropped successfully.', 'success')
    } catch {
      hideProgress(container, 'tb-vcrop-progress')
      setStatus(container, 'tb-vcrop-status', 'Processing failed.', 'error')
    }
    btn.disabled = false
  })
}

// ─── Rotate Video ─────────────────────────────────────────────────────────────

function mountVideoRotate(container: HTMLElement) {
  container.innerHTML = `
    ${videoDropZone('tb-vrot-input')}
    <div id="tb-vrot-form" class="toolbox-form" style="display:none">
      <div class="toolbox-field">
        <label>Rotation</label>
        <div class="toolbox-btn-group" id="tb-vrot-btns">
          <button class="toolbox-option-btn active" data-val="transpose=1">90° CW</button>
          <button class="toolbox-option-btn" data-val="transpose=2,transpose=2">180°</button>
          <button class="toolbox-option-btn" data-val="transpose=2">90° CCW</button>
        </div>
      </div>
      <button class="toolbox-btn" id="tb-vrot-btn">Rotate & Download</button>
      ${progressHTML('tb-vrot-progress')}
      <div id="tb-vrot-status" class="toolbox-status" style="display:none"></div>
    </div>
  `

  const input   = container.querySelector<HTMLInputElement>('#tb-vrot-input')!
  const form    = container.querySelector<HTMLElement>('#tb-vrot-form')!
  const btnGrp  = container.querySelector<HTMLElement>('#tb-vrot-btns')!
  const btn     = container.querySelector<HTMLButtonElement>('#tb-vrot-btn')!
  let file: File | null = null
  let filter = 'transpose=1'

  input.addEventListener('change', () => {
    file = input.files?.[0] || null
    if (file) form.style.display = 'flex'
  })

  btnGrp.querySelectorAll<HTMLElement>('.toolbox-option-btn').forEach(b => {
    b.addEventListener('click', () => {
      btnGrp.querySelectorAll('.toolbox-option-btn').forEach(x => x.classList.remove('active'))
      b.classList.add('active')
      filter = b.dataset.val!
    })
  })

  btn.addEventListener('click', async () => {
    if (!file) return
    btn.disabled = true
    setStatus(container, 'tb-vrot-status', '', 'info')
    try {
      const ffmpeg = await getFFmpeg(pct => {
        showProgress(container, 'tb-vrot-progress', pct, `Processing… ${pct}%`)
      })
      showProgress(container, 'tb-vrot-progress', 0, 'Loading FFmpeg…')
      const ext = getExt(file)
      await ffmpeg.writeFile(`in.${ext}`, await fetchFile(file))
      await ffmpeg.exec(['-i', `in.${ext}`, '-vf', filter, '-c:a', 'copy', `out.${ext}`])
      const data = await ffmpeg.readFile(`out.${ext}`) as Uint8Array
      downloadBlob(new Blob([(data as unknown as ArrayBuffer)], { type: file.type }), `rotated.${ext}`)
      hideProgress(container, 'tb-vrot-progress')
      setStatus(container, 'tb-vrot-status', 'Rotated successfully.', 'success')
    } catch {
      hideProgress(container, 'tb-vrot-progress')
      setStatus(container, 'tb-vrot-status', 'Processing failed.', 'error')
    }
    btn.disabled = false
  })
}

// ─── Compress Video ───────────────────────────────────────────────────────────

function mountVideoCompress(container: HTMLElement) {
  container.innerHTML = `
    ${videoDropZone('tb-vcomp-input')}
    <div id="tb-vcomp-form" class="toolbox-form" style="display:none">
      <div class="toolbox-field">
        <label>Quality</label>
        <div class="toolbox-btn-group" id="tb-vcomp-quality">
          <button class="toolbox-option-btn" data-crf="18">High</button>
          <button class="toolbox-option-btn active" data-crf="28">Medium</button>
          <button class="toolbox-option-btn" data-crf="38">Low</button>
        </div>
      </div>
      <button class="toolbox-btn" id="tb-vcomp-btn">Compress & Download</button>
      ${progressHTML('tb-vcomp-progress')}
      <div id="tb-vcomp-status" class="toolbox-status" style="display:none"></div>
    </div>
  `

  const input   = container.querySelector<HTMLInputElement>('#tb-vcomp-input')!
  const form    = container.querySelector<HTMLElement>('#tb-vcomp-form')!
  const qBtns   = container.querySelector<HTMLElement>('#tb-vcomp-quality')!
  const btn     = container.querySelector<HTMLButtonElement>('#tb-vcomp-btn')!
  let file: File | null = null
  let crf = '28'

  input.addEventListener('change', () => {
    file = input.files?.[0] || null
    if (file) form.style.display = 'flex'
  })

  qBtns.querySelectorAll<HTMLElement>('.toolbox-option-btn').forEach(b => {
    b.addEventListener('click', () => {
      qBtns.querySelectorAll('.toolbox-option-btn').forEach(x => x.classList.remove('active'))
      b.classList.add('active')
      crf = b.dataset.crf!
    })
  })

  btn.addEventListener('click', async () => {
    if (!file) return
    btn.disabled = true
    setStatus(container, 'tb-vcomp-status', '', 'info')
    try {
      const ffmpeg = await getFFmpeg(pct => {
        showProgress(container, 'tb-vcomp-progress', pct, `Compressing… ${pct}%`)
      })
      showProgress(container, 'tb-vcomp-progress', 0, 'Loading FFmpeg…')
      const ext = getExt(file)
      await ffmpeg.writeFile(`in.${ext}`, await fetchFile(file))
      await ffmpeg.exec(['-i', `in.${ext}`, '-vcodec', 'libx264', '-crf', crf, '-preset', 'fast', '-acodec', 'copy', `out.${ext}`])
      const data = await ffmpeg.readFile(`out.${ext}`) as Uint8Array
      downloadBlob(new Blob([(data as unknown as ArrayBuffer)], { type: `video/${ext}` }), `compressed.${ext}`)
      hideProgress(container, 'tb-vcomp-progress')
      setStatus(container, 'tb-vcomp-status', 'Compressed successfully.', 'success')
    } catch {
      hideProgress(container, 'tb-vcomp-progress')
      setStatus(container, 'tb-vcomp-status', 'Processing failed.', 'error')
    }
    btn.disabled = false
  })
}

// ─── Format Changer ───────────────────────────────────────────────────────────

function mountVideoConvert(container: HTMLElement) {
  container.innerHTML = `
    ${videoDropZone('tb-vconv-input')}
    <div id="tb-vconv-form" class="toolbox-form" style="display:none">
      <div class="toolbox-field">
        <label>Output format</label>
        <div class="toolbox-btn-group" id="tb-vconv-fmt">
          <button class="toolbox-option-btn active" data-fmt="mp4">MP4</button>
          <button class="toolbox-option-btn" data-fmt="webm">WebM</button>
          <button class="toolbox-option-btn" data-fmt="avi">AVI</button>
          <button class="toolbox-option-btn" data-fmt="mov">MOV</button>
        </div>
      </div>
      <button class="toolbox-btn" id="tb-vconv-btn">Convert & Download</button>
      ${progressHTML('tb-vconv-progress')}
      <div id="tb-vconv-status" class="toolbox-status" style="display:none"></div>
    </div>
  `

  const input   = container.querySelector<HTMLInputElement>('#tb-vconv-input')!
  const form    = container.querySelector<HTMLElement>('#tb-vconv-form')!
  const fmtBtns = container.querySelector<HTMLElement>('#tb-vconv-fmt')!
  const btn     = container.querySelector<HTMLButtonElement>('#tb-vconv-btn')!
  let file: File | null = null
  let fmt = 'mp4'

  input.addEventListener('change', () => {
    file = input.files?.[0] || null
    if (file) form.style.display = 'flex'
  })

  fmtBtns.querySelectorAll<HTMLElement>('.toolbox-option-btn').forEach(b => {
    b.addEventListener('click', () => {
      fmtBtns.querySelectorAll('.toolbox-option-btn').forEach(x => x.classList.remove('active'))
      b.classList.add('active')
      fmt = b.dataset.fmt!
    })
  })

  btn.addEventListener('click', async () => {
    if (!file) return
    btn.disabled = true
    setStatus(container, 'tb-vconv-status', '', 'info')
    try {
      const ffmpeg = await getFFmpeg(pct => {
        showProgress(container, 'tb-vconv-progress', pct, `Converting… ${pct}%`)
      })
      showProgress(container, 'tb-vconv-progress', 0, 'Loading FFmpeg…')
      const inExt = getExt(file)
      const outName = `out.${fmt}`
      const mimeMap: Record<string, string> = {
        mp4: 'video/mp4', webm: 'video/webm', avi: 'video/x-msvideo', mov: 'video/quicktime'
      }
      await ffmpeg.writeFile(`in.${inExt}`, await fetchFile(file))
      await ffmpeg.exec(['-i', `in.${inExt}`, outName])
      const data = await ffmpeg.readFile(outName) as Uint8Array
      downloadBlob(new Blob([(data as unknown as ArrayBuffer)], { type: mimeMap[fmt] }), outName)
      hideProgress(container, 'tb-vconv-progress')
      setStatus(container, 'tb-vconv-status', `Converted to ${fmt.toUpperCase()} successfully.`, 'success')
    } catch {
      hideProgress(container, 'tb-vconv-progress')
      setStatus(container, 'tb-vconv-status', 'Processing failed.', 'error')
    }
    btn.disabled = false
  })
}
