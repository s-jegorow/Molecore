export default class StrikethroughTool {
  private api: any
  private button: HTMLElement | null = null
  private tag: string = 'S'
  private class: string = 'cdx-strikethrough'

  static get isInline() {
    return true
  }

  static get sanitize() {
    return {
      s: {},
      strike: {},
      del: {}
    }
  }

  constructor({ api }: any) {
    this.api = api
  }

  render() {
    this.button = document.createElement('button')
    this.button.type = 'button'
    this.button.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 8.5H13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        <path d="M5 4.5C5 3.67 5.67 3 6.5 3H9.5C10.33 3 11 3.67 11 4.5V6M5 11.5C5 12.33 5.67 13 6.5 13H9.5C10.33 13 11 12.33 11 11.5V10" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
      </svg>
    `
    this.button.classList.add('ce-inline-tool')

    return this.button
  }

  surround(range: Range) {
    const s = document.createElement(this.tag)
    s.appendChild(range.extractContents())
    range.insertNode(s)
  }

  checkState(selection: Selection) {
    const s = this.api.selection.findParentTag(this.tag)
    if (this.button) {
      this.button.classList.toggle('ce-inline-tool--active', !!s)
    }
    return !!s
  }

  static get title() {
    return 'Strikethrough'
  }
}
