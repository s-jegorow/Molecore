import { getFFmpeg, fetchFile } from './toolbox-ffmpeg'

export function mountAudioTool(id: string, container: HTMLElement) {
  switch (id) {
    case 'extract': mountExtractAudio(container); break
    case 'trim':    mountTrimAudio(container);    break
    case 'merge':   mountMergeAudio(container);   break
    case 'speed':   mountChangeSpeed(container);  break
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function audioDropZone(id: string, accept: string, label: string): string {
  return `
    <label class="toolbox-drop-zone">
      <input type="file" id="${id}" accept="${accept}" style="display:none">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M9 18V5l12-2v13"/>
        <circle cx="6" cy="18" r="3"/>
        <circle cx="18" cy="16" r="3"/>
      </svg>
      <span>${label}</span>
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
  const fill = wrap.querySelector<HTMLElement>('.toolbox-progress-fill')!
  const lbl  = wrap.querySelector<HTMLElement>('.toolbox-progress-label')!
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
  return file.name.split('.').pop()?.toLowerCase() || 'mp3'
}

function parseTime(timeStr: string): number {
  const parts = timeStr.split(':').map(Number)
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return parseFloat(timeStr) || 0
}

// ─── Extract Audio ────────────────────────────────────────────────────────────

function mountExtractAudio(container: HTMLElement) {
  container.innerHTML = `
    <label class="toolbox-drop-zone">
      <input type="file" id="tb-ext-input" accept="video/*" style="display:none">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <polygon points="23 7 16 12 23 17 23 7"/>
        <rect x="1" y="5" width="15" height="14" rx="2"/>
      </svg>
      <span>Drop video or click to upload</span>
    </label>
    <div id="tb-ext-form" class="toolbox-form" style="display:none">
      <div class="toolbox-field">
        <label>Output format</label>
        <div class="toolbox-btn-group" id="tb-ext-fmt">
          <button class="toolbox-option-btn active" data-fmt="mp3">MP3</button>
          <button class="toolbox-option-btn" data-fmt="wav">WAV</button>
          <button class="toolbox-option-btn" data-fmt="aac">AAC</button>
          <button class="toolbox-option-btn" data-fmt="ogg">OGG</button>
        </div>
      </div>
      <button class="toolbox-btn" id="tb-ext-btn">Extract & Download</button>
      ${progressHTML('tb-ext-progress')}
      <div id="tb-ext-status" class="toolbox-status" style="display:none"></div>
    </div>
  `

  const input   = container.querySelector<HTMLInputElement>('#tb-ext-input')!
  const form    = container.querySelector<HTMLElement>('#tb-ext-form')!
  const fmtBtns = container.querySelector<HTMLElement>('#tb-ext-fmt')!
  const btn     = container.querySelector<HTMLButtonElement>('#tb-ext-btn')!
  let file: File | null = null
  let fmt = 'mp3'

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
    setStatus(container, 'tb-ext-status', '', 'info')
    try {
      const ffmpeg = await getFFmpeg(pct => {
        showProgress(container, 'tb-ext-progress', pct, `Extracting… ${pct}%`)
      })
      showProgress(container, 'tb-ext-progress', 0, 'Loading FFmpeg…')
      const inExt = getExt(file)
      const mimeMap: Record<string, string> = {
        mp3: 'audio/mpeg', wav: 'audio/wav', aac: 'audio/aac', ogg: 'audio/ogg'
      }
      await ffmpeg.writeFile(`in.${inExt}`, await fetchFile(file))
      await ffmpeg.exec(['-i', `in.${inExt}`, '-vn', '-acodec', fmt === 'mp3' ? 'libmp3lame' : fmt === 'aac' ? 'aac' : 'copy', `out.${fmt}`])
      const data = await ffmpeg.readFile(`out.${fmt}`) as Uint8Array
      downloadBlob(new Blob([(data as unknown as ArrayBuffer)], { type: mimeMap[fmt] }), `audio.${fmt}`)
      hideProgress(container, 'tb-ext-progress')
      setStatus(container, 'tb-ext-status', `Audio extracted as ${fmt.toUpperCase()}.`, 'success')
    } catch {
      hideProgress(container, 'tb-ext-progress')
      setStatus(container, 'tb-ext-status', 'Processing failed.', 'error')
    }
    btn.disabled = false
  })
}

// ─── Trim Audio ───────────────────────────────────────────────────────────────

function mountTrimAudio(container: HTMLElement) {
  container.innerHTML = `
    ${audioDropZone('tb-trim-input', 'audio/*', 'Drop audio or click to upload')}
    <div id="tb-trim-form" class="toolbox-form" style="display:none">
      <div class="toolbox-row">
        <div class="toolbox-field" style="flex:1">
          <label>Start (mm:ss)</label>
          <input type="text" id="tb-trim-start" placeholder="0:00" value="0:00">
        </div>
        <div class="toolbox-field" style="flex:1">
          <label>End (mm:ss)</label>
          <input type="text" id="tb-trim-end" placeholder="0:30">
        </div>
      </div>
      <button class="toolbox-btn" id="tb-trim-btn">Trim & Download</button>
      ${progressHTML('tb-trim-progress')}
      <div id="tb-trim-status" class="toolbox-status" style="display:none"></div>
    </div>
  `

  const input    = container.querySelector<HTMLInputElement>('#tb-trim-input')!
  const form     = container.querySelector<HTMLElement>('#tb-trim-form')!
  const startIn  = container.querySelector<HTMLInputElement>('#tb-trim-start')!
  const endIn    = container.querySelector<HTMLInputElement>('#tb-trim-end')!
  const btn      = container.querySelector<HTMLButtonElement>('#tb-trim-btn')!
  let file: File | null = null

  input.addEventListener('change', () => {
    file = input.files?.[0] || null
    if (!file) return
    const audio = document.createElement('audio')
    audio.src = URL.createObjectURL(file)
    audio.onloadedmetadata = () => {
      const total = Math.floor(audio.duration)
      const m = Math.floor(total / 60)
      const s = total % 60
      endIn.value = `${m}:${String(s).padStart(2, '0')}`
      URL.revokeObjectURL(audio.src)
    }
    form.style.display = 'flex'
  })

  btn.addEventListener('click', async () => {
    if (!file) return
    const start = parseTime(startIn.value)
    const end   = parseTime(endIn.value)
    if (end <= start) {
      setStatus(container, 'tb-trim-status', 'End must be after start.', 'error')
      return
    }
    btn.disabled = true
    setStatus(container, 'tb-trim-status', '', 'info')
    try {
      const ffmpeg = await getFFmpeg(pct => {
        showProgress(container, 'tb-trim-progress', pct, `Trimming… ${pct}%`)
      })
      showProgress(container, 'tb-trim-progress', 0, 'Loading FFmpeg…')
      const ext = getExt(file)
      await ffmpeg.writeFile(`in.${ext}`, await fetchFile(file))
      await ffmpeg.exec([
        '-i', `in.${ext}`,
        '-ss', String(start),
        '-to', String(end),
        '-c', 'copy',
        `out.${ext}`
      ])
      const data = await ffmpeg.readFile(`out.${ext}`) as Uint8Array
      downloadBlob(new Blob([(data as unknown as ArrayBuffer)], { type: file.type }), `trimmed.${ext}`)
      hideProgress(container, 'tb-trim-progress')
      setStatus(container, 'tb-trim-status', 'Trimmed successfully.', 'success')
    } catch {
      hideProgress(container, 'tb-trim-progress')
      setStatus(container, 'tb-trim-status', 'Processing failed.', 'error')
    }
    btn.disabled = false
  })
}

// ─── Merge Audio ──────────────────────────────────────────────────────────────

function mountMergeAudio(container: HTMLElement) {
  container.innerHTML = `
    ${audioDropZone('tb-amerge-input', 'audio/*', 'Drop audio files or click to select')}
    <div id="tb-amerge-list" class="toolbox-file-list" style="display:none"></div>
    <div id="tb-amerge-actions" style="display:none;flex-direction:column;gap:8px">
      <label class="toolbox-drop-zone toolbox-drop-zone-sm">
        <input type="file" id="tb-amerge-add" accept="audio/*" multiple style="display:none">
        <span>+ Add more files</span>
      </label>
      <button class="toolbox-btn" id="tb-amerge-btn">Merge & Download</button>
    </div>
    ${progressHTML('tb-amerge-progress')}
    <div id="tb-amerge-status" class="toolbox-status" style="display:none"></div>
  `

  const input    = container.querySelector<HTMLInputElement>('#tb-amerge-input')!
  const addInput = container.querySelector<HTMLInputElement>('#tb-amerge-add')!
  const listEl   = container.querySelector<HTMLElement>('#tb-amerge-list')!
  const actions  = container.querySelector<HTMLElement>('#tb-amerge-actions')!
  const btn      = container.querySelector<HTMLButtonElement>('#tb-amerge-btn')!
  let files: File[] = []

  function addFiles(newFiles: FileList | null) {
    if (!newFiles) return
    files.push(...Array.from(newFiles))
    renderList()
  }

  function renderList() {
    if (!files.length) {
      listEl.style.display = 'none'
      actions.style.display = 'none'
      return
    }
    listEl.style.display = 'block'
    actions.style.display = 'flex'
    listEl.innerHTML = files.map((f, i) => `
      <div class="toolbox-file-item">
        <span class="toolbox-file-name">${f.name}</span>
        <button class="toolbox-file-remove" data-i="${i}">✕</button>
      </div>
    `).join('')
    listEl.querySelectorAll<HTMLButtonElement>('.toolbox-file-remove').forEach(b => {
      b.addEventListener('click', () => {
        files.splice(parseInt(b.dataset.i!), 1)
        renderList()
      })
    })
  }

  input.addEventListener('change', () => addFiles(input.files))
  addInput.addEventListener('change', () => addFiles(addInput.files))

  btn.addEventListener('click', async () => {
    if (files.length < 2) {
      setStatus(container, 'tb-amerge-status', 'Please add at least 2 audio files.', 'error')
      return
    }
    btn.disabled = true
    setStatus(container, 'tb-amerge-status', '', 'info')
    try {
      const ffmpeg = await getFFmpeg(pct => {
        showProgress(container, 'tb-amerge-progress', pct, `Merging… ${pct}%`)
      })
      showProgress(container, 'tb-amerge-progress', 0, 'Loading FFmpeg…')
      const ext = getExt(files[0])
      for (let i = 0; i < files.length; i++) {
        await ffmpeg.writeFile(`in${i}.${ext}`, await fetchFile(files[i]))
      }
      // Create concat file
      const concatContent = files.map((_, i) => `file 'in${i}.${ext}'`).join('\n')
      await ffmpeg.writeFile('concat.txt', new TextEncoder().encode(concatContent))
      await ffmpeg.exec(['-f', 'concat', '-safe', '0', '-i', 'concat.txt', '-c', 'copy', `out.${ext}`])
      const data = await ffmpeg.readFile(`out.${ext}`) as Uint8Array
      downloadBlob(new Blob([(data as unknown as ArrayBuffer)], { type: files[0].type }), `merged.${ext}`)
      hideProgress(container, 'tb-amerge-progress')
      setStatus(container, 'tb-amerge-status', `Merged ${files.length} files.`, 'success')
    } catch {
      hideProgress(container, 'tb-amerge-progress')
      setStatus(container, 'tb-amerge-status', 'Processing failed.', 'error')
    }
    btn.disabled = false
  })
}

// ─── Change Speed ─────────────────────────────────────────────────────────────

function mountChangeSpeed(container: HTMLElement) {
  container.innerHTML = `
    ${audioDropZone('tb-speed-input', 'audio/*', 'Drop audio or click to upload')}
    <div id="tb-speed-form" class="toolbox-form" style="display:none">
      <div class="toolbox-field">
        <label>Speed</label>
        <div class="toolbox-btn-group" id="tb-speed-btns">
          <button class="toolbox-option-btn" data-speed="0.5">0.5×</button>
          <button class="toolbox-option-btn" data-speed="0.75">0.75×</button>
          <button class="toolbox-option-btn active" data-speed="1.25">1.25×</button>
          <button class="toolbox-option-btn" data-speed="1.5">1.5×</button>
          <button class="toolbox-option-btn" data-speed="2">2×</button>
        </div>
      </div>
      <button class="toolbox-btn" id="tb-speed-btn">Apply & Download</button>
      ${progressHTML('tb-speed-progress')}
      <div id="tb-speed-status" class="toolbox-status" style="display:none"></div>
    </div>
  `

  const input   = container.querySelector<HTMLInputElement>('#tb-speed-input')!
  const form    = container.querySelector<HTMLElement>('#tb-speed-form')!
  const sBtns   = container.querySelector<HTMLElement>('#tb-speed-btns')!
  const btn     = container.querySelector<HTMLButtonElement>('#tb-speed-btn')!
  let file: File | null = null
  let speed = '1.25'

  input.addEventListener('change', () => {
    file = input.files?.[0] || null
    if (file) form.style.display = 'flex'
  })

  sBtns.querySelectorAll<HTMLElement>('.toolbox-option-btn').forEach(b => {
    b.addEventListener('click', () => {
      sBtns.querySelectorAll('.toolbox-option-btn').forEach(x => x.classList.remove('active'))
      b.classList.add('active')
      speed = b.dataset.speed!
    })
  })

  btn.addEventListener('click', async () => {
    if (!file) return
    btn.disabled = true
    setStatus(container, 'tb-speed-status', '', 'info')
    try {
      const ffmpeg = await getFFmpeg(pct => {
        showProgress(container, 'tb-speed-progress', pct, `Processing… ${pct}%`)
      })
      showProgress(container, 'tb-speed-progress', 0, 'Loading FFmpeg…')
      const ext = getExt(file)
      await ffmpeg.writeFile(`in.${ext}`, await fetchFile(file))
      await ffmpeg.exec(['-i', `in.${ext}`, '-filter:a', `atempo=${speed}`, `out.${ext}`])
      const data = await ffmpeg.readFile(`out.${ext}`) as Uint8Array
      downloadBlob(new Blob([(data as unknown as ArrayBuffer)], { type: file.type }), `speed_${speed}x.${ext}`)
      hideProgress(container, 'tb-speed-progress')
      setStatus(container, 'tb-speed-status', `Speed changed to ${speed}×.`, 'success')
    } catch {
      hideProgress(container, 'tb-speed-progress')
      setStatus(container, 'tb-speed-status', 'Processing failed.', 'error')
    }
    btn.disabled = false
  })
}
