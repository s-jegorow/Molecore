import { getPages, createPage, updatePage, getPreferences } from './api'
import { appState } from './state'
import type { Page, PageSelectCallback } from './types'
import { showIconPicker } from './iconPicker'

let currentPageId: number | null = null
let pageSelectCallback: PageSelectCallback | null = null
let allPages: Page[] = []

// Initialize page list (bottom bar + slide-in panel)
export function initPageList(onPageSelect: PageSelectCallback) {
  pageSelectCallback = onPageSelect
  const mobileMenuToggle = document.getElementById('mobile-menu-toggle')
  const mobileOverlay = document.getElementById('mobile-overlay')
  const mobileNewPageBtn = document.getElementById('mobile-new-page-btn')
  const searchInput = document.getElementById('search-input') as HTMLInputElement
  const searchResults = document.getElementById('search-results')

  if (!mobileMenuToggle || !mobileOverlay || !mobileNewPageBtn) {
    return
  }

  // Logo button toggles menu open/close
  mobileMenuToggle.addEventListener('click', () => {
    if (mobileOverlay.classList.contains('active')) {
      closeMobileMenu()
    } else {
      openMobileMenu()
    }
  })

  // Close menu when clicking overlay
  mobileOverlay.addEventListener('click', (e) => {
    if (e.target === mobileOverlay) {
      closeMobileMenu()
    }
  })

  // New page button
  mobileNewPageBtn.addEventListener('click', async () => {
    try {
      const newPage = await createPage({
        title: 'Untitled',
        content: { blocks: [] }
      })
      await loadPages(onPageSelect)
      closeMobileMenu()
      onPageSelect(newPage.id)
    } catch (error) {
      console.error('Failed to create page:', error)
    }
  })

  // Demo: back to start button
  const demoBackBtn = document.getElementById('demo-back-btn')
  if (demoBackBtn) {
    demoBackBtn.addEventListener('click', async () => {
      closeMobileMenu()
      const { navigateToHomePage } = await import('./pages')
      await navigateToHomePage()
    })
  }

  // Listen for icon updates
  window.addEventListener('iconUpdated', () => {
    loadPages(onPageSelect)
  })

  // Search input
  if (searchInput && searchResults) {
    searchInput.addEventListener('input', (e) => {
      const query = (e.target as HTMLInputElement).value.toLowerCase().trim()
      renderSearchResults(query, onPageSelect)
    })

    // Close search results when clicking outside
    document.addEventListener('click', (e) => {
      if (!searchInput.contains(e.target as Node) && !searchResults.contains(e.target as Node)) {
        searchResults.innerHTML = ''
      }
    })
  }

  // Event delegation for page clicks
  const mobilePagesList = document.getElementById('mobile-pages-list')
  const mobileFavoritesList = document.getElementById('mobile-favorites-list')

  if (mobilePagesList) {
    mobilePagesList.addEventListener('click', (e) => {
      const pageItem = (e.target as HTMLElement).closest('.page-item')
      if (!pageItem) return

      const pageId = parseInt((pageItem as HTMLElement).dataset.pageId || '0')
      if (!pageId) return

      // Don't trigger if clicking icon
      const iconEl = pageItem.querySelector('.page-icon')
      if (iconEl && (e.target === iconEl || iconEl.contains(e.target as Node))) {
        return
      }

      closeMobileMenu()
      onPageSelect(pageId)
      setActivePage(pageId)
    })
  }

  if (mobileFavoritesList) {
    mobileFavoritesList.addEventListener('click', (e) => {
      const pageItem = (e.target as HTMLElement).closest('.page-item')
      if (!pageItem) return

      const pageId = parseInt((pageItem as HTMLElement).dataset.pageId || '0')
      if (!pageId) return

      // Don't trigger if clicking icon
      const iconEl = pageItem.querySelector('.page-icon')
      if (iconEl && (e.target === iconEl || iconEl.contains(e.target as Node))) {
        return
      }

      closeMobileMenu()
      onPageSelect(pageId)
      setActivePage(pageId)
    })
  }

  // Initial load
  loadPages(onPageSelect)
}

