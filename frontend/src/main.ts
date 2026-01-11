import './style.css'
import EditorJS from '@editorjs/editorjs'
import Header from '@editorjs/header'
import List from '@editorjs/list'
import Code from '@editorjs/code'
import Table from '@editorjs/table'
import ParagraphWithBlanks from './ParagraphWithBlanks'
import ResizableImage from './ResizableImage'
import BackgroundColorTune from './BackgroundColorTune'
import ColorTool from './ColorTool'
import HighlightTool from './HighlightTool'
import UnderlineTool from './UnderlineTool'
import StrikethroughTool from './StrikethroughTool'
import DragDrop from 'editorjs-drag-drop'
import PageBlock from './PageBlock'
import { getPage, getPages, updatePage, deletePage } from './api'
import { initSidebar, setActivePage, loadPages } from './sidebar'

let currentPageId: number | null = null
let editor: EditorJS
let autoSaveTimeout: number | null = null

// Editor initialisieren
function initEditor() {
  editor = new EditorJS({
    holder: 'editor',

    tools: {
      paragraph: {
        class: ParagraphWithBlanks,
        inlineToolbar: true,
        tunes: ['backgroundColor']
      },
      header: {
        class: Header as any,
        tunes: ['backgroundColor']
      },
      list: {
        class: List as any,
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
      image: ResizableImage as any,
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

      // Fix popover clipping: relocate popovers to body while preserving position
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node instanceof HTMLElement && node.classList.contains('ce-popover')) {
              // Wait for Editor.js to position it first
              setTimeout(() => {
                const rect = node.getBoundingClientRect()
                node.style.position = 'fixed'
                node.style.top = rect.top + 'px'
                node.style.left = rect.left + 'px'
                document.body.appendChild(node)
              }, 0)
            }
          })
        })
      })

      const editorElement = document.getElementById('editor')
      if (editorElement) {
        observer.observe(editorElement, {
          childList: true,
          subtree: true
        })
      }
    },

    onChange: () => {
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
    updateFavoriteButton(page.is_favorite)

    console.log('Page loaded:', page.title)
  } catch (error) {
    console.error('Failed to load page:', error)
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

// Dark mode handler
const darkmodeBtn = document.getElementById('darkmode-btn')
let isDarkMode = localStorage.getItem('darkMode') === 'true'

function toggleDarkMode() {
  isDarkMode = !isDarkMode
  localStorage.setItem('darkMode', String(isDarkMode))

  if (isDarkMode) {
    document.body.classList.add('dark-mode')
  } else {
    document.body.classList.remove('dark-mode')
  }
}

// Apply saved dark mode preference on load
if (isDarkMode) {
  document.body.classList.add('dark-mode')
}

darkmodeBtn?.addEventListener('click', toggleDarkMode)

// Favorite button handler
const favoriteBtn = document.getElementById('favorite-btn')
favoriteBtn?.addEventListener('click', async () => {
  if (!currentPageId) return

  try {
    const page = await getPage(currentPageId)
    const newFavoriteState = !page.is_favorite

    await updatePage(currentPageId, { is_favorite: newFavoriteState })
    updateFavoriteButton(newFavoriteState)

    // Reload sidebar to move page between sections
    await loadPages(loadPage)

    console.log(`Page ${newFavoriteState ? 'added to' : 'removed from'} favorites`)
  } catch (error) {
    console.error('Failed to toggle favorite:', error)
  }
})

// Delete button handler
const deleteBtn = document.getElementById('delete-btn')
deleteBtn?.addEventListener('click', async () => {
  if (!currentPageId) return

  const confirmed = confirm('Are you sure you want to delete this page? This action cannot be undone.')
  if (!confirmed) return

  try {
    await deletePage(currentPageId)

    // Clear editor
    if (editor) {
      await editor.isReady
      await editor.clear()
    }

    // Clear title
    const pageTitleInput = document.getElementById('page-title') as HTMLInputElement
    if (pageTitleInput) {
      pageTitleInput.value = 'Untitled'
    }

    // Reset current page
    currentPageId = null
    ;(window as any).currentPageId = null

    // Reload sidebar
    await loadPages(loadPage)

    console.log('Page deleted')
  } catch (error) {
    console.error('Failed to delete page:', error)
    alert('Delete failed!')
  }
})

// Title Input - Save on blur
const pageTitleInput = document.getElementById('page-title') as HTMLInputElement
pageTitleInput?.addEventListener('blur', async () => {
  if (!currentPageId) return

  const newTitle = pageTitleInput.value || 'Untitled'

  try {
    await updatePage(currentPageId, { title: newTitle })
    // Sidebar aktualisieren
    const pageItem = document.querySelector(`[data-page-id="${currentPageId}"]`)
    if (pageItem) {
      pageItem.textContent = newTitle
    }
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
    console.log('Auto-saved')
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
  initEditor()
  initSidebar(loadPage)

  // Load home page by default
  try {
    const allPages = await getPages()
    const homePage = allPages.find(p => p.is_home)
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
    const homePage = allPages.find(p => p.is_home)
    if (homePage) {
      await loadPage(homePage.id)
    }
  } catch (error) {
    console.error('Failed to load home page:', error)
  }
})

init()
