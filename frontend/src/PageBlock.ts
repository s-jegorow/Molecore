import type { API, BlockTool, BlockToolConstructorOptions } from '@editorjs/editorjs'
import { createPage, getPages } from './api'
import { showIconPicker } from './iconPicker'

export default class PageBlock implements BlockTool {
  private api: API
  private data: { pageId?: number; pageTitle?: string }
  private wrapper: HTMLElement | null = null
  private container: HTMLElement | null = null
  private currentPageId: number | null = null

  constructor({ data, api }: BlockToolConstructorOptions) {
    this.api = api
    this.data = data || {}

    // Get current page ID from window
    this.currentPageId = (window as any).currentPageId || null
  }

  render() {
    this.container = document.createElement('div')
    this.container.style.position = 'relative'

    this.wrapper = document.createElement('div')
    this.wrapper.classList.add('page-block')
    this.updateStyles()

    this.container.appendChild(this.wrapper)

    if (this.data.pageId && this.data.pageTitle) {
      this.renderExistingPage()
    } else {
      this.renderPageSelector()
    }

    return this.container
  }

  private updateStyles() {
    if (!this.wrapper) return

    const isDarkMode = document.body.classList.contains('dark-mode')

    this.wrapper.style.cssText = `
      padding: 4px 4px;
      margin: 0;
      background: transparent;
      color: ${isDarkMode ? '#a0a0a0' : '#666'};
      display: flex;
      align-items: center;
      gap: 8px;
      transition: all 0.15s ease;
      border-radius: 4px;
    `
  }

  async renderExistingPage() {
    if (!this.wrapper) return

    // Opt out of EditorJS contentEditable — clicks are for navigation, not text editing
    this.wrapper.contentEditable = 'false'
    this.wrapper.style.cursor = 'pointer'

    // Fetch current page data to get icon
    let pageIcon = '📄'
    try {
      const pages = await getPages()
      const currentPage = pages.find(p => p.id === this.data.pageId)
      if (currentPage?.icon) {
        pageIcon = currentPage.icon
      }
    } catch (error) {
      console.error('Failed to fetch page icon:', error)
    }

    const iconEl = document.createElement('span')
    iconEl.className = 'page-block-icon'
    iconEl.style.cssText = 'font-size: 20px; cursor: pointer; display: inline-flex; align-items: center; margin-right: 2px;'

    // Check if icon is URL or emoji
    if (pageIcon.startsWith('http')) {
      const img = document.createElement('img')
      img.src = pageIcon
      img.style.cssText = 'width: 20px; height: 20px; object-fit: cover; border-radius: 2px;'
      iconEl.appendChild(img)
    } else {
      iconEl.textContent = pageIcon
    }

    const title = document.createElement('span')
    title.textContent = this.data.pageTitle || 'Untitled'
    title.style.flex = '1'
    title.style.fontWeight = '400'
    title.style.fontSize = '15px'

    this.wrapper.innerHTML = ''
    this.wrapper.appendChild(iconEl)
    this.wrapper.appendChild(title)

    // Icon double-click - show picker
    iconEl.addEventListener('dblclick', async (e) => {
      e.stopPropagation()
      e.preventDefault()
      if (this.data.pageId) {
        showIconPicker(this.data.pageId, iconEl, () => {
          // Trigger sidebar reload
          window.dispatchEvent(new CustomEvent('iconUpdated'))
        })
      }
    })

    this.wrapper.onmouseenter = () => {
      if (this.wrapper && title) {
        const isDarkMode = document.body.classList.contains('dark-mode')
        this.wrapper.style.background = isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)'
        title.style.color = isDarkMode ? '#e0e0e0' : '#000'
      }
    }
    this.wrapper.onmouseleave = () => {
      if (this.wrapper && title) {
        const isDarkMode = document.body.classList.contains('dark-mode')
        this.wrapper.style.background = 'transparent'
        title.style.color = isDarkMode ? '#a0a0a0' : '#666'
      }
    }

    // Wrapper click - navigate to page (entire row is clickable)
    // Use mousedown — fires before click/EditorJS/DragDrop can intercept
    this.wrapper.addEventListener('mousedown', (e) => {
      // Don't navigate if clicking on the icon (double-click for picker)
      if ((e.target as HTMLElement).closest('.page-block-icon')) return
      e.stopPropagation()
      e.preventDefault()
      if (this.data.pageId) {
        window.dispatchEvent(new CustomEvent('navigateToPage', {
          detail: { pageId: this.data.pageId }
        }))
      }
    })
  }

  renderPageSelector() {
    if (!this.wrapper) return

    this.wrapper.contentEditable = 'false'
    this.wrapper.style.cursor = 'default'

    const input = document.createElement('input')
    input.type = 'text'
    input.placeholder = 'Type page name...'
    const isDarkMode = document.body.classList.contains('dark-mode')
    input.style.cssText = `
      width: 100%;
      border: none;
      background: transparent;
      outline: none;
      font-size: 14px;
      font-family: inherit;
      color: ${isDarkMode ? '#e0e0e0' : '#000'};
    `

    this.wrapper.innerHTML = ''
    this.wrapper.appendChild(input)

    input.onkeydown = (e) => {
      if (e.key === 'Enter' && input.value.trim()) {
        e.preventDefault()
        const newTitle = input.value.trim()

        // Create NEW page as SUBPAGE of current page
        createPage({
          title: newTitle,
          content: { blocks: [] },
          parent_id: this.currentPageId
        }).then(newPage => {
          this.data.pageId = newPage.id
          this.data.pageTitle = newPage.title
          this.renderExistingPage()

          // Trigger auto-save
          const event = new CustomEvent('pageBlockCreated')
          window.dispatchEvent(event)
        }).catch(error => {
          console.error('Failed to create page:', error)
        })
      }
    }

    // Auto-focus
    setTimeout(() => input.focus(), 100)
  }

  save() {
    return {
      pageId: this.data.pageId,
      pageTitle: this.data.pageTitle
    }
  }

  validate(savedData: { pageId?: number; pageTitle?: string }) {
    // Allow saving even if no page is selected yet
    return true
  }

  static get isReadOnlySupported() {
    return true
  }
}
