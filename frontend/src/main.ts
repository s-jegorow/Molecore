import EditorJS from '@editorjs/editorjs'
import Header from '@editorjs/header'
import List from '@editorjs/list'
import Code from '@editorjs/code'
import Table from '@editorjs/table'
import CustomToggleBlock from './CustomToggleBlock'
import ParagraphWithBlanks from './ParagraphWithBlanks'
import ResizableImage from './ResizableImage'
import BackgroundColorTune from './BackgroundColorTune'
import ColorTool from './ColorTool'
import HighlightTool from './HighlightTool'
import UnderlineTool from './UnderlineTool'
import StrikethroughTool from './StrikethroughTool'
import LinkTool from './LinkTool'
import DragDrop from 'editorjs-drag-drop'
import PageBlock from './PageBlock'
import AudioBlock from './AudioBlock'
import FileBlock from './FileBlock'
import EmbedBlock from './EmbedBlock'
import { getPage, getPages, updatePage, deletePage, API_URL } from './api'
import { initSidebar, setActivePage, loadPages } from './sidebar'
import { initMobileMenu, loadMobilePages } from './mobileMenu'
import { UndoManager } from './UndoManager'
import { Modal } from './Modal'
import { initKeycloak, isAuthenticated, login, logout, getUserInfo, getToken } from './keycloak'


let currentPageId: number | null = null
let editor: EditorJS
let autoSaveTimeout: number | null = null
let undoManager: UndoManager

// Editor initialisieren
function initEditor() {
  editor = new EditorJS({
    holder: 'editor',

    tools: {
      paragraph: {
        class: ParagraphWithBlanks,
        inlineToolbar: ['bold', 'italic', 'link', 'highlight', 'color', 'underline', 'strikethrough'],
        tunes: ['backgroundColor']
      },
      header: {
        class: Header as any,
        inlineToolbar: ['bold', 'italic', 'link', 'highlight', 'color', 'underline', 'strikethrough'],
        tunes: ['backgroundColor']
      },
      list: {
        class: List as any,
        inlineToolbar: ['bold', 'italic', 'link', 'highlight', 'color', 'underline', 'strikethrough'],
        tunes: ['backgroundColor']
      },
      code: {
        class: Code as any,
        tunes: ['backgroundColor']
      },
      table: {
        class: Table as any,
        tunes: ['backgroundColor']
      },
      toggle: {
        class: CustomToggleBlock as any,
        inlineToolbar: ['bold', 'italic', 'link', 'highlight', 'color', 'underline', 'strikethrough'],
        tunes: ['backgroundColor']
      },
      image: ResizableImage as any,
      audio: AudioBlock as any,
      file: FileBlock as any,
      embed: EmbedBlock as any,
      link: LinkTool as any,
      highlight: HighlightTool as any,
      color: ColorTool as any,
      underline: UnderlineTool as any,
      strikethrough: StrikethroughTool as any,
      page: PageBlock as any,
      backgroundColor: BackgroundColorTune as any
    },

    placeholder: 'Type / for commands...',
    autofocus: true,

    onReady: () => {
      new DragDrop(editor)

      // Initialize undo manager
      undoManager = new UndoManager(editor, 5)

      // Capture initial state after a short delay
      setTimeout(async () => {
        await undoManager.captureState()
        updateUndoRedoButtons()
      }, 500)

      // Global touch event fix for EditorJS popovers
      document.addEventListener('touchend', (e: TouchEvent) => {
        const target = e.target as HTMLElement

        // Check if touch is on a popover item
        const popoverItem = target.closest('.ce-popover__item')
        if (popoverItem) {
          e.preventDefault()
          e.stopPropagation()

          // Trigger click after a tiny delay
          setTimeout(() => {
            (popoverItem as HTMLElement).click()
          }, 50)
        }
      }, { passive: false, capture: true })

      const editorElement = document.getElementById('editor')
      if (editorElement) {
        // Make links clickable
        editorElement.addEventListener('click', (e: MouseEvent) => {
          const target = e.target as HTMLElement
          const link = target.closest('a')
          if (link && link.href) {
            e.preventDefault()
            window.open(link.href, '_blank', 'noopener,noreferrer')
          }
        })
      }
    },

    onChange: async () => {
      // Capture state for undo
      if (undoManager) {
        await undoManager.captureState()
        updateUndoRedoButtons()
      }

      // Debounced auto-save: 2 seconds after last change
      if (autoSaveTimeout) {
        clearTimeout(autoSaveTimeout)
      }
      autoSaveTimeout = window.setTimeout(() => {
        autoSave()
      }, 2000)
    }
  })

  // Make editor available globally for ResizableImage tool
  ;(window as any).editor = editor
}

