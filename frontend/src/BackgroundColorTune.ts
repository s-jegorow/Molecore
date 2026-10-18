import { BLOCK_COLORS } from './utils'

const TUNE_COLORS = [
  { name: 'Default', value: '' },
  { name: 'Light Gray', value: 'lightgray' },
  { name: 'Red', value: 'red' },
  { name: 'Orange', value: 'orange' },
  { name: 'Blue', value: 'blue' },
  { name: 'Green', value: 'green' },
  { name: 'Purple', value: 'purple' },
  { name: 'Pink', value: 'pink' }
]

export default class BackgroundColorTune {
  private data: { backgroundColor?: string }
  private block: any
  private wrapper: HTMLElement | null = null

  static get isTune() {
    return true
  }

  constructor({ data, block }: any) {
    this.data = data || {}
    this.block = block
  }

  render() {
    this.wrapper = document.createElement('div')
    this.wrapper.classList.add('background-color-tune')

    TUNE_COLORS.forEach(color => {
      const swatch = BLOCK_COLORS[color.value] || { bg: '#ffffff', border: '#e0e0e0' }
      const button = document.createElement('button')
      button.classList.add('background-color-option')
      button.style.cssText = `
        width: 28px;
        height: 28px;
        border-radius: 4px;
        border: 2px solid ${swatch.border};
        background: ${swatch.bg};
        cursor: pointer;
        margin: 4px;
        transition: transform 0.1s ease;
      `
      button.title = color.name

      if (this.data.backgroundColor === color.value) {
        button.style.transform = 'scale(1.15)'
        button.style.boxShadow = '0 0 0 2px rgba(33, 150, 243, 0.3)'
      }

      const handleClick = () => {
        this.data.backgroundColor = color.value
        this.applyBackgroundColor()

        if (this.wrapper) {
          this.wrapper.querySelectorAll('.background-color-option').forEach(btn => {
            const btnElement = btn as HTMLElement
            btnElement.style.transform = ''
            btnElement.style.boxShadow = ''
          })
          button.style.transform = 'scale(1.15)'
          button.style.boxShadow = '0 0 0 2px rgba(33, 150, 243, 0.3)'
        }

        try {
          this.block.dispatchChange()
        } catch (err) {
        }
      }

      button.addEventListener('pointerdown', handleClick, true)

      this.wrapper.appendChild(button)
    })

    return this.wrapper
  }

  applyBackgroundColor() {
    const blockElement = this.block.holder
    if (!blockElement) return

    const value = this.data.backgroundColor || ''
    const color = value && value !== 'black' ? BLOCK_COLORS[value] : undefined

    if (color) {
      blockElement.style.cssText = `
        background: ${color.bg};
        border-left: 4px solid ${color.border};
        padding: 12px 16px;
        border-radius: 4px;
        margin: 8px 0;
        color: ${color.text};
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
