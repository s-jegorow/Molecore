export default class LinkTool {
  private button: HTMLButtonElement | null = null
  private input: HTMLInputElement | null = null
  private tag: string = 'A'
  private iconSvg: string = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7.5 10.5L6 12C5.2 12.8 3.8 12.8 3 12C2.2 11.2 2.2 9.8 3 9L5.5 6.5M8.5 5.5L10 4C10.8 3.2 12.2 3.2 13 4C13.8 4.8 13.8 6.2 13 7L10.5 9.5M5.5 10.5L10.5 5.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>'

  static get isInline() {
    return true
  }

  static get sanitize() {
    return {
      a: {
        href: true,
        target: '_blank',
        rel: 'noopener'
      }
    }
  }

  constructor() {}

  render(): HTMLButtonElement {
    this.button = document.createElement('button')
    this.button.type = 'button'
    this.button.innerHTML = this.iconSvg
    this.button.classList.add('ce-inline-tool')
    return this.button
  }

  surround(range: Range): void {
    if (!range) return

    const selectedText = range.toString()
    const link = document.createElement(this.tag)

    // Create input for URL
    this.input = document.createElement('input')
    this.input.type = 'text'
    this.input.placeholder = 'Enter URL...'
    this.input.style.cssText = `
      position: absolute;
      z-index: 10000;
      padding: 8px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 14px;
      min-width: 300px;
      background: white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    `

    // Position input near selection
    const rect = range.getBoundingClientRect()
    this.input.style.left = rect.left + 'px'
    this.input.style.top = (rect.bottom + 5) + 'px'

    document.body.appendChild(this.input)
    this.input.focus()

    // Handle Enter key
    this.input.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        const url = this.input!.value.trim()

        if (url) {
          link.href = url.startsWith('http') ? url : 'https://' + url
          link.target = '_blank'
          link.rel = 'noopener'
          link.textContent = selectedText

          range.deleteContents()
          range.insertNode(link)
        }

        this.input!.remove()
        this.input = null
      } else if (e.key === 'Escape') {
        this.input!.remove()
        this.input = null
      }
    })

    // Handle clicking outside
    setTimeout(() => {
      const clickHandler = (e: MouseEvent) => {
        if (this.input && !this.input.contains(e.target as Node)) {
          this.input.remove()
          this.input = null
          document.removeEventListener('click', clickHandler)
        }
      }
      document.addEventListener('click', clickHandler)
    }, 100)
  }

  checkState(selection: Selection): boolean {
    if (!selection || !selection.anchorNode) return false

    const anchorElement = selection.anchorNode as HTMLElement
    const parentElement = anchorElement.parentElement

    return !!parentElement?.closest(this.tag)
  }

  static get shortcut(): string {
    return 'CMD+K'
  }
}