async function buildBreadcrumbs(pageId: number) {
  const breadcrumbsContainer = document.getElementById('breadcrumbs')
  if (!breadcrumbsContainer) return

  try {
    const allPages = await getPages()
    const pageMap = new Map(allPages.map(p => [p.id, p]))

    const path: Array<{ id: number; title: string }> = []
    let currentId: number | null = pageId

    // Build path from current page to root
    while (currentId !== null) {
      const page = pageMap.get(currentId)
      if (!page) break

      path.unshift({ id: page.id, title: page.title })
      currentId = page.parent_id
    }

    // Render breadcrumbs
    breadcrumbsContainer.innerHTML = path
      .map((item, index) => {
        const isLast = index === path.length - 1
        if (isLast) {
          return `<span class="breadcrumb-current">${item.title}</span>`
        }
        return `<a href="#" class="breadcrumb-link" data-page-id="${item.id}">${item.title}</a>`
      })
      .join('<span class="breadcrumb-separator">/</span>')

    // Add click handlers for breadcrumb links
    breadcrumbsContainer.querySelectorAll('.breadcrumb-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault()
        const targetPageId = parseInt((e.target as HTMLElement).dataset.pageId || '0')
        if (targetPageId) {
          loadPage(targetPageId)
        }
      })
    })
  } catch (error) {
    console.error('Failed to build breadcrumbs:', error)
  }
}

async function loadPage(pageId: number) {
  try {
    const page = await getPage(pageId)

    // Editor neu initialisieren -> neue Page
    if (editor) {
      await editor.isReady
      await editor.clear()
      await editor.render(page.content)

      // Clear undo history when loading a new page
      if (undoManager) {
        undoManager.clear()
        await undoManager.captureState()
        updateUndoRedoButtons()
      }
    }

    // Titel aktualisieren
    const pageTitleInput = document.getElementById('page-title') as HTMLInputElement
    if (pageTitleInput) {
      pageTitleInput.value = page.title
    }

    currentPageId = pageId
    // Make currentPageId available globally for PageBlock
    ;(window as any).currentPageId = pageId
    setActivePage(pageId)

    // Update breadcrumbs
    await buildBreadcrumbs(pageId)

    // Update favorite button state
    updateFavoriteButton(page.page_type === 'favorite')

    // Update header image
    updateHeaderImage(page.header)

    // Update delete button visibility
    updateDeleteButtonVisibility(page.page_type === 'home')

    console.log('Page loaded:', page.title)
  } catch (error) {
    console.error('Failed to load page:', error)
  }
}

function updateDeleteButtonVisibility(isHomePage: boolean) {
  const deleteBtn = document.getElementById('delete-btn')
  if (!deleteBtn) return

  if (isHomePage) {
    deleteBtn.style.display = 'none'
  } else {
    deleteBtn.style.display = 'flex'
  }
}

function updateFavoriteButton(isFavorite: boolean) {
  const favoriteBtn = document.getElementById('favorite-btn')
  if (!favoriteBtn) return

  if (isFavorite) {
    favoriteBtn.classList.add('is-favorite')
    favoriteBtn.textContent = '★'
  } else {
    favoriteBtn.classList.remove('is-favorite')
    favoriteBtn.textContent = '☆'
  }
}

