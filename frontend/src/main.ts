import './style.css'
import { appState } from './state'
import { initEditor, performUndo, performRedo, canUndo, canRedo } from './editor'
import { loadPage, navigateToHomePage, scheduleAutoSave, setupHeaderUpload, setupPageTitleHandler, setupFavoriteButton, setupPageEventListeners } from './pages'
import { initProfileModal, setupProfileButton } from './profile'
import { initKeycloak, updateAuthUI, initAuthUI } from './auth'
import { initDesktopPageList, initMobilePageList, initDarkMode, setupLogoClick } from './ui'

/**
 * Update undo/redo button states
 */
function updateUndoRedoButtons(): void {
  const undoBtn = document.getElementById('undo-btn')
  const redoBtn = document.getElementById('redo-btn')

  if (undoBtn) {
    undoBtn.classList.toggle('disabled', !canUndo())
  }
  if (redoBtn) {
    redoBtn.classList.toggle('disabled', !canRedo())
  }
}

/**
 * Setup undo/redo buttons
 */
function setupUndoRedo(): void {
  const undoBtn = document.getElementById('undo-btn')
  const redoBtn = document.getElementById('redo-btn')

  if (undoBtn) {
    undoBtn.addEventListener('click', async () => {
      if (canUndo()) {
        await performUndo()
        updateUndoRedoButtons()
      }
    })
  }

  if (redoBtn) {
    redoBtn.addEventListener('click', async () => {
      if (canRedo()) {
        await performRedo()
        updateUndoRedoButtons()
      }
    })
  }

  // Keyboard shortcuts
  document.addEventListener('keydown', async (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
      e.preventDefault()
      if (canUndo()) {
        await performUndo()
        updateUndoRedoButtons()
      }
    }

    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z') {
      e.preventDefault()
      if (canRedo()) {
        await performRedo()
        updateUndoRedoButtons()
      }
    }
  })
}

/**
 * Setup session expiration handler
 */
function setupSessionExpiredHandler(): void {
  window.addEventListener('session-expired', ((e: CustomEvent) => {
    alert('Your session has expired. Please log in again.')
    window.location.reload()
  }) as EventListener)
}

/**
 * Main initialization
 */
async function init(): Promise<void> {
  // Initialize authentication
  const authenticated = await initKeycloak()
  updateAuthUI(authenticated)
  initAuthUI()

  // Initialize dark mode
  initDarkMode()

  // Setup session handler
  setupSessionExpiredHandler()

  // If not authenticated, stop here
  if (!authenticated) {
    return
  }

  // Hide welcome screen, show app content
  const welcomeScreen = document.getElementById('welcome-screen')
  const appContent = document.getElementById('app-content')
  if (welcomeScreen) welcomeScreen.style.display = 'none'
  if (appContent) appContent.classList.add('active')

  // Initialize editor
  initEditor(scheduleAutoSave, updateUndoRedoButtons)

  // Initialize page lists
  initDesktopPageList(loadPage)
  initMobilePageList(loadPage)

  // Initialize profile modal
  initProfileModal()

  // Setup buttons and handlers
  setupUndoRedo()
  setupHeaderUpload()
  setupPageTitleHandler()
  setupFavoriteButton()
  setupPageEventListeners()
  setupProfileButton()
  setupLogoClick(navigateToHomePage)

  // Load home page
  await navigateToHomePage()
}

// Start application
init()
