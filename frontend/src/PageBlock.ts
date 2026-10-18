import type { BlockTool, BlockToolConstructorOptions } from '@editorjs/editorjs'
import { createPage, getPages } from './api'
import { showIconPicker } from './iconPicker'
import { appState } from './state'
import { isImageIcon } from './utils'

export default class PageBlock implements BlockTool {
  private data: { pageId?: number; pageTitle?: string }
  private wrapper: HTMLElement | null = null
  private container: HTMLElement | null = null

  constructor({ data }: BlockToolConstructorOptions) {
    this.data = data || {}
  }

  static get toolbox() {
    return {
      title: 'Page',
      icon: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>'
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

    this.wrapper.contentEditable = 'false'
    this.wrapper.style.cursor = 'pointer'

    let pageIcon = '📄'
    let exists = true
    try {
      const pages = await getPages()
      const currentPage = pages.find(p => p.id === this.data.pageId)
      if (currentPage) {
        if (currentPage.icon) pageIcon = currentPage.icon
        this.data.pageTitle = currentPage.title
      } else {
        exists = false
      }
    } catch (error) {
      console.error('Failed to fetch page icon:', error)
    }
    if (!this.wrapper) return

    const iconEl = document.createElement('span')
    iconEl.className = 'page-block-icon'
    iconEl.style.cssText = 'font-size: 20px; cursor: pointer; display: inline-flex; align-items: center; margin-right: 2px;'

    if (isImageIcon(pageIcon)) {
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

    if (!exists) {
      title.textContent = `${this.data.pageTitle || 'Untitled'} (deleted)`
      title.style.textDecoration = 'line-through'
      this.wrapper.style.cursor = 'default'
      this.wrapper.style.opacity = '0.6'
      return
    }

    iconEl.addEventListener('dblclick', async (e) => {
      e.stopPropagation()
      e.preventDefault()
      if (this.data.pageId) {
        showIconPicker(this.data.pageId, iconEl, () => {
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

    // mousedown instead of click, otherwise editorjs/dragdrop eat the event
    this.wrapper.addEventListener('mousedown', (e) => {
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

        createPage({
          title: newTitle,
          content: { blocks: [] },
          parent_id: appState.currentPageId
        }).then(newPage => {
          this.data.pageId = newPage.id
          this.data.pageTitle = newPage.title
          this.renderExistingPage()

          const event = new CustomEvent('pageBlockCreated')
          window.dispatchEvent(event)
        }).catch(error => {
          console.error('Failed to create page:', error)
        })
      }
    }

    setTimeout(() => input.focus(), 100)
  }

  save() {
    return {
      pageId: this.data.pageId,
      pageTitle: this.data.pageTitle
    }
  }

  validate(_savedData: { pageId?: number; pageTitle?: string }) {
    return true
  }

  static get isReadOnlySupported() {
    return true
  }
}
