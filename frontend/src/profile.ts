import { getToken } from './auth'
import { API_URL, getPreferences, updatePreferences, invalidatePagesCache } from './api'
import { Modal } from './Modal'
import { showNotepadTab, hideNotepadTab } from './notepad'
import { showToolboxTab, hideToolboxTab } from './toolbox'
import { showTimerTab, hideTimerTab } from './timer'
import { showTodoTab, hideTodoTab } from './todo'
import { showCalendarTab, hideCalendarTab } from './calendar'
import { refreshSidebar } from './ui'

let settingsModal: HTMLElement | null = null
let modalClose: HTMLElement | null = null
let cleanupUploadsBtn: HTMLElement | null = null

export function initProfileModal(): void {
  settingsModal = document.getElementById('settings-modal')
  modalClose = settingsModal?.querySelector('.modal-close') || null
  cleanupUploadsBtn = document.getElementById('cleanup-uploads-btn')

  modalClose?.addEventListener('click', closeProfileModal)

  settingsModal?.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
      closeProfileModal()
    }
  })

  cleanupUploadsBtn?.addEventListener('click', handleCleanupUploads)

  const notionBtn = document.getElementById('notion-importer-btn')
  initNotionImporter()
  notionBtn?.addEventListener('click', () => {
    closeProfileModal()
    openNotionImporter()
  })

  type ChipDef = {
    id: string
    pref: string
    show: () => void
    hide: () => void
    default: boolean
  }

  const chipDefs: ChipDef[] = [
    { id: 'notepad-chip',  pref: 'notepad_enabled',     show: showNotepadTab,  hide: hideNotepadTab,  default: false },
    { id: 'todo-chip',     pref: 'todo_enabled',         show: showTodoTab,     hide: hideTodoTab,     default: false },
    { id: 'timer-chip',    pref: 'focus_timer_enabled',  show: showTimerTab,    hide: hideTimerTab,    default: false },
    { id: 'calendar-chip', pref: 'calendar_enabled',     show: showCalendarTab, hide: hideCalendarTab, default: false },
    { id: 'toolbox-chip',  pref: 'toolbox_enabled',      show: showToolboxTab,  hide: hideToolboxTab,  default: false },
  ]

  getPreferences().then(prefs => {
    for (const def of chipDefs) {
      const chip = document.getElementById(def.id)
      if (!chip) continue
      const enabled = prefs[def.pref] ?? def.default
      chip.classList.toggle('active', enabled)
      if (enabled) def.show()
    }
  })

  for (const def of chipDefs) {
    const chip = document.getElementById(def.id)
    if (!chip) continue
    chip.addEventListener('click', async () => {
      const active = chip.classList.toggle('active')
      await updatePreferences({ [def.pref]: active })
      if (active) def.show()
      else def.hide()
    })
  }

  const dashboardToggle = document.getElementById('dashboard-toggle') as HTMLInputElement
  if (dashboardToggle) {
    getPreferences().then(prefs => {
      dashboardToggle.checked = prefs.dashboard_enabled ?? true
    })
    dashboardToggle.addEventListener('change', async () => {
      await updatePreferences({ dashboard_enabled: dashboardToggle.checked })
      refreshSidebar()
    })
  }

  const grainToggle = document.getElementById('grain-toggle') as HTMLInputElement
  if (grainToggle) {
    getPreferences().then(prefs => {
      grainToggle.checked = prefs.grain_enabled ?? false
      applyGrain(grainToggle.checked)
    })
    grainToggle.addEventListener('change', async () => {
      await updatePreferences({ grain_enabled: grainToggle.checked })
      applyGrain(grainToggle.checked)
    })
  }
}

function applyGrain(enabled: boolean): void {
  document.body.classList.toggle('grain-enabled', enabled)
}

function closeProfileModal(): void {
  settingsModal?.classList.remove('active')
}

let niSelectedFile: File | null = null
let niImporting = false

function niElements() {
  return {
    overlay: document.getElementById('notion-importer-modal'),
    bodyForm: document.getElementById('ni-body-form'),
    bodyLog: document.getElementById('ni-body-log'),
    fileInput: document.getElementById('ni-file-input') as HTMLInputElement | null,
    dropzone: document.getElementById('ni-dropzone'),
    dropLabel: document.getElementById('ni-dropzone-label'),
    importBtn: document.getElementById('ni-import-btn') as HTMLButtonElement | null,
    parentIdInput: document.getElementById('ni-parent-id') as HTMLInputElement | null,
    logEl: document.getElementById('ni-log'),
    spinner: document.getElementById('ni-spinner'),
    progressLabel: document.getElementById('ni-progress-label'),
    doneActions: document.getElementById('ni-done-actions'),
  }
}

