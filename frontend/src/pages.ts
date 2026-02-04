import { getPage, getPages, updatePage, deletePage, API_URL } from './api'
import { setActivePage } from './ui'
import { appState } from './state'
import { Modal } from './Modal'
import { getToken } from './auth'

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

  if (isFavorite) {
    favoriteBtn.classList.add('is-favorite')
    favoriteBtn.textContent = '★'
  } else {
    favoriteBtn.classList.remove('is-favorite')
    favoriteBtn.textContent = '☆'
  }
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
  try {
    const page = await getPage(pageId)

    // Reinitialize editor with new page
    if (appState.editor) {
      await appState.editor.isReady
      await appState.editor.clear()
      await appState.editor.render(page.content)

      // Clear undo history when loading a new page
      if (appState.undoManager) {
        appState.undoManager.clear()
        await appState.undoManager.captureState()
        // Trigger undo/redo button update
        const event = new CustomEvent('undoStateChanged')
        window.dispatchEvent(event)
      }
    }

    // Update page title
    const pageTitleInput = document.getElementById('page-title') as HTMLInputElement
    if (pageTitleInput) {
      pageTitleInput.value = page.title
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

/**
 * Auto-save the current page content
 */
async function autoSave() {
  if (!appState.currentPageId || !appState.editor) return

  try {
    await appState.editor.isReady
    const content = await appState.editor.save()
    const pageTitleInput = document.getElementById('page-title') as HTMLInputElement
    const title = pageTitleInput?.value || 'Untitled'

    await updatePage(appState.currentPageId, { content, title })
  } catch (error) {
    console.error('Auto-save failed:', error)
  }
}

/**
 * Schedule an auto-save with a debounce delay
 */
export async function scheduleAutoSave(): Promise<void> {
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

      // Reload sidebar to move page between sections
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

    const confirmed = await Modal.confirm('Are you sure you want to delete this page? This action cannot be undone.', 'Delete Page')
    if (!confirmed) return

    try {
      await deletePage(appState.currentPageId)

      // Reload sidebar first

      // Navigate to home page
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
}
