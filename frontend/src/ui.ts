import { getPages, createPage, updatePage } from './api'
import type { Page, PageSelectCallback } from './types'
import { showIconPicker } from './iconPicker'

let currentPageId: number | null = null
let pageSelectCallback: PageSelectCallback | null = null
let allPages: Page[] = []

// Desktop sidebar initialization
export function initDesktopPageList(onPageSelect: PageSelectCallback) {
  pageSelectCallback = onPageSelect
  const newPageBtn = document.getElementById('new-page-btn')
  const pagesList = document.getElementById('pages-list')
  const favoritesList = document.getElementById('favorites-list')
  const searchInput = document.getElementById('search-input') as HTMLInputElement
  const searchResults = document.getElementById('search-results')

  if (!newPageBtn || !pagesList) {
    console.error('Sidebar elements not found')
    return
  }

  // Listen for icon updates from PageBlock
  window.addEventListener('iconUpdated', () => {
    loadDesktopPages(onPageSelect)
  })

  // New page button
  newPageBtn.addEventListener('click', async () => {
    try {
      const newPage = await createPage({
        title: 'Untitled',
        content: { blocks: [] }
      })
      await loadDesktopPages(onPageSelect)
      onPageSelect(newPage.id)
    } catch (error) {
      console.error('Failed to create page:', error)
    }
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

  // Event delegation for page clicks (fixes closure bug)
  pagesList.addEventListener('click', (e) => {
    const pageItem = (e.target as HTMLElement).closest('.page-item')
    if (!pageItem) return

    const pageId = parseInt((pageItem as HTMLElement).dataset.pageId || '0')
    if (!pageId) return

    // Don't trigger if clicking icon
    const iconEl = pageItem.querySelector('.page-icon')
    if (iconEl && (e.target === iconEl || iconEl.contains(e.target as Node))) {
      return
    }

    onPageSelect(pageId)
    setActivePage(pageId)
  })

  if (favoritesList) {
    favoritesList.addEventListener('click', (e) => {
      const pageItem = (e.target as HTMLElement).closest('.page-item')
      if (!pageItem) return

      const pageId = parseInt((pageItem as HTMLElement).dataset.pageId || '0')
      if (!pageId) return

      // Don't trigger if clicking icon
      const iconEl = pageItem.querySelector('.page-icon')
      if (iconEl && (e.target === iconEl || iconEl.contains(e.target as Node))) {
        return
      }

      onPageSelect(pageId)
      setActivePage(pageId)
    })
  }

  // Initial load
  loadDesktopPages(onPageSelect)
}

// Mobile menu initialization
export function initMobilePageList(onPageSelect: PageSelectCallback) {
  const mobileMenuToggle = document.getElementById('mobile-menu-toggle')
  const mobileOverlay = document.getElementById('mobile-overlay')
  const mobileNewPageBtn = document.getElementById('mobile-new-page-btn')

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
      await loadMobilePages(onPageSelect)
      closeMobileMenu()
      onPageSelect(newPage.id)
    } catch (error) {
      console.error('Failed to create page:', error)
    }
  })

  // Listen for icon updates
  window.addEventListener('iconUpdated', () => {
    loadMobilePages(onPageSelect)
  })

  // Event delegation for mobile page clicks
  const mobilePagesList = document.getElementById('mobile-pages-list')
  const mobileFavoritesList = document.getElementById('mobile-favorites-list')

  if (mobilePagesList) {
    mobilePagesList.addEventListener('click', (e) => {
      const pageItem = (e.target as HTMLElement).closest('.page-item')
      if (!pageItem) return

      const pageId = parseInt((pageItem as HTMLElement).dataset.pageId || '0')
      if (!pageId) return

      closeMobileMenu()
      onPageSelect(pageId)
    })
  }

  if (mobileFavoritesList) {
    mobileFavoritesList.addEventListener('click', (e) => {
      const pageItem = (e.target as HTMLElement).closest('.page-item')
      if (!pageItem) return

      const pageId = parseInt((pageItem as HTMLElement).dataset.pageId || '0')
      if (!pageId) return

      closeMobileMenu()
      onPageSelect(pageId)
    })
  }

  // Initial load
  loadMobilePages(onPageSelect)
}

// Set active page indicator
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

  function updateDarkmodeIcon() {
    const moonIcon = isDarkMode ? '🌙' : '☾'
    if (darkmodeBtn) darkmodeBtn.textContent = moonIcon
    if (mobileDarkmodeBtn) mobileDarkmodeBtn.textContent = moonIcon
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
    updateDarkmodeIcon()
  }

  // Apply saved dark mode preference on load
  if (isDarkMode) {
    document.body.classList.add('dark-mode')
    darkmodeBtn?.classList.add('active')
    mobileDarkmodeBtn?.classList.add('active')
  }
  updateLogo()
  updateDarkmodeIcon()

  darkmodeBtn?.addEventListener('click', toggleDarkMode)
  mobileDarkmodeBtn?.addEventListener('click', toggleDarkMode)
}

