import { API_URL } from './api'
import { getToken } from './auth'

export default class ResizableImage {
  private data: { url: string; width?: number }
  private wrapper: HTMLElement | null = null
  private container: HTMLElement | null = null
  private img: HTMLImageElement | null = null
  private api: any
  private readOnly: boolean
  private block: any

  constructor({ data, api, readOnly, block }: any) {
    this.data = data || { url: '', width: 100 }
    this.api = api
    this.readOnly = readOnly
    this.block = block
  }

  render() {
    this.wrapper = document.createElement('div')
    this.wrapper.classList.add('resizable-image-wrapper')

    if (this.data.url) {
      this.renderImage()
    } else {
      this.renderUploader()
    }

    return this.wrapper
  }

  renderImage() {
    if (!this.wrapper) return

    this.wrapper.innerHTML = ''

    // Container for image + resize handle
    this.container = document.createElement('div')
    this.container.style.cssText = `
      position: relative;
      display: inline-block;
      max-width: 100%;
      width: ${this.data.width || 100}%;
      margin: 10px 0;
    `

    this.img = document.createElement('img')
    this.img.src = this.data.url
    this.img.style.cssText = `
      width: 100%;
      height: auto;
      display: block;
      border-radius: 4px;
      pointer-events: none;
    `
    this.img.draggable = false

    this.container.appendChild(this.img)

    if (!this.readOnly) {
      // Resize handle
      const resizeHandle = document.createElement('div')
      resizeHandle.innerHTML = '⇔'
      resizeHandle.style.cssText = `
        position: absolute;
        bottom: 8px;
        right: 8px;
        width: 28px;
        height: 28px;
        background: rgba(0, 123, 255, 0.9);
        color: white;
        border-radius: 6px;
        cursor: ew-resize;
        display: none;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        user-select: none;
        z-index: 10;
        font-weight: bold;
      `

      this.container.appendChild(resizeHandle)

      // Show/hide resize handle on hover
      this.container.addEventListener('mouseenter', () => {
        resizeHandle.style.display = 'flex'
      })

      this.container.addEventListener('mouseleave', () => {
        resizeHandle.style.display = 'none'
      })

      // Resize drag logic
      let startX = 0
      let startWidth = 0

      const onMouseMove = (e: MouseEvent) => {
        if (!this.container || !this.wrapper) return

        const diff = e.clientX - startX
        const parentWidth = this.wrapper.parentElement?.offsetWidth || 800
        const newWidth = startWidth + diff
        const clampedWidth = Math.max(100, Math.min(newWidth, parentWidth))
        const percentage = (clampedWidth / parentWidth) * 100

        this.container.style.width = percentage + '%'
        this.data.width = Math.round(percentage)
      }

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''

        // Manually trigger onChange callback to start auto-save timer
        if ((window as any).editor) {
          const editorInstance = (window as any).editor
          if (editorInstance.configuration?.onChange) {
            editorInstance.configuration.onChange()
          }
        }
      }

      resizeHandle.addEventListener('mousedown', (e) => {
        e.preventDefault()
        e.stopPropagation()
        startX = e.clientX
        startWidth = this.container?.offsetWidth || 0
        document.body.style.cursor = 'ew-resize'
        document.body.style.userSelect = 'none'
        document.addEventListener('mousemove', onMouseMove)
        document.addEventListener('mouseup', onMouseUp)
      })
    }

    this.wrapper.appendChild(this.container)
  }

  renderUploader() {
    if (!this.wrapper) return

    this.wrapper.innerHTML = ''

    // Create upload UI similar to @editorjs/image style
    const uploaderContainer = document.createElement('div')
    uploaderContainer.style.cssText = `
      border: 2px dashed #e0e0e0;
      border-radius: 8px;
      padding: 40px 20px;
      text-align: center;
      cursor: pointer;
      transition: all 0.15s ease;
      margin: 10px 0;
    `

    uploaderContainer.addEventListener('mouseenter', () => {
      uploaderContainer.style.borderColor = '#007bff'
      uploaderContainer.style.backgroundColor = '#f8f9fa'
    })

    uploaderContainer.addEventListener('mouseleave', () => {
      uploaderContainer.style.borderColor = '#e0e0e0'
      uploaderContainer.style.backgroundColor = 'transparent'
    })

    const label = document.createElement('div')
    label.textContent = 'Click to upload image'
    label.style.cssText = `
      color: #6c757d;
      font-size: 14px;
      margin-bottom: 10px;
    `

    const fileInput = document.createElement('input')
    fileInput.type = 'file'
    fileInput.accept = 'image/*'
    fileInput.style.display = 'none'

    fileInput.addEventListener('change', async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      // Show loading state
      label.textContent = 'Uploading...'
      uploaderContainer.style.pointerEvents = 'none'

      const formData = new FormData()
      formData.append('image', file)

      try {
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
        const result = await response.json()

        if (result.success && result.file?.url) {
          this.data.url = result.file.url
          this.data.width = 100
          this.renderImage()
        } else {
          throw new Error('Upload failed')
        }
      } catch (error) {
        console.error('Upload failed:', error)
        label.textContent = 'Upload failed. Click to try again.'
        uploaderContainer.style.pointerEvents = 'auto'
      }
    })

    uploaderContainer.addEventListener('click', () => {
      fileInput.click()
    })

    uploaderContainer.appendChild(label)
    uploaderContainer.appendChild(fileInput)
    this.wrapper.appendChild(uploaderContainer)
  }

  save() {
    return {
      url: this.data.url,
      width: this.data.width || 100
    }
  }

  static get toolbox() {
    return {
      title: 'Image',
      icon: '<svg width="17" height="15" viewBox="0 0 336 276" xmlns="http://www.w3.org/2000/svg"><path d="M291 150V79c0-19-15-34-34-34H79c-19 0-34 15-34 34v42l67-44 81 72 56-29 42 30zm0 52l-43-30-56 30-81-67-66 39v23c0 19 15 34 34 34h178c17 0 31-13 34-29zM79 0h178c44 0 79 35 79 79v118c0 44-35 79-79 79H79c-44 0-79-35-79-79V79C0 35 35 0 79 0z"/></svg>'
    }
  }
}
