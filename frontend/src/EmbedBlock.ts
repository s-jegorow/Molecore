export default class EmbedBlock {
  private api: any
  private readOnly: boolean
  private data: {
    url?: string
    height?: number
  }
  private wrapper: HTMLElement | null = null

  constructor({ data, api, readOnly }: any) {
    this.api = api
    this.readOnly = readOnly
    this.data = data || { height: 400 }
  }

  static get toolbox() {
    return {
      title: 'Embed',
      icon: '<svg width="17" height="15" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M8 5v14l11-7L8 5z"/></svg>'
    }
  }

  render() {
    this.wrapper = document.createElement('div')
    this.wrapper.classList.add('embed-block')

    if (this.data.url) {
      this._createEmbed()
    } else {
      this._createUrlInput()
    }

    return this.wrapper
  }

  private _createUrlInput() {
    if (!this.wrapper) return

    const inputContainer = document.createElement('div')
    inputContainer.classList.add('embed-input-container')

    inputContainer.innerHTML = `
      <div class="embed-input-area">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
        </svg>
        <input type="text" class="embed-url-input" placeholder="Paste embed URL or iframe code..." />
        <button class="embed-submit-btn">Embed</button>
      </div>
      <div class="embed-help">
        <p style="font-size: 12px; color: #999;">
          Examples: YouTube, Google Docs, Figma, Miro, etc.
        </p>
      </div>
    `

    const input = inputContainer.querySelector('.embed-url-input') as HTMLInputElement
    const submitBtn = inputContainer.querySelector('.embed-submit-btn') as HTMLButtonElement

    const handleSubmit = () => {
      const value = input.value.trim()
      if (!value) return

      // Extract URL from iframe code if pasted
      const iframeSrcMatch = value.match(/src=["']([^"']+)["']/)
      const extractedUrl = iframeSrcMatch ? iframeSrcMatch[1] : value

      // Only allow http/https URLs
      try {
        const parsed = new URL(extractedUrl)
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          return
        }
      } catch {
        return
      }

      this.data.url = extractedUrl
      this._createEmbed()
    }

    submitBtn.addEventListener('click', handleSubmit)
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleSubmit()
      }
    })

    this.wrapper.innerHTML = ''
    this.wrapper.appendChild(inputContainer)

    // Auto-focus input
    setTimeout(() => input.focus(), 0)
  }

  private _createEmbed() {
    if (!this.wrapper || !this.data.url) return

    // Validate URL protocol
    try {
      const parsed = new URL(this.data.url)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return
    } catch {
      return
    }

    this.wrapper.innerHTML = ''
    this.wrapper.classList.add('embed-wrapper')

    const embedContainer = document.createElement('div')
    embedContainer.classList.add('embed-container')

    const iframe = document.createElement('iframe')
    iframe.src = this.data.url
    iframe.style.height = `${this.data.height || 400}px`
    iframe.setAttribute('frameborder', '0')
    iframe.setAttribute('allowfullscreen', 'true')
    iframe.setAttribute('loading', 'lazy')

    embedContainer.appendChild(iframe)

    // Edit/Delete buttons
    if (!this.readOnly) {
      const controls = document.createElement('div')
      controls.classList.add('embed-controls')

      const editBtn = document.createElement('button')
      editBtn.classList.add('embed-control-btn')
      editBtn.innerHTML = '✎'
      editBtn.title = 'Edit URL'
      editBtn.addEventListener('click', () => {
        this._createUrlInput()
      })

      const deleteBtn = document.createElement('button')
      deleteBtn.classList.add('embed-control-btn', 'embed-delete-btn')
      deleteBtn.innerHTML = '×'
      deleteBtn.title = 'Remove embed'
      deleteBtn.addEventListener('click', () => {
        this.data = { height: 400 }
        this._createUrlInput()
      })

      const resizeBtn = document.createElement('button')
      resizeBtn.classList.add('embed-control-btn')
      resizeBtn.innerHTML = '⇕'
      resizeBtn.title = 'Resize'
      resizeBtn.addEventListener('click', () => {
        const newHeight = prompt('Enter height in pixels:', String(this.data.height || 400))
        if (newHeight && !isNaN(Number(newHeight))) {
          this.data.height = Number(newHeight)
          iframe.style.height = `${this.data.height}px`
        }
      })

      controls.appendChild(editBtn)
      controls.appendChild(resizeBtn)
      controls.appendChild(deleteBtn)

      embedContainer.appendChild(controls)
    }

    this.wrapper.appendChild(embedContainer)
  }

  save() {
    return this.data
  }

  static get isReadOnlySupported() {
    return true
  }

  destroy() {
    // Cleanup when block is destroyed
    if (this.wrapper) {
      this.wrapper.innerHTML = ''
    }
  }
}
