import './style.css'
import { appState } from './state'
import { initEditor, performUndo, performRedo, canUndo, canRedo } from './editor'
import { loadPage, navigateToHomePage, scheduleAutoSave, setupPageEventListeners } from './pages'
import { initProfileModal } from './profile'
import { initKeycloak, updateAuthUI, initAuthUI } from './auth'
import { initPageList, initDarkMode, initReadMode } from './ui'
import { initNotepad } from './notepad'
import { initToolbox } from './toolbox'
import { initTimer } from './timer'
import { initTodo } from './todo'
import { initCalendar } from './calendar'
import { Modal } from './Modal'
import { login } from './auth'
import { initInstallApp, registerServiceWorker } from './pwa'
import { initQuickSwitcher } from './quickSwitcher'

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

  window.addEventListener('undoStateChanged', updateUndoRedoButtons)

  document.addEventListener('keydown', async (e: KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey) || e.code !== 'KeyZ') return
    const target = e.target as HTMLElement | null
    if (target && !target.closest('#editor') && (target.closest('input, textarea') || target.isContentEditable)) return

    e.preventDefault()
    if (e.shiftKey) {
      if (canRedo()) {
        await performRedo()
        updateUndoRedoButtons()
      }
    } else if (canUndo()) {
      await performUndo()
      updateUndoRedoButtons()
    }
  })
}

function setupSessionExpiredHandler(): void {
  window.addEventListener('sessionExpired', (async () => {
    await Modal.error('Your session has expired. Please log in again.')
    login()
  }) as EventListener)
}

async function init(): Promise<void> {
  initInstallApp()
  registerServiceWorker()

  // keycloak redirect dies offline, so skip it and let the sw serve the cache
  if (!navigator.onLine) {
    await startOffline()
    return
  }

  const authenticated = await initKeycloak()
  updateAuthUI(authenticated)
  initAuthUI()

  initDarkMode()

  setupSessionExpiredHandler()

  if (!authenticated) {
    appState.isDemo = true
    document.body.classList.add('demo-mode')
  }

  await startApp()
}

async function startOffline(): Promise<void> {
  appState.isOffline = true
  document.body.classList.add('offline')
  updateAuthUI(true)
  initAuthUI()
  initDarkMode()

  window.addEventListener('online', () => window.location.reload())

  await startApp()
}

async function startApp(): Promise<void> {
  if (!appState.isDemo) {
    const welcomeScreen = document.getElementById('welcome-screen')
    const appContent = document.getElementById('app-content')
    if (welcomeScreen) welcomeScreen.style.display = 'none'
    if (appContent) appContent.classList.add('active')
  }

  initEditor(scheduleAutoSave, updateUndoRedoButtons)

  initPageList(loadPage)
  initQuickSwitcher(loadPage)

  initProfileModal()

  setupUndoRedo()
  initReadMode()
  setupPageEventListeners()
  initNotepad()
  initToolbox()
  initTimer()
  initTodo()
  initCalendar()
  if (!appState.isDemo) {
    await navigateToHomePage()
  }
}

init()
