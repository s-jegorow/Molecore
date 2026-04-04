import { getToken, logout } from './auth'
import { API_URL, getPreferences, updatePreferences } from './api'
import { Modal } from './Modal'
import { showNotepadTab, hideNotepadTab } from './notepad'
import { showToolboxTab, hideToolboxTab } from './toolbox'
import { showTimerTab, hideTimerTab } from './timer'
import { showTodoTab, hideTodoTab } from './todo'
import { showCalendarTab, hideCalendarTab } from './calendar'
import { refreshSidebar } from './ui'

// DOM elements
let settingsModal: HTMLElement | null = null
let modalClose: HTMLElement | null = null
let cleanupUploadsBtn: HTMLElement | null = null
let settingsLogoutBtn: HTMLElement | null = null
let settingsBtn: HTMLElement | null = null

// Initialize profile modal elements
export function initProfileModal(): void {
  settingsModal = document.getElementById('settings-modal')
  modalClose = settingsModal?.querySelector('.modal-close') || null
  cleanupUploadsBtn = document.getElementById('cleanup-uploads-btn')
  settingsLogoutBtn = document.getElementById('settings-logout-btn')
  settingsBtn = document.getElementById('settings-btn')

  // Setup event listeners
  modalClose?.addEventListener('click', closeProfileModal)

  settingsModal?.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
      closeProfileModal()
    }
  })

  settingsLogoutBtn?.addEventListener('click', handleLogout)
  cleanupUploadsBtn?.addEventListener('click', handleCleanupUploads)

  // Notion Importer
  const notionBtn = document.getElementById('notion-importer-btn')
  notionBtn?.addEventListener('click', () => {
    closeProfileModal()
    openNotionImporter()
  })

  // Side tab chips
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

  // Dashboard toggle
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

  // Grain toggle
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

// Open the profile modal
export function openProfileModal(): void {
  settingsModal?.classList.add('active')
  loadStorageStats()
}

// Close the profile modal
function closeProfileModal(): void {
  settingsModal?.classList.remove('active')
}

// Setup profile button click handler
export function setupProfileButton(): void {
  settingsBtn?.addEventListener('click', () => {
    openProfileModal()
  })
}

// Load storage usage statistics
async function loadStorageStats(): Promise<void> {
  const storageBar = document.getElementById('storage-bar')
  const storageText = document.getElementById('storage-text')

  if (!storageBar || !storageText) return

  try {
    const token = await getToken()
    const response = await fetch(`${API_URL}/api/storage-usage`, {
      headers: {
        ...(token && { 'Authorization': `Bearer ${token}` })
      }
    })

    if (!response.ok) throw new Error('Failed to load storage stats')

    const data = await response.json()
    storageBar.style.width = `${Math.min(data.percentage, 100)}%`

    // Add warning or danger classes based on usage
    storageBar.classList.remove('warning', 'danger')
    if (data.percentage >= 90) {
      storageBar.classList.add('danger')
    } else if (data.percentage >= 70) {
      storageBar.classList.add('warning')
    }

    storageText.textContent = `${data.usage_formatted} of ${data.quota_formatted} used (${data.percentage}%)`
  } catch (error) {
    console.error('Failed to load storage stats:', error)
    storageText.textContent = 'Could not load storage info'
  }
}

// Handle logout from settings modal
function handleLogout(): void {
  closeProfileModal()
  logout()
}

// Notion Importer modal
function openNotionImporter(): void {
  const overlay = document.getElementById('notion-importer-modal')
  const bodyForm = document.getElementById('ni-body-form')
  const bodyLog = document.getElementById('ni-body-log')
  const fileInput = document.getElementById('ni-file-input') as HTMLInputElement
  const dropzone = document.getElementById('ni-dropzone')
  const dropLabel = document.getElementById('ni-dropzone-label')
  const importBtn = document.getElementById('ni-import-btn') as HTMLButtonElement
  const parentIdInput = document.getElementById('ni-parent-id') as HTMLInputElement
  const logEl = document.getElementById('ni-log')
  const spinner = document.getElementById('ni-spinner')
  const progressLabel = document.getElementById('ni-progress-label')
  const doneActions = document.getElementById('ni-done-actions')

  if (!overlay) return

  // Reset to form view
  bodyForm!.style.display = ''
  bodyLog!.style.display = 'none'
  fileInput.value = ''
  parentIdInput.value = ''
  importBtn.disabled = true
  if (dropLabel) dropLabel.innerHTML = 'Drop .zip here or <u>browse</u>'

  overlay.classList.add('active')
  overlay.setAttribute('aria-hidden', 'false')

  let selectedFile: File | null = null

  function setFile(f: File): void {
    if (!f.name.toLowerCase().endsWith('.zip')) return
    selectedFile = f
    if (dropLabel) dropLabel.textContent = f.name
    importBtn.disabled = false
  }

  // File input change
  fileInput.addEventListener('change', () => {
    if (fileInput.files?.[0]) setFile(fileInput.files[0])
  }, { once: true })

  // Click dropzone → trigger file picker
  dropzone?.addEventListener('click', () => fileInput.click())

  // Drag & drop
  dropzone?.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('ni-dropzone--over') })
  dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('ni-dropzone--over'))
  dropzone?.addEventListener('drop', (e) => {
    e.preventDefault()
    dropzone.classList.remove('ni-dropzone--over')
    const f = e.dataTransfer?.files[0]
    if (f) setFile(f)
  })

  // Close buttons
  function closeModal(): void {
    overlay.classList.remove('active')
    overlay.setAttribute('aria-hidden', 'true')
  }

  document.getElementById('ni-close-btn')?.addEventListener('click', closeModal, { once: true })
  document.getElementById('ni-cancel-btn')?.addEventListener('click', closeModal, { once: true })
  document.getElementById('ni-done-btn')?.addEventListener('click', closeModal, { once: true })
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal() })

  // Import
  importBtn.addEventListener('click', async () => {
    if (!selectedFile) return

    bodyForm!.style.display = 'none'
    bodyLog!.style.display = ''
    doneActions!.style.display = 'none'
    spinner!.style.display = ''
    if (progressLabel) progressLabel.textContent = 'Importing…'
    if (logEl) logEl.textContent = ''

    try {
      const token = await getToken()
      const formData = new FormData()
      formData.append('zip_file', selectedFile)
      const parentId = parentIdInput.value.trim()
      if (parentId) formData.append('parent_id', parentId)

      const response = await fetch(`${API_URL}/api/import/notion`, {
        method: 'POST',
        headers: { ...(token && { Authorization: `Bearer ${token}` }) },
        body: formData,
      })

      const data = await response.json()
      spinner!.style.display = 'none'

      if (!response.ok) {
        if (progressLabel) progressLabel.textContent = 'Import failed'
        if (logEl) logEl.textContent = data.detail || 'Unknown error'
      } else {
        if (progressLabel) progressLabel.textContent = `Done — ${data.pages_created} page(s) imported`
        if (logEl) logEl.textContent = (data.log as string[]).join('\n')
      }
    } catch (err) {
      spinner!.style.display = 'none'
      if (progressLabel) progressLabel.textContent = 'Import failed'
      if (logEl) logEl.textContent = String(err)
    }

    doneActions!.style.display = ''
  }, { once: true })
}

// Handle cleanup of unused uploaded files
async function handleCleanupUploads(): Promise<void> {
  const confirmed = await Modal.confirm(
    'Are you sure you want to clean up unused files? This will permanently delete files that are no longer referenced in any page.',
    'Clean Up Files'
  )
  if (!confirmed) return

  // Close settings modal immediately so it doesn't interfere with result modal
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
