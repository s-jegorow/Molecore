import type { API, BlockTool, BlockToolConstructorOptions } from '@editorjs/editorjs'
import { createPage } from './api'

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

  static get toolbox() {
    return {
      title: 'Page',
      icon: '📄'
    }
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
      padding: 8px 4px;
      margin: 4px 0;
      background: transparent;
      color: ${isDarkMode ? '#a0a0a0' : '#666'};
      display: flex;
      align-items: center;
      gap: 8px;
      transition: all 0.15s ease;
      border-radius: 4px;
    `
  }

  renderExistingPage() {
    if (!this.wrapper) return

    this.wrapper.style.cursor = 'pointer'

    const icon = document.createElement('span')
    icon.textContent = '📄'
    icon.style.fontSize = '20px'

    const title = document.createElement('span')
    title.textContent = this.data.pageTitle || 'Untitled'
    title.style.flex = '1'
    title.style.fontWeight = '400'
    title.style.fontSize = '15px'

    this.wrapper.innerHTML = ''
    this.wrapper.appendChild(icon)
    this.wrapper.appendChild(title)

    this.wrapper.onmouseenter = () => {
      if (this.wrapper && title) {
        const isDarkMode = document.body.classList.contains('dark-mode')
        this.wrapper.style.background = isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)'
        title.style.color = isDarkMode ? '#e0e0e0' : '#000'
        title.style.textDecoration = 'underline'
      }
    }
    this.wrapper.onmouseleave = () => {
      if (this.wrapper && title) {
        const isDarkMode = document.body.classList.contains('dark-mode')
        this.wrapper.style.background = 'transparent'
        title.style.color = isDarkMode ? '#a0a0a0' : '#666'
        title.style.textDecoration = 'none'
      }
    }

    this.wrapper.onclick = () => {
      if (this.data.pageId) {
        // Navigate directly to subpage (not through sidebar)
        const event = new CustomEvent('navigateToPage', {
          detail: { pageId: this.data.pageId }
        })
        window.dispatchEvent(event)
      }
    }
  }

  renderPageSelector() {
    if (!this.wrapper) return

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