// Setup logo click handler
export function setupLogoClick(navigateToHome: () => void) {
  const logoElement = document.querySelector('.logo')
  logoElement?.addEventListener('click', async (e) => {
    e.preventDefault()
    navigateToHome()
  })
}

// Load desktop pages (sidebar)
async function loadDesktopPages(onPageSelect: PageSelectCallback) {
  const pagesList = document.getElementById('pages-list')
  const favoritesList = document.getElementById('favorites-list')
  if (!pagesList) return

  try {
    allPages = await getPages()
    // Filter: Only show pages WITHOUT parent_id (no subpages) AND not home page
    const mainPages = allPages.filter(page => !page.parent_id && page.page_type !== 'home')

    // Split into favorites and all pages
    const favorites = mainPages.filter(page => page.page_type === 'favorite')
    const nonFavorites = mainPages.filter(page => page.page_type !== 'favorite')

    // Render favorites
    if (favoritesList) {
      favoritesList.innerHTML = ''
      favorites.forEach(page => {
        const pageItem = createDesktopPageItem(page, onPageSelect)
        favoritesList.appendChild(pageItem)
      })
    }

    // Render all main pages (excluding favorites - they're in favorites-list)
    renderDesktopPages(nonFavorites, onPageSelect)

    // Clear search if there was one
    const searchInput = document.getElementById('search-input') as HTMLInputElement
    const searchResults = document.getElementById('search-results')
    if (searchInput) {
      searchInput.value = ''
    }
    if (searchResults) {
      searchResults.innerHTML = ''
    }
  } catch (error) {
    console.error('Failed to load pages:', error)
  }
}

// Load mobile pages
async function loadMobilePages(onPageSelect: PageSelectCallback) {
  const mobilePagesList = document.getElementById('mobile-pages-list')
  const mobileFavoritesList = document.getElementById('mobile-favorites-list')

  if (!mobilePagesList) return

  try {
    const allPagesData = await getPages()
    const mainPages = allPagesData.filter(page => !page.parent_id && page.page_type !== 'home')
    const favorites = mainPages.filter(page => page.page_type === 'favorite')

    if (mobileFavoritesList) {
      mobileFavoritesList.innerHTML = ''
      favorites.forEach(page => {
        const pageItem = createMobilePageItem(page, onPageSelect)
        mobileFavoritesList.appendChild(pageItem)
      })
    }

    mobilePagesList.innerHTML = ''
    mainPages.forEach(page => {
      const pageItem = createMobilePageItem(page, onPageSelect)
      mobilePagesList.appendChild(pageItem)
    })
  } catch (error) {
    console.error('Failed to load mobile pages:', error)
  }
}

// Render desktop pages
function renderDesktopPages(pages: Page[], onPageSelect: PageSelectCallback) {
  const pagesList = document.getElementById('pages-list')
  if (!pagesList) return

  pagesList.innerHTML = ''

  pages.forEach(page => {
    const pageItem = createDesktopPageItem(page, onPageSelect)
    pagesList.appendChild(pageItem)
  })
}

// Create desktop page item
function createDesktopPageItem(page: Page, onPageSelect: PageSelectCallback): HTMLElement {
  const pageItem = document.createElement('div')
  pageItem.className = 'page-item'
  pageItem.dataset.pageId = String(page.id)
  pageItem.draggable = true

  // Icon element
  const iconEl = document.createElement('span')
  iconEl.className = 'page-icon'
  iconEl.style.cssText = 'margin-right: 8px; user-select: none; display: inline-flex; align-items: center;'

  // Check if icon is URL or emoji
  if (page.icon && page.icon.startsWith('http')) {
    const img = document.createElement('img')
    img.src = page.icon
    img.style.cssText = 'width: 16px; height: 16px; object-fit: cover; border-radius: 2px;'
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
      // Reload sidebar to update icon in both lists
      if (pageSelectCallback) {
        loadDesktopPages(pageSelectCallback)
      }
    })
  })

  // Drag & Drop handlers
  pageItem.addEventListener('dragstart', (e) => {
    e.dataTransfer!.effectAllowed = 'move'
    e.dataTransfer!.setData('text/plain', String(page.id))
    pageItem.classList.add('dragging')
  })

  pageItem.addEventListener('dragend', () => {
    pageItem.classList.remove('dragging')
  })

  pageItem.addEventListener('dragover', (e) => {
    e.preventDefault()
    e.dataTransfer!.dropEffect = 'move'

    const dragging = document.querySelector('.dragging')
    if (dragging && dragging !== pageItem) {
      pageItem.classList.add('drag-over')
    }
  })

  pageItem.addEventListener('dragleave', () => {
    pageItem.classList.remove('drag-over')
  })

  pageItem.addEventListener('drop', async (e) => {
    e.preventDefault()
    pageItem.classList.remove('drag-over')

    const draggedId = parseInt(e.dataTransfer!.getData('text/plain'))
    const targetId = page.id

    if (draggedId === targetId) return

    await reorderPages(draggedId, targetId)
    await loadDesktopPages(onPageSelect)
  })

  // Click handled by event delegation in initDesktopPageList

  // Double click - edit title inline
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

  return pageItem
}