/**
 * Refresh sidebar (re-fetch pages from API)
 */
export async function refreshSidebar(): Promise<void> {
  if (pageSelectCallback) {
    await loadPages(pageSelectCallback)
  }
}

export function setActivePage(pageId: number) {
  currentPageId = pageId

  document.querySelectorAll('.page-item').forEach(item => {
    item.classList.remove('active')
    if ((item as HTMLElement).dataset.pageId === String(pageId)) {
      item.classList.add('active')
    }
  })
}

// Dark mode initialization
export function initDarkMode() {
  const mobileDarkmodeBtn = document.getElementById('mobile-darkmode-btn')

  // Default: dark mode
  const savedMode = localStorage.getItem('darkMode')
  let isDarkMode = savedMode !== null ? savedMode === 'true' : true

  function updateLogo() {
    const landingLogo = document.getElementById('landing-logo') as HTMLImageElement
    if (landingLogo) {
      landingLogo.src = isDarkMode ? '/molecore-logo-dark.png' : '/molecore-logo-light.png'
    }
  }

  function updateDarkmodeIcon() {
    const moonIcon = isDarkMode ? '🌙' : '☾'
    if (mobileDarkmodeBtn) mobileDarkmodeBtn.textContent = moonIcon
  }

  function toggleDarkMode() {
    isDarkMode = !isDarkMode
    localStorage.setItem('darkMode', String(isDarkMode))

    if (isDarkMode) {
      document.body.classList.add('dark-mode')
      mobileDarkmodeBtn?.classList.add('active')
    } else {
      document.body.classList.remove('dark-mode')
      mobileDarkmodeBtn?.classList.remove('active')
    }

    updateLogo()
    updateDarkmodeIcon()
  }

  // Apply saved dark mode preference on load
  if (isDarkMode) {
    document.body.classList.add('dark-mode')
    mobileDarkmodeBtn?.classList.add('active')
  }
  updateLogo()
  updateDarkmodeIcon()

  mobileDarkmodeBtn?.addEventListener('click', toggleDarkMode)
}

// Load pages into the slide-in panel
async function loadPages(onPageSelect: PageSelectCallback) {
  const mobilePagesList = document.getElementById('mobile-pages-list')
  const mobileFavoritesList = document.getElementById('mobile-favorites-list')

  if (!mobilePagesList) return

  try {
    allPages = await getPages()
    const mainPages = allPages.filter(page => !page.parent_id && page.page_type !== 'home')
    const favorites = mainPages.filter(page => page.page_type === 'favorite')
    const nonFavorites = mainPages.filter(page => page.page_type !== 'favorite')

    if (mobileFavoritesList) {
      mobileFavoritesList.innerHTML = ''

      // Dashboard item at top of favorites if enabled
      const prefs = await getPreferences().catch(() => ({}))
      if (prefs.dashboard_enabled ?? true) {
        const homePage = allPages.find(p => p.page_type === 'home')
        if (homePage) {
          const dashItem = document.createElement('div')
          dashItem.className = 'page-item' + (currentPageId === homePage.id ? ' active' : '')
          dashItem.dataset.pageId = String(homePage.id)
          dashItem.innerHTML = `<span style="margin-right:8px;font-size:16px">🏠</span><span class="page-title">Dashboard</span>`
          dashItem.addEventListener('click', () => {
            onPageSelect(homePage.id)
            closeMobileMenu()
          })
          mobileFavoritesList.appendChild(dashItem)
        }
      }

      favorites.forEach(page => {
        const pageItem = createPageItem(page, onPageSelect)
        mobileFavoritesList.appendChild(pageItem)
      })
    }

    mobilePagesList.innerHTML = ''
    nonFavorites.forEach(page => {
      const pageItem = createPageItem(page, onPageSelect)
      mobilePagesList.appendChild(pageItem)
    })

    // Clear search
    const searchInput = document.getElementById('search-input') as HTMLInputElement
    const searchResults = document.getElementById('search-results')
    if (searchInput) searchInput.value = ''
    if (searchResults) searchResults.innerHTML = ''
  } catch (error) {
    console.error('Failed to load pages:', error)
  }
}

