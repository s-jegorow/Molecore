import { getPage, getPages, updatePage, deletePage, getPreferences, API_URL } from './api'
import { setActivePage, refreshSidebar } from './ui'
import { appState } from './state'
import { Modal } from './Modal'
import { getToken } from './auth'
import { applyCalloutForeignKeys, initCalloutObserver } from './CalloutBlock'

/**
 * Build breadcrumb navigation showing the path from root to current page
 */
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
    breadcrumbsContainer.innerHTML = ''
    path.forEach((item, index) => {
      const isLast = index === path.length - 1

      if (index > 0) {
        const sep = document.createElement('span')
        sep.className = 'breadcrumb-separator'
        sep.textContent = '/'
        breadcrumbsContainer.appendChild(sep)
      }

      if (isLast) {
        const span = document.createElement('span')
        span.className = 'breadcrumb-current'
        span.textContent = item.title
        breadcrumbsContainer.appendChild(span)
      } else {
        const link = document.createElement('a')
        link.href = '#'
        link.className = 'breadcrumb-link'
        link.dataset.pageId = String(item.id)
        link.textContent = item.title
        link.addEventListener('click', (e) => {
          e.preventDefault()
          loadPage(item.id)
        })
        breadcrumbsContainer.appendChild(link)
      }
    })
  } catch (error) {
    console.error('Failed to build breadcrumbs:', error)
  }
}

/**
 * Update the delete button visibility based on page type
 * Home page cannot be deleted
 */
function updateDeleteButtonVisibility(isHomePage: boolean) {
  const deleteBtn = document.getElementById('delete-btn')
  if (!deleteBtn) return

  if (isHomePage) {
    deleteBtn.style.display = 'none'
  } else {
    deleteBtn.style.display = 'flex'
  }
}

/**
 * Update the favorite button appearance
 */
function updateFavoriteButton(isFavorite: boolean) {
  const favoriteBtn = document.getElementById('favorite-btn')
  if (!favoriteBtn) return

  favoriteBtn.classList.toggle('is-favorite', isFavorite)
  favoriteBtn.title = isFavorite ? 'Remove from favorites' : 'Add to favorites'
}

/**
 * Update the header background image
 */
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

/**
 * Load a page by ID and render it in the editor
 */
export async function loadPage(pageId: number) {
  // In demo mode, switch from landing page to app on first page load
  if (appState.isDemo) {
    const welcomeScreen = document.getElementById('welcome-screen')
    const appContent = document.getElementById('app-content')
    if (welcomeScreen) welcomeScreen.style.display = 'none'
    if (appContent) appContent.classList.add('active')
  }

  setSyncIndicator('ok')
  appState.suppressIdleUntil = Date.now() + 800

  try {
    const page = await getPage(pageId)

    // Reinitialize editor with new page
    if (appState.editor) {
      await appState.editor.isReady
      await appState.editor.clear()
      await appState.editor.render(page.content)

      // Re-init callout observer for new page content + apply immediately
      initCalloutObserver()

      // Clear undo history when loading a new page
      if (appState.undoManager) {
        appState.undoManager.clear()
        await appState.undoManager.captureState()
        // Trigger undo/redo button update
        const event = new CustomEvent('undoStateChanged')
        window.dispatchEvent(event)
      }
    }

    // Update page title + title color
    const pageTitleInput = document.getElementById('page-title') as HTMLInputElement
    if (pageTitleInput) {
      pageTitleInput.value = page.title
      const raw = (page.content as any)?.title_color || ''
      const titleColor = /^#[0-9a-fA-F]{6}$/.test(raw) ? raw : ''
      pageTitleInput.style.color = titleColor
      applyTitleColorIndicator(titleColor)
    }

    appState.currentPageId = pageId
    setActivePage(pageId)

    // Update breadcrumbs
    await buildBreadcrumbs(pageId)

    // Update favorite button state
    updateFavoriteButton(page.page_type === 'favorite')

    // Update header image
    updateHeaderImage(page.header)

    // Update delete button visibility
    updateDeleteButtonVisibility(page.page_type === 'home')

  } catch (error) {
    console.error('Failed to load page:', error)
  }
}

/**
 * Navigate to the home page
 */
export async function navigateToHomePage(): Promise<void> {
  if (appState.isDemo) {
    // In demo mode, "home" means back to the landing page
    const welcomeScreen = document.getElementById('welcome-screen')
    const appContent = document.getElementById('app-content')
    if (welcomeScreen) welcomeScreen.style.display = ''
    if (appContent) appContent.classList.remove('active')
    return
  }

  try {
    const [allPages, prefs] = await Promise.all([getPages(), getPreferences().catch(() => ({}))])
    const dashboardEnabled = (prefs as any).dashboard_enabled ?? true

    if (dashboardEnabled) {
      const homePage = allPages.find(p => p.page_type === 'home')
      if (homePage) {
        await loadPage(homePage.id)
        return
      }
    }

    const firstFavorite = allPages.find(p => p.page_type === 'favorite' && !p.parent_id)
    const firstPage = allPages.find(p => p.page_type !== 'home' && !p.parent_id)
    const target = firstFavorite || firstPage || allPages.find(p => p.page_type === 'home')
    if (target) await loadPage(target.id)
  } catch (error) {
    console.error('Failed to load home page:', error)
  }
}