function updateHeaderImage(headerPath: string | null | undefined) {
  const header = document.querySelector('header')
  if (!header) return

  // Set or remove background image
  if (headerPath) {
    (header as HTMLElement).style.backgroundImage = `url('${headerPath}')`
  } else {
    (header as HTMLElement).style.backgroundImage = ''
  }
}

// Dark mode handler
const darkmodeBtn = document.getElementById('darkmode-btn')
const mobileDarkmodeBtn = document.getElementById('mobile-darkmode-btn')

// Check if mobile (screen width <= 768px)
const isMobile = () => window.innerWidth <= 768

// Default: Desktop = dark, Mobile = light (if no preference saved)
const savedMode = localStorage.getItem('darkMode')
let isDarkMode = savedMode !== null ? savedMode === 'true' : !isMobile()

function updateLogo() {
  const logoImg = document.querySelector('.logo img') as HTMLImageElement
  if (logoImg) {
    logoImg.src = isDarkMode ? '/molecore-logo-dark.png' : '/molecore-logo-light.png'
  }
}

function toggleDarkMode() {
  isDarkMode = !isDarkMode
  localStorage.setItem('darkMode', String(isDarkMode))

  if (isDarkMode) {
    document.body.classList.add('dark-mode')
    darkmodeBtn?.classList.add('active')
    mobileDarkmodeBtn?.classList.add('active')
  } else {
    document.body.classList.remove('dark-mode')
    darkmodeBtn?.classList.remove('active')
    mobileDarkmodeBtn?.classList.remove('active')
  }

  updateLogo()
}

// Apply saved dark mode preference on load
if (isDarkMode) {
  document.body.classList.add('dark-mode')
  darkmodeBtn?.classList.add('active')
  mobileDarkmodeBtn?.classList.add('active')
}
updateLogo()

darkmodeBtn?.addEventListener('click', toggleDarkMode)
mobileDarkmodeBtn?.addEventListener('click', toggleDarkMode)

// Login/Logout handler
const loginBtn = document.getElementById('login-btn')
const logoutBtn = document.getElementById('logout-btn')
const userGreeting = document.getElementById('user-greeting')

const mobileLoginBtn = document.getElementById('mobile-login-btn')
const mobileLogoutBtn = document.getElementById('mobile-logout-btn')

loginBtn?.addEventListener('click', () => {
  login()
})

logoutBtn?.addEventListener('click', () => {
  logout()
})

mobileLoginBtn?.addEventListener('click', () => {
  login()
})

mobileLogoutBtn?.addEventListener('click', () => {
  logout()
})

function updateUserUI(authenticated: boolean) {
  const newPageBtn = document.getElementById('new-page-btn')
  const pagesSection = document.getElementById('pages-section')
  const favoritesSection = document.getElementById('favorites-section')
  const searchContainer = document.getElementById('search-container')
  const settingsBtn = document.getElementById('settings-btn')

  if (authenticated) {
    const userInfo = getUserInfo()
    const username = userInfo?.preferred_username || userInfo?.name || 'User'

    if (userGreeting) userGreeting.textContent = `Hello ${username}`
    if (loginBtn) loginBtn.style.display = 'none'
    if (logoutBtn) logoutBtn.style.display = 'block'
    if (mobileLoginBtn) mobileLoginBtn.style.display = 'none'
    if (mobileLogoutBtn) mobileLogoutBtn.style.display = 'block'
    if (newPageBtn) newPageBtn.style.display = 'block'
    if (pagesSection) pagesSection.style.display = 'block'
    if (favoritesSection) favoritesSection.style.display = 'block'
    if (searchContainer) searchContainer.style.display = 'block'
    if (settingsBtn) settingsBtn.style.display = 'block'
  } else {
    if (userGreeting) userGreeting.textContent = 'Hello Guest'
    if (loginBtn) loginBtn.style.display = 'block'
    if (logoutBtn) logoutBtn.style.display = 'none'
    if (mobileLoginBtn) mobileLoginBtn.style.display = 'block'
    if (mobileLogoutBtn) mobileLogoutBtn.style.display = 'none'
    if (newPageBtn) newPageBtn.style.display = 'none'
    if (pagesSection) pagesSection.style.display = 'none'
    if (favoritesSection) favoritesSection.style.display = 'none'
    if (searchContainer) searchContainer.style.display = 'none'
    if (settingsBtn) settingsBtn.style.display = 'none'
  }
}