// Create a page item element with icon-picker and inline-rename
function createPageItem(page: Page, onPageSelect: PageSelectCallback): HTMLElement {
  const pageItem = document.createElement('div')
  pageItem.className = 'page-item'
  pageItem.dataset.pageId = String(page.id)

  // Icon element
  const iconEl = document.createElement('span')
  iconEl.className = 'page-icon'
  iconEl.style.cssText = 'margin-right: 8px; user-select: none; display: inline-flex; align-items: center; font-size: 16px;'

  if (page.icon && page.icon.startsWith('http')) {
    const img = document.createElement('img')
    img.src = page.icon
    img.style.cssText = 'width: 20px; height: 20px; object-fit: cover; border-radius: 2px;'
    iconEl.appendChild(img)
  } else {
    iconEl.textContent = page.icon || '📄'
  }

  // Title element
  const titleEl = document.createElement('span')
  titleEl.className = 'page-title'
  titleEl.textContent = page.title
  titleEl.style.cssText = 'flex: 1; cursor: default; text-decoration: none;'

  pageItem.appendChild(iconEl)
  pageItem.appendChild(titleEl)

  if (page.id === currentPageId) {
    pageItem.classList.add('active')
  }

  // Icon double-click handler - show picker
  iconEl.addEventListener('dblclick', (e) => {
    e.stopPropagation()
    e.preventDefault()
    showIconPicker(page.id, iconEl, () => {
      if (pageSelectCallback) {
        loadPages(pageSelectCallback)
      }
    })
  })

  // Double click title - edit inline
  titleEl.addEventListener('dblclick', (e) => {
    e.stopPropagation()
    const input = document.createElement('input')
    input.type = 'text'
    input.value = page.title
    input.className = 'page-item-edit'

    input.style.cssText = `
      flex: 1;
      padding: 4px 8px;
      border: 1px solid #007bff;
      border-radius: 4px;
      font-size: 14px;
      font-family: inherit;
      outline: none;
      background: transparent;
      color: var(--color-text-primary);
    `

    const saveTitle = async () => {
      const newTitle = input.value.trim() || 'Untitled'
      try {
        await updatePage(page.id, { title: newTitle })
        titleEl.textContent = newTitle

        // Update header if this is the active page
        if (page.id === currentPageId) {
          const headerInput = document.getElementById('page-title') as HTMLInputElement
          if (headerInput) {
            headerInput.value = newTitle
          }
        }
      } catch (error) {
        console.error('Failed to update title:', error)
        titleEl.textContent = page.title
      }
    }

    input.addEventListener('blur', saveTitle)
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        input.blur()
      } else if (e.key === 'Escape') {
        titleEl.textContent = page.title
      }
    })

    titleEl.textContent = ''
    titleEl.appendChild(input)
    input.focus()
    input.select()
  })

  // Click handled by event delegation in initPageList

  return pageItem
}

// Search functionality
function getBlockText(block: any): string {
  if (block.data.text) return block.data.text
  if (block.data.items) {
    return Array.isArray(block.data.items)
      ? block.data.items.map((i: any) => (typeof i === 'string' ? i : i.content || '')).join(' ')
      : ''
  }
  if (block.data.code) return block.data.code
  if (block.data.content && Array.isArray(block.data.content)) {
    return block.data.content.flat().join(' ')
  }
  if (block.data.pageTitle) return block.data.pageTitle
  return ''
}

