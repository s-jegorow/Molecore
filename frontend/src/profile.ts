import { getToken, logout } from './auth'
import { API_URL } from './api'
import { Modal } from './Modal'

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
