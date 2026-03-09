/**
 * CalloutBlock – A colored container that groups subsequent EditorJS blocks.
 *
 * Uses a foreignKey-like pattern (inspired by editorjs-toggle-block):
 *   - Data:  { fk: string, items: number, color: string }
 *   - The callout header stores fk/items/color as data-attributes.
 *   - A MutationObserver (initCalloutObserver) watches the editor DOM
 *     and applies data-callout-fk + data-callout-color to child blocks.
 *
 * IMPORTANT: Uses data-callout-fk (NOT foreignKey) to avoid conflicts
 * with the toggle block which also uses foreignKey.
 */

const CALLOUT_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  black:     { bg: '#1e1e1e', border: '#333333', text: '#ffffff' },
  blue:      { bg: '#0d3a5c', border: '#124a72', text: '#ffffff' },
  red:       { bg: '#5c1010', border: '#7d1414', text: '#ffffff' },
  orange:    { bg: '#6b2a0f', border: '#8b3612', text: '#ffffff' },
  green:     { bg: '#1a4d24', border: '#226630', text: '#ffffff' },
  purple:    { bg: '#3d2470', border: '#4f2f8f', text: '#ffffff' },
  pink:      { bg: '#6b1e42', border: '#8a2753', text: '#ffffff' },
  lightgray: { bg: '#f5f5f5', border: '#9e9e9e', text: '#000000' },
}

const DEFAULT_COLOR = 'black'

function uid(): string {
  return 'callout-' + Math.random().toString(36).slice(2, 10)
}

export default class CalloutBlock {
  private api: any
  private data: { fk: string; items: number; color: string }
  private wrapper: HTMLElement | null = null
  private readOnly: boolean

  static get toolbox() {
    return {
      title: 'Callout',
      icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" stroke-width="2"/><path stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M7 8h10M7 12h6"/></svg>',
    }
  }

  static get enableLineBreaks() { return false }
  static get isReadOnlySupported() { return true }

  constructor({ data, api, readOnly }: any) {
    this.api = api
    this.readOnly = readOnly || false
    this.data = {
      fk:    data?.fk    || uid(),
      items: data?.items ?? 0,
      color: data?.color || DEFAULT_COLOR,
    }
  }

  render(): HTMLElement {
    this.wrapper = document.createElement('div')
    this.wrapper.classList.add('callout-block-header')
    this.wrapper.contentEditable = 'false'

    // Store data as attributes so the observer can read them
    this.wrapper.setAttribute('data-callout-fk', this.data.fk)
    this.wrapper.setAttribute('data-callout-items', String(this.data.items))
    this.wrapper.setAttribute('data-callout-color', this.data.color)

    this._applyColor()

    // No visible label — just a thin colored bar as handle for settings
    this.wrapper.innerHTML = ''

    return this.wrapper
  }

  save(): { fk: string; items: number; color: string } {
    // Always use the stored items count — do NOT recalculate from DOM.
    // With nested callouts, inner callouts overwrite data-callout-fk
    // on shared children, which corrupts the outer callout's count.
    return {
      fk: this.data.fk,
      items: this.data.items,
      color: this.data.color,
    }
  }

  static validate(data: any): boolean {
    return !!data.fk
  }