/**
 * Auto-save the current page content
 */
function setSyncIndicator(status: 'idle' | 'ok' | 'error') {
  const el = document.getElementById('sync-indicator')
  if (!el) return
  el.classList.remove('sync-idle', 'sync-ok', 'sync-error')
  el.classList.add(`sync-${status}`)
  el.title = status === 'ok' ? 'Saved' : status === 'error' ? 'Save failed' : 'Not yet saved'
}

async function autoSave() {
  if (!appState.currentPageId || !appState.editor) return
  if (appState.isDemo) return
  if (appState.isSaving) return

  try {
    appState.isSaving = true
    await appState.editor.isReady
    const content = await appState.editor.save()
    const pageTitleInput = document.getElementById('page-title') as HTMLInputElement
    const title = pageTitleInput?.value || 'Untitled'
    const titleColor = pageTitleInput?.style.color || ''
    if (titleColor) (content as any).title_color = titleColor

    await updatePage(appState.currentPageId, { content, title })
    setSyncIndicator('ok')
  } catch (error) {
    console.error('Auto-save failed:', error)
    setSyncIndicator('error')
  } finally {
    appState.isSaving = false
  }
}

/**
 * Schedule an auto-save with a debounce delay
 */
export async function scheduleAutoSave(): Promise<void> {
  if (appState.isDemo) return
  if (Date.now() > appState.suppressIdleUntil) setSyncIndicator('idle')
  appState.clearAutoSaveTimeout()

  appState.autoSaveTimeout = window.setTimeout(() => {
    autoSave()
  }, 2000)
}

/**
 * Set up the header upload functionality (double-click to upload)
 */
export function setupHeaderUpload(): void {
  const headerElement = document.querySelector('header')
  headerElement?.addEventListener('dblclick', async (e) => {
    // Don't trigger if double-clicking on the title input
    if ((e.target as HTMLElement).id === 'page-title') return
    if (!appState.currentPageId) return
    if (appState.isDemo) return

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

        const token = await getToken()
        const response = await fetch(`${API_URL}/api/upload`, {
          method: 'POST',
          headers: {
            ...(token && { 'Authorization': `Bearer ${token}` })
          },
          body: formData
        })

        if (!response.ok) throw new Error('Upload failed')

        const data = await response.json()
        const headerPath = `${API_URL}${data.url}`

        await updatePage(appState.currentPageId!, { header: headerPath })
        updateHeaderImage(headerPath)
      } catch (error) {
        console.error('Failed to upload header:', error)
        await Modal.error('Failed to upload header image.')
      }
    })
    input.click()
  })
}

/**
 * Set up the page title input handler (save on blur)
 */
