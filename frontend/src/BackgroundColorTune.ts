export default class BackgroundColorTune {
  private api: any
  private data: { backgroundColor?: string }
  private block: any
  private wrapper: HTMLElement | null = null

  static get isTune() {
    return true
  }

  constructor({ api, data, config, block }: any) {
    this.api = api
    this.data = data || {}
    this.block = block
  }

  render() {
    const colors = [
      { name: 'Default', value: '', bg: '#ffffff', border: '#e0e0e0', textColor: '#000000' },
      { name: 'Light Gray', value: 'lightgray', bg: '#f5f5f5', border: '#9e9e9e', textColor: '#000000' },
      { name: 'Red', value: 'red', bg: '#5c1010', border: '#7d1414', textColor: '#ffffff' },
      { name: 'Orange', value: 'orange', bg: '#6b2a0f', border: '#8b3612', textColor: '#ffffff' },
      { name: 'Blue', value: 'blue', bg: '#0d3a5c', border: '#124a72', textColor: '#ffffff' },
      { name: 'Green', value: 'green', bg: '#1a4d24', border: '#226630', textColor: '#ffffff' },
      { name: 'Purple', value: 'purple', bg: '#3d2470', border: '#4f2f8f', textColor: '#ffffff' },
      { name: 'Pink', value: 'pink', bg: '#6b1e42', border: '#8a2753', textColor: '#ffffff' }
    ]

    this.wrapper = document.createElement('div')
    this.wrapper.classList.add('background-color-tune')

    colors.forEach(color => {
      const button = document.createElement('button')
      button.classList.add('background-color-option')
      button.style.cssText = `
        width: 28px;
        height: 28px;
        border-radius: 4px;
        border: 2px solid ${color.border};
        background: ${color.bg};
        cursor: pointer;
        margin: 4px;
        transition: transform 0.1s ease;
      `
      button.title = color.name

      if (this.data.backgroundColor === color.value) {
        button.style.transform = 'scale(1.15)'
        button.style.boxShadow = '0 0 0 2px rgba(33, 150, 243, 0.3)'
      }

      button.addEventListener('click', () => {
        this.data.backgroundColor = color.value
        this.applyBackgroundColor()
        this.api.blocks.update()
      })

      this.wrapper.appendChild(button)
    })

    return this.wrapper
  }

  applyBackgroundColor() {
    const blockElement = this.block.holder
    if (!blockElement) return

    const colors: Record<string, { bg: string; border: string; textColor: string }> = {
      lightgray: { bg: '#f5f5f5', border: '#9e9e9e', textColor: '#000000' },
      red: { bg: '#5c1010', border: '#7d1414', textColor: '#ffffff' },
      orange: { bg: '#6b2a0f', border: '#8b3612', textColor: '#ffffff' },
      blue: { bg: '#0d3a5c', border: '#124a72', textColor: '#ffffff' },
      green: { bg: '#1a4d24', border: '#226630', textColor: '#ffffff' },
      purple: { bg: '#3d2470', border: '#4f2f8f', textColor: '#ffffff' },
      pink: { bg: '#6b1e42', border: '#8a2753', textColor: '#ffffff' }
    }

    const color = colors[this.data.backgroundColor || '']

    if (color) {
      blockElement.style.cssText = `
        background: ${color.bg};
        border-left: 4px solid ${color.border};
        padding: 12px 16px;
        border-radius: 4px;
        margin: 8px 0;
        color: ${color.textColor};
      `
    } else {
      blockElement.style.cssText = ''
    }
  }

  save() {
    return {
      backgroundColor: this.data.backgroundColor
    }
  }

  wrap(blockContent: HTMLElement) {
    this.applyBackgroundColor()
    return blockContent
  }
}
