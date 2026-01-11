export default class ColorTool {
  private api: any
  private button: HTMLElement | null = null
  private tag: string = 'SPAN'
  private class: string = 'cdx-color'

  static get isInline() {
    return true
  }

  static get sanitize() {
    return {
      span: {
        style: true,
        class: true
      }
    }
  }

  constructor({ api }: any) {
    this.api = api
  }

  render() {
    this.button = document.createElement('button')
    this.button.type = 'button'
    this.button.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 16 16">
        <path d="M8 2L4 14h2l1-3h6l1 3h2L12 2H8zm0 3.5L9.5 9h-3L8 5.5z" fill="currentColor"/>
        <rect x="2" y="14" width="12" height="2" fill="#ff6b6b"/>
      </svg>
    `
    this.button.classList.add('ce-inline-tool')

    this.button.addEventListener('click', () => {
      this.showColorPicker()
    })

    return this.button
  }

  showColorPicker() {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return

    const range = selection.getRangeAt(0)
    const selectedText = range.toString()
    if (!selectedText) return

    // Create color picker popup
    const popup = document.createElement('div')
    popup.classList.add('color-picker-popup')
    popup.style.cssText = `
      position: absolute;
      background: white;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 12px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 10000;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      width: 220px;
    `

    const colors = [
      { name: 'Default', value: '' },
      { name: 'Black', value: '#000000' },
      { name: 'Gray', value: '#495057' },
      { name: 'Red', value: '#e03131' },
      { name: 'Orange', value: '#fd7e14' },
      { name: 'Yellow', value: '#fab005' },
      { name: 'Green', value: '#2b8a3e' },
      { name: 'Teal', value: '#0ca678' },
      { name: 'Blue', value: '#1971c2' },
      { name: 'Indigo', value: '#4c6ef5' },
      { name: 'Purple', value: '#7048e8' },
      { name: 'Pink', value: '#d6336c' }
    ]

    colors.forEach(color => {
      const colorBtn = document.createElement('button')
      colorBtn.style.cssText = `
        width: 32px;
        height: 32px;
        border-radius: 4px;
        border: 2px solid ${color.value || '#e0e0e0'};
        background: ${color.value || 'white'};
        cursor: pointer;
        transition: transform 0.1s ease;
      `
      colorBtn.title = color.name

      colorBtn.addEventListener('mouseenter', () => {
        colorBtn.style.transform = 'scale(1.1)'
      })

      colorBtn.addEventListener('mouseleave', () => {
        colorBtn.style.transform = 'scale(1)'
      })

      colorBtn.addEventListener('click', () => {
        this.applyColor(color.value)
        document.body.removeChild(popup)
      })

      popup.appendChild(colorBtn)
    })

    // Position popup near selection
    const rect = range.getBoundingClientRect()
    popup.style.top = (rect.bottom + window.scrollY + 5) + 'px'
    popup.style.left = (rect.left + window.scrollX) + 'px'

    document.body.appendChild(popup)

    // Close on outside click
    setTimeout(() => {
      const closeHandler = (e: MouseEvent) => {
        if (!popup.contains(e.target as Node)) {
          document.body.removeChild(popup)
          document.removeEventListener('click', closeHandler)
        }
      }
      document.addEventListener('click', closeHandler)
    }, 100)
  }

  applyColor(color: string) {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return

    const range = selection.getRangeAt(0)
    const span = document.createElement('span')

    if (color) {
      span.style.color = color
    }

    span.appendChild(range.extractContents())
    range.insertNode(span)

    // Restore selection
    selection.removeAllRanges()
    selection.addRange(range)
  }

  surround(range: Range) {
    // Not used - we handle this in applyColor
  }

  checkState() {
    // Not used for this tool
    return false
  }

  static get title() {
    return 'Color'
  }
}
