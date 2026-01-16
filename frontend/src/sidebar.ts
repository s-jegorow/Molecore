import { getPages, createPage, updatePage } from './api'
import type { Page } from './types'
import { showIconPicker } from './iconPicker'

let currentPageId: number | null = null
let pageSelectCallback: ((pageId: number) => void) | null = null
let allPages: Page[] = []

export function initSidebar(onPageSelect: (pageId: number) => void) {
  pageSelectCallback = onPageSelect
  const newPageBtn = document.getElementById('new-page-btn')
  const pagesList = document.getElementById('pages-list')
  const searchInput = document.getElementById('search-input') as HTMLInputElement
  const searchResults = document.getElementById('search-results')

  if (!newPageBtn || !pagesList) {
    console.error('Sidebar elements not found')
    return
  }

  // Listen for icon updates from PageBlock
  window.addEventListener('iconUpdated', () => {
    loadPages(onPageSelect)
  })

  // New Page Button
  newPageBtn.addEventListener('click', async () => {
    try {
      const newPage = await createPage({
        title: 'Untitled',
        content: { blocks: [] }
      })
      await loadPages(onPageSelect)
      onPageSelect(newPage.id)
    } catch (error) {
      console.error('Failed to create page:', error)
    }
  })

  // Search Input
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

  // Listen for subpages created from PageBlock - no sidebar reload needed!
  // Subpages don't appear in sidebar

  // Initial Load
  loadPages(onPageSelect)
}

function renderPages(pages: Page[], onPageSelect: (pageId: number) => void) {
  const pagesList = document.getElementById('pages-list')
  if (!pagesList) return

  pagesList.innerHTML = ''

  pages.forEach(page => {
    const pageItem = createPageItem(page, onPageSelect)
    pagesList.appendChild(pageItem)
  })
}

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

function renderSearchResults(query: string, onPageSelect: (pageId: number) => void) {
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

async function reorderPages(draggedId: number, targetId: number) {
  try {
    const allPages = await getPages()
    const mainPages = allPages.filter(page => !page.parent_id)

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

export async function loadPages(onPageSelect: (pageId: number) => void) {
  const pagesList = document.getElementById('pages-list')
  const favoritesList = document.getElementById('favorites-list')
  if (!pagesList) return

  try {
    allPages = await getPages()
    // Filter: Only show pages WITHOUT parent_id (no subpages) AND not home page
    const mainPages = allPages.filter(page => !page.parent_id && page.page_type !== 'home')

    // Split into favorites and all pages
    const favorites = mainPages.filter(page => page.page_type === 'favorite')

    // Render favorites
    if (favoritesList) {
      favoritesList.innerHTML = ''
      favorites.forEach(page => {
        const pageItem = createPageItem(page, onPageSelect)
        favoritesList.appendChild(pageItem)
      })
    }

    // Render ALL main pages (including favorites)
    renderPages(mainPages, onPageSelect)

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

function createPageItem(page: Page, onPageSelect: (pageId: number) => void): HTMLElement {
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
        loadPages(pageSelectCallback)
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
    await loadPages(onPageSelect)
  })

  // Single click - select page
  pageItem.addEventListener('click', (e) => {
    // Don't trigger if clicking on icon or its children (like img)
    const target = e.target as Node
    if (target === iconEl || iconEl.contains(target)) {
      return
    }
    onPageSelect(page.id)
    setActivePage(page.id)
  })

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

export function setActivePage(pageId: number) {
  currentPageId = pageId

  document.querySelectorAll('.page-item').forEach(item => {
    item.classList.remove('active')
    if (item.getAttribute('data-page-id') === String(pageId)) {
      item.classList.add('active')
    }
  })
}
