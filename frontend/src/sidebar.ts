import { getPages, createPage, updatePage } from './api'
import type { Page } from './types'

let currentPageId: number | null = null

export function initSidebar(onPageSelect: (pageId: number) => void) {
  const newPageBtn = document.getElementById('new-page-btn')
  const pagesList = document.getElementById('pages-list')

  if (!newPageBtn || !pagesList) {
    console.error('Sidebar elements not found')
    return
  }

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

  // Initial Load
  loadPages(onPageSelect)
}

async function loadPages(onPageSelect: (pageId: number) => void) {
  const pagesList = document.getElementById('pages-list')
  if (!pagesList) return

  try {
    const pages = await getPages()
    renderPages(pages, onPageSelect)
  } catch (error) {
    console.error('Failed to load pages:', error)
  }
}

function renderPages(pages: Page[], onPageSelect: (pageId: number) => void) {
  const pagesList = document.getElementById('pages-list')
  if (!pagesList) return

  pagesList.innerHTML = ''

  pages.forEach(page => {
    const pageItem = document.createElement('div')
    pageItem.className = 'page-item'
    pageItem.textContent = page.title
    pageItem.dataset.pageId = String(page.id)

    if (page.id === currentPageId) {
      pageItem.classList.add('active')
    }

    // Single click - select page
    pageItem.addEventListener('click', () => {
      onPageSelect(page.id)
      setActivePage(page.id)
    })

    // Double click - edit title inline
    pageItem.addEventListener('dblclick', (e) => {
      e.stopPropagation()
      const input = document.createElement('input')
      input.type = 'text'
      input.value = page.title
      input.className = 'page-item-edit'

      input.style.cssText = `
        width: 100%;
        padding: 8px 12px;
        border: 1px solid #007bff;
        border-radius: 4px;
        font-size: 14px;
        font-family: inherit;
        outline: none;
      `

      const saveTitle = async () => {
        const newTitle = input.value.trim() || 'Untitled'
        try {
          await updatePage(page.id, { title: newTitle })
          pageItem.textContent = newTitle

          // Update header if this is the active page
          if (page.id === currentPageId) {
            const headerInput = document.getElementById('page-title') as HTMLInputElement
            if (headerInput) {
              headerInput.value = newTitle
            }
          }
        } catch (error) {
          console.error('Failed to update title:', error)
          pageItem.textContent = page.title
        }
      }

      input.addEventListener('blur', saveTitle)
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          input.blur()
        } else if (e.key === 'Escape') {
          pageItem.textContent = page.title
        }
      })

      pageItem.textContent = ''
      pageItem.appendChild(input)
      input.focus()
      input.select()
    })

    pagesList.appendChild(pageItem)
  })
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