// Settings modal handler
const settingsBtn = document.getElementById('settings-btn')
const settingsModal = document.getElementById('settings-modal')
const modalClose = settingsModal?.querySelector('.modal-close')
const cleanupUploadsBtn = document.getElementById('cleanup-uploads-btn')

settingsBtn?.addEventListener('click', () => {
  settingsModal?.classList.add('active')
})

modalClose?.addEventListener('click', () => {
  settingsModal?.classList.remove('active')
})

settingsModal?.addEventListener('click', (e) => {
  if (e.target === settingsModal) {
    settingsModal.classList.remove('active')
  }
})

cleanupUploadsBtn?.addEventListener('click', async () => {
  const confirmed = await Modal.confirm('Are you sure you want to clean up unused files? This will permanently delete files that are no longer referenced in any page.', 'Clean Up Files')
  if (!confirmed) return

  // Close settings modal immediately so it doesn't interfere with result modal
  settingsModal?.classList.remove('active')

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
    await Modal.success(`Files deleted: ${result.deleted_count}\nSpace freed: ${result.space_freed}`, 'Cleanup Complete')
  } catch (error) {
    console.error('Cleanup error:', error)
    await Modal.error('Failed to clean up files. Please try again.')
  }
})

// Header double-click handler - Upload header image
const headerElement = document.querySelector('header')
headerElement?.addEventListener('dblclick', (e) => {
  // Don't trigger if double-clicking on the title input
  if ((e.target as HTMLElement).id === 'page-title') return
  if (!currentPageId) return

  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('upload_type', 'header')

      const response = await fetch(`${API_URL}/api/upload`, {
        method: 'POST',
        body: formData
      })

      if (!response.ok) throw new Error('Upload failed')

      const data = await response.json()
      const headerPath = `${API_URL}${data.url}`

      await updatePage(currentPageId, { header: headerPath })
      updateHeaderImage(headerPath)

      console.log('Header image uploaded')
    } catch (error) {
      console.error('Failed to upload header:', error)
      await Modal.error('Failed to upload header image.')
    }
  })
  input.click()
})

// Favorite button handler
const favoriteBtn = document.getElementById('favorite-btn')
favoriteBtn?.addEventListener('click', async () => {
  if (!currentPageId) return

  try {
    const page = await getPage(currentPageId)

    // Toggle between 'favorite' and 'normal'
    const newPageType = page.page_type === 'favorite' ? 'normal' : 'favorite'

    await updatePage(currentPageId, { page_type: newPageType })
    updateFavoriteButton(newPageType === 'favorite')

    // Reload sidebar to move page between sections
    await loadPages(loadPage)

    console.log(`Page ${newPageType === 'favorite' ? 'added to' : 'removed from'} favorites`)
  } catch (error) {
    console.error('Failed to toggle favorite:', error)
  }
})

// Delete button handler
const deleteBtn = document.getElementById('delete-btn')
deleteBtn?.addEventListener('click', async () => {
  if (!currentPageId) return

  const confirmed = await Modal.confirm('Are you sure you want to delete this page? This action cannot be undone.', 'Delete Page')
  if (!confirmed) return

  try {
    await deletePage(currentPageId)

    // Reload sidebar first
    await loadPages(loadPage)

    // Navigate to home page
    const allPages = await getPages()
    const homePage = allPages.find(p => p.page_type === 'home')
    if (homePage) {
      await loadPage(homePage.id)
    }
  } catch (error: any) {
    console.error('Failed to delete page:', error)
    const errorMessage = error?.message || 'Failed to delete page. Please try again.'
    await Modal.error(errorMessage)
  }
})

