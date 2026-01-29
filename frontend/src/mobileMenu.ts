import { loadPages } from './sidebar'
import { createPage } from './api'
import type { Page } from './types'

let mobilePageSelectCallback: ((pageId: number) => void) | null = null

export function initMobileMenu(onPageSelect: (pageId: number) => void) {
  mobilePageSelectCallback = onPageSelect

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

  mobileOverlay.addEventListener('click', (e) => {
    if (e.target === mobileOverlay) {
      closeMobileMenu()
    }
  })

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

  window.addEventListener('iconUpdated', () => {
    loadMobilePages(onPageSelect)
  })

  loadMobilePages(onPageSelect)
}

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

export async function loadMobilePages(onPageSelect: (pageId: number) => void) {
  const mobilePagesList = document.getElementById('mobile-pages-list')
  const mobileFavoritesList = document.getElementById('mobile-favorites-list')

  if (!mobilePagesList) return

  try {
    const { getPages } = await import('./api')
    const allPages = await getPages()
    const mainPages = allPages.filter(page => !page.parent_id && page.page_type !== 'home')
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

function createMobilePageItem(page: Page, onPageSelect: (pageId: number) => void): HTMLElement {
  const pageItem = document.createElement('div')
  pageItem.className = 'page-item'
  pageItem.dataset.pageId = String(page.id)

  const iconEl = document.createElement('span')
  iconEl.className = 'page-icon'
  iconEl.style.cssText = 'margin-right: 8px; user-select: none; display: inline-flex; align-items: center; font-size: 16px;'

  // Check if icon is URL or emoji (same logic as sidebar.ts)
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

  pageItem.addEventListener('click', () => {
    closeMobileMenu()
    onPageSelect(page.id)
  })

  return pageItem
}
