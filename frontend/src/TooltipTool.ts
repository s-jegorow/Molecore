export default class TooltipTool {
  private api: any
  private button: HTMLButtonElement | null = null
  private _state: boolean = false
  private tag: string = 'SPAN'
  private class: string = 'cdx-tooltip'

  static get isInline() {
    return true
  }

  static get sanitize() {
    return {
      span: {
        class: 'cdx-tooltip',
        'data-tooltip': true,
      },
    }
  }

  static get title() {
    return 'Tooltip'
  }

  constructor({ api }: any) {
    this.api = api
  }

  get state() {
    return this._state
  }

  set state(state: boolean) {
    this._state = state
    if (this.button) {
      this.button.classList.toggle(this.api.styles.inlineToolButtonActive, state)
    }
  }

  render() {
    this.button = document.createElement('button')
    this.button.type = 'button'
    this.button.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>'
    this.button.classList.add(this.api.styles.inlineToolButton)
    return this.button
  }

  renderActions() {
    const wrapper = document.createElement('div')
    wrapper.classList.add('tooltip-tool-actions')

    const input = document.createElement('input')
    input.type = 'text'
    input.placeholder = 'Tooltip text...'
    input.classList.add('tooltip-tool-input')

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        this._applyTooltip(input.value)
        input.value = ''
      }
    })

    const applyBtn = document.createElement('button')
    applyBtn.type = 'button'
    applyBtn.textContent = '✓'
    applyBtn.classList.add('tooltip-tool-apply')
    applyBtn.addEventListener('click', () => {
      this._applyTooltip(input.value)
      input.value = ''
    })

    wrapper.appendChild(input)
    wrapper.appendChild(applyBtn)

    // Hide by default, show when state is active
    wrapper.hidden = !this._state

    this._actionsWrapper = wrapper
    return wrapper
  }

  private _actionsWrapper: HTMLElement | null = null

  surround(range: Range) {
    if (this._state) {
      // Remove tooltip
      const tooltipEl = this.api.selection.findParentTag(this.tag, this.class)
      if (tooltipEl) {
        this._unwrap(tooltipEl)
      }
      this.state = false
      if (this._actionsWrapper) this._actionsWrapper.hidden = true
    } else {
      // Show input for tooltip text
      this.state = true
      if (this._actionsWrapper) {
        this._actionsWrapper.hidden = false
        const input = this._actionsWrapper.querySelector('input')
        if (input) {
          setTimeout(() => input.focus(), 50)
        }
      }
    }
  }

  private _applyTooltip(text: string) {
    if (!text.trim()) return

    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return

    const range = selection.getRangeAt(0)

    const span = document.createElement(this.tag)
    span.classList.add(this.class)
    span.dataset.tooltip = text.trim()

    try {
      range.surroundContents(span)
    } catch {
      // If surroundContents fails (partial selection), extract and wrap
      const fragment = range.extractContents()
      span.appendChild(fragment)
      range.insertNode(span)
    }

    this.api.selection.expandToTag(span)
    this.state = true
    if (this._actionsWrapper) this._actionsWrapper.hidden = true
  }

  checkState() {
    const tooltipEl = this.api.selection.findParentTag(this.tag, this.class)
    this.state = !!tooltipEl

    if (this._actionsWrapper) {
      if (tooltipEl) {
        const input = this._actionsWrapper.querySelector('input') as HTMLInputElement
        if (input) {
          input.value = tooltipEl.dataset.tooltip || ''
        }
        this._actionsWrapper.hidden = false
      } else {
        this._actionsWrapper.hidden = true
      }
    }
  }

  private _unwrap(el: HTMLElement) {
    const parent = el.parentNode
    if (!parent) return

    while (el.firstChild) {
      parent.insertBefore(el.firstChild, el)
    }
    parent.removeChild(el)
  }
}
