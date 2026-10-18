import { appState } from './state'
import { BLOCK_COLORS, uid } from './utils'

const CALLOUT_COLOR_ORDER = ['black', 'blue', 'red', 'orange', 'green', 'purple', 'pink', 'lightgray']

const DEFAULT_COLOR = 'black'

export default class CalloutBlock {
  private data: { fk: string; items: number; color: string }
  private wrapper: HTMLElement | null = null

  static get toolbox() {
    return {
      title: 'Callout',
      icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" stroke-width="2"/><path stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M7 8h10M7 12h6"/></svg>',
    }
  }

  static get enableLineBreaks() { return false }
  static get isReadOnlySupported() { return true }

  constructor({ data }: any) {
    this.data = {
      fk:    data?.fk    || uid('callout'),
      items: data?.items ?? 0,
      color: data?.color || DEFAULT_COLOR,
    }
  }

  render(): HTMLElement {
    this.wrapper = document.createElement('div')
    this.wrapper.classList.add('callout-block-header')
    this.wrapper.contentEditable = 'false'

    this.wrapper.setAttribute('data-callout-fk', this.data.fk)
    this.wrapper.setAttribute('data-callout-items', String(this.data.items))
    this.wrapper.setAttribute('data-callout-color', this.data.color)

    this._applyColor()

    this.wrapper.innerHTML = ''

    return this.wrapper
  }

  save(): { fk: string; items: number; color: string } {
    const items = this.wrapper
      ? parseInt(this.wrapper.getAttribute('data-callout-items') || '0', 10)
      : this.data.items
    return {
      fk: this.data.fk,
      items,
      color: this.data.color,
    }
  }

  static validate(data: any): boolean {
    return !!data.fk
  }

  renderSettings(): HTMLElement {
    const wrapper = document.createElement('div')
    wrapper.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;padding:8px;'

    CALLOUT_COLOR_ORDER.forEach(name => {
      const colors = BLOCK_COLORS[name]
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
        if (this.wrapper) {
          this.wrapper.setAttribute('data-callout-color', name)
        }
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
    const c = BLOCK_COLORS[this.data.color] || BLOCK_COLORS[DEFAULT_COLOR]
    this.wrapper.style.background = c.bg
    this.wrapper.style.color = c.text
  }
}

const _headerPositions = new Map<string, number>()
let _fixingHeaderFk: string | null = null

function _getHeaderIdx(fk: string): number {
  const blocks = Array.from(document.querySelectorAll('.ce-block'))
  for (let i = 0; i < blocks.length; i++) {
    const h = (blocks[i] as HTMLElement).querySelector('.callout-block-header') as HTMLElement
    if (h?.getAttribute('data-callout-fk') === fk) return i
  }
  return -1
}

function _getNextChildToMove(fk: string, currentHeaderIdx: number, movedDown: boolean): number {
  const blocks = Array.from(document.querySelectorAll('.ce-block'))
  const children: number[] = []
  blocks.forEach((b, i) => {
    if (i !== currentHeaderIdx && (b as HTMLElement).getAttribute('data-callout-fk') === fk) {
      children.push(i)
    }
  })
  children.sort((a, b) => a - b)

  if (children.every((ci, i) => ci === currentHeaderIdx + 1 + i)) return -1

  if (movedDown) {
    return children.find(ci => ci < currentHeaderIdx) ?? -1
  } else {
    for (let i = children.length - 1; i >= 0; i--) {
      if (children[i] !== currentHeaderIdx + 1 + i) return children[i]
    }
    return -1
  }
}

export function applyCalloutForeignKeys(): boolean {
  try {
    const allBlocks = document.querySelectorAll('.ce-block')
    const blockArray = Array.from(allBlocks)

    // editorjs only moves the dragged block, so we drag the callout children along ourselves
    if (!_fixingHeaderFk) {
      const editor = appState.editor as any
      if (editor) {
        for (let idx = 0; idx < blockArray.length; idx++) {
          const block = blockArray[idx] as HTMLElement
          const header = block.querySelector('.callout-block-header') as HTMLElement
          if (!header) continue

          const fk = header.getAttribute('data-callout-fk')
          if (!fk) continue

          const prevIdx = _headerPositions.get(fk)
          _headerPositions.set(fk, idx)

          if (prevIdx === undefined || prevIdx === idx) continue

          const movedDown = idx > prevIdx

          let moveCount = 0
          for (let attempt = 0; attempt < 50; attempt++) {
            const hIdx = _getHeaderIdx(fk)
            if (hIdx < 0) break
            const childIdx = _getNextChildToMove(fk, hIdx, movedDown)
            if (childIdx < 0) break
            editor.blocks.move(hIdx + 1, childIdx)
            moveCount++
          }

          const finalIdx = _getHeaderIdx(fk)
          if (finalIdx >= 0) _headerPositions.set(fk, finalIdx)

          if (moveCount > 0) {
            _fixingHeaderFk = fk
            setTimeout(() => { _fixingHeaderFk = null }, 500)
            return false
          }
          // moveCount 0 = header just shifted because something got inserted above, no real drag
        }
      }
    }

    if (!_fixingHeaderFk) {
      blockArray.forEach((block, idx) => {
        const header = block.querySelector('.callout-block-header') as HTMLElement
        if (!header) return
        const fk = header.getAttribute('data-callout-fk')
        if (!fk) return
        const storedItems = parseInt(header.getAttribute('data-callout-items') || '0', 10)
        if (storedItems <= 0) return
        if (!blockArray.some(b => (b as HTMLElement).getAttribute('data-callout-fk') === fk)) return
        const scanLimit = storedItems + 1
        let newItems = 0
        for (let i = 1; i <= scanLimit; i++) {
          const child = blockArray[idx + i] as HTMLElement | undefined
          if (!child) break
          if (child.getAttribute('data-callout-fk') === fk) newItems = i
        }
        if (newItems !== storedItems) header.setAttribute('data-callout-items', String(newItems))
      })
    }

    blockArray.forEach(block => {
      const el = block as HTMLElement
      if (el.hasAttribute('data-callout-fk')) {
        el.removeAttribute('data-callout-fk')
        el.removeAttribute('data-callout-color')
      }
    })

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

let _observer: MutationObserver | null = null
let _debounce: ReturnType<typeof setTimeout> | null = null

export function initCalloutObserver() {
  if (_observer) {
    _observer.disconnect()
    _observer = null
  }

  _headerPositions.clear()
  _fixingHeaderFk = null

  const redactor = document.querySelector('.codex-editor__redactor')
  if (!redactor) {
    setTimeout(initCalloutObserver, 200)
    return
  }

  _observer = new MutationObserver(() => {
    if (_debounce) clearTimeout(_debounce)
    _debounce = setTimeout(() => {
      applyCalloutForeignKeys()
    }, 80)
  })

  _observer.observe(redactor, { childList: true, subtree: true })

  applyCalloutForeignKeys()

  // render() sometimes resolves before the dom is ready, so retry a few times
  setTimeout(() => applyCalloutForeignKeys(), 300)
  setTimeout(() => applyCalloutForeignKeys(), 800)
  setTimeout(() => applyCalloutForeignKeys(), 1500)
}