// Create mobile page item
function createMobilePageItem(page: Page, onPageSelect: PageSelectCallback): HTMLElement {
  const pageItem = document.createElement('div')
  pageItem.className = 'page-item'
  pageItem.dataset.pageId = String(page.id)

  const iconEl = document.createElement('span')
  iconEl.className = 'page-icon'
  iconEl.style.cssText = 'margin-right: 8px; user-select: none; display: inline-flex; align-items: center; font-size: 16px;'

  // Check if icon is URL or emoji
  if (page.icon && page.icon.startsWith('http')) {
    const img = document.createElement('img')
    img.src = page.icon
    img.style.cssText = 'width: 20px; height: 20px; object-fit: cover; border-radius: 2px;'
    iconEl.appendChild(img)
  } else {
    iconEl.textContent = page.icon || '📄'
  }

  const titleEl = document.createElement('span')
  titleEl.className = 'page-title'
  titleEl.textContent = page.title
  titleEl.style.cssText = 'flex: 1; cursor: pointer;'

  pageItem.appendChild(iconEl)
  pageItem.appendChild(titleEl)

  // Click handled by event delegation in initMobilePageList

  return pageItem
}

// Search functionality
function searchInPageContent(page: Page, query: string): boolean {
  // Search in title
  if (page.title.toLowerCase().includes(query)) {
    return true
  }

  // Search in content blocks
  if (page.content && page.content.blocks) {
    for (const block of page.content.blocks) {
      // Extract text from different block types
      let blockText = ''

      if (block.data.text) {
        // Paragraph, Header
        blockText = block.data.text
      } else if (block.data.items) {
        // List
        blockText = block.data.items.join(' ')
      } else if (block.data.code) {
        // Code
        blockText = block.data.code
      } else if (block.data.content) {
        // Table
        if (Array.isArray(block.data.content)) {
          blockText = block.data.content.flat().join(' ')
        }
      } else if (block.data.pageTitle) {
        // PageBlock
        blockText = block.data.pageTitle
      }

      // Strip HTML tags and search
      const strippedText = blockText.replace(/<[^>]*>/g, '').toLowerCase()
      if (strippedText.includes(query)) {
        return true
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

  // Search ALL pages (including subpages)
  const matches = allPages.filter(page => searchInPageContent(page, query))

  if (matches.length === 0) {
    searchResults.innerHTML = '<div class="search-no-results">No results found</div>'
    return
  }

  searchResults.innerHTML = ''
  matches.forEach(page => {
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

    resultItem.addEventListener('click', () => {
      onPageSelect(page.id)
      searchResults.innerHTML = ''
      const searchInput = document.getElementById('search-input') as HTMLInputElement
      if (searchInput) {
        searchInput.value = ''
      }
    })

    searchResults.appendChild(resultItem)
  })
}

// Reorder pages via drag and drop
async function reorderPages(draggedId: number, targetId: number) {
  try {
    const allPagesData = await getPages()
    const mainPages = allPagesData.filter(page => !page.parent_id)

    const draggedIndex = mainPages.findIndex(p => p.id === draggedId)
    const targetIndex = mainPages.findIndex(p => p.id === targetId)

    if (draggedIndex === -1 || targetIndex === -1) return

    // Reorder array
    const [draggedPage] = mainPages.splice(draggedIndex, 1)
    mainPages.splice(targetIndex, 0, draggedPage)

    // Update order for all pages
    const updatePromises = mainPages.map((page, index) =>
      updatePage(page.id, { order: index })
    )

    await Promise.all(updatePromises)
  } catch (error) {
    console.error('Failed to reorder pages:', error)
  }
}

// Mobile menu controls
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
