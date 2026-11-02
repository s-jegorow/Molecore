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

    this.container.appendChild(this.wrapper)

    if (this.data.pageId && this.data.pageTitle) {
      this.renderExistingPage()
    } else {
      this.renderPageSelector()
    }

    return this.container
  }

  async renderExistingPage() {
    if (!this.wrapper) return

    this.wrapper.contentEditable = 'false'

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

    if (isImageIcon(pageIcon)) {
      const img = document.createElement('img')
      img.src = pageIcon
      img.className = 'page-icon-img'
      iconEl.appendChild(img)
    } else {
      iconEl.textContent = pageIcon
    }

    const title = document.createElement('span')
    title.className = 'page-block-title'
    title.textContent = this.data.pageTitle || 'Untitled'

    this.wrapper.innerHTML = ''
    this.wrapper.appendChild(iconEl)
    this.wrapper.appendChild(title)

    if (!exists) {
      title.textContent = `${this.data.pageTitle || 'Untitled'} (deleted)`
      this.wrapper.classList.add('page-block--deleted')
      return
    }

    this.wrapper.classList.add('page-block--link')

    iconEl.addEventListener('dblclick', async (e) => {
      e.stopPropagation()
      e.preventDefault()
      if (this.data.pageId) {
        showIconPicker(this.data.pageId, iconEl, () => {
          window.dispatchEvent(new CustomEvent('iconUpdated'))
        })
      }
    })

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

    const input = document.createElement('input')
    input.type = 'text'
    input.className = 'page-block-input'
    input.placeholder = 'Type page name...'

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
