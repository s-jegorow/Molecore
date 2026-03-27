export default class RevealBlock {
  private api: any
  private readOnly: boolean
  private data: {
    text?: string
  }
  private wrapper: HTMLElement | null = null
  private revealed: boolean = false

  constructor({ data, api, readOnly }: any) {
    this.api = api
    this.readOnly = readOnly
    this.data = data || {}
  }

  static get toolbox() {
    return {
      title: 'Reveal',
      icon: '<svg width="17" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>'
    }
  }

  render() {
    this.wrapper = document.createElement('div')
    this.wrapper.classList.add('reveal-block')

    const contentArea = document.createElement('div')
    contentArea.classList.add('reveal-content')

    if (!this.readOnly) {
      // Edit mode: show editable textarea
      const textarea = document.createElement('div')
      textarea.classList.add('reveal-editor')
      textarea.contentEditable = 'true'
      textarea.innerHTML = this.data.text || ''
      textarea.dataset.placeholder = 'Hidden text...'

      textarea.addEventListener('input', () => {
        this.data.text = textarea.innerHTML
      })

      const label = document.createElement('div')
      label.classList.add('reveal-label')
      label.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg> Reveal Block'

      contentArea.appendChild(label)
      contentArea.appendChild(textarea)
    } else {
      // Read mode: click to reveal
      const hiddenText = document.createElement('div')
      hiddenText.classList.add('reveal-hidden')
      hiddenText.innerHTML = this.data.text || ''

      const overlay = document.createElement('div')
      overlay.classList.add('reveal-overlay')
      overlay.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg><span>Click to reveal</span>'

      contentArea.appendChild(hiddenText)
      contentArea.appendChild(overlay)

      contentArea.addEventListener('click', () => {
        this.revealed = !this.revealed
        contentArea.classList.toggle('revealed', this.revealed)

        if (this.revealed) {
          overlay.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg><span>Click to hide</span>'
        } else {
          overlay.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg><span>Click to reveal</span>'
        }
      })
    }

    this.wrapper.appendChild(contentArea)
    return this.wrapper
  }

  save() {
    return {
      text: this.data.text || ''
    }
  }
}