  renderSettings(): HTMLElement {
    const wrapper = document.createElement('div')
    wrapper.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;padding:8px;'

    Object.entries(CALLOUT_COLORS).forEach(([name, colors]) => {
      const btn = document.createElement('button')
      btn.style.cssText = `
        width:28px;height:28px;border-radius:4px;
        border:2px solid ${colors.border};background:${colors.bg};
        cursor:pointer;transition:transform .1s ease;
      `
      btn.title = name.charAt(0).toUpperCase() + name.slice(1)
      if (this.data.color === name) {
        btn.style.transform = 'scale(1.15)'
        btn.style.boxShadow = '0 0 0 2px rgba(33,150,243,.3)'
      }
      btn.addEventListener('pointerdown', (e: Event) => {
        e.preventDefault()
        this.data.color = name
        this._applyColor()
        // Update header attribute
        if (this.wrapper) {
          this.wrapper.setAttribute('data-callout-color', name)
        }
        // Re-apply all callout colors (handles nested callouts correctly)
        setTimeout(() => applyCalloutForeignKeys(), 50)
        wrapper.querySelectorAll('button').forEach(b => {
          ;(b as HTMLElement).style.transform = ''
          ;(b as HTMLElement).style.boxShadow = ''
        })
        btn.style.transform = 'scale(1.15)'
        btn.style.boxShadow = '0 0 0 2px rgba(33,150,243,.3)'
      }, true)
      wrapper.appendChild(btn)
    })

    return wrapper
  }

  static get sanitize() { return {} }

  private _applyColor() {
    if (!this.wrapper) return
    const c = CALLOUT_COLORS[this.data.color] || CALLOUT_COLORS[DEFAULT_COLOR]
    this.wrapper.style.background = c.bg
    this.wrapper.style.color = c.text
  }
}

// ─── Central foreignKey application ──────────────────────────────────────────

/**
 * Apply data-callout-fk + data-callout-color to child blocks of all callouts.
 * Scans the DOM for callout headers and marks the next N siblings.
 * Returns true if at least one callout header with children was processed.
 */
export function applyCalloutForeignKeys(): boolean {
  try {
    const allBlocks = document.querySelectorAll('.ce-block')
    const blockArray = Array.from(allBlocks)

    // First, clear old callout attributes from all blocks
    blockArray.forEach(block => {
      const el = block as HTMLElement
      if (el.hasAttribute('data-callout-fk')) {
        el.removeAttribute('data-callout-fk')
        el.removeAttribute('data-callout-color')
      }
    })

    // Then apply fresh attributes based on current callout headers
    let applied = false
    blockArray.forEach((block, idx) => {
      const header = block.querySelector('.callout-block-header') as HTMLElement
      if (!header) return

      const fk = header.getAttribute('data-callout-fk')
      const items = parseInt(header.getAttribute('data-callout-items') || '0', 10)
      const color = header.getAttribute('data-callout-color') || 'black'

      if (!fk || items <= 0) return

      for (let i = 1; i <= items; i++) {
        const child = blockArray[idx + i] as HTMLElement | undefined
        if (!child) break
        child.setAttribute('data-callout-fk', fk)
        child.setAttribute('data-callout-color', color)
        applied = true
      }
    })

    return applied
  } catch (e) {
    console.error('applyCalloutForeignKeys error:', e)
    return false
  }
}

// ─── MutationObserver for reliable DOM updates ───────────────────────────────

let _observer: MutationObserver | null = null
let _debounce: ReturnType<typeof setTimeout> | null = null

/**
 * Set up a MutationObserver on the editor redactor to automatically
 * re-apply callout foreignKeys whenever blocks change.
 * Also applies immediately + with fallback retries to handle async rendering.
 */
export function initCalloutObserver() {
  // Disconnect previous observer if any
  if (_observer) {
    _observer.disconnect()
    _observer = null
  }

  const redactor = document.querySelector('.codex-editor__redactor')
  if (!redactor) {
    // Redactor not ready yet, retry
    setTimeout(initCalloutObserver, 200)
    return
  }

  _observer = new MutationObserver(() => {
    if (_debounce) clearTimeout(_debounce)
    _debounce = setTimeout(() => {
      applyCalloutForeignKeys()
    }, 80)
  })

  // Watch for any DOM changes in the editor tree
  _observer.observe(redactor, { childList: true, subtree: true })

  // Apply immediately
  applyCalloutForeignKeys()

  // Fallback retries: EditorJS render() may resolve before DOM is fully ready
  setTimeout(() => applyCalloutForeignKeys(), 300)
  setTimeout(() => applyCalloutForeignKeys(), 800)
  setTimeout(() => applyCalloutForeignKeys(), 1500)
}
