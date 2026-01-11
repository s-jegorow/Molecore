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
      <svg width="16" height="16" viewBox="0 0 16 16">
        <path d="M2 7.5h12v1H2z" fill="currentColor"/>
        <path d="M5 4c0-.6.4-1 1-1h4c.6 0 1 .4 1 1v2h-1V4.5H6V6H5V4zm1 8c0 .6.4 1 1 1h2c.6 0 1-.4 1-1v-2h1v2c0 1.1-.9 2-2 2H7c-1.1 0-2-.9-2-2v-2h1v2z" fill="currentColor"/>
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
