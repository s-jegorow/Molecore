import { Modal } from './Modal'
import { API_URL } from './api'
import { getToken } from './auth'

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export default class FileBlock {
  private api: any
  private readOnly: boolean
  private data: {
    url?: string
    fileName?: string
    fileSize?: number
    fileType?: string
  }
  private wrapper: HTMLElement | null = null

  constructor({ data, api, readOnly }: any) {
    this.api = api
    this.readOnly = readOnly
    this.data = data || {}
  }

  static get toolbox() {
    return {
      title: 'File',
      icon: '<svg width="17" height="15" viewBox="0 0 384 512" xmlns="http://www.w3.org/2000/svg"><path d="M224 136V0H24C10.7 0 0 10.7 0 24v464c0 13.3 10.7 24 24 24h336c13.3 0 24-10.7 24-24V160H248c-13.2 0-24-10.8-24-24zm76.45 211.36l-96.42 95.7c-6.65 6.61-17.39 6.61-24.04 0l-96.42-95.7C73.42 337.29 80.54 320 94.82 320H160v-80c0-8.84 7.16-16 16-16h32c8.84 0 16 7.16 16 16v80h65.18c14.28 0 21.4 17.29 11.27 27.36zM377 105L279.1 7c-4.5-4.5-10.6-7-17-7H256v128h128v-6.1c0-6.3-2.5-12.4-7-16.9z"/></svg>'
    }
  }

  render() {
    this.wrapper = document.createElement('div')
    this.wrapper.classList.add('file-block')

    if (this.data.url) {
      this._createFileDisplay()
    } else {
      this._createUploader()
    }

    return this.wrapper
  }

  private _createUploader() {
    if (!this.wrapper) return

    const uploader = document.createElement('div')
    uploader.classList.add('file-uploader')
    uploader.innerHTML = `
      <div class="file-uploader-area">
        <svg width="40" height="40" viewBox="0 0 384 512" fill="currentColor">
          <path d="M224 136V0H24C10.7 0 0 10.7 0 24v464c0 13.3 10.7 24 24 24h336c13.3 0 24-10.7 24-24V160H248c-13.2 0-24-10.8-24-24zm76.45 211.36l-96.42 95.7c-6.65 6.61-17.39 6.61-24.04 0l-96.42-95.7C73.42 337.29 80.54 320 94.82 320H160v-80c0-8.84 7.16-16 16-16h32c8.84 0 16 7.16 16 16v80h65.18c14.28 0 21.4 17.29 11.27 27.36zM377 105L279.1 7c-4.5-4.5-10.6-7-17-7H256v128h128v-6.1c0-6.3-2.5-12.4-7-16.9z"/>
        </svg>
        <p>Click to upload file</p>
        <p style="font-size: 12px; color: #999;">All file types (Max 50MB)</p>
      </div>
    `

    const input = document.createElement('input')
    input.type = 'file'
    // Accept all file types
    input.style.display = 'none'

    uploader.addEventListener('click', () => input.click())

    input.addEventListener('change', async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      // Check file size (50MB max)
      if (file.size > 50 * 1024 * 1024) {
        await Modal.error('File too large. Maximum size is 50MB.')
        return
      }

      await this._uploadFile(file)
    })

    this.wrapper.innerHTML = ''
    this.wrapper.appendChild(uploader)
    this.wrapper.appendChild(input)
  }

  private async _uploadFile(file: File) {
    if (!this.wrapper) return

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('upload_type', 'file')

      const token = await getToken()

      const headers: HeadersInit = {}
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      const response = await fetch(`${API_URL}/api/upload`, {
        method: 'POST',
        headers,
        body: formData
      })

      if (!response.ok) throw new Error('Upload failed')

      const data = await response.json()
      this.data.url = `${API_URL}${data.url}`
      this.data.fileName = file.name
      this.data.fileSize = file.size
      this.data.fileType = file.type

      this._createFileDisplay()
    } catch (error) {
      console.error('Upload failed:', error)
      await Modal.error('Failed to upload file. Please try again.')
    }
  }

  private _createFileDisplay() {
    if (!this.wrapper || !this.data.url) return

    this.wrapper.innerHTML = ''
    this.wrapper.classList.add('file-display-wrapper')

    const fileDisplay = document.createElement('div')
    fileDisplay.classList.add('file-display')

    const icon = this._getFileIcon(this.data.fileName || '')
    const formattedSize = this._formatFileSize(this.data.fileSize || 0)

    fileDisplay.innerHTML = `
      <div class="file-icon">${icon}</div>
      <div class="file-info">
        <div class="file-name">${escapeHtml(this.data.fileName || 'Unknown File')}</div>
        <div class="file-meta">${formattedSize}</div>
      </div>
      <a href="${escapeHtml(this.data.url || '')}" download="${escapeHtml(this.data.fileName || '')}" class="file-download-btn" title="Download">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
      </a>
    `

    this.wrapper.appendChild(fileDisplay)

    // Add delete button if not readOnly
    if (!this.readOnly) {
      const deleteBtn = document.createElement('button')
      deleteBtn.classList.add('file-delete-btn')
      deleteBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
      </svg>`
      deleteBtn.title = 'Remove file'
      deleteBtn.addEventListener('click', () => {
        this.data = {}
        this._createUploader()
      })
      fileDisplay.appendChild(deleteBtn)
    }
  }

  private _getFileIcon(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase()

    switch (ext) {
      case 'pdf':
        return '📄'
      case 'zip':
      case 'rar':
      case '7z':
        return '🗜️'
      case 'doc':
      case 'docx':
        return '📝'
      case 'txt':
        return '📃'
      default:
        return '📎'
    }
  }

  private _formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes'

    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))

    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  save() {
    return this.data
  }

  destroy() {
    // Cleanup when block is destroyed
    if (this.wrapper) {
      this.wrapper.innerHTML = ''
    }
  }
}
