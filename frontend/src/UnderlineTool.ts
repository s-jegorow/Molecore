export default class UnderlineTool {
  private api: any
  private button: HTMLElement | null = null
  private tag: string = 'U'
  private class: string = 'cdx-underline'

  static get isInline() {
    return true
  }

  static get sanitize() {
    return {
      u: {}
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
        <path d="M4 2v6c0 2.2 1.8 4 4 4s4-1.8 4-4V2h-1.5v6c0 1.4-1.1 2.5-2.5 2.5S5.5 9.4 5.5 8V2H4z" fill="currentColor"/>
        <rect x="3" y="14" width="10" height="1.5" fill="currentColor"/>
      </svg>
    `
    this.button.classList.add('ce-inline-tool')

    return this.button
  }

  surround(range: Range) {
    const u = document.createElement(this.tag)
    u.appendChild(range.extractContents())
    range.insertNode(u)
  }

  checkState(selection: Selection) {
    const u = this.api.selection.findParentTag(this.tag)
    if (this.button) {
      this.button.classList.toggle('ce-inline-tool--active', !!u)
    }
    return !!u
  }

  static get title() {
    return 'Underline'
  }
}