function searchInPageContent(page: Page, query: string): string | true | false {
  if (page.title.toLowerCase().includes(query)) return true

  if (page.content && page.content.blocks) {
    for (const block of page.content.blocks) {
      const raw = getBlockText(block)
      const stripped = raw.replace(/<[^>]*>/g, '')
      if (stripped.toLowerCase().includes(query)) {
        // Return a short snippet around the match
        const idx = stripped.toLowerCase().indexOf(query)
        const start = Math.max(0, idx - 30)
        const end = Math.min(stripped.length, idx + query.length + 50)
        const snippet = (start > 0 ? '…' : '') + stripped.slice(start, end) + (end < stripped.length ? '…' : '')
        return snippet
      }
    }
  }

  return false
}

function getPagePath(pageId: number): string {
  const pageMap = new Map(allPages.map(p => [p.id, p]))
  const path: string[] = []
  let currentId: number | null = pageId

  while (currentId !== null) {
    const page = pageMap.get(currentId)
    if (!page) break
    path.unshift(page.title)
    currentId = page.parent_id
  }

  return path.join(' / ')
}

function renderSearchResults(query: string, onPageSelect: PageSelectCallback) {
  const searchResults = document.getElementById('search-results')
  if (!searchResults) return

  if (!query) {
    searchResults.innerHTML = ''
    return
  }

  const matchResults: Array<{ page: Page; snippet: string | null }> = []
  for (const page of allPages) {
    const result = searchInPageContent(page, query)
    if (result !== false) {
      matchResults.push({ page, snippet: result === true ? null : result })
    }
  }

  if (matchResults.length === 0) {
    searchResults.innerHTML = '<div class="search-no-results">No results found</div>'
    return
  }

  searchResults.innerHTML = ''
  matchResults.forEach(({ page, snippet }) => {
    const resultItem = document.createElement('div')
    resultItem.className = 'search-result-item'

    const title = document.createElement('div')
    title.className = 'search-result-title'
    title.textContent = page.title

    const path = document.createElement('div')
    path.className = 'search-result-path'
    path.textContent = getPagePath(page.id)

    resultItem.appendChild(title)
    resultItem.appendChild(path)

    if (snippet) {
      const snippetEl = document.createElement('div')
      snippetEl.className = 'search-result-snippet'
      snippetEl.textContent = snippet
      resultItem.appendChild(snippetEl)
    }

    resultItem.addEventListener('click', () => {
      closeMobileMenu()
      onPageSelect(page.id)
      searchResults.innerHTML = ''
      const searchInput = document.getElementById('search-input') as HTMLInputElement
      if (searchInput) searchInput.value = ''
    })

    searchResults.appendChild(resultItem)
  })
}

// Menu controls
function openMobileMenu() {
  const overlay = document.getElementById('mobile-overlay')
  if (overlay) {
    overlay.classList.add('active')
  }
}

function closeMobileMenu() {
  const overlay = document.getElementById('mobile-overlay')
  if (overlay) {
    overlay.classList.remove('active')
  }
}

// Read Mode
export function initReadMode() {
  const readModeBtn = document.getElementById('readmode-btn')
  let isReadMode = localStorage.getItem('readMode') === 'true'

  function applyReadMode() {
    document.body.classList.toggle('read-mode', isReadMode)
    if (readModeBtn) {
      readModeBtn.classList.toggle('active', isReadMode)
      readModeBtn.title = isReadMode ? 'Edit Mode (⌘⇧R)' : 'Read Mode (⌘⇧R)'
    }

    if (appState.editor) {
      appState.editor.readOnly.toggle(isReadMode)
    }
  }

  function toggleReadMode() {
    isReadMode = !isReadMode
    localStorage.setItem('readMode', String(isReadMode))
    applyReadMode()
  }

  // Apply on init
  if (isReadMode) {
    // Delay to let editor initialize first
    setTimeout(applyReadMode, 300)
  }

  readModeBtn?.addEventListener('click', toggleReadMode)

  // Keyboard shortcut: Cmd+Shift+R
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'r') {
      e.preventDefault()
      toggleReadMode()
    }
  })
}
