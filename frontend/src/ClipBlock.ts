import type { API, BlockAPI, BlockTool, BlockToolConstructorOptions } from '@editorjs/editorjs'
import { clipUrl } from './api'
import { appState } from './state'
import { refreshSidebar } from './ui'

export default class ClipBlock implements BlockTool {
  private api: API
  private block: BlockAPI
  private readOnly: boolean

  constructor({ api, block, readOnly }: BlockToolConstructorOptions) {
    this.api = api
    this.block = block
    this.readOnly = readOnly
  }

  static get toolbox() {
    return {
      title: 'Web clip',
      icon: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>'
    }
  }

  render() {
    const wrapper = document.createElement('div')
    wrapper.className = 'page-block clip-block'
    wrapper.contentEditable = 'false'
    if (this.readOnly) return wrapper

    const input = document.createElement('input')
    input.type = 'url'
    input.className = 'page-block-input'
    input.placeholder = 'Paste a link to clip...'

    const status = document.createElement('div')
    status.className = 'clip-block-status'

    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || !input.value.trim()) return
      e.preventDefault()
      e.stopPropagation()
      this.clip(input, status)
    })

    wrapper.appendChild(input)
    wrapper.appendChild(status)
    setTimeout(() => input.focus(), 100)
    return wrapper
  }

  private async clip(input: HTMLInputElement, status: HTMLElement) {
    status.classList.remove('clip-block-status--error')

    if (appState.isDemo || appState.isOffline) {
      status.textContent = 'Clipping needs a login and an internet connection.'
      status.classList.add('clip-block-status--error')
      return
    }

    const startPageId = appState.currentPageId
    input.disabled = true
    status.textContent = 'Fetching article...'

    try {
      const page = await clipUrl(input.value.trim(), startPageId)

      if (appState.currentPageId !== startPageId) {
        await refreshSidebar()
        return
      }

      const index = this.api.blocks.getBlockIndex(this.block.id)
      this.api.blocks.insert('page', { pageId: page.id, pageTitle: page.title }, undefined, index, false, true)
      window.dispatchEvent(new CustomEvent('pageBlockCreated'))
    } catch (error: any) {
      status.textContent = error?.message || 'Clipping failed.'
      status.classList.add('clip-block-status--error')
      input.disabled = false
      input.focus()
    }
  }

  save() {
    return {}
  }

  validate() {
    return false
  }

  static get isReadOnlySupported() {
    return true
  }
}
