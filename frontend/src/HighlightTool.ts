export default class HighlightTool {
  private api: any
  private button: HTMLElement | null = null
  private tag: string = 'MARK'
  private class: string = 'cdx-highlight'

  static get isInline() {
    return true
  }

  static get sanitize() {
    return {
      mark: {
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
        <path d="M3 2h10v2H3z" fill="currentColor"/>
        <path d="M4 5h8l-1 9H5z" fill="#ffd93d" stroke="currentColor" stroke-width="1"/>
        <path d="M6 14h4v2H6z" fill="currentColor"/>
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
    popup.classList.add('highlight-picker-popup')
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
      { name: 'Default', bg: '', text: '' },
      { name: 'Yellow', bg: '#fff3bf', text: '#000000' },
      { name: 'Orange', bg: '#ffe8cc', text: '#000000' },
      { name: 'Red', bg: '#ffe0e0', text: '#000000' },
      { name: 'Pink', bg: '#fce4ec', text: '#000000' },
      { name: 'Purple', bg: '#e9d5ff', text: '#000000' },
      { name: 'Blue', bg: '#d0ebff', text: '#000000' },
      { name: 'Teal', bg: '#c3fae8', text: '#000000' },
      { name: 'Green', bg: '#d3f9d8', text: '#000000' },
      { name: 'Gray', bg: '#e9ecef', text: '#000000' },
      { name: 'Brown', bg: '#e7d7c1', text: '#000000' },
      { name: 'Dark Blue', bg: '#1971c2', text: '#ffffff' },
      { name: 'Dark Red', bg: '#c92a2a', text: '#ffffff' }
    ]

    colors.forEach(color => {
      const colorBtn = document.createElement('button')
      colorBtn.style.cssText = `
        width: 32px;
        height: 32px;
        border-radius: 4px;
        border: 2px solid ${color.bg || '#e0e0e0'};
        background: ${color.bg || 'white'};
        cursor: pointer;
        transition: transform 0.1s ease;
        position: relative;
      `
      colorBtn.title = color.name

      // Show text color indicator for dark backgrounds
      if (color.text === '#ffffff') {
        const textIndicator = document.createElement('span')
        textIndicator.textContent = 'A'
        textIndicator.style.cssText = `
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          color: white;
          font-size: 12px;
          font-weight: bold;
        `
        colorBtn.appendChild(textIndicator)
      }

      colorBtn.addEventListener('mouseenter', () => {
        colorBtn.style.transform = 'scale(1.1)'
      })

      colorBtn.addEventListener('mouseleave', () => {
        colorBtn.style.transform = 'scale(1)'
      })

      colorBtn.addEventListener('click', () => {
        this.applyHighlight(color.bg, color.text)
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

  applyHighlight(bgColor: string, textColor: string) {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return

    const range = selection.getRangeAt(0)
    const mark = document.createElement('mark')

    if (bgColor) {
      mark.style.backgroundColor = bgColor
      mark.style.padding = '2px 0'
      mark.style.borderRadius = '2px'
    }

    if (textColor) {
      mark.style.color = textColor
    }

    mark.appendChild(range.extractContents())
    range.insertNode(mark)

    // Restore selection
    selection.removeAllRanges()
    selection.addRange(range)
  }

  surround(range: Range) {
    // Not used - we handle this in applyHighlight
  }

  checkState() {
    // Not used for this tool
    return false
  }

  static get title() {
    return 'Highlight'
  }
}
