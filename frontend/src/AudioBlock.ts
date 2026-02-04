import { Modal } from './Modal'
import { API_URL } from './api'
import { getToken } from './auth'

export default class AudioBlock {
  private api: any
  private readOnly: boolean
  private data: {
    url?: string
    fileName?: string
  }
  private wrapper: HTMLElement | null = null

  constructor({ data, api, readOnly }: any) {
    this.api = api
    this.readOnly = readOnly
    this.data = data || {}
  }

  static get toolbox() {
    return {
      title: 'Audio',
      icon: '<svg width="17" height="15" viewBox="0 0 336 276" xmlns="http://www.w3.org/2000/svg"><path d="M291 150V79c0-19-15-34-34-34H79c-19 0-34 15-34 34v42l67-44 81 72 56-29 42 30zm0 52l-43-30-56 30-81-67-66 39v23c0 19 15 34 34 34h178c17 0 31-13 34-29zM79 0h178c44 0 79 35 79 79v118c0 44-35 79-79 79H79c-44 0-79-35-79-79V79C0 35 35 0 79 0z"/></svg>'
    }
  }

  render() {
    this.wrapper = document.createElement('div')
    this.wrapper.classList.add('audio-block')

    if (this.data.url) {
      this._createAudioPlayer()
    } else {
      this._createUploader()
    }

    return this.wrapper
  }

  private _createUploader() {
    if (!this.wrapper) return

    const uploader = document.createElement('div')
    uploader.classList.add('audio-uploader')
    uploader.innerHTML = `
      <div class="audio-uploader-area">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 18V5l12-2v13"></path>
          <circle cx="6" cy="18" r="3"></circle>
          <circle cx="18" cy="16" r="3"></circle>
        </svg>
        <p>Click to upload audio file</p>
        <p style="font-size: 12px; color: #999;">MP3, WAV, OGG (Max 50MB)</p>
      </div>
    `

    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'audio/*'
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
      formData.append('upload_type', 'audio')

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

      this._createAudioPlayer()
    } catch (error) {
      console.error('Upload failed:', error)
      await Modal.error('Failed to upload audio file. Please try again.')
    }
  }

  private _createAudioPlayer() {
    if (!this.wrapper || !this.data.url) return

    this.wrapper.innerHTML = ''
    this.wrapper.classList.add('audio-player-wrapper')

    const player = document.createElement('div')
    player.classList.add('audio-player')

    player.innerHTML = `
      <div class="audio-player-controls">
        <button class="audio-play-btn" title="Play">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z"/>
          </svg>
        </button>
        <div class="audio-info">
          <div class="audio-filename">${this.data.fileName || 'Audio File'}</div>
          <div class="audio-time">
            <span class="audio-current">0:00</span> / <span class="audio-duration">0:00</span>
          </div>
        </div>
      </div>
      <div class="audio-progress-container">
        <div class="audio-progress-bar">
          <div class="audio-progress-fill"></div>
        </div>
      </div>
    `

    const audio = document.createElement('audio')
    audio.src = this.data.url
    audio.preload = 'metadata'

    const playBtn = player.querySelector('.audio-play-btn') as HTMLButtonElement
    const currentTimeEl = player.querySelector('.audio-current') as HTMLElement
    const durationEl = player.querySelector('.audio-duration') as HTMLElement
    const progressFill = player.querySelector('.audio-progress-fill') as HTMLElement
    const progressContainer = player.querySelector('.audio-progress-container') as HTMLElement

    // Play/Pause
    playBtn.addEventListener('click', () => {
      if (audio.paused) {
        audio.play()
        playBtn.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
          </svg>
        `
      } else {
        audio.pause()
        playBtn.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z"/>
          </svg>
        `
      }
    })

    // Update time
    audio.addEventListener('timeupdate', () => {
      const current = this._formatTime(audio.currentTime)
      currentTimeEl.textContent = current

      const progress = (audio.currentTime / audio.duration) * 100
      progressFill.style.width = `${progress}%`
    })

    // Load duration
    audio.addEventListener('loadedmetadata', () => {
      const duration = this._formatTime(audio.duration)
      durationEl.textContent = duration
    })

    // Seek
    progressContainer.addEventListener('click', (e) => {
      const rect = progressContainer.getBoundingClientRect()
      const x = e.clientX - rect.left
      const percentage = x / rect.width
      audio.currentTime = percentage * audio.duration
    })

    // Reset on end
    audio.addEventListener('ended', () => {
      playBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5v14l11-7z"/>
        </svg>
      `
    })

    this.wrapper.appendChild(player)

    // Add delete button if not readOnly
    if (!this.readOnly) {
      const deleteBtn = document.createElement('button')
      deleteBtn.classList.add('audio-delete-btn')
      deleteBtn.innerHTML = '×'
      deleteBtn.title = 'Remove audio'
      deleteBtn.addEventListener('click', () => {
        this.data = {}
        this._createUploader()
      })
      player.appendChild(deleteBtn)
    }
  }

  private _formatTime(seconds: number): string {
    if (isNaN(seconds)) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
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