export function setupPageTitleHandler(): void {
  const pageTitleInput = document.getElementById('page-title') as HTMLInputElement
  pageTitleInput?.addEventListener('blur', async () => {
    if (!appState.currentPageId) return

    const newTitle = pageTitleInput.value || 'Untitled'

    try {
      await updatePage(appState.currentPageId, { title: newTitle })
      // Update sidebar title element
      const pageItems = document.querySelectorAll(`[data-page-id="${appState.currentPageId}"]`)
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
}

/**
 * Set up the favorite button toggle handler
 */
export function setupFavoriteButton(): void {
  const favoriteBtn = document.getElementById('favorite-btn')
  favoriteBtn?.addEventListener('click', async () => {
    if (!appState.currentPageId) return

    try {
      const page = await getPage(appState.currentPageId)

      // Toggle between 'favorite' and 'normal'
      const newPageType = page.page_type === 'favorite' ? 'normal' : 'favorite'

      await updatePage(appState.currentPageId, { page_type: newPageType })
      updateFavoriteButton(newPageType === 'favorite')
      await refreshSidebar()
    } catch (error) {
      console.error('Failed to toggle favorite:', error)
    }
  })
}

/**
 * Set up the delete button handler
 */
function setupDeleteButton(): void {
  const deleteBtn = document.getElementById('delete-btn')
  deleteBtn?.addEventListener('click', async () => {
    if (!appState.currentPageId) return

    const { confirmed, checked: cascade } = await Modal.confirmWithCheckbox(
      'Are you sure you want to delete this page? This action cannot be undone.',
      'Also delete all subpages',
      'Delete Page'
    )
    if (!confirmed) return

    try {
      await deletePage(appState.currentPageId, cascade)
      await refreshSidebar()
      await navigateToHomePage()
    } catch (error: any) {
      console.error('Failed to delete page:', error)
      const errorMessage = error?.message || 'Failed to delete page. Please try again.'
      await Modal.error(errorMessage)
    }
  })
}

/**
 * Set up the logo click handler to navigate to home page
 */
function setupLogoHandler(): void {
  const logoElement = document.querySelector('.logo')
  logoElement?.addEventListener('click', async (e) => {
    e.preventDefault()
    await navigateToHomePage()
  })
}

/**
 * Set up auto-save when PageBlock is created
 */
function setupPageBlockAutoSave(): void {
  window.addEventListener('pageBlockCreated', async () => {
    // Wait a bit for editor to finish rendering the block
    await new Promise(resolve => setTimeout(resolve, 100))
    await autoSave()
  })
}

/**
 * Set up navigation from PageBlock clicks
 */
function setupPageBlockNavigation(): void {
  window.addEventListener('navigateToPage', (e: any) => {
    const pageId = e.detail?.pageId
    if (pageId) {
      loadPage(pageId)
    }
  })
}

/**
 * Set up all page-related event listeners
 */
export function setupPageEventListeners(): void {
  setupHeaderUpload()
  setupPageTitleHandler()
  setupFavoriteButton()
  setupDeleteButton()
  setupLogoHandler()
  setupPageBlockAutoSave()
  setupPageBlockNavigation()
  setupTitleColorPicker()
  setupDragScroll()
}

/**
 * Auto-scroll the main content area when dragging a block near the top/bottom edge.
 * EditorJS uses HTML5 drag events, so we listen to dragover/dragend.
 */
function setupDragScroll(): void {
  const main = document.querySelector('main')
  if (!main) return

  let rafId: number | null = null
  let scrollSpeed = 0

  const tick = () => {
    if (scrollSpeed !== 0) {
      main.scrollTop += scrollSpeed
      rafId = requestAnimationFrame(tick)
    } else {
      rafId = null
    }
  }

  document.addEventListener('dragover', (e) => {
    const rect = main.getBoundingClientRect()
    const zone = 80
    const maxSpeed = 14

    if (e.clientY > rect.bottom - zone) {
      scrollSpeed = maxSpeed * ((e.clientY - (rect.bottom - zone)) / zone)
    } else if (e.clientY < rect.top + zone) {
      scrollSpeed = -maxSpeed * (((rect.top + zone) - e.clientY) / zone)
    } else {
      scrollSpeed = 0
    }

    if (scrollSpeed !== 0 && rafId === null) rafId = requestAnimationFrame(tick)
    if (scrollSpeed === 0 && rafId !== null) { cancelAnimationFrame(rafId); rafId = null }
  })

  document.addEventListener('dragend', () => {
    scrollSpeed = 0
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null }
  })
}

const TITLE_COLORS = [
  { label: 'Default', value: '' },
  { label: 'Gray',    value: '#888888' },
  { label: 'Red',     value: '#e03e3e' },
  { label: 'Orange',  value: '#d9730d' },
  { label: 'Yellow',  value: '#c19a00' },
  { label: 'Green',   value: '#0f7b6c' },
  { label: 'Blue',    value: '#0b6e99' },
  { label: 'Purple',  value: '#6940a5' },
  { label: 'Pink',    value: '#ad1a72' },
  { label: 'White',   value: '#ffffff' },
]

export function applyTitleColorIndicator(color: string): void {
  const indicator = document.getElementById('title-color-indicator')
  if (indicator) indicator.style.background = color || 'var(--color-text-primary)'
}

function setupTitleColorPicker(): void {
  const btn = document.getElementById('title-color-btn')
  const titleInput = document.getElementById('page-title') as HTMLInputElement
  if (!btn || !titleInput) return

  btn.addEventListener('click', (e) => {
    e.stopPropagation()

    // Remove existing popover
    document.getElementById('title-color-popover')?.remove()

    const popover = document.createElement('div')
    popover.id = 'title-color-popover'
    popover.className = 'title-color-popover'

    TITLE_COLORS.forEach(({ label, value }) => {
      const swatch = document.createElement('button')
      swatch.className = 'title-color-swatch'
      swatch.title = label
      swatch.style.background = value || 'transparent'
      if (!value) {
        swatch.classList.add('title-color-swatch--default')
        swatch.textContent = '✕'
      }
      if (titleInput.style.color === value) swatch.classList.add('active')

      swatch.addEventListener('click', (ev) => {
        ev.stopPropagation()
        titleInput.style.color = value
        applyTitleColorIndicator(value)
        popover.remove()
        scheduleAutoSave()
      })
      popover.appendChild(swatch)
    })

    document.body.appendChild(popover)

    // Position below the button, clamped so it never goes off-screen to the right
    const rect = btn.getBoundingClientRect()
    const popoverWidth = popover.getBoundingClientRect().width || 160
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - popoverWidth - 8))
    popover.style.top = `${rect.bottom + 6}px`
    popover.style.left = `${left}px`

    // Close on outside click
    const close = (ev: MouseEvent) => {
      if (!popover.contains(ev.target as Node)) {
        popover.remove()
        document.removeEventListener('click', close)
      }
    }
    setTimeout(() => document.addEventListener('click', close), 0)
  })
}