// Title Input - Save on blur
const pageTitleInput = document.getElementById('page-title') as HTMLInputElement
pageTitleInput?.addEventListener('blur', async () => {
  if (!currentPageId) return

  const newTitle = pageTitleInput.value || 'Untitled'

  try {
    await updatePage(currentPageId, { title: newTitle })
    // Sidebar aktualisieren - nur das Title-Element, nicht das Icon
    const pageItems = document.querySelectorAll(`[data-page-id="${currentPageId}"]`)
    pageItems.forEach(pageItem => {
      const titleEl = pageItem.querySelector('.page-title')
      if (titleEl) {
        titleEl.textContent = newTitle
      }
    })
  } catch (error) {
    console.error('Failed to update title:', error)
  }
})


// Auto-save function
async function autoSave() {
  if (!currentPageId || !editor) return

  try {
    await editor.isReady
    const content = await editor.save()
    const pageTitleInput = document.getElementById('page-title') as HTMLInputElement
    const title = pageTitleInput?.value || 'Untitled'

    await updatePage(currentPageId, { content, title })
  } catch (error) {
    console.error('Auto-save failed:', error)
  }
}

// Auto-save when PageBlock is created
window.addEventListener('pageBlockCreated', async () => {
  // Wait a bit for editor to finish rendering the block
  await new Promise(resolve => setTimeout(resolve, 100))
  autoSave()
})

// Navigate to subpages from PageBlock
window.addEventListener('navigateToPage', (e: any) => {
  const pageId = e.detail?.pageId
  if (pageId) {
    loadPage(pageId)
  }
})

// Load home page on init
async function init() {
  const authenticated = await initKeycloak()

  updateUserUI(authenticated)

  if (!authenticated) {
    return
  }

  const welcomeScreen = document.getElementById('welcome-screen')
  const appContent = document.getElementById('app-content')
  if (welcomeScreen) welcomeScreen.style.display = 'none'
  if (appContent) appContent.classList.add('active')

  initEditor()
  initSidebar(loadPage)
  initMobileMenu(loadPage)

  try {
    const allPages = await getPages()
    const homePage = allPages.find(p => p.page_type === 'home')
    if (homePage) {
      await loadPage(homePage.id)
    }
  } catch (error) {
    console.error('Failed to load home page:', error)
  }
}


// Logo click handler - load home page
const logoElement = document.querySelector('.logo')
logoElement?.addEventListener('click', async (e) => {
  e.preventDefault()
  try {
    const allPages = await getPages()
    const homePage = allPages.find(p => p.page_type === 'home')
    if (homePage) {
      await loadPage(homePage.id)
    }
  } catch (error) {
    console.error('Failed to load home page:', error)
  }
})

// Undo/Redo buttons
const undoBtn = document.getElementById('undo-btn') as HTMLButtonElement
const redoBtn = document.getElementById('redo-btn') as HTMLButtonElement

function updateUndoRedoButtons() {
  if (!undoManager) return

  if (undoBtn) {
    undoBtn.disabled = !undoManager.canUndo()
  }
  if (redoBtn) {
    redoBtn.disabled = !undoManager.canRedo()
  }
}

undoBtn?.addEventListener('click', async () => {
  if (!undoManager) return
  await undoManager.undo()
  updateUndoRedoButtons()
})

redoBtn?.addEventListener('click', async () => {
  if (!undoManager) return
  await undoManager.redo()
  updateUndoRedoButtons()
})

// Keyboard shortcuts
document.addEventListener('keydown', async (e) => {
  if (!undoManager) return

  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
  const modKey = isMac ? e.metaKey : e.ctrlKey

  if (modKey && e.key === 'z' && !e.shiftKey) {
    e.preventDefault()
    await undoManager.undo()
    updateUndoRedoButtons()
  } else if (modKey && e.key === 'z' && e.shiftKey) {
    e.preventDefault()
    await undoManager.redo()
    updateUndoRedoButtons()
  }
})

// Handle session expiration
window.addEventListener('sessionExpired', () => {
  const welcomeScreen = document.getElementById('welcome-screen')
  const appContent = document.getElementById('app-content')
  if (welcomeScreen) welcomeScreen.style.display = 'flex'
  if (appContent) appContent.classList.remove('active')
  updateUserUI(false)
})

init()