function closeNotionImporter(): void {
  if (niImporting) return
  const { overlay } = niElements()
  overlay?.classList.remove('active')
  overlay?.setAttribute('aria-hidden', 'true')
}

function initNotionImporter(): void {
  const { overlay, fileInput, dropzone, dropLabel, importBtn } = niElements()
  if (!overlay || !fileInput || !importBtn) return

  function setFile(f: File): void {
    if (!f.name.toLowerCase().endsWith('.zip')) return
    niSelectedFile = f
    if (dropLabel) dropLabel.textContent = f.name
    importBtn!.disabled = false
  }

  fileInput.addEventListener('change', () => {
    if (fileInput.files?.[0]) setFile(fileInput.files[0])
  })

  dropzone?.addEventListener('click', () => fileInput.click())

  dropzone?.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('ni-dropzone--over') })
  dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('ni-dropzone--over'))
  dropzone?.addEventListener('drop', (e) => {
    e.preventDefault()
    dropzone.classList.remove('ni-dropzone--over')
    const f = e.dataTransfer?.files[0]
    if (f) setFile(f)
  })

  document.getElementById('ni-close-btn')?.addEventListener('click', closeNotionImporter)
  document.getElementById('ni-cancel-btn')?.addEventListener('click', closeNotionImporter)
  document.getElementById('ni-done-btn')?.addEventListener('click', closeNotionImporter)
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeNotionImporter() })

  importBtn.addEventListener('click', runNotionImport)
}

function openNotionImporter(): void {
  const { overlay, bodyForm, bodyLog, fileInput, dropLabel, importBtn, parentIdInput } = niElements()
  if (!overlay || !fileInput || !importBtn) return

  niSelectedFile = null
  if (bodyForm) bodyForm.style.display = ''
  if (bodyLog) bodyLog.style.display = 'none'
  fileInput.value = ''
  if (parentIdInput) parentIdInput.value = ''
  importBtn.disabled = true
  if (dropLabel) dropLabel.innerHTML = 'Drop .zip here or <u>browse</u>'

  overlay.classList.add('active')
  overlay.setAttribute('aria-hidden', 'false')
}

async function runNotionImport(): Promise<void> {
  const { bodyForm, bodyLog, importBtn, parentIdInput, logEl, spinner, progressLabel, doneActions } = niElements()
  if (!niSelectedFile || niImporting) return
  niImporting = true
  if (importBtn) importBtn.disabled = true

  if (bodyForm) bodyForm.style.display = 'none'
  if (bodyLog) bodyLog.style.display = ''
  if (doneActions) doneActions.style.display = 'none'
  if (spinner) spinner.style.display = ''
  if (progressLabel) progressLabel.textContent = 'Importing…'
  if (logEl) logEl.textContent = ''

  try {
    const token = await getToken()
    const formData = new FormData()
    formData.append('zip_file', niSelectedFile)
    const parentId = parentIdInput?.value.trim()
    if (parentId) formData.append('parent_id', parentId)

    const response = await fetch(`${API_URL}/api/import/notion`, {
      method: 'POST',
      headers: { ...(token && { Authorization: `Bearer ${token}` }) },
      body: formData,
    })

    const data = await response.json().catch(() => ({}))
    if (spinner) spinner.style.display = 'none'

    if (!response.ok) {
      if (progressLabel) progressLabel.textContent = 'Import failed'
      if (logEl) logEl.textContent = data.detail || 'Unknown error'
    } else {
      if (progressLabel) progressLabel.textContent = `Done, ${data.pages_created} page(s) imported`
      if (logEl) logEl.textContent = (data.log as string[]).join('\n')
      invalidatePagesCache()
      await refreshSidebar()
    }
  } catch (err) {
    if (spinner) spinner.style.display = 'none'
    if (progressLabel) progressLabel.textContent = 'Import failed'
    if (logEl) logEl.textContent = String(err)
  } finally {
    niImporting = false
  }

  if (doneActions) doneActions.style.display = ''
}

async function handleCleanupUploads(): Promise<void> {
  const confirmed = await Modal.confirm(
    'Are you sure you want to clean up unused files? This will permanently delete files that are no longer referenced in any page.',
    'Clean Up Files'
  )
  if (!confirmed) return

  closeProfileModal()

  try {
    const token = await getToken()
    const response = await fetch(`${API_URL}/api/cleanup-uploads`, {
      method: 'POST',
      headers: {
        ...(token && { 'Authorization': `Bearer ${token}` })
      }
    })

    if (!response.ok) {
      throw new Error('Cleanup failed')
    }

    const result = await response.json()
    await Modal.success(
      `Files deleted: ${result.deleted_count}\nSpace freed: ${result.space_freed}`,
      'Cleanup Complete'
    )
  } catch (error) {
    console.error('Cleanup error:', error)
    await Modal.error('Failed to clean up files. Please try again.')
  }
}
